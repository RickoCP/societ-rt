/**
 * UpdateEmergencyStatusUseCase — Updates the status of an existing
 * emergency alert within a tenant.
 *
 * Logic:
 * 1. Update status via emergencyRepository.updateStatus
 * 2. Enqueue audit (action: 'emergency_status_updated', fire-and-forget)
 * 3. Return ok(updatedAlert)
 *
 * @see Requirements 10.3, 10.5
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { EmergencyRepository } from '../repositories/EmergencyRepository';
import type { EmergencyAlert } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface UpdateEmergencyStatusUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    alertId: string;
    status: EmergencyAlert['status'];
  }): Promise<DomainResult<EmergencyAlert>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const UpdateEmergencyStatusUseCaseImpl = ({
  emergencyRepository,
  auditQueueProtocol,
}: {
  emergencyRepository: EmergencyRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): UpdateEmergencyStatusUseCase => ({
  execute: async ({ authContext, alertId, status }) => {
    // 1. Update status via repository
    const result = await emergencyRepository.updateStatus(
      authContext.tenantId,
      alertId,
      status,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const updatedAlert = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'emergency_status_updated',
        resourceType: 'emergency_alert',
        resourceId: alertId,
        details: {
          newStatus: status,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(updatedAlert);
  },
});
