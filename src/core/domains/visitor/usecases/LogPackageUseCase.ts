/**
 * LogPackageUseCase — Logs a new package delivery within a tenant.
 *
 * Logic:
 * 1. Log package via visitorRepository.logPackage
 * 2. Enqueue notification to recipient household (fire-and-forget)
 * 3. Enqueue audit (action: 'package_logged', fire-and-forget)
 * 4. Return ok(packageLog)
 *
 * @see Requirements 15.3, 15.4
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
import type { PackageLog, LogPackageInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface LogPackageUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: LogPackageInput;
  }): Promise<DomainResult<PackageLog>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const LogPackageUseCaseImpl = ({
  visitorRepository,
  notificationQueueProtocol,
  auditQueueProtocol,
}: {
  visitorRepository: VisitorRepository;
  notificationQueueProtocol: NotificationQueueProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): LogPackageUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Log package via repository
    const result = await visitorRepository.logPackage(
      authContext.tenantId,
      data,
      authContext.userId,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const packageLog = result.data;

    // 2. Enqueue notification to recipient household (fire-and-forget)
    notificationQueueProtocol
      .enqueueNotification({
        tenantId: authContext.tenantId,
        userId: data.recipientHouseholdId,
        type: 'package_arrival',
        title: 'Package Delivery',
        body: `Package from ${data.courierName}: ${data.description}`,
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
        actionType: 'package_logged',
        resourceType: 'package_log',
        resourceId: packageLog.id,
        details: {
          recipientHouseholdId: data.recipientHouseholdId,
          courierName: data.courierName,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(packageLog);
  },
});
