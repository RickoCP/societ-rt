/**
 * TokenVersionService Tests — Token version management for forced invalidation.
 *
 * Tests cover:
 * - Get current tokenVersion for user
 * - Token version validation (EXACT match, not greater-than)
 * - Force logout user (increment version + revoke all tokens)
 * - Force logout tenant (bulk increment + revoke all tokens)
 *
 * @see Requirement 15 (Token Version for Forced Invalidation)
 * @see Design V4: Token version mismatch → immediate rejection
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  TokenVersionServiceImpl,
  type TokenVersionService,
  type TokenVersionUserRepository,
} from '../TokenVersionService';
import type { RefreshTokenService } from '../RefreshTokenService';
import { ok, fail } from '@core/utils';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

/**
 * Create a mock TokenVersionUserRepository.
 */
function createMockUserRepository(): {
  repository: TokenVersionUserRepository;
  mocks: {
    getTokenVersion: Mock;
    incrementTokenVersion: Mock;
    incrementTokenVersionForTenant: Mock;
    getUserIdsByTenant: Mock;
  };
} {
  const mocks = {
    getTokenVersion: vi.fn(),
    incrementTokenVersion: vi.fn(),
    incrementTokenVersionForTenant: vi.fn(),
    getUserIdsByTenant: vi.fn(),
  };

  const repository: TokenVersionUserRepository = {
    getTokenVersion: mocks.getTokenVersion,
    incrementTokenVersion: mocks.incrementTokenVersion,
    incrementTokenVersionForTenant: mocks.incrementTokenVersionForTenant,
    getUserIdsByTenant: mocks.getUserIdsByTenant,
  };

  return { repository, mocks };
}

/**
 * Create a mock RefreshTokenService.
 */
function createMockRefreshTokenService(): {
  service: RefreshTokenService;
  mocks: {
    revokeAllForUser: Mock;
  };
} {
  const mocks = {
    revokeAllForUser: vi.fn(),
  };

  const service = {
    createToken: vi.fn(),
    validateToken: vi.fn(),
    rotateToken: vi.fn(),
    revokeToken: vi.fn(),
    revokeFamily: vi.fn(),
    revokeAllForUser: mocks.revokeAllForUser,
    revokeForUserAndTenant: vi.fn(),
    hashToken: vi.fn(),
    generateOpaqueToken: vi.fn(),
  } as unknown as RefreshTokenService;

  return { service, mocks };
}

