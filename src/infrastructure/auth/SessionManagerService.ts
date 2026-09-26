/**
 * SessionManagerService — Infrastructure service for session/logout management.
 *
 * Implements session revocation flows:
 * - Single session logout
 * - Logout all devices (increment tokenVersion + revoke all tokens)
 * - Logout from specific tenant
 * - Handle membership revocation (automatic tenant logout)
 *
 * @see Requirement 16 (Session Revocation and Logout)
 */

import type { DomainResult } from '@core/utils';
import { isFail, ok } from '@core/utils';
import type { RefreshTokenService } from './RefreshTokenService';
import type { TokenVersionService, TokenVersionIncrementResult } from './TokenVersionService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of a single session logout.
 */
export interface LogoutResult {
  readonly success: true;
  /** Whether the token was actually found and revoked (vs already revoked/not found) */
  readonly tokenRevoked: boolean;
}

/**
 * Result of logging out all devices.
 */
export interface LogoutAllDevicesResult {
  readonly userId: string;
  readonly previousTokenVersion: number;
  readonly newTokenVersion: number;
  readonly revokedRefreshTokens: number;
}

/**
 * Result of logging out from a specific tenant.
 */
export interface LogoutFromTenantResult {
  readonly userId: string;
  readonly tenantId: string;
  readonly revokedRefreshTokens: number;
}

/**
 * Audit logger function type for session operations.
 */
export type SessionAuditLogger = (entry: SessionAuditEntry) => void | Promise<void>;

/**
 * Audit entry for session operations.
 */
export interface SessionAuditEntry {
  readonly userId: string;
  readonly action: 'logout' | 'logout_all_devices' | 'logout_from_tenant' | 'membership_revocation_logout';
  readonly correlationId?: string;
  readonly tenantId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface SessionManagerService {
  /**
   * Logout from current session (revoke the current refresh token).
   * This is idempotent — returns success even if token is already revoked.
   * @see Requirement 16 AC 1-2, 6
   */
  logout(
    refreshToken: string,
    correlationId?: string,
  ): Promise<DomainResult<LogoutResult>>;

  /**
   * Logout from all devices for a user.
   * Increments tokenVersion and revokes all refresh tokens.
   * @see Requirement 16 AC 3
   */
  logoutAllDevices(
    userId: string,
    correlationId?: string,
  ): Promise<DomainResult<LogoutAllDevicesResult>>;

  /**
   * Logout from a specific tenant (revoke all refresh tokens for that tenant).
   * Does NOT increment tokenVersion (only affects one tenant).
   * @see Requirement 16 AC 4
   */
  logoutFromTenant(
    userId: string,
    tenantId: string,
    correlationId?: string,
  ): Promise<DomainResult<LogoutFromTenantResult>>;

  /**
   * Handle membership revocation — automatic tenant logout.
   * Called when a membership is revoked to ensure the user is logged out.
   * @see Requirement 16 AC 5
   */
  handleMembershipRevocation(
    userId: string,
    tenantId: string,
    membershipId: string,
    correlationId?: string,
  ): Promise<DomainResult<LogoutFromTenantResult>>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SessionManagerServiceConfig {
  /** Optional audit logger for session operations */
  readonly auditLogger?: SessionAuditLogger;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for SessionManagerService.
 * Follows DI pattern.
 */
export function SessionManagerServiceImpl({
  refreshTokenService,
  tokenVersionService,
  config,
}: {
  refreshTokenService: RefreshTokenService;
  tokenVersionService: TokenVersionService;
  config?: SessionManagerServiceConfig;
}): SessionManagerService {
  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Log an audit entry if logger is configured.
   * @see Requirement 16 AC 7: Log all logout operations
   */
  async function logAudit(
    entry: Omit<SessionAuditEntry, 'timestamp'>,
  ): Promise<void> {
    if (config?.auditLogger) {
      try {
        await config.auditLogger({
          ...entry,
          timestamp: new Date(),
        });
      } catch {
        // Audit logging should not break session operations
        console.error('Failed to log session audit entry');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Service Methods
  // ---------------------------------------------------------------------------

  async function logout(
    refreshToken: string,
    correlationId?: string,
  ): Promise<DomainResult<LogoutResult>> {
    // Revoke the specific token
    // Note: revokeToken is idempotent — returns success even if already revoked
    const revokeResult = await refreshTokenService.revokeToken(refreshToken);

    if (isFail(revokeResult)) {
      // Even on error, we return success for idempotency
      // (token might already be gone/expired)
      console.error('Error during logout token revocation', revokeResult.error);
    }

    // We can't easily tell if the token was "actually" revoked vs already revoked
    // without changing the service interface, so we mark it as revoked
    // The idempotency requirement (AC 6) says we return success either way

    await logAudit({
      userId: 'unknown', // Token may not be valid, so we don't have userId
      action: 'logout',
      correlationId,
    });

    return ok({
      success: true,
      tokenRevoked: !isFail(revokeResult),
    });
  }

  async function logoutAllDevices(
    userId: string,
    correlationId?: string,
  ): Promise<DomainResult<LogoutAllDevicesResult>> {
    // Use TokenVersionService.forceLogoutUser which:
    // 1. Increments tokenVersion
    // 2. Revokes all refresh tokens
    const result = await tokenVersionService.forceLogoutUser(userId);

    if (isFail(result)) {
      return result;
    }

    const data: TokenVersionIncrementResult = result.data;

    await logAudit({
      userId,
      action: 'logout_all_devices',
      correlationId,
      metadata: {
        previousTokenVersion: data.previousVersion,
        newTokenVersion: data.newVersion,
        revokedRefreshTokens: data.revokedTokenCount,
      },
    });

    return ok({
      userId,
      previousTokenVersion: data.previousVersion,
      newTokenVersion: data.newVersion,
      revokedRefreshTokens: data.revokedTokenCount,
    });
  }

  async function logoutFromTenant(
    userId: string,
    tenantId: string,
    correlationId?: string,
  ): Promise<DomainResult<LogoutFromTenantResult>> {
    // Revoke all refresh tokens for this user in this tenant
    // Note: We do NOT increment tokenVersion here because that would
    // invalidate access tokens for ALL tenants
    const result = await refreshTokenService.revokeForUserAndTenant(
      userId,
      tenantId,
    );

    if (isFail(result)) {
      return result;
    }

    await logAudit({
      userId,
      action: 'logout_from_tenant',
      correlationId,
      tenantId,
      metadata: {
        revokedRefreshTokens: result.data,
      },
    });

    return ok({
      userId,
      tenantId,
      revokedRefreshTokens: result.data,
    });
  }

  async function handleMembershipRevocation(
    userId: string,
    tenantId: string,
    membershipId: string,
    correlationId?: string,
  ): Promise<DomainResult<LogoutFromTenantResult>> {
    // When membership is revoked, log out the user from that tenant
    const result = await refreshTokenService.revokeForUserAndTenant(
      userId,
      tenantId,
    );

    if (isFail(result)) {
      return result;
    }

    await logAudit({
      userId,
      action: 'membership_revocation_logout',
      correlationId,
      tenantId,
      metadata: {
        membershipId,
        revokedRefreshTokens: result.data,
        reason: 'membership_revoked',
      },
    });

    return ok({
      userId,
      tenantId,
      revokedRefreshTokens: result.data,
    });
  }

  return {
    logout,
    logoutAllDevices,
    logoutFromTenant,
    handleMembershipRevocation,
  };
}
