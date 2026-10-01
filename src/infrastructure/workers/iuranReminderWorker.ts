/**
 * Iuran Reminder Worker — BullMQ Worker that checks for unpaid iuran past due date.
 *
 * Queries IuranStatus where status='unpaid' and month is in the past,
 * then enqueues a notification to the household head via NotificationQueueProtocol.
 *
 * Designed to run periodically via BullMQ repeatable jobs.
 *
 * Factory function: createIuranReminderWorker({ prismaClient, notificationQueueProtocol })
 *
 * @see Requirements 7.6, 23.1, 23.4
 */

import { Worker, type Job } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import type { NotificationQueueProtocol } from '@core/protocols';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IuranReminderPayload {
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
// Current month helper
// ---------------------------------------------------------------------------

/** Returns the current month in YYYY-MM format. */
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createIuranReminderWorker({
  prismaClient,
  notificationQueueProtocol,
}: {
  prismaClient: PrismaClient;
  notificationQueueProtocol: NotificationQueueProtocol;
}): Worker {
  const connection = parseRedisConnection();

  const worker = new Worker<IuranReminderPayload>(
    'iuran_reminder',
    async (_job: Job<IuranReminderPayload>) => {
      const currentMonth = getCurrentMonth();

      // Find all unpaid iuran records where the month is before the current month
      const unpaidRecords = await prismaClient.iuranStatus.findMany({
        where: {
          status: 'unpaid',
          month: { lt: currentMonth },
        },
        include: {
          household: {
            include: {
              residents: {
                where: { deletedAt: null },
                orderBy: { createdAt: 'asc' },
                take: 1, // household head = first resident
              },
            },
          },
        },
      });

      for (const record of unpaidRecords) {
        const headResident = record.household.residents[0];
        if (!headResident) continue;

        // Look up an active user in the same tenant to notify
        const user = await prismaClient.user.findFirst({
          where: {
            tenantId: record.tenantId,
            deletedAt: null,
            status: 'active',
          },
          orderBy: { createdAt: 'asc' },
        });

        if (!user) continue;

        await notificationQueueProtocol.enqueueNotification({
          tenantId: record.tenantId,
          userId: user.id,
          type: 'iuran_reminder',
          title: 'Iuran Belum Dibayar',
          body: `Iuran bulan ${record.month} untuk rumah ${record.household.householdNumber} belum dibayar. Segera lakukan pembayaran.`,
          channels: ['inbox', 'push'],
        });
      }

      console.info(
        JSON.stringify({
          level: 'info',
          code: 'IURAN_REMINDER_COMPLETED',
          unpaidCount: unpaidRecords.length,
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
        code: 'IURAN_REMINDER_FAILED',
        jobId: job?.id,
        message: err.message,
        timestamp: new Date().toISOString(),
      }),
    );
  });

  return worker;
}
