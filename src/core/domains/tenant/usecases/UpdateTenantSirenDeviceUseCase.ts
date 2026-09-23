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

import type { AuditQueueProtocol, AuthContext } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { TenantRepository } from '../repositories/TenantRepository';
import type { Tenant, UpdateTenantSirenInput } from '../entities';
import { authInsufficientRole } from '@core/domains/auth/errors/authErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface UpdateTenantSirenDeviceUseCase {
  execute(params: {
    authContext: AuthContext;
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
    // 1. Check role
    if (!ALLOWED_ROLES.has(authContext.role)) {
      return fail(authInsufficientRole());
    }

    // 2. Normalize: treat empty/whitespace as clearing the device (null).
    const trimmed = (input.sirenDeviceId ?? '').trim();
    const sirenDeviceId = trimmed.length > 0 ? trimmed : null;

    // 3. Update tenant. tenantId comes from the (route-overridden) auth context.
    const updateResult = await tenantRepository.update(authContext.tenantId, {
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
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'tenant_siren_device_updated',
        resourceType: 'tenant',
        resourceId: tenant.id,
        details: {
          sirenConfigured: sirenDeviceId !== null,
        },
        impersonatorId: authContext.impersonatorId,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 5. Return success
    return ok(tenant);
  },
});
