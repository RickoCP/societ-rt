/**
 * Auth-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Uses the factory helpers from AppError.ts to ensure consistency.
 *
 * @see Requirements 3.4, 3.5, 3.7, 4.2, 4.3
 * @see Requirements 14 (Refresh Token), 15 (Token Version), 16 (Session Revocation)
 */

import type { AppError } from '@core/utils';
import { authenticationError, authorizationError } from '@core/utils';

// ---------------------------------------------------------------------------
// Credential Errors
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Token Errors
// ---------------------------------------------------------------------------

/** JWT token is expired, malformed, or otherwise invalid. */
export function authTokenInvalid(): AppError {
  return authenticationError(
    'AUTH_TOKEN_INVALID',
    'Authentication token is invalid or expired',
  );
}

/**
 * Token version mismatch — token has been force-invalidated.
 * @see Requirement 15 AC 4: tokenVersion in JWT < user's tokenVersion → reject
 */
export function authTokenRevoked(): AppError {
  return authenticationError(
    'AUTH_TOKEN_REVOKED',
    'Token has been revoked due to forced invalidation',
    { userMessage: 'Your session has been invalidated. Please log in again.' },
  );
}

// ---------------------------------------------------------------------------
// Refresh Token Errors
// ---------------------------------------------------------------------------

/**
 * Refresh token is invalid (hash mismatch, not found, etc.).
 * @see Requirement 14 AC 2: SHA-256 hash validation
 */
export function authRefreshTokenInvalid(): AppError {
  return authenticationError(
    'AUTH_REFRESH_TOKEN_INVALID',
    'Refresh token is invalid or not found',
    { userMessage: 'Your session could not be refreshed. Please log in again.' },
  );
}

/**
 * Refresh token has expired (past 30-day default expiry).
 * @see Requirement 14 AC 8: 30-day expiry
 */
export function authRefreshTokenExpired(): AppError {
  return authenticationError(
    'AUTH_REFRESH_TOKEN_EXPIRED',
    'Refresh token has expired',
    { userMessage: 'Your session has expired. Please log in again.' },
  );
}

/**
 * Refresh token reuse detected — a revoked token was presented.
 * This triggers family-wide revocation as a security measure.
 * @see Requirement 14 AC 6: Revoked token → revoke family, return AUTH_TOKEN_REUSE_DETECTED
 * @see Design V5: Refresh token reuse → family-wide revocation
 */
export function authTokenReuseDetected(): AppError {
  return authenticationError(
    'AUTH_TOKEN_REUSE_DETECTED',
    'Potential token theft detected — all sessions in family have been revoked',
    {
      userMessage:
        'For your security, all your sessions have been logged out. Please log in again.',
    },
  );
}

/**
 * Refresh token has already been used (rotated but not yet revoked).
 * This is a softer version of reuse detection for race conditions.
 */
export function authRefreshTokenAlreadyUsed(): AppError {
  return authenticationError(
    'AUTH_REFRESH_TOKEN_ALREADY_USED',
    'Refresh token has already been used for rotation',
    { userMessage: 'Your session was already refreshed. Please use the new token.' },
  );
}

// ---------------------------------------------------------------------------
// Authorization Errors
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Session Management Errors
// ---------------------------------------------------------------------------

/**
 * Session not found or already logged out.
 * @see Requirement 16 AC 6: Return success even if token already revoked (idempotent)
 * Note: This error is typically NOT thrown during logout (idempotent success),
 * but may be used for other session operations.
 */
export function authSessionNotFound(): AppError {
  return authenticationError(
    'AUTH_SESSION_NOT_FOUND',
    'Session not found or already logged out',
  );
}

/**
 * User not found during token operations.
 */
export function authUserNotFound(): AppError {
  return authenticationError(
    'AUTH_USER_NOT_FOUND',
    'User associated with token not found',
  );
}

// ---------------------------------------------------------------------------
// Recovery Token Errors
// ---------------------------------------------------------------------------

