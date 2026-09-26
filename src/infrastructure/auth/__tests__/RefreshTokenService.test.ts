/**
 * RefreshTokenService Tests — Secure refresh token lifecycle management.
 *
 * Tests cover:
 * - Token generation (256-bit opaque, URL-safe base64)
 * - Token hashing (SHA-256)
 * - Token validation and status checking
 * - Token rotation with familyId stability
 * - Generation monotonic increment
 * - Reuse detection → family-wide revocation with AUTH_TOKEN_REUSE_DETECTED
 * - Single token revocation (idempotent)
 * - User-wide and tenant-specific revocation
 *
 * @see Requirements 14 (Refresh Token), 16 (Session Revocation)
 * @see Design D2: Opaque 256-bit, SHA-256 hash storage, 30-day expiry
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import crypto from 'crypto';
import {
  RefreshTokenServiceImpl,
  type RefreshTokenService,
  type CreateTokenInput,
  type RotateTokenInput,
} from '../RefreshTokenService';
import type { RefreshTokenRepository } from '@core/domains/auth/repositories/RefreshTokenRepository';
import type { RefreshToken } from '@core/domains/auth/entities/RefreshToken';
import { ok, fail, type DomainResult } from '@core/utils';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

/**
 * Create a mock RefreshTokenRepository.
 */
function createMockRepository(): {
  repository: RefreshTokenRepository;
  mocks: {
    create: Mock;
    findByHash: Mock;
    findById: Mock;
    findByFamily: Mock;
    findByUserId: Mock;
    findByUserAndTenant: Mock;
    revokeById: Mock;
    revokeByFamily: Mock;
    revokeByUserId: Mock;
    revokeByUserAndTenant: Mock;
    getLatestGeneration: Mock;
    countActiveByUserId: Mock;
    deleteExpiredBefore: Mock;
  };
} {
  const mocks = {
    create: vi.fn(),
    findByHash: vi.fn(),
    findById: vi.fn(),
    findByFamily: vi.fn(),
    findByUserId: vi.fn(),
    findByUserAndTenant: vi.fn(),
    revokeById: vi.fn(),
    revokeByFamily: vi.fn(),
    revokeByUserId: vi.fn(),
    revokeByUserAndTenant: vi.fn(),
    getLatestGeneration: vi.fn(),
    countActiveByUserId: vi.fn(),
    deleteExpiredBefore: vi.fn(),
  };

  const repository: RefreshTokenRepository = {
    create: mocks.create,
    findByHash: mocks.findByHash,
    findById: mocks.findById,
    findByFamily: mocks.findByFamily,
    findByUserId: mocks.findByUserId,
    findByUserAndTenant: mocks.findByUserAndTenant,
    revokeById: mocks.revokeById,
    revokeByFamily: mocks.revokeByFamily,
    revokeByUserId: mocks.revokeByUserId,
    revokeByUserAndTenant: mocks.revokeByUserAndTenant,
    getLatestGeneration: mocks.getLatestGeneration,
    countActiveByUserId: mocks.countActiveByUserId,
    deleteExpiredBefore: mocks.deleteExpiredBefore,
  };

  return { repository, mocks };
}

/**
 * Create a mock RefreshToken entity.
 */
function createMockToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'token-id-1',
    userId: 'user-123',
    tokenHash: 'hash-abc',
    familyId: 'family-xyz',
    generation: 1,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    revokedAt: null,
    replacedBy: null,
    userAgent: 'Mozilla/5.0',
    ipAddress: '192.168.1.1',
    tenantId: 'tenant-456',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockRepository();
    service = RefreshTokenServiceImpl({
      refreshTokenRepository: mockRepo.repository,
    });
  });

  // -------------------------------------------------------------------------
  // Token Generation Tests
  // -------------------------------------------------------------------------

  describe('generateOpaqueToken', () => {
    /**
     * AC 1: Generate opaque 256-bit (32 byte) random tokens
     */
    it('should generate 256-bit opaque random tokens', () => {
      const token = service.generateOpaqueToken();

      // URL-safe base64 encoding of 32 bytes should be 43 characters
      // (32 * 8 / 6 = 42.67, rounded up)
      expect(token.length).toBeGreaterThanOrEqual(42);
      expect(token.length).toBeLessThanOrEqual(44);
    });

    it('should generate URL-safe base64 encoded tokens', () => {
      const token = service.generateOpaqueToken();

      // URL-safe base64 should not contain + or /
      expect(token).not.toMatch(/[+/]/);
      // Should only contain URL-safe base64 characters
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate unique tokens on each call', () => {
      const tokens = new Set<string>();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        tokens.add(service.generateOpaqueToken());
      }

      expect(tokens.size).toBe(iterations);
    });

    it('should generate cryptographically random tokens', () => {
      // Verify entropy by checking different byte positions
      const tokens = Array.from({ length: 50 }, () =>
        service.generateOpaqueToken(),
      );

      // Decode and check distribution
      const firstChars = tokens.map(t => t[0]);
      const uniqueFirstChars = new Set(firstChars);

      // Should have reasonable entropy in first character
      expect(uniqueFirstChars.size).toBeGreaterThan(5);
    });
  });

  // -------------------------------------------------------------------------
  // Token Hashing Tests
  // -------------------------------------------------------------------------

  describe('hashToken', () => {
    /**
     * AC 2: Hash tokens with SHA-256 for storage
     */
    it('should hash tokens using SHA-256', () => {
      const plaintextToken = 'test-token-12345';
      const hash = service.hashToken(plaintextToken);

      // SHA-256 produces 64-character hex string
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should produce deterministic hashes', () => {
      const token = 'deterministic-test-token';

      const hash1 = service.hashToken(token);
      const hash2 = service.hashToken(token);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different tokens', () => {
      const hash1 = service.hashToken('token-1');
      const hash2 = service.hashToken('token-2');

      expect(hash1).not.toBe(hash2);
    });

    it('should match Node.js crypto SHA-256 output', () => {
      const token = 'verify-sha256';
      const expectedHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      expect(service.hashToken(token)).toBe(expectedHash);
    });
  });

  // -------------------------------------------------------------------------
  // Token Creation Tests
  // -------------------------------------------------------------------------

  describe('createToken', () => {
    const validInput: CreateTokenInput = {
      userId: 'user-123',
      tenantId: 'tenant-456',
      userAgent: 'Mozilla/5.0',
      ipAddress: '192.168.1.1',
    };

    beforeEach(() => {
      mockRepo.mocks.create.mockResolvedValue(
        ok(createMockToken({ userId: validInput.userId })),
      );
    });

    it('should create a new token with generation=1', async () => {
      const result = await service.createToken(validInput);

      expect(result.success).toBe(true);
      expect(mockRepo.mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: validInput.userId,
          generation: 1,
        }),
      );
    });

    /**
     * AC 3: familyId created for new token families
     */
    it('should generate a new familyId (UUID v4)', async () => {
      await service.createToken(validInput);

      const createCall = mockRepo.mocks.create.mock.calls[0]?.[0];
      expect(createCall.familyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('should hash the token before storing', async () => {
      await service.createToken(validInput);

      const createCall = mockRepo.mocks.create.mock.calls[0]?.[0];
      // Hash should be 64-char hex string
      expect(createCall.tokenHash.length).toBe(64);
      expect(createCall.tokenHash).toMatch(/^[a-f0-9]+$/);
    });

    it('should return plaintext token and record', async () => {
      const result = await service.createToken(validInput);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.token).toBeDefined();
      expect(result.data.record).toBeDefined();
      // Verify the returned token can hash to the stored hash
      const hashOfReturned = service.hashToken(result.data.token);
      const createCall = mockRepo.mocks.create.mock.calls[0]?.[0];
      expect(hashOfReturned).toBe(createCall.tokenHash);
    });

    it('should set correct expiry (default 30 days)', async () => {
      const now = Date.now();
      await service.createToken(validInput);

      const createCall = mockRepo.mocks.create.mock.calls[0]?.[0];
      const expiresAt = createCall.expiresAt as Date;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(now + thirtyDaysMs - 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(now + thirtyDaysMs + 1000);
    });

    it('should respect custom expiry', async () => {
      const customExpiryMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const now = Date.now();

      await service.createToken({
        ...validInput,
        expiresInMs: customExpiryMs,
      });

      const createCall = mockRepo.mocks.create.mock.calls[0]?.[0];
      const expiresAt = createCall.expiresAt as Date;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
        now + customExpiryMs - 1000,
      );
      expect(expiresAt.getTime()).toBeLessThanOrEqual(now + customExpiryMs + 1000);
    });

    it('should pass tenantId to repository', async () => {
      await service.createToken(validInput);

      expect(mockRepo.mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: validInput.tenantId,
        }),
      );
    });

    it('should pass client metadata to repository', async () => {
      await service.createToken(validInput);

      expect(mockRepo.mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: validInput.userAgent,
          ipAddress: validInput.ipAddress,
        }),
      );
    });

    it('should propagate repository errors', async () => {
      const error = { code: 'DB_ERROR', message: 'Database error' };
      mockRepo.mocks.create.mockResolvedValue(fail(error));

      const result = await service.createToken(validInput);

      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Token Validation Tests
  // -------------------------------------------------------------------------

  describe('validateToken', () => {
    const plaintextToken = 'test-plaintext-token';

    beforeEach(() => {
      // Default: return active token
      mockRepo.mocks.findByHash.mockImplementation(async (hash: string) => {
        return ok(
          createMockToken({
            tokenHash: hash,
          }),
        );
      });
    });

    it('should validate active token successfully', async () => {
      const result = await service.validateToken(plaintextToken);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.status).toBe('active');
      expect(result.data.token).toBeDefined();
    });

    it('should hash token before lookup', async () => {
      await service.validateToken(plaintextToken);

      const expectedHash = service.hashToken(plaintextToken);
      expect(mockRepo.mocks.findByHash).toHaveBeenCalledWith(expectedHash);
    });

    it('should return AUTH_REFRESH_TOKEN_INVALID for unknown token', async () => {
      mockRepo.mocks.findByHash.mockResolvedValue(ok(null));

      const result = await service.validateToken(plaintextToken);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_REFRESH_TOKEN_INVALID');
    });

    it('should return AUTH_REFRESH_TOKEN_EXPIRED for expired token', async () => {
      mockRepo.mocks.findByHash.mockResolvedValue(
        ok(
          createMockToken({
            expiresAt: new Date(Date.now() - 1000), // Expired
          }),
        ),
      );

      const result = await service.validateToken(plaintextToken);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_REFRESH_TOKEN_EXPIRED');
    });

    /**
     * AC 6: Reuse detection → family-wide revocation
     */
    it('should detect reuse of revoked token and revoke entire family', async () => {
      mockRepo.mocks.findByHash.mockResolvedValue(
        ok(
          createMockToken({
            revokedAt: new Date(), // Revoked token
            familyId: 'family-to-revoke',
          }),
        ),
      );
      mockRepo.mocks.revokeByFamily.mockResolvedValue(ok(3));

      const result = await service.validateToken(plaintextToken);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_TOKEN_REUSE_DETECTED');
      expect(mockRepo.mocks.revokeByFamily).toHaveBeenCalledWith(
        'family-to-revoke',
      );
    });

    /**
     * AC 6: Reuse detection for rotated tokens
     */
    it('should detect reuse of rotated token and revoke entire family', async () => {
      mockRepo.mocks.findByHash.mockResolvedValue(
        ok(
          createMockToken({
            revokedAt: new Date(),
            replacedBy: 'new-token-id', // Rotated token
            familyId: 'rotated-family',
          }),
        ),
      );
      mockRepo.mocks.revokeByFamily.mockResolvedValue(ok(5));

      const result = await service.validateToken(plaintextToken);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_TOKEN_REUSE_DETECTED');
      expect(mockRepo.mocks.revokeByFamily).toHaveBeenCalledWith(
        'rotated-family',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Token Rotation Tests
  // -------------------------------------------------------------------------

  describe('rotateToken', () => {
    const currentPlaintextToken = 'current-valid-token';
    const currentTokenHash = crypto
      .createHash('sha256')
      .update(currentPlaintextToken)
      .digest('hex');

    const activeToken = createMockToken({
      id: 'old-token-id',
      tokenHash: currentTokenHash,
      familyId: 'stable-family-id',
      generation: 3,
    });

    const rotateInput: RotateTokenInput = {
      currentToken: currentPlaintextToken,
      userAgent: 'Mozilla/5.0 Updated',
      ipAddress: '192.168.1.2',
    };

    beforeEach(() => {
      // Setup: current token is active
      mockRepo.mocks.findByHash.mockResolvedValue(ok(activeToken));
      // Setup: create new token
      mockRepo.mocks.create.mockImplementation(async input => {
        return ok(
          createMockToken({
            id: 'new-token-id',
            tokenHash: input.tokenHash,
            familyId: input.familyId,
            generation: input.generation,
          }),
        );
      });
      // Setup: revoke succeeds
      mockRepo.mocks.revokeById.mockResolvedValue(ok(undefined));
      // Setup: findById for updated old token
      mockRepo.mocks.findById.mockResolvedValue(
        ok(
          createMockToken({
            ...activeToken,
            revokedAt: new Date(),
            replacedBy: 'new-token-id',
          }),
        ),
      );
    });

    /**
     * AC 3: familyId remains stable across rotations
     */
    it('should preserve familyId during rotation', async () => {
      const result = await service.rotateToken(rotateInput);

      expect(result.success).toBe(true);
      expect(mockRepo.mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          familyId: 'stable-family-id', // Same as original
        }),
      );
    });

    /**
     * AC 4: Generation increments monotonically
     */
    it('should increment generation by 1', async () => {
      const result = await service.rotateToken(rotateInput);

      expect(result.success).toBe(true);
      expect(mockRepo.mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          generation: 4, // Was 3, now 4
        }),
      );
    });

    /**
     * AC 5: Old token marked as revoked with replacedBy
     */
    it('should mark old token as revoked with replacedBy', async () => {
      await service.rotateToken(rotateInput);

      expect(mockRepo.mocks.revokeById).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenId: 'old-token-id',
          replacedBy: 'new-token-id',
        }),
      );
    });

    it('should return new plaintext token', async () => {
      const result = await service.rotateToken(rotateInput);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.newToken).toBeDefined();
      expect(result.data.newToken.length).toBeGreaterThan(40);
    });

    it('should return new and revoked token records', async () => {
      const result = await service.rotateToken(rotateInput);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.tokenRecord.id).toBe('new-token-id');
      expect(result.data.revokedToken.id).toBe('old-token-id');
    });

    it('should use new client metadata for new token', async () => {
      await service.rotateToken(rotateInput);

      expect(mockRepo.mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: 'Mozilla/5.0 Updated',
          ipAddress: '192.168.1.2',
        }),
      );
    });

    it('should preserve tenantId during rotation', async () => {
      await service.rotateToken(rotateInput);

      expect(mockRepo.mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: activeToken.tenantId,
        }),
      );
    });

    it('should fail rotation if current token is invalid', async () => {
      mockRepo.mocks.findByHash.mockResolvedValue(ok(null));

      const result = await service.rotateToken(rotateInput);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_REFRESH_TOKEN_INVALID');
    });

    it('should fail rotation if current token is expired', async () => {
      mockRepo.mocks.findByHash.mockResolvedValue(
        ok(
          createMockToken({
            expiresAt: new Date(Date.now() - 1000),
          }),
        ),
      );

      const result = await service.rotateToken(rotateInput);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_REFRESH_TOKEN_EXPIRED');
    });

    /**
     * AC 6: Reuse during rotation triggers family revocation
     */
    it('should trigger family revocation if rotated token is reused', async () => {
      mockRepo.mocks.findByHash.mockResolvedValue(
        ok(
          createMockToken({
            revokedAt: new Date(),
            replacedBy: 'some-other-id',
            familyId: 'compromised-family',
          }),
        ),
      );
      mockRepo.mocks.revokeByFamily.mockResolvedValue(ok(5));

      const result = await service.rotateToken(rotateInput);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_TOKEN_REUSE_DETECTED');
      expect(mockRepo.mocks.revokeByFamily).toHaveBeenCalledWith(
        'compromised-family',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Token Revocation Tests
  // -------------------------------------------------------------------------

  describe('revokeToken', () => {
    const plaintextToken = 'token-to-revoke';

    it('should revoke active token', async () => {
      mockRepo.mocks.findByHash.mockResolvedValue(
        ok(
          createMockToken({
            id: 'active-token-id',
            revokedAt: null,
          }),
        ),
      );
      mockRepo.mocks.revokeById.mockResolvedValue(ok(undefined));

      const result = await service.revokeToken(plaintextToken);

      expect(result.success).toBe(true);
      expect(mockRepo.mocks.revokeById).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenId: 'active-token-id',
        }),
      );
    });

    /**
     * Idempotent revocation
     */
    it('should return success for already revoked token (idempotent)', async () => {
      mockRepo.mocks.findByHash.mockResolvedValue(
        ok(
          createMockToken({
            revokedAt: new Date(), // Already revoked
          }),
        ),
      );

      const result = await service.revokeToken(plaintextToken);

      expect(result.success).toBe(true);
      expect(mockRepo.mocks.revokeById).not.toHaveBeenCalled();
    });

    /**
     * Idempotent revocation for non-existent token
     */
    it('should return success for non-existent token (idempotent)', async () => {
      mockRepo.mocks.findByHash.mockResolvedValue(ok(null));

      const result = await service.revokeToken(plaintextToken);

      expect(result.success).toBe(true);
      expect(mockRepo.mocks.revokeById).not.toHaveBeenCalled();
    });
  });

  describe('revokeFamily', () => {
    /**
     * AC 6: Family-wide revocation
     */
    it('should revoke all tokens in family', async () => {
      mockRepo.mocks.revokeByFamily.mockResolvedValue(ok(5));

      const result = await service.revokeFamily('family-123');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toBe(5);
      expect(mockRepo.mocks.revokeByFamily).toHaveBeenCalledWith('family-123');
    });
  });

  describe('revokeAllForUser', () => {
    it('should revoke all tokens for user', async () => {
      mockRepo.mocks.revokeByUserId.mockResolvedValue(ok(10));

      const result = await service.revokeAllForUser('user-123');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toBe(10);
      expect(mockRepo.mocks.revokeByUserId).toHaveBeenCalledWith('user-123');
    });
  });

  describe('revokeForUserAndTenant', () => {
    it('should revoke all tokens for user in tenant', async () => {
      mockRepo.mocks.revokeByUserAndTenant.mockResolvedValue(ok(3));

      const result = await service.revokeForUserAndTenant(
        'user-123',
        'tenant-456',
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toBe(3);
      expect(mockRepo.mocks.revokeByUserAndTenant).toHaveBeenCalledWith(
        'user-123',
        'tenant-456',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Audit Logging Tests
  // -------------------------------------------------------------------------

  describe('audit logging', () => {
    it('should call audit logger on token creation', async () => {
      const auditLogger = vi.fn();
      const serviceWithAudit = RefreshTokenServiceImpl({
        refreshTokenRepository: mockRepo.repository,
        config: { auditLogger },
      });

      mockRepo.mocks.create.mockResolvedValue(ok(createMockToken()));

      await serviceWithAudit.createToken({
        userId: 'user-123',
        ipAddress: '192.168.1.1',
      });

      expect(auditLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          operation: 'create',
          ipAddress: '192.168.1.1',
        }),
      );
    });

    it('should not throw if audit logger fails', async () => {
      const auditLogger = vi.fn().mockRejectedValue(new Error('Audit failed'));
      const serviceWithAudit = RefreshTokenServiceImpl({
        refreshTokenRepository: mockRepo.repository,
        config: { auditLogger },
      });

      mockRepo.mocks.create.mockResolvedValue(ok(createMockToken()));

      // Should not throw
      const result = await serviceWithAudit.createToken({
        userId: 'user-123',
      });

      expect(result.success).toBe(true);
    });
  });
});
