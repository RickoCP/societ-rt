/**
 * RefreshToken — Domain entity representing an opaque refresh token.
 *
 * Refresh tokens are:
 * - Opaque random 256-bit values (NOT JWT)
 * - Stored as SHA-256 hashes (never plaintext)
 * - Organized into families with stable familyId across rotations
 * - Tracked by monotonically increasing generation counter
 *
 * @see Requirements 14 (Refresh Token), 15 (Token Version), 16 (Session Revocation)
 * @see Design D2: Refresh token: opaque 256-bit, SHA-256 hashed storage, 30-day expiry
 */

// ---------------------------------------------------------------------------
// Core Types
// ---------------------------------------------------------------------------

/**
 * RefreshToken — Domain entity for secure session refresh.
 *
 * SECURITY INVARIANTS:
 * - tokenHash is SHA-256 hash, never plaintext
 * - familyId remains stable across all rotations
 * - generation increments monotonically (1, 2, 3, ...)
 * - Reused token → entire family revoked
 */
export interface RefreshToken {
  /** Unique identifier for this token record */
  readonly id: string;

  /** User who owns this refresh token */
  readonly userId: string;

  /** SHA-256 hash of the actual token (never store plaintext) */
  readonly tokenHash: string;

  /**
   * Family identifier - stable across all rotations within the same session.
   * When a token is rotated, the new token inherits the same familyId.
   */
  readonly familyId: string;

  /**
   * Generation/sequence counter - increments monotonically on each rotation.
   * First token in family has generation=1.
   */
  readonly generation: number;

  /** Token expiration timestamp (default 30 days from creation) */
  readonly expiresAt: Date;

  /** Timestamp when token was revoked (null if active) */
  readonly revokedAt: Date | null;

  /**
   * Reference to the token ID that replaced this one during rotation.
   * Null for active tokens and tokens revoked without replacement.
   */
  readonly replacedBy: string | null;

  /** Client user agent for audit purposes */
  readonly userAgent: string | null;

  /** Client IP address for audit purposes */
  readonly ipAddress: string | null;

  /** Tenant context at token creation (for tenant-specific logout) */
  readonly tenantId: string | null;

  /** Token creation timestamp */
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Token Status
// ---------------------------------------------------------------------------

/**
 * Derived status of a refresh token based on its state.
 */
export type RefreshTokenStatus = 'active' | 'expired' | 'revoked' | 'rotated';

/**
 * Determine the status of a refresh token.
 */
export function getRefreshTokenStatus(
  token: RefreshToken,
  now: Date = new Date(),
): RefreshTokenStatus {
  if (token.revokedAt !== null) {
    if (token.replacedBy !== null) {
      return 'rotated';
    }
    return 'revoked';
  }

  if (token.expiresAt < now) {
    return 'expired';
  }

  return 'active';
}

// ---------------------------------------------------------------------------
// Token Operations
// ---------------------------------------------------------------------------

/**
 * Operations that can be performed on refresh tokens.
 * Used for audit logging.
 */
export type RefreshTokenOperation =
  | 'create'
  | 'refresh' // Token rotation
  | 'revoke_single' // Single token revocation
  | 'revoke_family' // Family-wide revocation (reuse detection)
  | 'revoke_user' // All tokens for user revoked
  | 'revoke_tenant' // All tokens for user+tenant revoked
  | 'expire'; // Natural expiration

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

/**
 * Input for creating a new refresh token.
 */
export interface CreateRefreshTokenInput {
  readonly userId: string;
  readonly userAgent?: string;
  readonly ipAddress?: string;
  readonly tenantId?: string;
  /** Override default 30-day expiry (in milliseconds from now) */
  readonly expiresInMs?: number;
}

/**
 * Input for rotating (refreshing) a token.
 */
export interface RotateTokenInput {
  /** The current refresh token plaintext (to be validated) */
  readonly currentToken: string;
  /** New client metadata */
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

// ---------------------------------------------------------------------------
// Audit Log Entry
// ---------------------------------------------------------------------------

/**
 * Audit log entry for refresh token operations.
 * @see Requirement 14 AC 9: Log all refresh token operations
 */
export interface RefreshTokenAuditEntry {
  readonly userId: string;
  readonly familyId: string;
  readonly generation: number;
  readonly operation: RefreshTokenOperation;
  readonly timestamp: Date;
  readonly correlationId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  /** Additional context (e.g., reason for revocation) */
  readonly metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for refresh token system.
 */
export interface RefreshTokenConfig {
  /** Token expiry duration in milliseconds (default: 30 days) */
  readonly expiryMs: number;
  /** Token byte length (default: 32 bytes = 256 bits) */
  readonly tokenByteLength: number;
  /** Hash algorithm for token storage (always SHA-256) */
  readonly hashAlgorithm: 'sha256';
}

/**
 * Default refresh token configuration.
 * @see Design D2: 30-day expiry
 */
export const DEFAULT_REFRESH_TOKEN_CONFIG: RefreshTokenConfig = {
  expiryMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  tokenByteLength: 32, // 256 bits
  hashAlgorithm: 'sha256',
} as const;
