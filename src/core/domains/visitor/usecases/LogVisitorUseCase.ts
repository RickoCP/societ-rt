/**
 * LogVisitorUseCase — Logs a new visitor entry within a tenant.
 *
 * Logic:
 * 1. Log visitor via visitorRepository.logVisitor
 * 2. Enqueue notification to destination household (fire-and-forget)
 * 3. Enqueue audit (action: 'visitor_logged', fire-and-forget)
 * 4. Return ok(visitorLog)
 *
 * @see Requirements 15.1, 15.2
 * @see Requirements 6.2, 6.5 (AuthorizationContext migration)
 */

import type {
  AuditQueueProtocol,
  NotificationQueueProtocol,
} from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { VisitorRepository } from '../repositories/VisitorRepository';
import type { VisitorLog, LogVisitorInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface LogVisitorUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: LogVisitorInput;
  }): Promise<DomainResult<VisitorLog>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const LogVisitorUseCaseImpl = ({
  visitorRepository,
  notificationQueueProtocol,
  auditQueueProtocol,
}: {
  visitorRepository: VisitorRepository;
  notificationQueueProtocol: NotificationQueueProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): LogVisitorUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Log visitor via repository
    const result = await visitorRepository.logVisitor(
      authContext.tenantId,
      data,
      authContext.userId,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const visitorLog = result.data;

    // 2. Enqueue notification to destination household (fire-and-forget)
    notificationQueueProtocol
      .enqueueNotification({
        tenantId: authContext.tenantId,
        userId: data.destinationHouseholdId,
        type: 'visitor_arrival',
        title: 'Visitor Arrival',
        body: `Visitor ${data.visitorName} has arrived. Purpose: ${data.purpose}`,
        channels: ['push', 'inbox'],
      })
      .catch(() => {
        /* notification must not block the response */
      });

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'visitor_logged',
        resourceType: 'visitor_log',
        resourceId: visitorLog.id,
        details: {
          visitorName: data.visitorName,
          purpose: data.purpose,
          destinationHouseholdId: data.destinationHouseholdId,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(visitorLog);
  },
});
