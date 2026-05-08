/**
 * ProcessNotificationEscalationUseCase — Manages notification escalation tiers
 * for security events.
 *
 * Escalation Tiers:
 * - Tier 1: Security_Guard — immediate notification
 * - Tier 2: Ketua_RT — after 5 minutes if unacknowledged
 * - Tier 3: Emergency contacts — after 15 minutes if unacknowledged
 *
 * Uses QueueProtocol to schedule delayed escalation jobs.
 * Escalation stops when any recipient acknowledges the notification.
 *
 * @see Requirements 43.3, 43.4, 43.10
 */

import type {
  NotificationQueueProtocol,
  QueueProtocol,
  AuditQueueProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscalationTier = 1 | 2 | 3;

export interface EscalationRecipient {
  readonly userId: string;
  readonly role: string;
  readonly tier: EscalationTier;
}

export interface ProcessNotificationEscalationInput {
  readonly tenantId: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly title: string;
  readonly body: string;
  /** Tier 1 recipients (Security_Guard) — notified immediately */
  readonly tier1Recipients: EscalationRecipient[];
  /** Tier 2 recipients (Ketua_RT) — notified after 5 min if unacknowledged */
  readonly tier2Recipients: EscalationRecipient[];
  /** Tier 3 recipients (emergency contacts) — notified after 15 min if unacknowledged */
  readonly tier3Recipients: EscalationRecipient[];
}

export interface EscalationResult {
  readonly eventId: string;
  readonly tier1JobIds: string[];
  readonly tier2JobId: string;
  readonly tier3JobId: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ProcessNotificationEscalationUseCase {
  execute(
    input: ProcessNotificationEscalationInput,
  ): Promise<DomainResult<EscalationResult>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Delay before Tier 2 escalation (5 minutes in milliseconds) */
const TIER_2_DELAY_MS = 5 * 60 * 1000;

/** Delay before Tier 3 escalation (15 minutes in milliseconds) */
const TIER_3_DELAY_MS = 15 * 60 * 1000;

const ESCALATION_JOB_TYPE = 'notification_escalation';

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ProcessNotificationEscalationUseCaseImpl = ({
  notificationQueueProtocol,
  queueProtocol,
  auditQueueProtocol,
}: {
  notificationQueueProtocol: NotificationQueueProtocol;
  queueProtocol: QueueProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): ProcessNotificationEscalationUseCase => ({
  execute: async (
    input: ProcessNotificationEscalationInput,
  ): Promise<DomainResult<EscalationResult>> => {
    try {
      const tier1JobIds: string[] = [];

      // Tier 1: Immediate notification to Security_Guard
      for (const recipient of input.tier1Recipients) {
        await notificationQueueProtocol.enqueueNotification({
          tenantId: input.tenantId,
          userId: recipient.userId,
          type: input.eventType,
          title: input.title,
          body: input.body,
          channels: ['push', 'inbox'],
        });
        tier1JobIds.push(
          `tier1_${input.eventId}_${recipient.userId}`,
        );
      }

      // Tier 2: Schedule delayed notification to Ketua_RT (after 5 min)
      const tier2JobId = await queueProtocol.enqueue(
        ESCALATION_JOB_TYPE,
        {
          tenantId: input.tenantId,
          eventId: input.eventId,
          eventType: input.eventType,
          tier: 2,
          title: input.title,
          body: input.body,
          recipients: input.tier2Recipients,
        },
        {
          delay: TIER_2_DELAY_MS,
          jobId: `escalation_tier2_${input.eventId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );

      // Tier 3: Schedule delayed notification to emergency contacts (after 15 min)
      const tier3JobId = await queueProtocol.enqueue(
        ESCALATION_JOB_TYPE,
        {
          tenantId: input.tenantId,
          eventId: input.eventId,
          eventType: input.eventType,
          tier: 3,
          title: input.title,
          body: input.body,
          recipients: input.tier3Recipients,
        },
        {
          delay: TIER_3_DELAY_MS,
          jobId: `escalation_tier3_${input.eventId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );

      // Audit log the escalation setup (fire-and-forget)
      auditQueueProtocol
        .enqueueAudit({
          tenantId: input.tenantId,
          actorUserId: 'system',
          actionType: 'notification_escalation_started',
          resourceType: 'notification',
          resourceId: input.eventId,
          details: {
            eventType: input.eventType,
            tier1Count: input.tier1Recipients.length,
            tier2Count: input.tier2Recipients.length,
            tier3Count: input.tier3Recipients.length,
            tier2DelayMs: TIER_2_DELAY_MS,
            tier3DelayMs: TIER_3_DELAY_MS,
          },
        })
        .catch(() => {
          /* audit must not block the response */
        });

      return ok({
        eventId: input.eventId,
        tier1JobIds,
        tier2JobId,
        tier3JobId,
      });
    } catch (error) {
      return fail(
        technicalError(
          'NOTIFICATION_ESCALATION_FAILED',
          'Failed to process notification escalation',
          { cause: error },
        ),
      );
    }
  },
});
