/**
 * LoginUseCase — Authenticates a user with email/password credentials.
 *
 * Logic:
 * 1. Find user by email via authRepository.findByEmail
 * 2. If not found → fail with authInvalidCredentials()
 * 3. Check if account is locked (lockedUntil > now) → fail with authAccountLocked
 * 4. Call authRepository.login(tenantId, email, password)
 * 5. If login fails → increment failed attempts; lock account if >= 5 attempts
 * 6. If login succeeds → reset failed attempts
 * 7. Enqueue audit log (fire-and-forget)
 * 8. Return ok(loginResult)
 *
 * @see Requirements 3.1, 3.4, 3.5, 3.8
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { AuthRepository } from '../repositories/AuthRepository';
import type { LoginResult } from '../entities';
import {
  authInvalidCredentials,
  authAccountLocked,
} from '../errors/authErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface LoginUseCase {
  execute(params: {
    tenantId: string;
    email: string;
    password: string;
    ipAddress?: string;
  }): Promise<DomainResult<LoginResult>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const LoginUseCaseImpl = ({
  authRepository,
  auditQueueProtocol,
}: {
  authRepository: AuthRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): LoginUseCase => ({
  execute: async ({ tenantId, email, password, ipAddress }) => {
    // 1. Find user by email
    const findResult = await authRepository.findByEmail(tenantId, email);
    if (!findResult.success) {
      return fail(findResult.error);
    }

    const user = findResult.data;

    // 2. If not found → invalid credentials
    if (!user) {
      return fail(authInvalidCredentials());
    }

    // 3. Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return fail(authAccountLocked(user.lockedUntil));
    }

    // 4. Attempt login via repository
    const loginResult = await authRepository.login(tenantId, email, password);

    // 5. If login fails → increment failed attempts
    if (!loginResult.success) {
      const newAttempts = user.failedLoginAttempts + 1;
      const lockedUntil =
        newAttempts >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCK_DURATION_MS)
          : null;

      // Fire-and-forget: update failed attempts
      await authRepository
        .updateFailedAttempts(tenantId, user.id, newAttempts, lockedUntil)
        .catch(() => {
          /* best-effort — do not block response */
        });

      return fail(loginResult.error);
    }

    // 6. Login succeeded → reset failed attempts
    await authRepository
      .resetFailedAttempts(tenantId, user.id)
      .catch(() => {
        /* best-effort — do not block response */
      });

    // 7. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: user.id,
        actionType: 'user_login',
        resourceType: 'session',
        resourceId: user.id,
        details: { email },
        ipAddress,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 8. Return success
    return ok(loginResult.data);
  },
});
