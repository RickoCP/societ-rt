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

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import { UserRole } from '@core/protocols';
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
    authContext: AuthContext;
    input: CreateDoorInstallationRequestInput;
  }): Promise<DomainResult<DoorInstallationRequest>>;
}

// ---------------------------------------------------------------------------
// Allowed roles
// ---------------------------------------------------------------------------

const ALLOWED_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.Ketua_RT,
  UserRole.Pengurus,
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
    // 1. Role gate — RT roles only.
    if (!ALLOWED_ROLES.has(authContext.role)) {
      return fail(authInsufficientRole());
    }

    const note = (input.note ?? '').trim();

    // 2. Create the request.
    const result = await doorMonitoringRepository.createInstallationRequest(
      authContext.tenantId,
      input.householdId,
      authContext.userId,
      note.length > 0 ? note : null,
    );
    if (!result.success) {
      return fail(result.error);
    }

    // 3. Audit (fire-and-forget).
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
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
