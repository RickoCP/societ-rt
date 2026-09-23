/**
 * ResolveDoorInstallationRequestUseCase — Platform-admin action to approve or
 * reject a door-sensor installation request raised by an RT.
 *
 * Approving here only records the decision; the physical device is registered
 * via RegisterDoorSensorUseCase. Rejecting closes the request with a reason.
 *
 * Authorization: Super_Admin only.
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import { UserRole } from '@core/protocols';
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
    authContext: AuthContext;
    input: ResolveDoorInstallationRequestInput;
  }): Promise<DomainResult<DoorInstallationRequest>>;
}

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
    // 1. Role gate — platform admin only.
    if (authContext.role !== UserRole.Super_Admin) {
      return fail(authInsufficientRole());
    }

    // 2. Ensure the request exists within the tenant.
    const found = await doorMonitoringRepository.findInstallationRequest(
      authContext.tenantId,
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
      authContext.tenantId,
      input.requestId,
      input.decision,
      authContext.userId,
    );
    if (!result.success) {
      return fail(result.error);
    }

    // 4. Audit (fire-and-forget).
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'door_installation_resolved',
        resourceType: 'door_installation_request',
        resourceId: input.requestId,
        details: { decision: input.decision },
        impersonatorId: authContext.impersonatorId,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(result.data);
  },
});
