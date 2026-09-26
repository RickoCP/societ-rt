/**
 * EmergencyQueueProtocol — Core abstraction for enqueueing emergency operations.
 *
 * Emergency operations use a dedicated high-priority queue with:
 * - Highest priority level (1)
 * - 3 retry attempts with exponential backoff (Req 20 AC 9)
 * - Dedicated queue partition/topic for isolation
 *
 * Infrastructure layer provides the concrete implementation.
 * This protocol has NO external dependencies (core layer).
 *
 * @see Requirements 20 (AC 8, AC 9)
 */

import type { EmergencyQueueMessage } from '@core/domains/emergency/types';

/**
 * Result of enqueueing an emergency operation.
 */
export interface EmergencyEnqueueResult {
  /** The unique message ID assigned by the queue */
  readonly messageId: string;
  /** Timestamp when the message was accepted */
  readonly acceptedAt: Date;
}

/**
 * Protocol for enqueueing emergency operations.
 *
 * Implementation requirements per Req 20 AC 8-9:
 * - MUST use a dedicated high-priority queue
 * - MUST retry up to 3 times with exponential backoff
 * - MUST set priority to highest level
 * - SHOULD isolate from normal notification queue
 */
export interface EmergencyQueueProtocol {
  /**
   * Enqueue an emergency operation with high priority.
   *
   * The implementation MUST:
   * - Use dedicated emergency queue (not shared with normal notifications)
   * - Set highest priority level
   * - Configure 3 retry attempts
   * - Use exponential backoff (base delay: 1000ms)
   *
   * @param message - The emergency operation message
   * @returns The message ID assigned by the queue system
   */
  enqueueEmergencyOperation(message: EmergencyQueueMessage): Promise<string>;

  /**
   * Check the health of the emergency queue.
   *
   * Used for monitoring and alerting when emergency infrastructure degrades.
   *
   * @returns true if the queue is operational
   */
  isHealthy(): Promise<boolean>;
}