describe('TokenVersionService', () => {
  let service: TokenVersionService;
  let mockUserRepo: ReturnType<typeof createMockUserRepository>;
  let mockRefreshService: ReturnType<typeof createMockRefreshTokenService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRepo = createMockUserRepository();
    mockRefreshService = createMockRefreshTokenService();
    service = TokenVersionServiceImpl({
      userRepository: mockUserRepo.repository,
      refreshTokenService: mockRefreshService.service,
    });
  });

  // -------------------------------------------------------------------------
  // getTokenVersion Tests
  // -------------------------------------------------------------------------

  describe('getTokenVersion', () => {
    it('should return current tokenVersion for user', async () => {
      mockUserRepo.mocks.getTokenVersion.mockResolvedValue(ok(5));

      const result = await service.getTokenVersion('user-123');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toBe(5);
      expect(mockUserRepo.mocks.getTokenVersion).toHaveBeenCalledWith(
        'user-123',
      );
    });

    it('should return AUTH_USER_NOT_FOUND if user does not exist', async () => {
      mockUserRepo.mocks.getTokenVersion.mockResolvedValue(ok(null));

      const result = await service.getTokenVersion('non-existent-user');

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_USER_NOT_FOUND');
    });

    it('should propagate repository errors', async () => {
      mockUserRepo.mocks.getTokenVersion.mockResolvedValue(
        fail({ code: 'DB_ERROR', message: 'Database error' }),
      );

      const result = await service.getTokenVersion('user-123');

      expect(result.success).toBe(false);
    });

    it('should handle tokenVersion of 0', async () => {
      mockUserRepo.mocks.getTokenVersion.mockResolvedValue(ok(0));

      const result = await service.getTokenVersion('user-123');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // validateTokenVersion Tests
  // -------------------------------------------------------------------------

  describe('validateTokenVersion', () => {
    beforeEach(() => {
      // Default: user has tokenVersion=5
      mockUserRepo.mocks.getTokenVersion.mockResolvedValue(ok(5));
    });

    /**
     * AC 3-4: Exact match validation (Design V4)
     */
    it('should return true when JWT tokenVersion matches exactly', async () => {
      const result = await service.validateTokenVersion('user-123', 5);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toBe(true);
    });

    /**
     * AC 4: Mismatch → reject (Design V4: EXACT match required)
     */
    it('should return false when JWT tokenVersion is less than current', async () => {
      const result = await service.validateTokenVersion('user-123', 3);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toBe(false);
    });

    /**
     * Design V4: Even greater version is rejected (EXACT match only)
     */
    it('should return false when JWT tokenVersion is GREATER than current', async () => {
      const result = await service.validateTokenVersion('user-123', 7);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // CRITICAL: Greater-than is also invalid per Design V4
      expect(result.data).toBe(false);
    });

    it('should return error if user not found', async () => {
      mockUserRepo.mocks.getTokenVersion.mockResolvedValue(ok(null));

      const result = await service.validateTokenVersion('non-existent', 1);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_USER_NOT_FOUND');
    });

    it('should validate tokenVersion=0 correctly', async () => {
      mockUserRepo.mocks.getTokenVersion.mockResolvedValue(ok(0));

      const result = await service.validateTokenVersion('user-123', 0);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toBe(true);
    });

    it('should reject tokenVersion=0 when current is 1', async () => {
      mockUserRepo.mocks.getTokenVersion.mockResolvedValue(ok(1));

      const result = await service.validateTokenVersion('user-123', 0);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // forceLogoutUser Tests
  // -------------------------------------------------------------------------

  describe('forceLogoutUser', () => {
    beforeEach(() => {
      mockUserRepo.mocks.getTokenVersion.mockResolvedValue(ok(5));
      mockUserRepo.mocks.incrementTokenVersion.mockResolvedValue(ok(6));
      mockRefreshService.mocks.revokeAllForUser.mockResolvedValue(ok(10));
    });

    /**
     * AC 5-6: Increment tokenVersion + revoke all refresh tokens
     */
    it('should increment tokenVersion and revoke all tokens', async () => {
      const result = await service.forceLogoutUser('user-123');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.previousVersion).toBe(5);
      expect(result.data.newVersion).toBe(6);
      expect(result.data.revokedTokenCount).toBe(10);

      expect(mockUserRepo.mocks.incrementTokenVersion).toHaveBeenCalledWith(
        'user-123',
      );
      expect(mockRefreshService.mocks.revokeAllForUser).toHaveBeenCalledWith(
        'user-123',
      );
    });

    it('should increment version BEFORE revoking tokens', async () => {
      const callOrder: string[] = [];

      mockUserRepo.mocks.incrementTokenVersion.mockImplementation(async () => {
        callOrder.push('increment');
        return ok(6);
      });
      mockRefreshService.mocks.revokeAllForUser.mockImplementation(async () => {
        callOrder.push('revoke');
        return ok(10);
      });

      await service.forceLogoutUser('user-123');

      // Version increment must happen first for security
      expect(callOrder).toEqual(['increment', 'revoke']);
    });

    it('should fail if user not found', async () => {
      mockUserRepo.mocks.getTokenVersion.mockResolvedValue(ok(null));

      const result = await service.forceLogoutUser('non-existent');

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_USER_NOT_FOUND');
    });

    it('should handle revoke failure gracefully', async () => {
      mockRefreshService.mocks.revokeAllForUser.mockResolvedValue(
        fail({ code: 'REVOKE_ERROR', message: 'Failed to revoke' }),
      );

      const result = await service.forceLogoutUser('user-123');

      // Should still succeed but with 0 revoked count
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.revokedTokenCount).toBe(0);
      expect(result.data.newVersion).toBe(6); // Version still incremented
    });
  });

  // -------------------------------------------------------------------------
  // forceLogoutTenant Tests
  // -------------------------------------------------------------------------

  describe('forceLogoutTenant', () => {
    beforeEach(() => {
      mockUserRepo.mocks.incrementTokenVersionForTenant.mockResolvedValue(ok(50));
      mockUserRepo.mocks.getUserIdsByTenant.mockResolvedValue(
        ok(['user-1', 'user-2', 'user-3']),
      );
      mockRefreshService.mocks.revokeAllForUser.mockResolvedValue(ok(5));
    });

    /**
     * AC 7: Bulk increment for tenant-wide force logout
     */
    it('should increment tokenVersion for all users in tenant', async () => {
      const result = await service.forceLogoutTenant('tenant-123');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.userCount).toBe(50);
      expect(mockUserRepo.mocks.incrementTokenVersionForTenant).toHaveBeenCalledWith(
        'tenant-123',
      );
    });

    it('should revoke all refresh tokens for all users in tenant', async () => {
      const result = await service.forceLogoutTenant('tenant-123');

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Should have called revokeAllForUser for each user
      expect(mockRefreshService.mocks.revokeAllForUser).toHaveBeenCalledTimes(3);
      expect(mockRefreshService.mocks.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(mockRefreshService.mocks.revokeAllForUser).toHaveBeenCalledWith('user-2');
      expect(mockRefreshService.mocks.revokeAllForUser).toHaveBeenCalledWith('user-3');

      // 3 users * 5 tokens each = 15 total
      expect(result.data.totalRevokedTokens).toBe(15);
    });

    it('should handle getUserIdsByTenant failure gracefully', async () => {
      mockUserRepo.mocks.getUserIdsByTenant.mockResolvedValue(
        fail({ code: 'DB_ERROR', message: 'Failed to get users' }),
      );

      const result = await service.forceLogoutTenant('tenant-123');

      // Should still return partial success
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.userCount).toBe(50);
      expect(result.data.totalRevokedTokens).toBe(0);
    });

    it('should handle individual user revoke failures gracefully', async () => {
      mockRefreshService.mocks.revokeAllForUser
        .mockResolvedValueOnce(ok(5))
        .mockResolvedValueOnce(fail({ code: 'ERROR', message: 'Failed' }))
        .mockResolvedValueOnce(ok(3));

      const result = await service.forceLogoutTenant('tenant-123');

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Only 2 successful revocations: 5 + 3 = 8
      expect(result.data.totalRevokedTokens).toBe(8);
    });
  });
});
