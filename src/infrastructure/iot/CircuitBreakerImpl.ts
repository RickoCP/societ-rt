/**
 * CircuitBreakerImpl — Infrastructure implementation of CircuitBreakerProtocol.
 *
 * Implements the standard circuit breaker state machine for Tuya Cloud API:
 * - Closed → Open: after 5 consecutive failures
 * - Open → Half-Open: after 30 seconds elapsed since opening
 * - Half-Open → Closed: after 3 consecutive successes
 * - Half-Open → Open: on any failure
 *
 * When the circuit is open, commands are immediately rejected with
 * IOT_CLOUD_UNAVAILABLE and queued for up to 5 minutes for later replay.
 *
 * Factory function pattern for Awilix DI compatibility.
 *
 * @see Requirements 38.13, 44.6
 */

import type {
  CircuitBreakerProtocol,
  CircuitBreakerState,
} from '@core/protocols/CircuitBreakerProtocol';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { iotCloudUnavailable } from '@core/domains/iot/errors/iotErrors';

// ---------------------------------------------------------------------------
// Configuration constants
// ---------------------------------------------------------------------------

/** Number of consecutive failures before opening the circuit. */
const FAILURE_THRESHOLD = 5;

/** Time in milliseconds before transitioning from Open to Half-Open. */
const OPEN_TIMEOUT_MS = 30_000;

/** Number of consecutive successes in Half-Open to close the circuit. */
const HALF_OPEN_SUCCESS_THRESHOLD = 3;

/** Maximum age (ms) for queued commands — 5 minutes. */
const QUEUE_MAX_AGE_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueuedCommand<T = unknown> {
  readonly operation: () => Promise<T>;
  readonly enqueuedAt: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const CircuitBreakerImpl = (): CircuitBreakerProtocol => {
  let state: CircuitBreakerState = 'closed';
  let consecutiveFailures = 0;
  let consecutiveSuccesses = 0;
  let openedAt: number | null = null;
  const commandQueue: QueuedCommand[] = [];

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  function transitionToOpen(): void {
    state = 'open';
    openedAt = Date.now();
    consecutiveFailures = 0;
    consecutiveSuccesses = 0;
  }

  function transitionToHalfOpen(): void {
    state = 'half-open';
    consecutiveSuccesses = 0;
  }

  function transitionToClosed(): void {
    state = 'closed';
    consecutiveFailures = 0;
    consecutiveSuccesses = 0;
    openedAt = null;
  }

  function recordSuccess(): void {
    consecutiveFailures = 0;

    if (state === 'half-open') {
      consecutiveSuccesses++;
      if (consecutiveSuccesses >= HALF_OPEN_SUCCESS_THRESHOLD) {
        transitionToClosed();
        drainQueue();
      }
    }
  }

  function recordFailure(): void {
    consecutiveSuccesses = 0;

    if (state === 'half-open') {
      transitionToOpen();
      return;
    }

    if (state === 'closed') {
      consecutiveFailures++;
      if (consecutiveFailures >= FAILURE_THRESHOLD) {
        transitionToOpen();
      }
    }
  }

  /**
   * Check if the open timeout has elapsed and transition to half-open.
   */
  function checkOpenTimeout(): void {
    if (state === 'open' && openedAt !== null) {
      const elapsed = Date.now() - openedAt;
      if (elapsed >= OPEN_TIMEOUT_MS) {
        transitionToHalfOpen();
      }
    }
  }

  /**
   * Enqueue a command for later replay (max 5 minutes retention).
   */
  function enqueueCommand<T>(operation: () => Promise<T>): void {
    // Prune expired commands first
    pruneExpiredCommands();
    commandQueue.push({ operation, enqueuedAt: Date.now() });
  }

  /**
   * Remove commands older than QUEUE_MAX_AGE_MS.
   */
  function pruneExpiredCommands(): void {
    const now = Date.now();
    let i = 0;
    while (i < commandQueue.length) {
      if (now - commandQueue[i].enqueuedAt > QUEUE_MAX_AGE_MS) {
        commandQueue.splice(i, 1);
      } else {
        i++;
      }
    }
  }

  /**
   * Attempt to replay queued commands after circuit closes.
   * Commands are executed fire-and-forget; failures are discarded.
   */
  function drainQueue(): void {
    pruneExpiredCommands();
    const commands = commandQueue.splice(0, commandQueue.length);
    for (const cmd of commands) {
      // Fire-and-forget: we don't block on queued command results
      void cmd.operation().catch(() => {
        // Silently discard — the circuit is now closed and
        // subsequent calls will go through normally.
      });
    }
  }

  // -------------------------------------------------------------------------
  // CircuitBreakerProtocol implementation
  // -------------------------------------------------------------------------

  return {
    async execute<T>(operation: () => Promise<T>): Promise<DomainResult<T>> {
      // Check if we should transition from open to half-open
      checkOpenTimeout();

      // If circuit is open, immediately fail and queue the command
      if (state === 'open') {
        enqueueCommand(operation);
        return fail(iotCloudUnavailable());
      }

      // Execute the operation (closed or half-open)
      try {
        const result = await operation();
        recordSuccess();
        return ok(result);
      } catch {
        recordFailure();
        return fail(iotCloudUnavailable());
      }
    },

    getState(): CircuitBreakerState {
      // Check timeout before returning state (lazy transition)
      checkOpenTimeout();
      return state;
    },

    reset(): void {
      transitionToClosed();
    },
  };
};
