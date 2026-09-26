/**
 * EmergencyQueueStub — Infrastructure implementation of EmergencyQueueProtocol.
 *
 * Delegates to QueueProtocol.enqueue() with job type 'emergency_operation'.
 * Factory function pattern for Awilix DI compatibility.
 * Jobs are processed by a dedicated emergency worker (BullMQ Worker).
 *
 * Configuration per Req 20 AC 8-9:
 * - Uses dedicated 'emergency' queue name (isolated from normal notifications)
 * - Priority: 1 (highest)
 * - Retry logic: 3 attempts with exponential backoff (delay: 1000ms)
 * - No delay on first attempt (emergency = immediate processing)
 *
 * @see Requirements 20 (AC 8, AC 9)
 */

import type { EmergencyQueueProtocol } from '@core/protocols';
import type { QueueProtocol } from '@core/protocols';
import type { EmergencyQueueMessage } from '@core/domains/emergency/types';

/**
 * Emergency queue job type constant.
 */
export const EMERGENCY_QUEUE_JOB_TYPE = 'emergency_operation';

/**
 * Default configuration for emergency queue jobs.
 */
export const EMERGENCY_QUEUE_CONFIG = {
  /** Number of retry attempts per Req 20 AC 9 */
  RETRY_ATTEMPTS: 3,
  /** Base delay for exponential backoff in milliseconds */
  BACKOFF_DELAY: 1000,
  /** Priority level (1 = highest) */
  PRIORITY: 1,
} as const;

/**
 * Create an EmergencyQueueStub instance.
 *
 * This implementation:
 * - Enqueues emergency operations to a dedicated queue
 * - Sets highest priority (1)
 * - Configures 3 retry attempts with exponential backoff
 * - Uses unique job IDs for deduplication
 */
export const EmergencyQueueStub = ({
  queueProtocol,
}: {
  queueProtocol: QueueProtocol;
}): EmergencyQueueProtocol => ({
  /**
   * Enqueue an emergency operation with high priority.
   */
  enqueueEmergencyOperation: async (
    message: EmergencyQueueMessage,
  ): Promise<string> => {
    const jobId = await queueProtocol.enqueue(
      EMERGENCY_QUEUE_JOB_TYPE,
      message,
      {
        attempts: EMERGENCY_QUEUE_CONFIG.RETRY_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: EMERGENCY_QUEUE_CONFIG.BACKOFF_DELAY,
        },
        priority: EMERGENCY_QUEUE_CONFIG.PRIORITY,
        jobId: message.messageId, // Use message ID for deduplication
      },
    );

    return jobId;
  },

  /**
   * Check if the emergency queue is healthy.
   *
   * In this stub implementation, we assume the queue is always healthy
   * if we can successfully create the stub. Real implementation would
   * check Redis connection and queue status.
   */
  isHealthy: async (): Promise<boolean> => {
    // TODO: Implement actual health check when Redis/BullMQ is set up
    return true;
  },
});