/**
 * Recovery token is invalid (hash mismatch, not found, etc.).
 * @see Requirement 51 AC 3: One-time use recovery tokens
 */
export function authRecoveryTokenInvalid(): AppError {
  return authenticationError(
    'AUTH_RECOVERY_TOKEN_INVALID',
    'Recovery token is invalid or not found',
    { userMessage: 'The password reset link is invalid. Please request a new one.' },
  );
}

/**
 * Recovery token has expired (past 1-hour default expiry).
 * @see Requirement 51 AC 3: 1-hour expiry
 */
export function authRecoveryTokenExpired(): AppError {
  return authenticationError(
    'AUTH_RECOVERY_TOKEN_EXPIRED',
    'Recovery token has expired',
    { userMessage: 'The password reset link has expired. Please request a new one.' },
  );
}

/**
 * Recovery token has already been used.
 * @see Requirement 51 AC 3: One-time use
 */
export function authRecoveryTokenAlreadyUsed(): AppError {
  return authenticationError(
    'AUTH_RECOVERY_TOKEN_ALREADY_USED',
    'Recovery token has already been used',
    { userMessage: 'This password reset link has already been used. Please request a new one.' },
  );
}

/**
 * Too many password recovery requests.
 * @see Requirement 51 AC 2: Rate-limit 3 per hour per email
 */
export function authRecoveryRateLimitExceeded(): AppError {
  return authenticationError(
    'AUTH_RECOVERY_RATE_LIMIT',
    'Too many password recovery requests',
    { userMessage: 'You have requested too many password resets. Please try again later.' },
  );
}

// ---------------------------------------------------------------------------
// Token Security Errors
// ---------------------------------------------------------------------------

/**
 * Token does not have sufficient entropy (weak/predictable token).
 * @see Task 40: Token entropy validation
 */
export function authTokenInsufficientEntropy(): AppError {
  return authenticationError(
    'AUTH_TOKEN_INSUFFICIENT_ENTROPY',
    'Token does not meet minimum entropy requirements',
  );
}

/**
 * Potential token leak detected (unusual access patterns).
 * @see Task 40: Token leak detection
 */
export function authTokenLeakDetected(): AppError {
  return authenticationError(
    'AUTH_TOKEN_LEAK_DETECTED',
    'Potential token security compromise detected',
    { userMessage: 'For your security, please log in again.' },
  );
}

/**
 * Token used from suspicious location/IP.
 * @see Task 40: Token leak detection
 */
export function authSuspiciousTokenUsage(): AppError {
  return authenticationError(
    'AUTH_SUSPICIOUS_TOKEN_USAGE',
    'Token used from suspicious location or unusual pattern detected',
    { userMessage: 'We detected unusual activity. For your security, please verify your identity.' },
  );
}

/**
 * Re-authentication required for sensitive operation.
 * @see Requirement 53: Sensitive Operation Re-authentication
 */
export function authReauthRequired(): AppError {
  return authenticationError(
    'AUTH_REAUTH_REQUIRED',
    'Re-authentication required for this operation',
    { userMessage: 'Please verify your identity to continue with this operation.' },
  );
}

/**
 * Password does not meet policy requirements.
 * @see Requirement 51 AC 1: Password policy enforcement
 */
export function authPasswordPolicyViolation(reason: string): AppError {
  return authenticationError(
    'AUTH_PASSWORD_POLICY_VIOLATION',
    `Password does not meet policy requirements: ${reason}`,
    { userMessage: 'Your password does not meet the security requirements.' },
  );
}

/**
 * Password was used previously (history check failed).
 * @see Requirement 51 AC 8: Prevent reuse of last N passwords
 */
export function authPasswordReused(): AppError {
  return authenticationError(
    'AUTH_PASSWORD_REUSED',
    'Password was used previously',
    { userMessage: 'You cannot reuse a recent password. Please choose a different one.' },
  );
}
