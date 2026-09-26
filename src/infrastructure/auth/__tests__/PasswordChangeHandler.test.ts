/**
 * PasswordChangeHandler Tests — Password change with mandatory session invalidation.
 *
 * Tests cover:
 * - Password policy validation (min length, complexity rules)
 * - Password history check (prevent reuse)
 * - MANDATORY tokenVersion increment (Requirement 51 AC 4 & AC 9)
 * - Session invalidation (no exceptions)
 * - Recovery token invalidation
 * - Audit logging
 *
 * @see Task 40: Token Security Hardening
 * @see Requirement 51 AC 4: Password reset invalidates ALL sessions by incrementing tokenVersion
 * @see Requirement 51 AC 9: MANDATORY session invalidation on password change (no exceptions)
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  PasswordChangeHandlerImpl,
  type PasswordChangeHandler,
  type PasswordRepository,
  type ChangePasswordInput,
} from '../PasswordChangeHandler';
import type { TokenVersionService, TokenVersionIncrementResult } from '../TokenVersionService';
import type { RecoveryTokenService } from '../RecoveryTokenService';
import type { TokenSecurityAuditService } from '../TokenSecurityAuditService';
import { ok, fail } from '@core/utils';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

function createMockPasswordRepository(): {
  repository: PasswordRepository;
  mocks: {
    getPasswordHash: Mock;
    updatePasswordHash: Mock;
    getPasswordHistory: Mock;
    addPasswordToHistory: Mock;
    userExists: Mock;
  };
} {
  const mocks = {
    getPasswordHash: vi.fn(),
    updatePasswordHash: vi.fn(),
    getPasswordHistory: vi.fn(),
    addPasswordToHistory: vi.fn(),
    userExists: vi.fn(),
  };

  const repository: PasswordRepository = {
    getPasswordHash: mocks.getPasswordHash,
    updatePasswordHash: mocks.updatePasswordHash,
    getPasswordHistory: mocks.getPasswordHistory,
    addPasswordToHistory: mocks.addPasswordToHistory,
    userExists: mocks.userExists,
  };

  return { repository, mocks };
}

function createMockTokenVersionService(): {
  service: TokenVersionService;
  mocks: {
    getTokenVersion: Mock;
    validateTokenVersion: Mock;
    forceLogoutUser: Mock;
    forceLogoutTenant: Mock;
  };
} {
  const mocks = {
    getTokenVersion: vi.fn(),
    validateTokenVersion: vi.fn(),
    forceLogoutUser: vi.fn(),
    forceLogoutTenant: vi.fn(),
  };

  const service: TokenVersionService = {
    getTokenVersion: mocks.getTokenVersion,
    validateTokenVersion: mocks.validateTokenVersion,
    forceLogoutUser: mocks.forceLogoutUser,
    forceLogoutTenant: mocks.forceLogoutTenant,
  };

  return { service, mocks };
}

function createMockRecoveryTokenService(): {
  service: Pick<RecoveryTokenService, 'invalidateAllForUser'>;
  mocks: {
    invalidateAllForUser: Mock;
  };
} {
  const mocks = {
    invalidateAllForUser: vi.fn(),
  };

  const service = {
    invalidateAllForUser: mocks.invalidateAllForUser,
  };

  return { service: service as RecoveryTokenService, mocks };
}

function createMockAuditService(): {
  service: TokenSecurityAuditService;
  mocks: {
    logPasswordChange: Mock;
  };
} {
  const mocks = {
    logPasswordChange: vi.fn().mockResolvedValue({}),
  };

  // Partial mock - only the methods we use
  const service = {
    logPasswordChange: mocks.logPasswordChange,
  } as unknown as TokenSecurityAuditService;

  return { service, mocks };
}

describe('PasswordChangeHandler', () => {
  let handler: PasswordChangeHandler;
  let mockRepo: ReturnType<typeof createMockPasswordRepository>;
  let mockTokenVersionService: ReturnType<typeof createMockTokenVersionService>;
  let mockRecoveryService: ReturnType<typeof createMockRecoveryTokenService>;
  let mockAuditService: ReturnType<typeof createMockAuditService>;

  const validInput: ChangePasswordInput = {
    userId: 'user-123',
    tenantId: 'tenant-456',
    newPassword: 'SecureP@ssw0rd!',
    newPasswordHash: 'hash-of-new-password',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    reason: 'user_initiated',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockPasswordRepository();
    mockTokenVersionService = createMockTokenVersionService();
    mockRecoveryService = createMockRecoveryTokenService();
    mockAuditService = createMockAuditService();

    // Default successful mocks
    mockRepo.mocks.userExists.mockResolvedValue(ok(true));
    mockRepo.mocks.getPasswordHistory.mockResolvedValue(ok([]));
    mockRepo.mocks.updatePasswordHash.mockResolvedValue(ok(undefined));
    mockRepo.mocks.getPasswordHash.mockResolvedValue(ok('old-hash'));
    mockRepo.mocks.addPasswordToHistory.mockResolvedValue(ok(undefined));

    const forceLogoutResult: TokenVersionIncrementResult = {
      userId: 'user-123',
      previousVersion: 0,
      newVersion: 1,
      revokedTokenCount: 3,
    };
    mockTokenVersionService.mocks.forceLogoutUser.mockResolvedValue(
      ok(forceLogoutResult),
    );

    mockRecoveryService.mocks.invalidateAllForUser.mockResolvedValue(ok(2));

    handler = PasswordChangeHandlerImpl({
      passwordRepository: mockRepo.repository,
      tokenVersionService: mockTokenVersionService.service,
      recoveryTokenService: mockRecoveryService.service as RecoveryTokenService,
      auditService: mockAuditService.service,
    });
  });

  // -------------------------------------------------------------------------
  // Password Policy Validation Tests
  // -------------------------------------------------------------------------

  describe('validatePassword', () => {
    /**
     * @see Requirement 51 AC 1: Password policy enforcement
     */
    it('should validate password meeting all requirements', () => {
      const result = handler.validatePassword('SecureP@ssw0rd!');

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should reject password shorter than minimum length', () => {
      const result = handler.validatePassword('Short1!');

      expect(result.isValid).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: 'minLength' }),
      );
    });

    it('should reject password without uppercase', () => {
      const result = handler.validatePassword('securepassword1!');

      expect(result.isValid).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: 'requireUppercase' }),
      );
    });

    it('should reject password without lowercase', () => {
      const result = handler.validatePassword('SECUREPASSWORD1!');

      expect(result.isValid).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: 'requireLowercase' }),
      );
    });

    it('should reject password without numbers', () => {
      const result = handler.validatePassword('SecurePassword!');

      expect(result.isValid).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: 'requireNumbers' }),
      );
    });

    it('should reject password without special characters', () => {
      const result = handler.validatePassword('SecurePassword1');

      expect(result.isValid).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: 'requireSpecial' }),
      );
    });

    it('should return multiple violations for weak password', () => {
      const result = handler.validatePassword('weak');

      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(3);
    });
  });

  // -------------------------------------------------------------------------
  // Password History Tests
  // -------------------------------------------------------------------------

  describe('checkPasswordHistory', () => {
    /**
     * @see Requirement 51 AC 8: Prevent reuse of last N passwords
     */
    it('should return false when password is not in history', async () => {
      mockRepo.mocks.getPasswordHistory.mockResolvedValue(ok(['old-hash-1', 'old-hash-2']));

      const result = await handler.checkPasswordHistory('user-123', 'new-hash');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toBe(false);
    });

    it('should return true when password is in history', async () => {
      mockRepo.mocks.getPasswordHistory.mockResolvedValue(
        ok(['old-hash-1', 'reused-hash', 'old-hash-2']),
      );

      const result = await handler.checkPasswordHistory('user-123', 'reused-hash');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toBe(true);
    });

    it('should handle repository errors gracefully', async () => {
      mockRepo.mocks.getPasswordHistory.mockResolvedValue(
        fail({ code: 'DB_ERROR', message: 'Database error' }),
      );

      const result = await handler.checkPasswordHistory('user-123', 'any-hash');

      // On error, allow (don't block password change)
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Password Change Tests
  // -------------------------------------------------------------------------

  describe('changePassword', () => {
    /**
     * @see Requirement 51 AC 4: Password reset invalidates ALL sessions by incrementing tokenVersion
     * @see Requirement 51 AC 9: MANDATORY session invalidation on password change (no exceptions)
     */
    it('should successfully change password and return result', async () => {
      const result = await handler.changePassword(validInput);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.userId).toBe('user-123');
      expect(result.data.previousTokenVersion).toBe(0);
      expect(result.data.newTokenVersion).toBe(1);
      expect(result.data.sessionsInvalidated).toBe(3);
      expect(result.data.recoveryTokensInvalidated).toBe(2);
    });

    it('should verify user exists before changing password', async () => {
      mockRepo.mocks.userExists.mockResolvedValue(ok(false));

      const result = await handler.changePassword(validInput);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('AUTH_USER_NOT_FOUND');
    });

    it('should validate password against policy', async () => {
      const result = await handler.changePassword({
        ...validInput,
        newPassword: 'weak', // Fails policy
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('AUTH_PASSWORD_POLICY_VIOLATION');
    });

    it('should check password history for reuse', async () => {
      mockRepo.mocks.getPasswordHistory.mockResolvedValue(
        ok([validInput.newPasswordHash]), // Hash matches history
      );

      const result = await handler.changePassword(validInput);

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('AUTH_PASSWORD_REUSED');
    });

    it('should update password hash in repository', async () => {
      await handler.changePassword(validInput);

      expect(mockRepo.mocks.updatePasswordHash).toHaveBeenCalledWith(
        'user-123',
        validInput.newPasswordHash,
      );
    });

    /**
     * MANDATORY: tokenVersion MUST be incremented
     * @see Requirement 51 AC 4 and AC 9
     */
    it('should ALWAYS increment tokenVersion via forceLogoutUser', async () => {
      await handler.changePassword(validInput);

      expect(mockTokenVersionService.mocks.forceLogoutUser).toHaveBeenCalledWith(
        'user-123',
      );
    });

    /**
     * MANDATORY: All recovery tokens MUST be invalidated
     */
    it('should ALWAYS invalidate all recovery tokens', async () => {
      await handler.changePassword(validInput);

      expect(mockRecoveryService.mocks.invalidateAllForUser).toHaveBeenCalledWith(
        'user-123',
        'password_changed',
      );
    });

    it('should add old password to history', async () => {
      await handler.changePassword(validInput);

      expect(mockRepo.mocks.addPasswordToHistory).toHaveBeenCalledWith(
        'user-123',
        'old-hash',
      );
    });

    /**
     * Critical: Password change should complete even if tokenVersion increment fails
     * (the password is already changed, we just log the error)
     */
    it('should complete password change even if tokenVersion increment fails', async () => {
      mockTokenVersionService.mocks.forceLogoutUser.mockResolvedValue(
        fail({ code: 'DB_ERROR', message: 'Database error' }),
      );

      const result = await handler.changePassword(validInput);

      // Password was still changed
      expect(mockRepo.mocks.updatePasswordHash).toHaveBeenCalled();
      // Result should still be success (password changed)
      expect(result.success).toBe(true);
    });

    it('should log audit entry on successful change', async () => {
      await handler.changePassword(validInput);

      expect(mockAuditService.mocks.logPasswordChange).toHaveBeenCalled();
    });

    it('should log audit entry on failed change', async () => {
      mockRepo.mocks.userExists.mockResolvedValue(ok(false));

      await handler.changePassword(validInput);

      expect(mockAuditService.mocks.logPasswordChange).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          success: false,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Force Password Change Tests
  // -------------------------------------------------------------------------

  describe('forcePasswordChange', () => {
    /**
     * @see Requirement 51 AC 7: Allow administrators to force password reset
     */
    it('should force password change without current password verification', async () => {
      const result = await handler.forcePasswordChange({
        userId: 'user-123',
        tenantId: 'tenant-456',
        newPassword: 'NewSecureP@ss1!',
        newPasswordHash: 'new-hash',
        adminUserId: 'admin-user-id',
        reason: 'admin_forced',
      });

      expect(result.success).toBe(true);
      expect(mockRepo.mocks.updatePasswordHash).toHaveBeenCalled();
      expect(mockTokenVersionService.mocks.forceLogoutUser).toHaveBeenCalled();
    });

    it('should log admin action for audit trail', async () => {
      await handler.forcePasswordChange({
        userId: 'user-123',
        newPassword: 'NewSecureP@ss1!',
        newPasswordHash: 'new-hash',
        adminUserId: 'admin-user-id',
        reason: 'admin_forced',
      });

      expect(mockAuditService.mocks.logPasswordChange).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          metadata: expect.objectContaining({
            adminUserId: 'admin-user-id',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Get Policy Tests
  // -------------------------------------------------------------------------

  describe('getPolicy', () => {
    it('should return current password policy', () => {
      const policy = handler.getPolicy();

      expect(policy.minLength).toBe(12);
      expect(policy.requireUppercase).toBe(true);
      expect(policy.requireLowercase).toBe(true);
      expect(policy.requireNumbers).toBe(true);
      expect(policy.requireSpecial).toBe(true);
      expect(policy.historyCount).toBe(5);
    });

    it('should respect custom policy configuration', () => {
      const customHandler = PasswordChangeHandlerImpl({
        passwordRepository: mockRepo.repository,
        tokenVersionService: mockTokenVersionService.service,
        recoveryTokenService: mockRecoveryService.service as RecoveryTokenService,
        config: {
          policy: {
            minLength: 16,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecial: false,
            historyCount: 10,
          },
        },
      });

      const policy = customHandler.getPolicy();

      expect(policy.minLength).toBe(16);
      expect(policy.requireSpecial).toBe(false);
      expect(policy.historyCount).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // Session Invalidation Verification (Critical Requirement)
  // -------------------------------------------------------------------------

  describe('mandatory session invalidation', () => {
    /**
     * CRITICAL TEST: Verify that session invalidation ALWAYS happens
     * @see Requirement 51 AC 9: MANDATORY session invalidation on password change (no exceptions)
     */
    it('should NEVER skip session invalidation on any password change reason', async () => {
      const reasons: Array<ChangePasswordInput['reason']> = [
        'user_initiated',
        'reset_via_recovery',
        'admin_forced',
        'policy_expiry',
        'security_incident',
      ];

      for (const reason of reasons) {
        vi.clearAllMocks();

        // Reset mocks
        mockRepo.mocks.userExists.mockResolvedValue(ok(true));
        mockRepo.mocks.getPasswordHistory.mockResolvedValue(ok([]));
        mockRepo.mocks.updatePasswordHash.mockResolvedValue(ok(undefined));
        mockRepo.mocks.getPasswordHash.mockResolvedValue(ok('old-hash'));
        mockRepo.mocks.addPasswordToHistory.mockResolvedValue(ok(undefined));
        mockTokenVersionService.mocks.forceLogoutUser.mockResolvedValue(
          ok({
            userId: 'user-123',
            previousVersion: 0,
            newVersion: 1,
            revokedTokenCount: 3,
          }),
        );
        mockRecoveryService.mocks.invalidateAllForUser.mockResolvedValue(ok(2));

        await handler.changePassword({
          ...validInput,
          reason,
        });

        expect(
          mockTokenVersionService.mocks.forceLogoutUser,
          `forceLogoutUser should be called for reason: ${reason}`,
        ).toHaveBeenCalled();
      }
    });

    it('should report sessions invalidated count from forceLogoutUser', async () => {
      mockTokenVersionService.mocks.forceLogoutUser.mockResolvedValue(
        ok({
          userId: 'user-123',
          previousVersion: 5,
          newVersion: 6,
          revokedTokenCount: 15,
        }),
      );

      const result = await handler.changePassword(validInput);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.sessionsInvalidated).toBe(15);
      expect(result.data.previousTokenVersion).toBe(5);
      expect(result.data.newTokenVersion).toBe(6);
    });
  });
});
