/**
 * CircuitBreakerProtocol — Core abstraction for circuit breaker pattern
 * applied to external API calls.
 *
 * Implements the standard circuit breaker state machine:
 * - Closed: requests pass through normally
 * - Open: requests fail immediately (after consecutive failures threshold)
 * - Half-Open: limited requests pass through to test recovery
 *
 * Infrastructure layer provides the concrete implementation with
 * configurable thresholds and timeouts.
 *
 * @see Requirements 38.13, 44.6
 */

import type { DomainResult } from '@core/utils';

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerProtocol {
  /**
   * Execute an operation through the circuit breaker.
   * If the circuit is open, immediately returns a failure.
   * If closed or half-open, executes the operation and tracks success/failure.
   */
  execute<T>(operation: () => Promise<T>): Promise<DomainResult<T>>;

  /** Get the current state of the circuit breaker. */
  getState(): CircuitBreakerState;

  /** Manually reset the circuit breaker to closed state. */
  reset(): void;
}
