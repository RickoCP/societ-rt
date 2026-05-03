/**
 * Notification Worker — BullMQ Worker that processes 'notification_dispatch' queue jobs.
 *
 * Handles push/email/inbox channels:
 * - inbox: creates a DB record via NotificationRepository
 * - push/email: placeholders (log intent only)
 *
 * Retry logic: 3 retries with exponential backoff (delay: 1000ms).
 * Logs NOTIFICATION_DISPATCH_FAILED on exhaustion.
 *
 * @see Requirements 17.3
 */

import { Worker, type Job } from 'bullmq';
import type { NotificationRepository } from '@core/domains/notification/repositories/NotificationRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationJobPayload {
  readonly tenantId: string;
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly channels: ('push' | 'email' | 'inbox')[];
}

// ---------------------------------------------------------------------------
// Redis connection helper
// ---------------------------------------------------------------------------

function parseRedisConnection(): { host: string; port: number } {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
  };
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createNotificationWorker({
  notificationRepository,
}: {
  notificationRepository: NotificationRepository;
}): Worker {
  const connection = parseRedisConnection();

  const worker = new Worker<NotificationJobPayload>(
    'notification_dispatch',
    async (job: Job<NotificationJobPayload>) => {
      const { tenantId, userId, type, title, body, channels } = job.data;

      for (const channel of channels) {
        if (channel === 'inbox') {
          const result = await notificationRepository.create(tenantId, {
            userId,
            type,
            title,
            body,
            channel: 'inbox',
          });

          if (!result.success) {
            throw new Error(
              `Failed to create inbox notification: ${result.error.code}`,
            );
          }
        }

        if (channel === 'push') {
          // Placeholder: push notification dispatch
          // In production, integrate with Web Push / FCM
        }

        if (channel === 'email') {
          // Placeholder: email notification dispatch
          // In production, integrate with email service (SES, SendGrid, etc.)
        }
      }
    },
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 100,
        duration: 1000,
      },
    },
  );

  worker.on('failed', (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
      // Log exhaustion — all retries consumed
      console.error(
        JSON.stringify({
          level: 'error',
          code: 'NOTIFICATION_DISPATCH_FAILED',
          jobId: job.id,
          tenantId: (job.data as NotificationJobPayload).tenantId,
          userId: (job.data as NotificationJobPayload).userId,
          attempts: job.attemptsMade,
          message: err.message,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  });

  return worker;
}
