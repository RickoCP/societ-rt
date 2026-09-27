/**
 * UpdateResidentStatusUseCase — Updates a resident's residency status.
 *
 * Logic:
 * 1. Update status via residentRepository
 * 2. Enqueue audit log with residentId and newStatus (fire-and-forget)
 * 3. Return ok(resident)
 *
 * @see Requirements 5.3, 5.5
 * @see Requirements 6.2, 6.5 (AuthorizationContext migration)
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { ResidentRepository } from '../repositories/ResidentRepository';
import type { Resident, ResidencyStatus } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface UpdateResidentStatusUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    residentId: string;
    status: ResidencyStatus;
  }): Promise<DomainResult<Resident>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const UpdateResidentStatusUseCaseImpl = ({
  residentRepository,
  auditQueueProtocol,
}: {
  residentRepository: ResidentRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): UpdateResidentStatusUseCase => ({
  execute: async ({ authContext, residentId, status }) => {
    // 1. Update status via repository
    const result = await residentRepository.updateResidentStatus(
      authContext.tenantId,
      residentId,
      status,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const resident = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'resident_status_updated',
        resourceType: 'resident',
        resourceId: residentId,
        details: { residentId, newStatus: status },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(resident);
  },
});
