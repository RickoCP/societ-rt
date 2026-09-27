/**
 * ResolveDoorInstallationRequestUseCase — Platform-admin action to approve or
 * reject a door-sensor installation request raised by an RT.
 *
 * Approving here only records the decision; the physical device is registered
 * via RegisterDoorSensorUseCase. Rejecting closes the request with a reason.
 *
 * Authorization: Super_Admin only.
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types/AuthContextCompat';
import { getMembershipRole, getTenantId, getUserId, isAuthorizationContext } from '@core/domains/authorization/types/AuthContextCompat';
import { MembershipRole } from '@core/domains/membership/types';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { authInsufficientRole } from '@core/domains/auth/errors/authErrors';
import type { DoorMonitoringRepository } from '../repositories/DoorMonitoringRepository';
import type { DoorInstallationRequest } from '../entities';
import { doorInstallationRequestNotFound } from '../errors/doorMonitoringErrors';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ResolveDoorInstallationRequestInput {
  readonly requestId: string;
  readonly decision: 'approved' | 'rejected';
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ResolveDoorInstallationRequestUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    input: ResolveDoorInstallationRequestInput;
  }): Promise<DomainResult<DoorInstallationRequest>>;
}

// ---------------------------------------------------------------------------
// Allowed roles
// ---------------------------------------------------------------------------

const ADMIN_ROLES: ReadonlySet<MembershipRole> = new Set([
  MembershipRole.PLATFORM_ADMIN,
]);

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ResolveDoorInstallationRequestUseCaseImpl = ({
  doorMonitoringRepository,
  auditQueueProtocol,
}: {
  doorMonitoringRepository: DoorMonitoringRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): ResolveDoorInstallationRequestUseCase => ({
  execute: async ({ authContext, input }) => {
    const role = getMembershipRole(authContext);
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);
    
    // 1. Role gate — platform admin only.
    if (!ADMIN_ROLES.has(role)) {
      return fail(authInsufficientRole());
    }

    // 2. Ensure the request exists within the tenant.
    const found = await doorMonitoringRepository.findInstallationRequest(
      tenantId,
      input.requestId,
    );
    if (!found.success) {
      return fail(found.error);
    }
    if (!found.data) {
      return fail(doorInstallationRequestNotFound(input.requestId));
    }

    // 3. Resolve.
    const result = await doorMonitoringRepository.resolveInstallationRequest(
      tenantId,
      input.requestId,
      input.decision,
      userId,
    );
    if (!result.success) {
      return fail(result.error);
    }

    // 4. Audit (fire-and-forget).
    const impersonatorId = isAuthorizationContext(authContext) 
      ? undefined  // AuthorizationContext doesn't have impersonatorId
      : (authContext as { impersonatorId?: string }).impersonatorId;
    
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'door_installation_resolved',
        resourceType: 'door_installation_request',
        resourceId: input.requestId,
        details: { decision: input.decision },
        impersonatorId,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(result.data);
  },
});
