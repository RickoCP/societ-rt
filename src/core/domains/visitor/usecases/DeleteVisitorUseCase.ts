/**
 * DeleteVisitorUseCase — Deletes a visitor log entry.
 *
 * Authorization logic:
 * 1. User can delete if they are the original creator (loggedBy === userId)
 * 2. OR user has admin/security role (RT_ADMIN, ORG_ADMIN, TENANT_OWNER, SECURITY, PLATFORM_ADMIN)
 *
 * Flow:
 * 1. Find visitor log by ID
 * 2. Check authorization (creator OR admin role)
 * 3. Delete visitor log via repository
 * 4. Enqueue audit log (fire-and-forget)
 * 5. Return ok(void)
 *
 * @see Requirements 15.1, 15.2
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { isAuthorizationContext } from '@core/domains/authorization/types';
import { MembershipRole } from '@core/domains/membership/types';
import type { DomainResult } from '@core/utils';
import { ok, fail, businessError, notFoundError } from '@core/utils';
import type { VisitorRepository } from '../repositories/VisitorRepository';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface DeleteVisitorUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    visitorLogId: string;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Roles allowed to delete any visitor log (not just their own)
// ---------------------------------------------------------------------------

const ADMIN_ROLES: ReadonlySet<MembershipRole> = new Set([
  MembershipRole.PLATFORM_ADMIN,
  MembershipRole.TENANT_OWNER,
  MembershipRole.ORG_ADMIN,
  MembershipRole.RT_ADMIN,
  MembershipRole.SECURITY,
]);

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const DeleteVisitorUseCaseImpl = ({
  visitorRepository,
  auditQueueProtocol,
}: {
  visitorRepository: VisitorRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): DeleteVisitorUseCase => ({
  execute: async ({ authContext, visitorLogId }) => {
    // 1. Find visitor log by ID
    const findResult = await visitorRepository.findById(
      authContext.tenantId,
      visitorLogId,
    );

    if (!findResult.success) {
      return fail(findResult.error);
    }

    const visitorLog = findResult.data;

    if (!visitorLog) {
      return fail(
        notFoundError(
          'VISITOR_NOT_FOUND',
          'Visitor log not found',
        ),
      );
    }

    // 2. Check authorization
    const isCreator = visitorLog.loggedBy === authContext.userId;

    // Check if user has admin role
    let hasAdminRole = false;
    if (isAuthorizationContext(authContext)) {
      // New AuthorizationContext: check MembershipRole
      hasAdminRole = ADMIN_ROLES.has(authContext.role);
    } else {
      // Legacy AuthContext: map UserRole to check
      // Legacy roles: Super_Admin, Ketua_RT, Pengurus, Security_Guard
      const legacyAdminRoles = ['Super_Admin', 'Ketua_RT', 'Pengurus', 'Security_Guard'];
      hasAdminRole = legacyAdminRoles.includes(authContext.role as string);
    }

    if (!isCreator && !hasAdminRole) {
      return fail(
        businessError(
          'VISITOR_DELETE_NOT_AUTHORIZED',
          'You are not authorized to delete this visitor log. Only the creator or admin/security personnel can delete.',
        ),
      );
    }

    // 3. Delete visitor log via repository
    const deleteResult = await visitorRepository.deleteVisitor(
      authContext.tenantId,
      visitorLogId,
    );

    if (!deleteResult.success) {
      return fail(deleteResult.error);
    }

    // 4. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'visitor_deleted',
        resourceType: 'visitor_log',
        resourceId: visitorLogId,
        details: {
          visitorName: visitorLog.visitorName,
          purpose: visitorLog.purpose,
          deletedByCreator: isCreator,
          deletedByAdmin: hasAdminRole && !isCreator,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 5. Return success
    return ok(undefined);
  },
});
