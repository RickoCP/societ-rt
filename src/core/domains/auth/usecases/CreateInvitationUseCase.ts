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
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import { UserRole } from '@core/protocols';
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
    authContext: AuthContext;
    email: string;
    role: UserRole;
  }): Promise<DomainResult<InvitationToken>>;
}

// ---------------------------------------------------------------------------
// Allowed roles for creating invitations
// ---------------------------------------------------------------------------

const ALLOWED_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.Ketua_RT,
  UserRole.Pengurus,
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
    // 1. Check role authorization
    if (!ALLOWED_ROLES.has(authContext.role)) {
      return fail(authInsufficientRole());
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
