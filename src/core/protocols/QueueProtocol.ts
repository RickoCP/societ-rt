/**
 * QueueProtocol — Core abstraction for background job queuing.
 *
 * Infrastructure layer provides the concrete implementation (e.g. BullMQ).
 */

export interface JobOptions {
  /** Delay in milliseconds before the job becomes available for processing */
  readonly delay?: number;
  /** Number of retry attempts on failure */
  readonly attempts?: number;
  /** Backoff strategy configuration */
  readonly backoff?: {
    readonly type: 'exponential' | 'fixed';
    readonly delay: number;
  };
  /** Optional unique job ID for deduplication */
  readonly jobId?: string;
  /** Priority (lower = higher priority) */
  readonly priority?: number;
}

export interface QueueProtocol {
  /**
   * Enqueue a background job.
   * @returns The job ID assigned by the queue system.
   */
  enqueue<T>(
    jobType: string,
    payload: T,
    options?: JobOptions,
  ): Promise<string>;
}
