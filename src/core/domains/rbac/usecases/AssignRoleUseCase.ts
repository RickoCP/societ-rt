/**
 * AssignRoleUseCase — Assigns a new role to a target user.
 *
 * Logic:
 * 1. If authContext.role is not Ketua_RT or Super_Admin → fail with authInsufficientRole()
 * 2. If Ketua_RT tries to assign Super_Admin → fail with authRoleEscalationDenied()
 * 3. Call rbacRepository.assignRole
 * 4. Enqueue audit log (action: 'role_changed', details: { targetUserId, newRole })
 * 5. Return ok(undefined)
 *
 * @see Requirements 4.2, 4.3, 4.5, 4.6
 */

import { UserRole } from '@core/protocols';
import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { RbacRepository } from '../repositories/RbacRepository';
import { ROLE_HIERARCHY } from '../entities';
import {
  authInsufficientRole,
  authRoleEscalationDenied,
} from '@core/domains/auth/errors/authErrors';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { hasAllowedUserRole, getTenantId, getUserId, isLegacyAuthContext } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Allowed roles
// ---------------------------------------------------------------------------

const ALLOWED_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.Ketua_RT,
  UserRole.Super_Admin,
]);

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface AssignRoleUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    targetUserId: string;
    newRole: UserRole;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const AssignRoleUseCaseImpl = ({
  rbacRepository,
  auditQueueProtocol,
}: {
  rbacRepository: RbacRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): AssignRoleUseCase => ({
  execute: async ({ authContext, targetUserId, newRole }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // 1. Only Ketua_RT or Super_Admin can assign roles
    if (!hasAllowedUserRole(authContext, ALLOWED_ROLES)) {
      return fail(authInsufficientRole());
    }

    // 2. Check if the actor is allowed to assign this specific role
    // For legacy context, use role directly; for new context, we need to map
    let actorRole: UserRole;
    if (isLegacyAuthContext(authContext)) {
      actorRole = authContext.role;
    } else {
      // Map MembershipRole back to UserRole for ROLE_HIERARCHY check
      // This is a simplified mapping - in a full migration, ROLE_HIERARCHY should use MembershipRole
      const roleMapping: Record<string, UserRole> = {
        'PLATFORM_ADMIN': UserRole.Super_Admin,
        'RT_ADMIN': UserRole.Ketua_RT,
        'TENANT_OWNER': UserRole.Ketua_RT,
        'ORG_ADMIN': UserRole.Pengurus,
        'RESIDENT': UserRole.Warga,
        'SECURITY': UserRole.Security_Guard,
      };
      actorRole = roleMapping[authContext.role] ?? UserRole.Warga;
    }
    
    const assignableRoles = ROLE_HIERARCHY[actorRole];
    if (!assignableRoles.includes(newRole)) {
      return fail(authRoleEscalationDenied());
    }

    // 3. Assign the role via repository
    const assignResult = await rbacRepository.assignRole(
      tenantId,
      targetUserId,
      newRole,
    );

    if (!assignResult.success) {
      return assignResult;
    }

    // 4. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'role_changed',
        resourceType: 'user',
        resourceId: targetUserId,
        details: { targetUserId, newRole },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 5. Return success
    return ok(undefined);
  },
});
