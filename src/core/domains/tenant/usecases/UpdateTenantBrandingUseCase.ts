/**
 * UpdateTenantBrandingUseCase — Updates tenant branding (logo, colors).
 *
 * Logic:
 * 1. Check authContext.role is Ketua_RT or Super_Admin
 * 2. If not → fail with authInsufficientRole()
 * 3. Update tenant via tenantRepository.update
 * 4. Enqueue audit log (fire-and-forget)
 * 5. Return ok(tenant)
 *
 * @see Requirements 2.3, 2.6
 */

import type { AuditQueueProtocol, AuthContext } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { TenantRepository } from '../repositories/TenantRepository';
import type { Tenant, UpdateTenantBrandingInput } from '../entities';
import { authInsufficientRole } from '@core/domains/auth/errors/authErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface UpdateTenantBrandingUseCase {
  execute(params: {
    authContext: AuthContext;
    branding: UpdateTenantBrandingInput;
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

export const UpdateTenantBrandingUseCaseImpl = ({
  tenantRepository,
  auditQueueProtocol,
}: {
  tenantRepository: TenantRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): UpdateTenantBrandingUseCase => ({
  execute: async ({ authContext, branding }) => {
    // 1. Check role
    if (!ALLOWED_ROLES.has(authContext.role)) {
      return fail(authInsufficientRole());
    }

    // 2. Update tenant branding
    const updateResult = await tenantRepository.update(
      authContext.tenantId,
      branding,
    );
    if (!updateResult.success) {
      return fail(updateResult.error);
    }

    const tenant = updateResult.data;

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'tenant_branding_updated',
        resourceType: 'tenant',
        resourceId: tenant.id,
        details: { branding },
        impersonatorId: authContext.impersonatorId,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(tenant);
  },
});
