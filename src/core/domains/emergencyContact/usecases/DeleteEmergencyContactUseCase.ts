/**
 * DeleteEmergencyContactUseCase — Removes an emergency contact from the
 * caller's tenant. Admin-only (Ketua_RT / Pengurus / Super_Admin).
 *
 * @see Requirements 6.2, 6.5, 6.7 (AuthorizationContext migration)
 */

import type { AuditQueueProtocol } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { isAuthorizationContext } from '@core/domains/authorization/types';
import { MembershipRole } from '@core/domains/membership/types';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { authInsufficientRole } from '@core/domains/auth/errors/authErrors';
import type { EmergencyContactRepository } from '../repositories';
import { emergencyContactNotFound } from '../errors';

// Legacy admin roles
const LEGACY_ADMIN_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.Super_Admin,
  UserRole.Ketua_RT,
  UserRole.Pengurus,
]);

// New membership admin roles
const MEMBERSHIP_ADMIN_ROLES: ReadonlySet<MembershipRole> = new Set([
  MembershipRole.PLATFORM_ADMIN,
  MembershipRole.TENANT_OWNER,
  MembershipRole.RT_ADMIN,
  MembershipRole.ORG_ADMIN,
]);

export interface DeleteEmergencyContactUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    id: string;
  }): Promise<DomainResult<void>>;
}

export const DeleteEmergencyContactUseCaseImpl = ({
  emergencyContactRepository,
  auditQueueProtocol,
}: {
  emergencyContactRepository: EmergencyContactRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): DeleteEmergencyContactUseCase => ({
  execute: async ({ authContext, id }) => {
    // 1. Role gate - support both legacy and new role types.
    if (isAuthorizationContext(authContext)) {
      if (!MEMBERSHIP_ADMIN_ROLES.has(authContext.role)) {
        return fail(authInsufficientRole());
      }
    } else {
      if (!LEGACY_ADMIN_ROLES.has(authContext.role)) {
        return fail(authInsufficientRole());
      }
    }

    // 2. Ensure it exists within the tenant.
    const existing = await emergencyContactRepository.findById(
      authContext.tenantId,
      id,
    );
    if (!existing.success) {
      return fail(existing.error);
    }
    if (!existing.data) {
      return fail(emergencyContactNotFound(id));
    }

    // 3. Delete.
    const result = await emergencyContactRepository.remove(
      authContext.tenantId,
      id,
    );
    if (!result.success) {
      return fail(result.error);
    }

    // 4. Audit (fire-and-forget).
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'emergency_contact_deleted',
        resourceType: 'emergency_contact',
        resourceId: id,
        details: {},
        impersonatorId: isAuthorizationContext(authContext) ? undefined : authContext.impersonatorId,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(undefined);
  },
});
