/**
 * NotificationQueueProtocol — Core abstraction for enqueuing notification dispatch jobs.
 *
 * Infrastructure layer provides the concrete implementation.
 * This protocol has NO external dependencies (core layer).
 *
 * @see Requirements 17.3
 */

export interface NotificationInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly channels: ('push' | 'email' | 'inbox')[];
}

export interface NotificationQueueProtocol {
  enqueueNotification(notification: NotificationInput): Promise<void>;
}
