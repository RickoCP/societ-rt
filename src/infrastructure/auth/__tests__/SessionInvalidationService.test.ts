/**
 * SessionInvalidationService Tests — Comprehensive session invalidation mechanisms.
 *
 * Tests cover:
 * - Immediate session invalidation on logout
 * - Bulk session invalidation for user
 * - Cross-device session termination
 * - Tenant-wide session invalidation
 * - Session validity checking
 * - User-tenant session invalidation
 *
 * @see Task 41: Session Invalidation (Req 52)
 * @see Requirement 16: Session Revocation and Logout
 * @see Requirement 15: Token Version for Forced Invalidation
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  SessionInvalidationServiceImpl,
  type SessionInvalidationService,
  type SessionInvalidationUserRepository,
  type SessionInvalidationAuditLogger,
  type SessionInvalidationAuditEntry,
} from '../SessionInvalidationService';
import type { RefreshTokenService, ValidatedToken } from '../RefreshTokenService';
import type { TokenVersionService } from '../TokenVersionService';
import type { RefreshToken } from '@core/domains/auth/entities/RefreshToken';
import { ok, fail } from '@core/utils';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

/**
 * Create a mock RefreshTokenService.
 */
function createMockRefreshTokenService(): {
  service: RefreshTokenService;
  mocks: {
    validateToken: Mock;
    revokeToken: Mock;
    revokeAllForUser: Mock;
    revokeForUserAndTenant: Mock;
  };
} {
  const mocks = {
    validateToken: vi.fn(),
    revokeToken: vi.fn(),
    revokeAllForUser: vi.fn(),
    revokeForUserAndTenant: vi.fn(),
  };

  const service = {
    createToken: vi.fn(),
    validateToken: mocks.validateToken,
    rotateToken: vi.fn(),
    revokeToken: mocks.revokeToken,
    revokeFamily: vi.fn(),
    revokeAllForUser: mocks.revokeAllForUser,
    revokeForUserAndTenant: mocks.revokeForUserAndTenant,
    hashToken: vi.fn(),
    generateOpaqueToken: vi.fn(),
  } as unknown as RefreshTokenService;

  return { service, mocks };
}

/**
 * Create a mock TokenVersionService.
 */
function createMockTokenVersionService(): {
  service: TokenVersionService;
  mocks: {
    forceLogoutUser: Mock;
    forceLogoutTenant: Mock;
    getTokenVersion: Mock;
    validateTokenVersion: Mock;
  };
} {
  const mocks = {
    forceLogoutUser: vi.fn(),
    forceLogoutTenant: vi.fn(),
    getTokenVersion: vi.fn(),
    validateTokenVersion: vi.fn(),
  };

  const service: TokenVersionService = {
    getTokenVersion: mocks.getTokenVersion,
    validateTokenVersion: mocks.validateTokenVersion,
    forceLogoutUser: mocks.forceLogoutUser,
    forceLogoutTenant: mocks.forceLogoutTenant,
  };

  return { service, mocks };
}

/**
 * Create a mock SessionInvalidationUserRepository.
 */
function createMockUserRepository(): {
  repository: SessionInvalidationUserRepository;
  mocks: {
    userExists: Mock;
    getUserIdsByTenant: Mock;
  };
} {
  const mocks = {
    userExists: vi.fn(),
    getUserIdsByTenant: vi.fn(),
  };

  const repository: SessionInvalidationUserRepository = {
    userExists: mocks.userExists,
    getUserIdsByTenant: mocks.getUserIdsByTenant,
  };

  return { repository, mocks };
}

/**
 * Create a mock RefreshToken for testing.
 */
function createMockRefreshToken(overrides?: Partial<RefreshToken>): RefreshToken {
  return {
    id: 'token-id-123',
    userId: 'user-123',
    tokenHash: 'hash-abc',
    familyId: 'family-xyz',
    generation: 1,
    issuedAt: new Date('2024-01-01'),
    expiresAt: new Date('2024-01-31'),
    revokedAt: null,
    replacedBy: null,
    tenantId: 'tenant-123',
    userAgent: 'TestAgent/1.0',
    ipAddress: '192.168.1.1',
    ...overrides,
  };
}

