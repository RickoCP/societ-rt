/**
 * NotificationQueueStub — Infrastructure implementation of NotificationQueueProtocol.
 *
 * Delegates to QueueProtocol.enqueue() with job type 'notification_dispatch'.
 * Factory function pattern for Awilix DI compatibility.
 * Jobs are processed by the notificationWorker (BullMQ Worker).
 * Retry logic: 3 attempts with exponential backoff (delay: 1000ms).
 *
 * @see Requirements 17.3
 */

import type { NotificationQueueProtocol, NotificationInput } from '@core/protocols';
import type { QueueProtocol } from '@core/protocols';

export const NotificationQueueStub = ({
  queueProtocol,
}: {
  queueProtocol: QueueProtocol;
}): NotificationQueueProtocol => ({
  enqueueNotification: async (notification: NotificationInput): Promise<void> => {
    await queueProtocol.enqueue('notification_dispatch', notification, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  },
});
