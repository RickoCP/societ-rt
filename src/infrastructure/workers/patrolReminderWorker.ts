/**
 * Patrol Reminder Worker — BullMQ Worker that checks for patrol members
 * not checked in within 30 minutes of scheduled start.
 *
 * Queries PatrolSchedule where date is today and no attendance recorded
 * within 30 minutes of the scheduled time slot, then enqueues notifications
 * to missing patrol members via NotificationQueueProtocol.
 *
 * Designed to run periodically via BullMQ repeatable jobs.
 *
 * Factory function: createPatrolReminderWorker({ prismaClient, notificationQueueProtocol })
 *
 * @see Requirements 12.4, 23.1, 23.4
 */

import { Worker, type Job } from 'bullmq';
import type { PrismaClient } from '@/generated/prisma/client';
import type { NotificationQueueProtocol } from '@core/protocols';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatrolReminderPayload {
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
// Date helpers
// ---------------------------------------------------------------------------

/** Returns the start of today (UTC). */
function getStartOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Returns the end of today (UTC). */
function getEndOfToday(): Date {
  const start = getStartOfToday();
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createPatrolReminderWorker({
  prismaClient,
  notificationQueueProtocol,
}: {
  prismaClient: PrismaClient;
  notificationQueueProtocol: NotificationQueueProtocol;
}): Worker {
  const connection = parseRedisConnection();

  const worker = new Worker<PatrolReminderPayload>(
    'patrol_reminder',
    async (_job: Job<PatrolReminderPayload>) => {
      const startOfToday = getStartOfToday();
      const endOfToday = getEndOfToday();
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      // Find today's patrol schedules that started more than 30 minutes ago
      const todaySchedules = await prismaClient.patrolSchedule.findMany({
        where: {
          date: {
            gte: startOfToday,
            lte: endOfToday,
          },
          createdAt: { lte: thirtyMinutesAgo },
        },
        include: {
          attendances: true,
        },
      });

      let notificationCount = 0;

      for (const schedule of todaySchedules) {
        // Determine which assigned users have NOT checked in
        const checkedInUserIds = new Set(
          schedule.attendances.map((a) => a.userId),
        );

        const missingUserIds = schedule.assignedUserIds.filter(
          (userId) => !checkedInUserIds.has(userId),
        );

        for (const userId of missingUserIds) {
          await notificationQueueProtocol.enqueueNotification({
            tenantId: schedule.tenantId,
            userId,
            type: 'patrol_reminder',
            title: 'Pengingat Patroli',
            body: `Anda belum melakukan check-in untuk jadwal patroli slot ${schedule.timeSlot} hari ini. Segera lakukan check-in.`,
            channels: ['inbox', 'push'],
          });
          notificationCount++;
        }
      }

      console.info(
        JSON.stringify({
          level: 'info',
          code: 'PATROL_REMINDER_COMPLETED',
          schedulesChecked: todaySchedules.length,
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
        code: 'PATROL_REMINDER_FAILED',
        jobId: job?.id,
        message: err.message,
        timestamp: new Date().toISOString(),
      }),
    );
  });

  return worker;
}
