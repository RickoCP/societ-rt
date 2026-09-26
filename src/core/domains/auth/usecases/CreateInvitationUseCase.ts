/**
 * CreateInvitationUseCase — Creates a time-limited invitation token.
 *
 * Logic:
 * 1. Check authContext.role is Ketua_RT or Pengurus → if not, fail
 * 2. Call authRepository.createInvitation with data
 * 3. Enqueue audit log (fire-and-forget)
 * 4. Return ok(invitation)
 *
 * @see Requirements 3.3, 4.6
 * @see Requirements 6.2, 6.6, 6.7 (AuthorizationContext migration)
 */

import type { AuditQueueProtocol } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import {
  isAuthorizationContext,
  getMembershipRole,
} from '@core/domains/authorization/types';
import { MembershipRole } from '@core/domains/membership/types';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { AuthRepository } from '../repositories/AuthRepository';
import type { InvitationToken } from '../entities';
import { authInsufficientRole } from '../errors/authErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CreateInvitationUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    email: string;
    role: UserRole;
  }): Promise<DomainResult<InvitationToken>>;
}

// ---------------------------------------------------------------------------
// Allowed roles for creating invitations (both legacy and new)
// ---------------------------------------------------------------------------

const ALLOWED_LEGACY_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.Super_Admin,
  UserRole.Ketua_RT,
  UserRole.Pengurus,
]);

const ALLOWED_MEMBERSHIP_ROLES: ReadonlySet<MembershipRole> = new Set([
  MembershipRole.PLATFORM_ADMIN,
  MembershipRole.TENANT_OWNER,
  MembershipRole.RT_ADMIN,
  MembershipRole.ORG_ADMIN,
]);

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CreateInvitationUseCaseImpl = ({
  authRepository,
  auditQueueProtocol,
}: {
  authRepository: AuthRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): CreateInvitationUseCase => ({
  execute: async ({ authContext, email, role }) => {
    // 1. Check role authorization - support both legacy and new roles
    if (isAuthorizationContext(authContext)) {
      // New AuthorizationContext: use MembershipRole
      if (!ALLOWED_MEMBERSHIP_ROLES.has(authContext.role)) {
        return fail(authInsufficientRole());
      }
    } else {
      // Legacy AuthContext: use UserRole
      if (!ALLOWED_LEGACY_ROLES.has(authContext.role)) {
        return fail(authInsufficientRole());
      }
    }

    // 2. Create invitation via repository
    const invitationResult = await authRepository.createInvitation(
      authContext.tenantId,
      {
        email,
        role,
        createdBy: authContext.userId,
      },
    );
    if (!invitationResult.success) {
      return fail(invitationResult.error);
    }

    const invitation = invitationResult.data;

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'invitation_created',
        resourceType: 'invitation',
        resourceId: invitation.id,
        details: { email, role },
        ipAddress: undefined,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(invitation);
  },
});
