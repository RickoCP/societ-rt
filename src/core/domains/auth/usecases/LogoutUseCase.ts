/**
 * LogoutUseCase — Invalidates a user session.
 *
 * Logic:
 * 1. Call authRepository.logout(userId)
 * 2. Enqueue audit log (fire-and-forget)
 * 3. Return ok(undefined)
 *
 * @see Requirements 3.6
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { AuthRepository } from '../repositories/AuthRepository';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface LogoutUseCase {
  execute(params: {
    userId: string;
    tenantId: string;
    ipAddress?: string;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const LogoutUseCaseImpl = ({
  authRepository,
  auditQueueProtocol,
}: {
  authRepository: AuthRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): LogoutUseCase => ({
  execute: async ({ userId, tenantId, ipAddress }) => {
    // 1. Invalidate session
    const logoutResult = await authRepository.logout(userId);
    if (!logoutResult.success) {
      return fail(logoutResult.error);
    }

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'user_logout',
        resourceType: 'session',
        resourceId: userId,
        details: {},
        ipAddress,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(undefined);
  },
});
