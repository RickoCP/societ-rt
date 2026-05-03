/**
 * CheckPermissionUseCase — Validates that a user's role meets the minimum
 * required role for an operation.
 *
 * This is a pure-logic use case with no external dependencies.
 * Returns synchronously (no Promise).
 *
 * @see Requirements 4.2, 4.4
 */

import type { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { hasMinimumRole } from '../entities';
import { authInsufficientRole } from '@core/domains/auth/errors/authErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CheckPermissionUseCase {
  execute(params: {
    userRole: UserRole;
    requiredRole: UserRole;
  }): DomainResult<void>;
}

// ---------------------------------------------------------------------------
// Factory implementation (no dependencies — pure logic)
// ---------------------------------------------------------------------------

export const CheckPermissionUseCaseImpl = (): CheckPermissionUseCase => ({
  execute: ({ userRole, requiredRole }) => {
    if (!hasMinimumRole(userRole, requiredRole)) {
      return fail(authInsufficientRole());
    }

    return ok(undefined);
  },
});
