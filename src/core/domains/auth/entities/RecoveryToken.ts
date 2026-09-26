/**
 * RecoveryToken — Domain entity representing an account recovery token.
 *
 * Recovery tokens are:
 * - Cryptographically random 256-bit values
 * - One-time use only
 * - Short-lived (1-hour expiry by default)
 * - Invalidated immediately after use or expiry
 *
 * @see Requirement 51 (Account Recovery & Credential Security)
 * @see Design D8: Recovery token expiry: 1 hour
 */

// ---------------------------------------------------------------------------
// Core Types
// ---------------------------------------------------------------------------

/**
 * RecoveryToken — Domain entity for secure password recovery.
 *
 * SECURITY INVARIANTS:
 * - tokenHash is SHA-256 hash, never plaintext
 * - One-time use: usedAt is set once and token becomes invalid
 * - Short-lived: 1-hour expiry to minimize compromise window
 * - Invalidated on use, expiry, OR new token generation
 */
export interface RecoveryToken {
  /** Unique identifier for this token record */
  readonly id: string;

  /** User who requested this recovery token */
  readonly userId: string;

  /** User's email at time of request (for audit/verification) */
  readonly email: string;

  /** SHA-256 hash of the actual token (never store plaintext) */
  readonly tokenHash: string;

  /** Token expiration timestamp (1 hour from creation) */
  readonly expiresAt: Date;

  /** Timestamp when token was used (null if not yet used) */
  readonly usedAt: Date | null;

  /** Timestamp when token was invalidated (null if active) */
  readonly invalidatedAt: Date | null;

  /** Reason for invalidation */
  readonly invalidationReason: RecoveryTokenInvalidationReason | null;

  /** Client IP address for audit purposes */
  readonly requestIpAddress: string | null;

  /** User agent at request time for audit purposes */
  readonly requestUserAgent: string | null;

  /** Token creation timestamp */
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Token Status
// ---------------------------------------------------------------------------

/**
 * Reasons why a recovery token can be invalidated.
 */
export type RecoveryTokenInvalidationReason =
  | 'used' // Token was used successfully
  | 'expired' // Token expired (1 hour)
  | 'superseded' // New token was generated
  | 'password_changed' // Password was changed through other means
  | 'admin_reset' // Admin forced token invalidation
  | 'user_cancelled'; // User cancelled the recovery flow

/**
 * Derived status of a recovery token based on its state.
 */
export type RecoveryTokenStatus = 'valid' | 'used' | 'expired' | 'invalidated';

/**
 * Determine the status of a recovery token.
 */
export function getRecoveryTokenStatus(
  token: RecoveryToken,
  now: Date = new Date(),
): RecoveryTokenStatus {
  // Check if explicitly invalidated
  if (token.invalidatedAt !== null) {
    return 'invalidated';
  }

  // Check if already used
  if (token.usedAt !== null) {
    return 'used';
  }

  // Check if expired
  if (token.expiresAt < now) {
    return 'expired';
  }

  return 'valid';
}

/**
 * Check if a recovery token is valid for use.
 */
export function isRecoveryTokenValid(
  token: RecoveryToken,
  now: Date = new Date(),
): boolean {
  return getRecoveryTokenStatus(token, now) === 'valid';
}

// ---------------------------------------------------------------------------
// Token Operations
// ---------------------------------------------------------------------------

/**
 * Operations that can be performed on recovery tokens.
 * Used for audit logging.
 */
export type RecoveryTokenOperation =
  | 'create'
  | 'validate'
  | 'use'
  | 'invalidate'
  | 'expire';

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

/**
 * Input for creating a new recovery token.
 */
export interface CreateRecoveryTokenInput {
  readonly userId: string;
  readonly email: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Input for using a recovery token.
 */
export interface UseRecoveryTokenInput {
  /** The recovery token plaintext (from URL/email) */
  readonly token: string;
  /** The new password being set */
  readonly newPasswordHash: string;
  /** Client IP for audit */
  readonly ipAddress?: string;
  /** User agent for audit */
  readonly userAgent?: string;
}

// ---------------------------------------------------------------------------
// Audit Log Entry
// ---------------------------------------------------------------------------

/**
 * Audit log entry for recovery token operations.
 * @see Requirement 51 AC 3: Recovery token logging
 */
export interface RecoveryTokenAuditEntry {
  readonly userId: string;
  readonly tokenId: string;
  readonly operation: RecoveryTokenOperation;
  readonly timestamp: Date;
  readonly correlationId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly success: boolean;
  /** Additional context (e.g., reason for failure) */
  readonly metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for recovery token system.
 */
export interface RecoveryTokenConfig {
  /** Token expiry duration in milliseconds (default: 1 hour) */
  readonly expiryMs: number;
  /** Token byte length (default: 32 bytes = 256 bits) */
  readonly tokenByteLength: number;
  /** Maximum recovery requests per email per hour */
  readonly maxRequestsPerHour: number;
}

/**
 * Default recovery token configuration.
 * @see Design D8: Recovery token expiry: 1 hour
 * @see Requirement 51 AC 2: Rate-limit 3 per hour per email
 */
export const DEFAULT_RECOVERY_TOKEN_CONFIG: RecoveryTokenConfig = {
  expiryMs: 60 * 60 * 1000, // 1 hour
  tokenByteLength: 32, // 256 bits
  maxRequestsPerHour: 3,
} as const;
