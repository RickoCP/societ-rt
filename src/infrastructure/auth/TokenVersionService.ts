/**
 * TokenVersionService — Infrastructure service for token version management.
 *
 * Implements forced token invalidation via tokenVersion:
 * - Get current tokenVersion for a user
 * - Increment tokenVersion to invalidate all tokens
 * - Bulk increment for tenant-wide force logout
 *
 * @see Requirement 15 (Token Version for Forced Invalidation)
 * @see Design V4: Token version mismatch → immediate rejection
 */

import type { DomainResult } from '@core/utils';
import { fail, isFail, ok } from '@core/utils';
import { authUserNotFound } from '@core/domains/auth/errors/authErrors';
import type { RefreshTokenService } from './RefreshTokenService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of incrementing a user's token version.
 */
export interface TokenVersionIncrementResult {
  readonly userId: string;
  readonly previousVersion: number;
  readonly newVersion: number;
  /** Number of refresh tokens revoked */
  readonly revokedTokenCount: number;
}

/**
 * Result of bulk token version increment for a tenant.
 */
export interface BulkTokenVersionIncrementResult {
  readonly tenantId: string;
  /** Number of users whose tokenVersion was incremented */
  readonly userCount: number;
  /** Total refresh tokens revoked across all users */
  readonly totalRevokedTokens: number;
}

/**
 * User repository interface required by TokenVersionService.
 * This is a minimal interface to avoid circular dependencies.
 */
export interface TokenVersionUserRepository {
  /**
   * Get the current tokenVersion for a user.
   */
  getTokenVersion(userId: string): Promise<DomainResult<number | null>>;

  /**
   * Increment tokenVersion for a user and return the new value.
   * @returns The new tokenVersion after increment
   */
  incrementTokenVersion(userId: string): Promise<DomainResult<number>>;

  /**
   * Increment tokenVersion for all users in a tenant.
   * @returns The number of users updated
   */
  incrementTokenVersionForTenant(tenantId: string): Promise<DomainResult<number>>;

  /**
   * Get all user IDs in a tenant.
   * Used for revoking refresh tokens after bulk increment.
   */
  getUserIdsByTenant(tenantId: string): Promise<DomainResult<string[]>>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface TokenVersionService {
  /**
   * Get the current tokenVersion for a user.
   * @see Requirement 15 AC 1-2: tokenVersion column
   */
  getTokenVersion(userId: string): Promise<DomainResult<number>>;

  /**
   * Validate that a JWT's tokenVersion matches the user's current tokenVersion.
   * @see Requirement 15 AC 3-4: Exact match validation
   * @see Design V4: Mismatch → AUTH_TOKEN_REVOKED
   * @returns true if valid, false if mismatch
   */
  validateTokenVersion(
    userId: string,
    jwtTokenVersion: number,
  ): Promise<DomainResult<boolean>>;

  /**
   * Increment tokenVersion and revoke all refresh tokens for a user.
   * This forces logout of all sessions.
   * @see Requirement 15 AC 5-6: Increment + revoke all refresh tokens
   */
  forceLogoutUser(userId: string): Promise<DomainResult<TokenVersionIncrementResult>>;

  /**
   * Increment tokenVersion for all users in a tenant.
   * This forces logout of all sessions for the entire tenant.
   * @see Requirement 15 AC 7: Bulk increment for tenant-wide force logout
   */
  forceLogoutTenant(
    tenantId: string,
  ): Promise<DomainResult<BulkTokenVersionIncrementResult>>;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for TokenVersionService.
 * Follows DI pattern.
 */
export function TokenVersionServiceImpl({
  userRepository,
  refreshTokenService,
}: {
  userRepository: TokenVersionUserRepository;
  refreshTokenService: RefreshTokenService;
}): TokenVersionService {
  async function getTokenVersion(userId: string): Promise<DomainResult<number>> {
    const result = await userRepository.getTokenVersion(userId);

    if (isFail(result)) {
      return result;
    }

    if (result.data === null) {
      return fail(authUserNotFound());
    }

    return ok(result.data);
  }

  async function validateTokenVersion(
    userId: string,
    jwtTokenVersion: number,
  ): Promise<DomainResult<boolean>> {
    const currentVersionResult = await getTokenVersion(userId);

    if (isFail(currentVersionResult)) {
      return currentVersionResult;
    }

    const currentVersion = currentVersionResult.data;

    // SECURITY: Exact match required
    // JWT tokenVersion MUST exactly equal User.tokenVersion
    // Any mismatch (less than, greater than) → reject
    // See Requirement 15 AC 4 and Design V4
    const isValid = jwtTokenVersion === currentVersion;

    return ok(isValid);
  }

  async function forceLogoutUser(
    userId: string,
  ): Promise<DomainResult<TokenVersionIncrementResult>> {
    // Get current version first
    const currentResult = await getTokenVersion(userId);
    if (isFail(currentResult)) {
      return currentResult;
    }
    const previousVersion = currentResult.data;

    // Increment tokenVersion
    const incrementResult = await userRepository.incrementTokenVersion(userId);
    if (isFail(incrementResult)) {
      return incrementResult;
    }
    const newVersion = incrementResult.data;

    // Revoke all refresh tokens for this user
    // This is done AFTER incrementing tokenVersion to ensure:
    // 1. Any new tokens issued will have the new version
    // 2. Existing access tokens are immediately invalid (version mismatch)
    // 3. Existing refresh tokens cannot be used
    const revokeResult = await refreshTokenService.revokeAllForUser(userId);
    const revokedTokenCount = isFail(revokeResult) ? 0 : revokeResult.data;

    return ok({
      userId,
      previousVersion,
      newVersion,
      revokedTokenCount,
    });
  }

  async function forceLogoutTenant(
    tenantId: string,
  ): Promise<DomainResult<BulkTokenVersionIncrementResult>> {
    // Increment tokenVersion for all users in tenant
    const incrementResult =
      await userRepository.incrementTokenVersionForTenant(tenantId);
    if (isFail(incrementResult)) {
      return incrementResult;
    }
    const userCount = incrementResult.data;

    // Get all user IDs to revoke their refresh tokens
    const userIdsResult = await userRepository.getUserIdsByTenant(tenantId);
    if (isFail(userIdsResult)) {
      // Token versions incremented but couldn't revoke refresh tokens
      // Log error but return partial success
      console.error(
        'Failed to get user IDs for refresh token revocation',
        userIdsResult.error,
      );
      return ok({
        tenantId,
        userCount,
        totalRevokedTokens: 0,
      });
    }

    // Revoke refresh tokens for each user
    // Note: Could be optimized with a bulk operation in the repository
    let totalRevokedTokens = 0;
    for (const userId of userIdsResult.data) {
      const revokeResult = await refreshTokenService.revokeAllForUser(userId);
      if (!isFail(revokeResult)) {
        totalRevokedTokens += revokeResult.data;
      }
    }

    return ok({
      tenantId,
      userCount,
      totalRevokedTokens,
    });
  }

  return {
    getTokenVersion,
    validateTokenVersion,
    forceLogoutUser,
    forceLogoutTenant,
  };
}
