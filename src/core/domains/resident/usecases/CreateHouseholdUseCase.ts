/**
 * CreateHouseholdUseCase — Creates a new household within a tenant.
 *
 * Logic:
 * 1. Create household via residentRepository
 * 2. Enqueue audit log (fire-and-forget)
 * 3. Return ok(household)
 *
 * @see Requirements 5.1, 6.1
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { ResidentRepository } from '../repositories/ResidentRepository';
import type { CreateHouseholdInput, Household } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CreateHouseholdUseCase {
  execute(params: {
    authContext: AuthContext;
    data: CreateHouseholdInput;
  }): Promise<DomainResult<Household>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CreateHouseholdUseCaseImpl = ({
  residentRepository,
  auditQueueProtocol,
}: {
  residentRepository: ResidentRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): CreateHouseholdUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Create household via repository
    const result = await residentRepository.createHousehold(
      authContext.tenantId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const household = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'household_created',
        resourceType: 'household',
        resourceId: household.id,
        details: { householdNumber: household.householdNumber },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(household);
  },
});
