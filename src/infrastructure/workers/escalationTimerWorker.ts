/**
 * Escalation Timer Worker — BullMQ Worker that processes notification
 * escalation timers.
 *
 * Handles two job types:
 * 1. `escalation_timer` — Checks if a critical event has been acknowledged.
 *    If not, escalates to the next tier (Tier 2 after 5 min, Tier 3 after 15 min).
 * 2. `cancel_escalation` — Cancels pending escalation jobs when an event
 *    is acknowledged.
 *
 * Designed to run as a persistent BullMQ worker.
 *
 * Factory function: createEscalationTimerWorker({ prismaClient, notificationQueueProtocol })
 *
 * @see Requirements 43.3, 43.4, 31.7
 */

import { Worker, Queue, type Job } from 'bullmq';
import type { PrismaClient } from '@/generated/prisma/client';
import type { NotificationQueueProtocol } from '@core/protocols';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EscalationTimerPayload {
  readonly eventId: string;
  readonly tenantId: string;
  readonly tier: 'tier2' | 'tier3';
  readonly eventType: string;
  readonly eventTitle: string;
}

interface CancelEscalationPayload {
  readonly eventId: string;
  readonly cancelJobIds: string[];
}

type EscalationJobPayload = EscalationTimerPayload | CancelEscalationPayload;

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
// Type guards
// ---------------------------------------------------------------------------

function isEscalationTimer(
  payload: EscalationJobPayload,
): payload is EscalationTimerPayload {
  return 'tier' in payload;
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createEscalationTimerWorker({
  prismaClient,
  notificationQueueProtocol,
}: {
  prismaClient: PrismaClient;
  notificationQueueProtocol: NotificationQueueProtocol;
}): Worker {
  const connection = parseRedisConnection();
  const queueName = 'escalation_timer';

  // Queue reference for removing delayed jobs on cancellation
  const escalationQueue = new Queue(queueName, { connection });

  const worker = new Worker<EscalationJobPayload>(
    queueName,
    async (job: Job<EscalationJobPayload>) => {
      const payload = job.data;

      // Handle cancellation
      if (!isEscalationTimer(payload)) {
        const cancelPayload = payload as CancelEscalationPayload;
        for (const jobId of cancelPayload.cancelJobIds) {
          try {
            const delayedJob = await escalationQueue.getJob(jobId);
            if (delayedJob) {
              await delayedJob.remove();
            }
          } catch {
            // Job may already be processed or removed — safe to ignore
          }
        }

        console.info(
          JSON.stringify({
            level: 'info',
            code: 'ESCALATION_CANCELLED',
            eventId: cancelPayload.eventId,
            cancelledJobs: cancelPayload.cancelJobIds,
            timestamp: new Date().toISOString(),
          }),
        );
        return;
      }

      // Handle escalation timer
      const { eventId, tenantId, tier, eventType, eventTitle } = payload;

      // Check if the event/notification has been acknowledged
      const notification = await prismaClient.notification.findFirst({
        where: {
          tenantId,
          type: eventType,
          status: 'read', // 'read' means acknowledged
        },
        orderBy: { createdAt: 'desc' },
      });

      // If already acknowledged, skip escalation
      if (notification) {
        console.info(
          JSON.stringify({
            level: 'info',
            code: 'ESCALATION_SKIPPED_ACKNOWLEDGED',
            eventId,
            tier,
            timestamp: new Date().toISOString(),
          }),
        );
        return;
      }

      // Determine recipients based on tier
      if (tier === 'tier2') {
        // Tier 2: Notify Ketua_RT
        const ketuaUsers = await prismaClient.user.findMany({
          where: { tenantId, role: 'Ketua_RT', status: 'active' },
          select: { id: true },
        });

        for (const user of ketuaUsers) {
          await notificationQueueProtocol.enqueueNotification({
            tenantId,
            userId: user.id,
            type: 'escalation_tier2',
            title: `[ESCALATION] ${eventTitle}`,
            body: `Event "${eventTitle}" belum ditangani setelah 5 menit. Memerlukan perhatian segera.`,
            channels: ['push', 'inbox'],
          });
        }
      } else if (tier === 'tier3') {
        // Tier 3: Notify emergency contacts (Ketua_RT + Pengurus)
        const emergencyRecipients = await prismaClient.user.findMany({
          where: {
            tenantId,
            role: { in: ['Ketua_RT', 'Pengurus'] },
            status: 'active',
          },
          select: { id: true },
        });

        for (const user of emergencyRecipients) {
          await notificationQueueProtocol.enqueueNotification({
            tenantId,
            userId: user.id,
            type: 'escalation_tier3',
            title: `[CRITICAL ESCALATION] ${eventTitle}`,
            body: `Event "${eventTitle}" belum ditangani setelah 15 menit. Eskalasi ke kontak darurat.`,
            channels: ['push', 'inbox'],
          });
        }
      }

      console.info(
        JSON.stringify({
          level: 'info',
          code: 'ESCALATION_PROCESSED',
          eventId,
          tier,
          eventType,
          timestamp: new Date().toISOString(),
        }),
      );
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(
      JSON.stringify({
        level: 'error',
        code: 'ESCALATION_TIMER_FAILED',
        jobId: job?.id,
        message: err.message,
        timestamp: new Date().toISOString(),
      }),
    );
  });

  return worker;
}
