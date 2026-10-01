/**
 * Event Reminder Worker — BullMQ Worker that checks for events within 24 hours.
 *
 * Queries CommunityEvent where date is within the next 24 hours,
 * then enqueues notifications to users who RSVP'd as 'attending'
 * via NotificationQueueProtocol.
 *
 * Designed to run periodically via BullMQ repeatable jobs.
 *
 * Factory function: createEventReminderWorker({ prismaClient, notificationQueueProtocol })
 *
 * @see Requirements 14.3, 23.1, 23.4
 */

import { Worker, type Job } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import type { NotificationQueueProtocol } from '@core/protocols';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EventReminderPayload {
  readonly triggeredAt: string;
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

export function createEventReminderWorker({
  prismaClient,
  notificationQueueProtocol,
}: {
  prismaClient: PrismaClient;
  notificationQueueProtocol: NotificationQueueProtocol;
}): Worker {
  const connection = parseRedisConnection();

  const worker = new Worker<EventReminderPayload>(
    'event_reminder',
    async (_job: Job<EventReminderPayload>) => {
      const now = new Date();
      const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Find events happening within the next 24 hours
      const upcomingEvents = await prismaClient.communityEvent.findMany({
        where: {
          date: {
            gte: now,
            lte: in24Hours,
          },
        },
        include: {
          rsvps: {
            where: { response: 'attending' },
          },
        },
      });

      let notificationCount = 0;

      for (const event of upcomingEvents) {
        for (const rsvp of event.rsvps) {
          await notificationQueueProtocol.enqueueNotification({
            tenantId: event.tenantId,
            userId: rsvp.userId,
            type: 'event_reminder',
            title: 'Pengingat Acara',
            body: `Acara "${event.title}" akan berlangsung pada ${event.date.toISOString().split('T')[0]} pukul ${event.time} di ${event.location}.`,
            channels: ['inbox', 'push'],
          });
          notificationCount++;
        }
      }

      console.info(
        JSON.stringify({
          level: 'info',
          code: 'EVENT_REMINDER_COMPLETED',
          eventsFound: upcomingEvents.length,
          notificationsSent: notificationCount,
          timestamp: new Date().toISOString(),
        }),
      );
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(
      JSON.stringify({
        level: 'error',
        code: 'EVENT_REMINDER_FAILED',
        jobId: job?.id,
        message: err.message,
        timestamp: new Date().toISOString(),
      }),
    );
  });

  return worker;
}
