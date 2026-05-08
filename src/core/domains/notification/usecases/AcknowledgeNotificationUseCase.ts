/**
 * AcknowledgeNotificationUseCase — Stops further escalation for an event
 * when any recipient acknowledges the notification.
 *
 * When acknowledged:
 * 1. Mark the notification/event as acknowledged in the repository
 * 2. Cancel pending escalation jobs (Tier 2 and Tier 3) via QueueProtocol
 * 3. Record acknowledgment in audit log
 *
 * @see Requirements 43.4, 43.10
 */

import type { QueueProtocol, AuditQueueProtocol } from '@core/protocols';
import type { AuthContext } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type { NotificationRepository } from '../repositories/NotificationRepository';
import {
  notificationNotFound,
} from '../errors/notificationErrors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AcknowledgeNotificationInput {
  readonly eventId: string;
  readonly notificationId: string;
}

export interface AcknowledgeNotificationResult {
  readonly eventId: string;
  readonly acknowledgedBy: string;
  readonly acknowledgedAt: Date;
  readonly escalationCancelled: boolean;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface AcknowledgeNotificationUseCase {
  execute(params: {
    authContext: AuthContext;
    data: AcknowledgeNotificationInput;
  }): Promise<DomainResult<AcknowledgeNotificationResult>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const AcknowledgeNotificationUseCaseImpl = ({
  notificationRepository,
  queueProtocol,
  auditQueueProtocol,
}: {
  notificationRepository: NotificationRepository;
  queueProtocol: QueueProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): AcknowledgeNotificationUseCase => ({
  execute: async ({ authContext, data }) => {
    try {
      // 1. Mark notification as read (acknowledged)
      const markResult = await notificationRepository.markAsRead(
        authContext.tenantId,
        data.notificationId,
      );

      if (!markResult.success) {
        // If the notification doesn't exist
        if (markResult.error.code === 'COMMON_NOT_FOUND') {
          return fail(notificationNotFound(data.notificationId));
        }
        return fail(markResult.error);
      }

      const acknowledgedAt = new Date();

      // 2. Cancel pending escalation jobs for this event
      let escalationCancelled = false;
      try {
        // Enqueue a cancellation job to remove pending escalation jobs
        await queueProtocol.enqueue(
          'cancel_escalation',
          {
            eventId: data.eventId,
            cancelJobIds: [
              `escalation_tier2_${data.eventId}`,
              `escalation_tier3_${data.eventId}`,
            ],
          },
          {
            jobId: `cancel_escalation_${data.eventId}`,
            priority: 1, // High priority to cancel quickly
          },
        );
        escalationCancelled = true;
      } catch {
        // Escalation cancellation failure should not block acknowledgment
        escalationCancelled = false;
      }

      // 3. Audit log the acknowledgment (fire-and-forget)
      auditQueueProtocol
        .enqueueAudit({
          tenantId: authContext.tenantId,
          actorUserId: authContext.userId,
          actionType: 'notification_acknowledged',
          resourceType: 'notification',
          resourceId: data.notificationId,
          details: {
            eventId: data.eventId,
            acknowledgedAt: acknowledgedAt.toISOString(),
            escalationCancelled,
          },
        })
        .catch(() => {
          /* audit must not block the response */
        });

      return ok({
        eventId: data.eventId,
        acknowledgedBy: authContext.userId,
        acknowledgedAt,
        escalationCancelled,
      });
    } catch (error) {
      return fail(
        technicalError(
          'NOTIFICATION_ACKNOWLEDGE_FAILED',
          'Failed to acknowledge notification',
          { cause: error },
        ),
      );
    }
  },
});
