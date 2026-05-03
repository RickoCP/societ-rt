/**
 * Auth-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 3.4, 3.5, 3.7, 4.2, 4.3
 */

import type { AppError } from '@core/utils';
import { authenticationError, authorizationError } from '@core/utils';

/** Invalid email/password combination. */
export function authInvalidCredentials(): AppError {
  return authenticationError(
    'AUTH_INVALID_CREDENTIALS',
    'Invalid email or password',
  );
}

/** Account is temporarily locked due to too many failed login attempts. */
export function authAccountLocked(lockedUntil: Date): AppError {
  return authenticationError(
    'AUTH_ACCOUNT_LOCKED',
    `Account is locked until ${lockedUntil.toISOString()}`,
  );
}

/** JWT token is expired, malformed, or otherwise invalid. */
export function authTokenInvalid(): AppError {
  return authenticationError(
    'AUTH_TOKEN_INVALID',
    'Authentication token is invalid or expired',
  );
}

/** Attempt to assign a role higher than the actor is allowed to grant. */
export function authRoleEscalationDenied(): AppError {
  return authorizationError(
    'AUTH_ROLE_ESCALATION_DENIED',
    'Cannot assign a role with higher privileges than your own',
  );
}

/** User does not have the required role for this operation. */
export function authInsufficientRole(): AppError {
  return authorizationError(
    'AUTH_INSUFFICIENT_ROLE',
    'Insufficient role for this operation',
  );
}
