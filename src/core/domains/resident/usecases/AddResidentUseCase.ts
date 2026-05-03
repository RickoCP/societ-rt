/**
 * AddResidentUseCase — Adds a new resident to a household within a tenant.
 *
 * Logic:
 * 1. Add resident via residentRepository
 * 2. Enqueue audit log (fire-and-forget)
 * 3. Return ok(resident)
 *
 * @see Requirements 5.2, 5.3
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { ResidentRepository } from '../repositories/ResidentRepository';
import type { CreateResidentInput, Resident } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface AddResidentUseCase {
  execute(params: {
    authContext: AuthContext;
    data: CreateResidentInput;
  }): Promise<DomainResult<Resident>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const AddResidentUseCaseImpl = ({
  residentRepository,
  auditQueueProtocol,
}: {
  residentRepository: ResidentRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): AddResidentUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Add resident via repository
    const result = await residentRepository.addResident(
      authContext.tenantId,
      data,
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
        actionType: 'resident_added',
        resourceType: 'resident',
        resourceId: resident.id,
        details: { name: resident.name, householdId: resident.householdId },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(resident);
  },
});