/**
 * Create a validated token response.
 */
function createValidatedToken(token: RefreshToken): ValidatedToken {
  return {
    token,
    status: 'active',
  };
}

describe('SessionInvalidationService', () => {
  let service: SessionInvalidationService;
  let mockRefreshService: ReturnType<typeof createMockRefreshTokenService>;
  let mockTokenVersionService: ReturnType<typeof createMockTokenVersionService>;
  let mockUserRepo: ReturnType<typeof createMockUserRepository>;
  let auditEntries: SessionInvalidationAuditEntry[];
  let mockAuditLogger: SessionInvalidationAuditLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    auditEntries = [];
    mockAuditLogger = vi.fn(async (entry) => {
      auditEntries.push(entry);
    });

    mockRefreshService = createMockRefreshTokenService();
    mockTokenVersionService = createMockTokenVersionService();
    mockUserRepo = createMockUserRepository();

    // Default mock behaviors
    mockUserRepo.mocks.userExists.mockResolvedValue(ok(true));
    mockRefreshService.mocks.revokeToken.mockResolvedValue(ok(undefined));
    mockRefreshService.mocks.revokeAllForUser.mockResolvedValue(ok(5));
    mockRefreshService.mocks.revokeForUserAndTenant.mockResolvedValue(ok(3));
    mockTokenVersionService.mocks.forceLogoutUser.mockResolvedValue(
      ok({
        userId: 'user-123',
        previousVersion: 5,
        newVersion: 6,
        revokedTokenCount: 10,
      }),
    );
    mockTokenVersionService.mocks.forceLogoutTenant.mockResolvedValue(
      ok({
        tenantId: 'tenant-123',
        userCount: 50,
        totalRevokedTokens: 200,
      }),
    );

    service = SessionInvalidationServiceImpl({
      refreshTokenService: mockRefreshService.service,
      tokenVersionService: mockTokenVersionService.service,
      userRepository: mockUserRepo.repository,
      config: {
        auditLogger: mockAuditLogger,
      },
    });
  });

  // -------------------------------------------------------------------------
  // invalidateSession Tests
  // -------------------------------------------------------------------------

  describe('invalidateSession', () => {
    const validToken = 'valid-refresh-token-abc';
    const mockRefreshToken = createMockRefreshToken();

    beforeEach(() => {
      mockRefreshService.mocks.validateToken.mockResolvedValue(
        ok(createValidatedToken(mockRefreshToken)),
      );
    });

    /**
     * Completion Criteria: Immediate session invalidation on logout
     */
    it('should immediately invalidate a single session', async () => {
      const result = await service.invalidateSession(
        validToken,
        'user_logout',
        'corr-123',
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.success).toBe(true);
      expect(result.data.userId).toBe('user-123');
      expect(result.data.wasActive).toBe(true);
      expect(result.data.timestamp).toBeInstanceOf(Date);
      expect(mockRefreshService.mocks.revokeToken).toHaveBeenCalledWith(validToken);
    });

    it('should be idempotent - succeed for already revoked tokens', async () => {
      // Token is already revoked
      mockRefreshService.mocks.validateToken.mockResolvedValue(
        fail({ code: 'AUTH_REFRESH_TOKEN_INVALID', message: 'Token invalid' }),
      );

      const result = await service.invalidateSession(
        validToken,
        'user_logout',
      );

      // Should still succeed (idempotent)
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.success).toBe(true);
      expect(result.data.wasActive).toBe(false);
    });

    it('should handle revocation errors gracefully', async () => {
      mockRefreshService.mocks.revokeToken.mockResolvedValue(
        fail({ code: 'REVOKE_ERROR', message: 'Failed to revoke' }),
      );

      const result = await service.invalidateSession(
        validToken,
        'user_logout',
      );

      // Should still return success for idempotency
      expect(result.success).toBe(true);
    });

    it('should log audit entry for session invalidation', async () => {
      await service.invalidateSession(validToken, 'user_logout', 'corr-123');

      expect(auditEntries.length).toBe(1);
      expect(auditEntries[0]!.action).toBe('immediate_invalidation');
      expect(auditEntries[0]!.reason).toBe('user_logout');
      expect(auditEntries[0]!.correlationId).toBe('corr-123');
    });

    it('should support different invalidation reasons', async () => {
      const reasons = [
        'user_logout',
        'password_change',
        'security_incident',
        'admin_forced',
      ] as const;

      for (const reason of reasons) {
        auditEntries = [];
        await service.invalidateSession(validToken, reason);
        expect(auditEntries[0]!.reason).toBe(reason);
      }
    });
  });

  // -------------------------------------------------------------------------
  // invalidateAllUserSessions Tests
  // -------------------------------------------------------------------------

  describe('invalidateAllUserSessions', () => {
    /**
     * Completion Criteria: Bulk session invalidation for user
     */
    it('should invalidate all sessions for a user', async () => {
      const result = await service.invalidateAllUserSessions(
        'user-123',
        'security_incident',
        'corr-123',
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.userId).toBe('user-123');
      expect(result.data.previousTokenVersion).toBe(5);
      expect(result.data.newTokenVersion).toBe(6);
      expect(result.data.revokedRefreshTokens).toBe(10);
      expect(result.data.accessTokensInvalidated).toBe(true);
      expect(mockTokenVersionService.mocks.forceLogoutUser).toHaveBeenCalledWith(
        'user-123',
      );
    });

    it('should fail if user does not exist', async () => {
      mockUserRepo.mocks.userExists.mockResolvedValue(ok(false));

      const result = await service.invalidateAllUserSessions(
        'non-existent',
        'security_incident',
      );

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_USER_NOT_FOUND');
    });

    it('should propagate tokenVersionService errors', async () => {
      mockTokenVersionService.mocks.forceLogoutUser.mockResolvedValue(
        fail({ code: 'TOKEN_VERSION_ERROR', message: 'Failed' }),
      );

      const result = await service.invalidateAllUserSessions(
        'user-123',
        'security_incident',
      );

      expect(result.success).toBe(false);
    });

    it('should log audit entry for bulk invalidation', async () => {
      await service.invalidateAllUserSessions(
        'user-123',
        'security_incident',
        'corr-456',
      );

      expect(auditEntries.length).toBe(1);
      expect(auditEntries[0]!.action).toBe('bulk_invalidation');
      expect(auditEntries[0]!.reason).toBe('security_incident');
      expect(auditEntries[0]!.metadata?.previousTokenVersion).toBe(5);
      expect(auditEntries[0]!.metadata?.newTokenVersion).toBe(6);
    });

    it('should return timestamp of invalidation', async () => {
      const beforeTime = new Date();
      const result = await service.invalidateAllUserSessions(
        'user-123',
        'user_logout',
      );
      const afterTime = new Date();

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(result.data.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  // -------------------------------------------------------------------------
  // terminateCrossDeviceSessions Tests
  // -------------------------------------------------------------------------

  describe('terminateCrossDeviceSessions', () => {
    /**
     * Completion Criteria: Cross-device session termination
     */
    it('should terminate all sessions across all devices', async () => {
      const result = await service.terminateCrossDeviceSessions(
        'user-123',
        'user_request',
        undefined,
        'corr-789',
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.userId).toBe('user-123');
      expect(result.data.previousTokenVersion).toBe(5);
      expect(result.data.newTokenVersion).toBe(6);
      expect(result.data.totalRefreshTokensRevoked).toBe(10);
      expect(mockTokenVersionService.mocks.forceLogoutUser).toHaveBeenCalledWith(
        'user-123',
      );
    });

    it('should handle excludeCurrentSession option', async () => {
      const mockToken = createMockRefreshToken();
      mockRefreshService.mocks.validateToken.mockResolvedValue(
        ok(createValidatedToken(mockToken)),
      );

      const result = await service.terminateCrossDeviceSessions(
        'user-123',
        'user_request',
        {
          excludeCurrentSession: true,
          currentRefreshToken: 'current-token',
        },
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Token version still changed, so currentSessionPreserved is false
      // The caller needs to issue a new token after this
      expect(result.data.currentSessionPreserved).toBe(false);
    });

    it('should fail if user does not exist', async () => {
      mockUserRepo.mocks.userExists.mockResolvedValue(ok(false));

      const result = await service.terminateCrossDeviceSessions(
        'non-existent',
        'user_request',
      );

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_USER_NOT_FOUND');
    });

    it('should log audit entry with cross-device action', async () => {
      await service.terminateCrossDeviceSessions(
        'user-123',
        'user_request',
        { excludeCurrentSession: true },
      );

      expect(auditEntries.length).toBe(1);
      expect(auditEntries[0]!.action).toBe('cross_device_termination');
      expect(auditEntries[0]!.metadata?.excludeCurrentSessionRequested).toBe(true);
    });

    it('should handle missing currentRefreshToken gracefully', async () => {
      const result = await service.terminateCrossDeviceSessions(
        'user-123',
        'user_request',
        {
          excludeCurrentSession: true,
          // No currentRefreshToken provided
        },
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Should still complete, just with currentSessionPreserved = false
      expect(result.data.currentSessionPreserved).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // invalidateTenantSessions Tests
  // -------------------------------------------------------------------------

  describe('invalidateTenantSessions', () => {
    it('should invalidate all sessions for all users in a tenant', async () => {
      const result = await service.invalidateTenantSessions(
        'tenant-123',
        'security_incident',
        'corr-tenant',
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.tenantId).toBe('tenant-123');
      expect(result.data.usersAffected).toBe(50);
      expect(result.data.totalRefreshTokensRevoked).toBe(200);
      expect(mockTokenVersionService.mocks.forceLogoutTenant).toHaveBeenCalledWith(
        'tenant-123',
      );
    });

    it('should propagate tokenVersionService errors', async () => {
      mockTokenVersionService.mocks.forceLogoutTenant.mockResolvedValue(
        fail({ code: 'TENANT_ERROR', message: 'Tenant not found' }),
      );

      const result = await service.invalidateTenantSessions(
        'bad-tenant',
        'security_incident',
      );

      expect(result.success).toBe(false);
    });

    it('should log audit entry with system user for tenant-wide operations', async () => {
      await service.invalidateTenantSessions(
        'tenant-123',
        'security_incident',
        'corr-tenant',
      );

      expect(auditEntries.length).toBe(1);
      expect(auditEntries[0]!.action).toBe('tenant_wide_invalidation');
      expect(auditEntries[0]!.userId).toBe('system');
      expect(auditEntries[0]!.tenantId).toBe('tenant-123');
    });

    it('should include metadata with affected user count', async () => {
      await service.invalidateTenantSessions(
        'tenant-123',
        'admin_forced',
      );

      expect(auditEntries[0]!.metadata?.usersAffected).toBe(50);
      expect(auditEntries[0]!.metadata?.totalRefreshTokensRevoked).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // isSessionValid Tests
  // -------------------------------------------------------------------------

  describe('isSessionValid', () => {
    it('should return true for valid session', async () => {
      const mockToken = createMockRefreshToken();
      mockRefreshService.mocks.validateToken.mockResolvedValue(
        ok(createValidatedToken(mockToken)),
      );

      const result = await service.isSessionValid('valid-token');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toBe(true);
    });

    it('should return false for invalid session', async () => {
      mockRefreshService.mocks.validateToken.mockResolvedValue(
        fail({ code: 'AUTH_REFRESH_TOKEN_INVALID', message: 'Invalid' }),
      );

      const result = await service.isSessionValid('invalid-token');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toBe(false);
    });

    it('should return false for expired session', async () => {
      mockRefreshService.mocks.validateToken.mockResolvedValue(
        fail({ code: 'AUTH_REFRESH_TOKEN_EXPIRED', message: 'Expired' }),
      );

      const result = await service.isSessionValid('expired-token');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toBe(false);
    });

    it('should return false for revoked session', async () => {
      mockRefreshService.mocks.validateToken.mockResolvedValue(
        fail({ code: 'AUTH_TOKEN_REUSE_DETECTED', message: 'Reuse' }),
      );

      const result = await service.isSessionValid('reused-token');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // invalidateUserTenantSessions Tests
  // -------------------------------------------------------------------------

  describe('invalidateUserTenantSessions', () => {
    /**
     * Completion Criteria: Session invalidation when membership is revoked
     */
    it('should invalidate only sessions for user in specific tenant', async () => {
      const result = await service.invalidateUserTenantSessions(
        'user-123',
        'tenant-456',
        'membership_revoked',
        'corr-mem',
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.success).toBe(true);
      expect(result.data.userId).toBe('user-123');
      expect(mockRefreshService.mocks.revokeForUserAndTenant).toHaveBeenCalledWith(
        'user-123',
        'tenant-456',
      );
      // Should NOT call forceLogoutUser (which would affect all tenants)
      expect(mockTokenVersionService.mocks.forceLogoutUser).not.toHaveBeenCalled();
    });

    it('should fail if user does not exist', async () => {
      mockUserRepo.mocks.userExists.mockResolvedValue(ok(false));

      const result = await service.invalidateUserTenantSessions(
        'non-existent',
        'tenant-456',
        'membership_revoked',
      );

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_USER_NOT_FOUND');
    });

    it('should mark wasActive based on tokens revoked', async () => {
      // First test: tokens were revoked
      mockRefreshService.mocks.revokeForUserAndTenant.mockResolvedValue(ok(5));

      let result = await service.invalidateUserTenantSessions(
        'user-123',
        'tenant-456',
        'membership_revoked',
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.wasActive).toBe(true);

      // Second test: no tokens to revoke
      mockRefreshService.mocks.revokeForUserAndTenant.mockResolvedValue(ok(0));

      result = await service.invalidateUserTenantSessions(
        'user-123',
        'tenant-456',
        'membership_revoked',
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.wasActive).toBe(false);
    });

    it('should log audit entry with tenant scope', async () => {
      await service.invalidateUserTenantSessions(
        'user-123',
        'tenant-456',
        'membership_revoked',
        'corr-mem',
      );

      expect(auditEntries.length).toBe(1);
      expect(auditEntries[0]!.tenantId).toBe('tenant-456');
      expect(auditEntries[0]!.metadata?.scope).toBe('user_tenant');
    });

    it('should propagate repository errors', async () => {
      mockRefreshService.mocks.revokeForUserAndTenant.mockResolvedValue(
        fail({ code: 'REVOKE_ERROR', message: 'Failed' }),
      );

      const result = await service.invalidateUserTenantSessions(
        'user-123',
        'tenant-456',
        'membership_revoked',
      );

      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Integration Scenarios
  // -------------------------------------------------------------------------

  describe('Integration Scenarios', () => {
    /**
     * Test: Session invalidation on password change flow
     * Password change should invalidate ALL sessions (handled by PasswordChangeHandler,
     * but this service provides the underlying mechanism)
     */
    it('should support password change invalidation via invalidateAllUserSessions', async () => {
      const result = await service.invalidateAllUserSessions(
        'user-123',
        'password_change',
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Verify tokenVersion was incremented (invalidates all access tokens)
      expect(result.data.newTokenVersion).toBeGreaterThan(result.data.previousTokenVersion);
      // Verify refresh tokens were revoked
      expect(result.data.revokedRefreshTokens).toBeGreaterThan(0);
    });

    /**
     * Test: Membership revocation should only affect specific tenant
     */
    it('should not affect other tenants when membership is revoked', async () => {
      await service.invalidateUserTenantSessions(
        'user-123',
        'tenant-A',
        'membership_revoked',
      );

      // Should only call revokeForUserAndTenant, NOT forceLogoutUser
      expect(mockRefreshService.mocks.revokeForUserAndTenant).toHaveBeenCalledWith(
        'user-123',
        'tenant-A',
      );
      expect(mockTokenVersionService.mocks.forceLogoutUser).not.toHaveBeenCalled();
    });

    /**
     * Test: Security incident should invalidate everything
     */
    it('should invalidate all sessions for security incidents', async () => {
      const result = await service.invalidateAllUserSessions(
        'user-123',
        'account_compromised',
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(mockTokenVersionService.mocks.forceLogoutUser).toHaveBeenCalledWith(
        'user-123',
      );
      expect(auditEntries[0]!.reason).toBe('account_compromised');
    });
  });

  // -------------------------------------------------------------------------
  // Audit Logger Edge Cases
  // -------------------------------------------------------------------------

  describe('Audit Logger', () => {
    it('should not fail if audit logger throws', async () => {
      const failingAuditLogger: SessionInvalidationAuditLogger = vi.fn(() => {
        throw new Error('Audit failed');
      });

      service = SessionInvalidationServiceImpl({
        refreshTokenService: mockRefreshService.service,
        tokenVersionService: mockTokenVersionService.service,
        userRepository: mockUserRepo.repository,
        config: {
          auditLogger: failingAuditLogger,
        },
      });

      // Should not throw
      const result = await service.invalidateAllUserSessions(
        'user-123',
        'user_logout',
      );

      expect(result.success).toBe(true);
    });

    it('should work without audit logger configured', async () => {
      service = SessionInvalidationServiceImpl({
        refreshTokenService: mockRefreshService.service,
        tokenVersionService: mockTokenVersionService.service,
        userRepository: mockUserRepo.repository,
        // No config / no audit logger
      });

      const result = await service.invalidateAllUserSessions(
        'user-123',
        'user_logout',
      );

      expect(result.success).toBe(true);
    });

    it('should handle async audit logger', async () => {
      const asyncEntries: SessionInvalidationAuditEntry[] = [];
      const asyncAuditLogger: SessionInvalidationAuditLogger = async (entry) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        asyncEntries.push(entry);
      };

      service = SessionInvalidationServiceImpl({
        refreshTokenService: mockRefreshService.service,
        tokenVersionService: mockTokenVersionService.service,
        userRepository: mockUserRepo.repository,
        config: {
          auditLogger: asyncAuditLogger,
        },
      });

      await service.invalidateAllUserSessions('user-123', 'user_logout');

      expect(asyncEntries.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Immediate Invalidation Verification
  // -------------------------------------------------------------------------

  describe('Immediate Invalidation', () => {
    /**
     * Completion Criteria: Immediate invalidation (not eventual)
     */
    it('should invalidate synchronously - token invalid immediately after call', async () => {
      // First call - token is valid
      const mockToken = createMockRefreshToken();
      mockRefreshService.mocks.validateToken.mockResolvedValue(
        ok(createValidatedToken(mockToken)),
      );

      // Invalidate the session
      await service.invalidateSession('the-token', 'user_logout');

      // The revokeToken should have been called immediately
      expect(mockRefreshService.mocks.revokeToken).toHaveBeenCalledWith('the-token');
    });

    it('should increment tokenVersion synchronously for bulk invalidation', async () => {
      await service.invalidateAllUserSessions('user-123', 'security_incident');

      // forceLogoutUser should be called immediately and synchronously
      expect(mockTokenVersionService.mocks.forceLogoutUser).toHaveBeenCalledTimes(1);
    });
  });
});
