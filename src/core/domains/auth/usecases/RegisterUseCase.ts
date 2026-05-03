/**
 * RegisterUseCase — Registers a new user via an invitation token.
 *
 * Logic:
 * 1. Validate invitation token via authRepository.validateInvitation
 * 2. If invalid/expired → return fail
 * 3. Register user via authRepository.register
 * 4. Enqueue audit log (fire-and-forget)
 * 5. Return ok(user)
 *
 * @see Requirements 3.2, 3.3
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type {
  AuthRepository,
  RegisterInput,
} from '../repositories/AuthRepository';
import type { User } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RegisterUseCase {
  execute(params: {
    tenantId: string;
    data: RegisterInput;
    ipAddress?: string;
  }): Promise<DomainResult<User>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RegisterUseCaseImpl = ({
  authRepository,
  auditQueueProtocol,
}: {
  authRepository: AuthRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RegisterUseCase => ({
  execute: async ({ tenantId, data, ipAddress }) => {
    // 1. Validate invitation token
    const invitationResult = await authRepository.validateInvitation(
      data.invitationToken,
    );
    if (!invitationResult.success) {
      return fail(invitationResult.error);
    }

    // 2. Register user
    const registerResult = await authRepository.register(tenantId, data);
    if (!registerResult.success) {
      return fail(registerResult.error);
    }

    const user = registerResult.data;

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: user.id,
        actionType: 'user_registered',
        resourceType: 'user',
        resourceId: user.id,
        details: { email: user.email, role: user.role },
        ipAddress,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(user);
  },
});
