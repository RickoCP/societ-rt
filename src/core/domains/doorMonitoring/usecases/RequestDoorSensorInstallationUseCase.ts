/**
 * RequestDoorSensorInstallationUseCase — Lets an RT (Ketua_RT / Pengurus) raise
 * a request to have a door sensor installed & registered for a household.
 *
 * The RT can ONLY request; a platform admin (Super_Admin) later approves and
 * registers the physical device id via RegisterDoorSensorUseCase.
 *
 * Logic:
 *  1. Role gate — Ketua_RT or Pengurus.
 *  2. Create the installation request (status: pending).
 *  3. Audit (fire-and-forget).
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types/AuthContextCompat';
import { getMembershipRole, getTenantId, getUserId } from '@core/domains/authorization/types/AuthContextCompat';
import { MembershipRole } from '@core/domains/membership/types';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { authInsufficientRole } from '@core/domains/auth/errors/authErrors';
import type { DoorMonitoringRepository } from '../repositories/DoorMonitoringRepository';
import type {
  DoorInstallationRequest,
  CreateDoorInstallationRequestInput,
} from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RequestDoorSensorInstallationUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    input: CreateDoorInstallationRequestInput;
  }): Promise<DomainResult<DoorInstallationRequest>>;
}

// ---------------------------------------------------------------------------
// Allowed roles
// ---------------------------------------------------------------------------

const ALLOWED_ROLES: ReadonlySet<MembershipRole> = new Set([
  MembershipRole.RT_ADMIN,
  MembershipRole.ORG_ADMIN, // Pengurus maps to ORG_ADMIN
  MembershipRole.TENANT_OWNER,
]);

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RequestDoorSensorInstallationUseCaseImpl = ({
  doorMonitoringRepository,
  auditQueueProtocol,
}: {
  doorMonitoringRepository: DoorMonitoringRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RequestDoorSensorInstallationUseCase => ({
  execute: async ({ authContext, input }) => {
    const role = getMembershipRole(authContext);
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);
    
    // 1. Role gate — RT roles only.
    if (!ALLOWED_ROLES.has(role)) {
      return fail(authInsufficientRole());
    }

    const note = (input.note ?? '').trim();

    // 2. Create the request.
    const result = await doorMonitoringRepository.createInstallationRequest(
      tenantId,
      input.householdId,
      userId,
      note.length > 0 ? note : null,
    );
    if (!result.success) {
      return fail(result.error);
    }

    // 3. Audit (fire-and-forget).
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'door_installation_requested',
        resourceType: 'door_installation_request',
        resourceId: result.data.id,
        details: { householdId: input.householdId },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(result.data);
  },
});
