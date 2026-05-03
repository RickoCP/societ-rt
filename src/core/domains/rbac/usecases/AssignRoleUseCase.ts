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

import type { AuthContext } from '@core/protocols';
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

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface AssignRoleUseCase {
  execute(params: {
    authContext: AuthContext;
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
    // 1. Only Ketua_RT or Super_Admin can assign roles
    if (
      authContext.role !== UserRole.Ketua_RT &&
      authContext.role !== UserRole.Super_Admin
    ) {
      return fail(authInsufficientRole());
    }

    // 2. Check if the actor is allowed to assign this specific role
    const assignableRoles = ROLE_HIERARCHY[authContext.role];
    if (!assignableRoles.includes(newRole)) {
      return fail(authRoleEscalationDenied());
    }

    // 3. Assign the role via repository
    const assignResult = await rbacRepository.assignRole(
      authContext.tenantId,
      targetUserId,
      newRole,
    );

    if (!assignResult.success) {
      return assignResult;
    }

    // 4. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
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
