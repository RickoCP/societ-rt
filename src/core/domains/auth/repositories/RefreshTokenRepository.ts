/**
 * RefreshTokenRepository — Core repository interface for refresh token operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete Prisma implementation.
 *
 * @see Requirements 14 (Refresh Token), 16 (Session Revocation)
 */

import type { DomainResult } from '@core/utils';
import type { RefreshToken } from '../entities/RefreshToken';

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

/**
 * Input for creating a new refresh token record.
 * The tokenHash is pre-computed by the caller using SHA-256.
 */
export interface CreateRefreshTokenInput {
  readonly userId: string;
  /** Pre-computed SHA-256 hash of the actual token */
  readonly tokenHash: string;
  /** Family identifier for this token lineage */
  readonly familyId: string;
  /** Generation number (1 for new family, incremented for rotations) */
  readonly generation: number;
  /** Token expiration timestamp */
  readonly expiresAt: Date;
  /** Optional tenant context */
  readonly tenantId?: string;
  /** Client metadata for audit */
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

/**
 * Input for revoking a token and optionally marking its replacement.
 */
export interface RevokeTokenInput {
  readonly tokenId: string;
  /** If this token is being replaced by a new one, the new token's ID */
  readonly replacedBy?: string;
  /** Timestamp of revocation (defaults to now) */
  readonly revokedAt?: Date;
}

/**
 * Options for querying refresh tokens.
 */
export interface RefreshTokenQueryOptions {
  /** Include revoked/expired tokens in results */
  readonly includeInactive?: boolean;
  /** Limit results */
  readonly limit?: number;
}

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

/**
 * Repository interface for refresh token persistence operations.
 *
 * SECURITY CONSIDERATIONS:
 * - Only stores token hashes, never plaintext
 * - Supports family-wide revocation for reuse detection
 * - Supports user-wide and tenant-specific revocation for logout
 */
export interface RefreshTokenRepository {
  /**
   * Create a new refresh token record.
   * @see Requirement 14 AC 1-4: Token creation with hash, familyId, generation
   */
  create(input: CreateRefreshTokenInput): Promise<DomainResult<RefreshToken>>;

  /**
   * Find a refresh token by its hash.
   * Used for token validation during refresh flow.
   * @see Requirement 14 AC 2: Hash-based lookup
   */
  findByHash(tokenHash: string): Promise<DomainResult<RefreshToken | null>>;

  /**
   * Find a refresh token by its ID.
   */
  findById(tokenId: string): Promise<DomainResult<RefreshToken | null>>;

  /**
   * Find all tokens in a family.
   * Used for reuse detection and family-wide revocation.
   * @see Requirement 14 AC 3, 6: Family-based tracking and revocation
   */
  findByFamily(
    familyId: string,
    options?: RefreshTokenQueryOptions,
  ): Promise<DomainResult<RefreshToken[]>>;

  /**
   * Find all tokens for a user.
   * Used for "logout all devices" operation.
   * @see Requirement 16 AC 3: Logout all devices
   */
  findByUserId(
    userId: string,
    options?: RefreshTokenQueryOptions,
  ): Promise<DomainResult<RefreshToken[]>>;

  /**
   * Find all tokens for a user in a specific tenant.
   * Used for "logout from tenant" operation.
   * @see Requirement 16 AC 4: Logout from tenant
   */
  findByUserAndTenant(
    userId: string,
    tenantId: string,
    options?: RefreshTokenQueryOptions,
  ): Promise<DomainResult<RefreshToken[]>>;

  /**
   * Revoke a single token by ID.
   * Optionally marks it as replaced by another token.
   * @see Requirement 14 AC 5: Mark old token as revoked with replacedBy
   */
  revokeById(input: RevokeTokenInput): Promise<DomainResult<void>>;

  /**
   * Revoke all tokens in a family (reuse detection).
   * This is triggered when a revoked/rotated token is reused.
   * @see Requirement 14 AC 6: Family-wide revocation on reuse
   */
  revokeByFamily(familyId: string): Promise<DomainResult<number>>;

  /**
   * Revoke all tokens for a user (logout all devices).
   * @see Requirement 16 AC 3: Logout all devices
   */
  revokeByUserId(userId: string): Promise<DomainResult<number>>;

  /**
   * Revoke all tokens for a user in a specific tenant.
   * @see Requirement 16 AC 4: Logout from tenant
   * @see Requirement 16 AC 5: Membership revocation triggers tenant logout
   */
  revokeByUserAndTenant(
    userId: string,
    tenantId: string,
  ): Promise<DomainResult<number>>;

  /**
   * Get the latest generation number for a family.
   * Used to detect out-of-order token usage.
   */
  getLatestGeneration(familyId: string): Promise<DomainResult<number | null>>;

  /**
   * Count active tokens for a user.
   * Useful for session management UI and security monitoring.
   */
  countActiveByUserId(userId: string): Promise<DomainResult<number>>;

  /**
   * Delete expired tokens older than a given date.
   * Used for periodic cleanup jobs.
   * Returns the number of deleted tokens.
   */
  deleteExpiredBefore(date: Date): Promise<DomainResult<number>>;
}
