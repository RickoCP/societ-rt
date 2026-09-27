/**
 * UpdateTenantSirenDeviceUseCase — Sets the physical siren device id for a
 * tenant (RT). The panic button triggers the siren belonging to the triggering
 * user's tenant, so this is what wires an RT to its own alarm device.
 *
 * Logic:
 * 1. Check authContext.role is Ketua_RT or Super_Admin
 * 2. If not → fail with authInsufficientRole()
 * 3. Update tenant via tenantRepository.update (sirenDeviceId)
 * 4. Enqueue audit log (fire-and-forget)
 * 5. Return ok(tenant)
 */

import type { AuditQueueProtocol } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { TenantRepository } from '../repositories/TenantRepository';
import type { Tenant, UpdateTenantSirenInput } from '../entities';
import { authInsufficientRole } from '@core/domains/auth/errors/authErrors';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { hasAllowedUserRole, getTenantId, getUserId, getImpersonatorId } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface UpdateTenantSirenDeviceUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    input: UpdateTenantSirenInput;
  }): Promise<DomainResult<Tenant>>;
}

// ---------------------------------------------------------------------------
// Allowed roles
// ---------------------------------------------------------------------------

const ALLOWED_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.Ketua_RT,
  UserRole.Super_Admin,
]);

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const UpdateTenantSirenDeviceUseCaseImpl = ({
  tenantRepository,
  auditQueueProtocol,
}: {
  tenantRepository: TenantRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): UpdateTenantSirenDeviceUseCase => ({
  execute: async ({ authContext, input }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);
    const impersonatorId = getImpersonatorId(authContext);

    // 1. Check role
    if (!hasAllowedUserRole(authContext, ALLOWED_ROLES)) {
      return fail(authInsufficientRole());
    }

    // 2. Normalize: treat empty/whitespace as clearing the device (null).
    const trimmed = (input.sirenDeviceId ?? '').trim();
    const sirenDeviceId = trimmed.length > 0 ? trimmed : null;

    // 3. Update tenant. tenantId comes from the (route-overridden) auth context.
    const updateResult = await tenantRepository.update(tenantId, {
      sirenDeviceId,
    });
    if (!updateResult.success) {
      return fail(updateResult.error);
    }

    const tenant = updateResult.data;

    // 4. Enqueue audit log (fire-and-forget). Never log secrets — the device id
    //    is not a secret, but we record only presence-relevant metadata.
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'tenant_siren_device_updated',
        resourceType: 'tenant',
        resourceId: tenant.id,
        details: {
          sirenConfigured: sirenDeviceId !== null,
        },
        impersonatorId,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 5. Return success
    return ok(tenant);
  },
});
