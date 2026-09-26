/**
 * JWT Service Tests — Multi-tenant access token generation and validation.
 *
 * Tests cover:
 * - Token creation with correct claims (no role/permissions)
 * - 15-minute expiry per Design Decision D1
 * - Token validation and signature verification
 * - Token version validation per Requirements 15.4
 * - Error handling for expired/invalid tokens
 *
 * @see Requirements 44 (AC 1-6)
 * @see Design JWT Structure section
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  JWTServiceImpl,
  type IJWTService,
  type CreateAccessTokenInput,
  ACCESS_TOKEN_EXPIRY_SECONDS,
} from '../jwtService';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'test-jwt-secret-for-unit-tests-at-least-32-chars';

describe('JWTService', () => {
  let jwtService: IJWTService;

  beforeEach(() => {
    // Set test environment
    vi.stubEnv('JWT_SECRET', TEST_JWT_SECRET);
    jwtService = JWTServiceImpl();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // Token Creation Tests
  // -------------------------------------------------------------------------

  describe('createAccessToken', () => {
    const validInput: CreateAccessTokenInput = {
      userId: 'user-123',
      activeTenantId: 'tenant-456',
      activeOrgUnitId: 'orgunit-789',
      tokenVersion: 1,
    };

    it('should create a valid JWT token', () => {
      const result = jwtService.createAccessToken(validInput);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.token).toBeDefined();
      expect(typeof result.data.token).toBe('string');
      expect(result.data.token.split('.')).toHaveLength(3); // JWT format
    });

    it('should include correct claims in token', () => {
      const result = jwtService.createAccessToken(validInput);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Decode token to verify claims
      const decoded = jwt.decode(result.data.token) as Record<string, unknown>;

      expect(decoded.sub).toBe(validInput.userId);
      expect(decoded.activeTenantId).toBe(validInput.activeTenantId);
      expect(decoded.activeOrgUnitId).toBe(validInput.activeOrgUnitId);
      expect(decoded.tokenVersion).toBe(validInput.tokenVersion);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    /**
     * AC 2: Role and permissions NOT in JWT (INV-AUTH-001)
     */
    it('should NOT include role in JWT claims', () => {
      const result = jwtService.createAccessToken(validInput);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const decoded = jwt.decode(result.data.token) as Record<string, unknown>;

      expect(decoded.role).toBeUndefined();
      expect(decoded.roles).toBeUndefined();
    });

    /**
     * AC 2: Role and permissions NOT in JWT (INV-AUTH-001)
     */
    it('should NOT include permissions in JWT claims', () => {
      const result = jwtService.createAccessToken(validInput);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const decoded = jwt.decode(result.data.token) as Record<string, unknown>;

      expect(decoded.permissions).toBeUndefined();
      expect(decoded.permission).toBeUndefined();
    });

    /**
     * AC 3: Access token expiry = 15 minutes (Design Decision D1)
     */
    it('should set 15-minute expiry on token', () => {
      const result = jwtService.createAccessToken(validInput);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const decoded = jwt.decode(result.data.token) as Record<string, unknown>;
      const iat = decoded.iat as number;
      const exp = decoded.exp as number;

      // Verify expiry is 15 minutes from issued time
      expect(exp - iat).toBe(ACCESS_TOKEN_EXPIRY_SECONDS);
      expect(exp - iat).toBe(15 * 60);
    });

    it('should return correct expiresAt timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      const result = jwtService.createAccessToken(validInput);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // expiresAt should be approximately 15 minutes from now
      const expectedExpiry = now + ACCESS_TOKEN_EXPIRY_SECONDS;
      expect(result.data.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 2);
      expect(result.data.expiresAt).toBeLessThanOrEqual(expectedExpiry + 2);
    });

    it('should handle null activeOrgUnitId for tenant-level admins', () => {
      const tenantAdminInput: CreateAccessTokenInput = {
        userId: 'admin-user',
        activeTenantId: 'tenant-456',
        activeOrgUnitId: null,
        tokenVersion: 0,
      };

      const result = jwtService.createAccessToken(tenantAdminInput);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const decoded = jwt.decode(result.data.token) as Record<string, unknown>;
      expect(decoded.activeOrgUnitId).toBeNull();
    });

    it('should use HS256 algorithm (Design Decision D3)', () => {
      const result = jwtService.createAccessToken(validInput);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Verify by checking header
      const parts = result.data.token.split('.');
      expect(parts[0]).toBeDefined();
      const header = JSON.parse(
        Buffer.from(parts[0]!, 'base64url').toString('utf8'),
      );
      expect(header.alg).toBe('HS256');
    });
  });

  // -------------------------------------------------------------------------
  // Token Validation Tests
  // -------------------------------------------------------------------------

  describe('validateAccessToken', () => {
    const validInput: CreateAccessTokenInput = {
      userId: 'user-123',
      activeTenantId: 'tenant-456',
      activeOrgUnitId: 'orgunit-789',
      tokenVersion: 1,
    };

    it('should validate a valid token successfully', () => {
      const createResult = jwtService.createAccessToken(validInput);
      expect(createResult.success).toBe(true);
      if (!createResult.success) return;

      const validateResult = jwtService.validateAccessToken({
        token: createResult.data.token,
      });

      expect(validateResult.success).toBe(true);
      if (!validateResult.success) return;

      expect(validateResult.data.claims.sub).toBe(validInput.userId);
      expect(validateResult.data.claims.activeTenantId).toBe(
        validInput.activeTenantId,
      );
      expect(validateResult.data.claims.activeOrgUnitId).toBe(
        validInput.activeOrgUnitId,
      );
      expect(validateResult.data.claims.tokenVersion).toBe(
        validInput.tokenVersion,
      );
    });

    it('should return AUTH_TOKEN_INVALID for malformed token', () => {
      const result = jwtService.validateAccessToken({
        token: 'not-a-valid-jwt',
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_TOKEN_INVALID');
    });

    it('should return AUTH_TOKEN_INVALID for tampered token', () => {
      const createResult = jwtService.createAccessToken(validInput);
      expect(createResult.success).toBe(true);
      if (!createResult.success) return;

      // Tamper with the token
      const tamperedToken = createResult.data.token.slice(0, -5) + 'xxxxx';

      const result = jwtService.validateAccessToken({
        token: tamperedToken,
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_TOKEN_INVALID');
    });

    it('should return AUTH_TOKEN_INVALID for wrong secret', () => {
      // Create token with different secret
      const tokenWithDifferentSecret = jwt.sign(
        {
          sub: validInput.userId,
          activeTenantId: validInput.activeTenantId,
          activeOrgUnitId: validInput.activeOrgUnitId,
          tokenVersion: validInput.tokenVersion,
        },
        'different-secret-at-least-32-characters-long',
        { expiresIn: '15m' },
      );

      const result = jwtService.validateAccessToken({
        token: tokenWithDifferentSecret,
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_TOKEN_INVALID');
    });

    it('should return AUTH_TOKEN_EXPIRED for expired token', () => {
      // Create an already-expired token
      const expiredToken = jwt.sign(
        {
          sub: validInput.userId,
          activeTenantId: validInput.activeTenantId,
          activeOrgUnitId: validInput.activeOrgUnitId,
          tokenVersion: validInput.tokenVersion,
        },
        TEST_JWT_SECRET,
        { expiresIn: '-1s' }, // Already expired
      );

      const result = jwtService.validateAccessToken({
        token: expiredToken,
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_TOKEN_EXPIRED');
    });

    /**
     * Token version validation per Requirements 15.4
     * JWT tokenVersion MUST exactly equal User.tokenVersion
     */
    it('should return AUTH_TOKEN_VERSION_MISMATCH when version does not match', () => {
      const createResult = jwtService.createAccessToken({
        ...validInput,
        tokenVersion: 1,
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) return;

      const result = jwtService.validateAccessToken({
        token: createResult.data.token,
        expectedTokenVersion: 2, // Different from token's version (1)
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_TOKEN_VERSION_MISMATCH');
    });

    it('should pass when token version matches expected', () => {
      const createResult = jwtService.createAccessToken({
        ...validInput,
        tokenVersion: 5,
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) return;

      const result = jwtService.validateAccessToken({
        token: createResult.data.token,
        expectedTokenVersion: 5, // Matches token's version
      });

      expect(result.success).toBe(true);
    });

    it('should skip version check when expectedTokenVersion is undefined', () => {
      const createResult = jwtService.createAccessToken({
        ...validInput,
        tokenVersion: 1,
      });
      expect(createResult.success).toBe(true);
      if (!createResult.success) return;

      const result = jwtService.validateAccessToken({
        token: createResult.data.token,
        // No expectedTokenVersion provided
      });

      expect(result.success).toBe(true);
    });

    it('should return AUTH_TOKEN_INVALID for missing required claims', () => {
      // Create token missing activeTenantId
      const incompleteToken = jwt.sign(
        {
          sub: 'user-123',
          // Missing activeTenantId
          activeOrgUnitId: 'orgunit-789',
          tokenVersion: 1,
        },
        TEST_JWT_SECRET,
        { expiresIn: '15m' },
      );

      const result = jwtService.validateAccessToken({
        token: incompleteToken,
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('AUTH_TOKEN_INVALID');
    });
  });

  // -------------------------------------------------------------------------
  // Token Decode Tests
  // -------------------------------------------------------------------------

  describe('decodeAccessToken', () => {
    const validInput: CreateAccessTokenInput = {
      userId: 'user-123',
      activeTenantId: 'tenant-456',
      activeOrgUnitId: 'orgunit-789',
      tokenVersion: 1,
    };

    it('should decode a valid token without verification', () => {
      const createResult = jwtService.createAccessToken(validInput);
      expect(createResult.success).toBe(true);
      if (!createResult.success) return;

      const claims = jwtService.decodeAccessToken(createResult.data.token);

      expect(claims).not.toBeNull();
      expect(claims?.sub).toBe(validInput.userId);
      expect(claims?.activeTenantId).toBe(validInput.activeTenantId);
    });

    it('should return null for malformed token', () => {
      const claims = jwtService.decodeAccessToken('not-a-valid-jwt');
      expect(claims).toBeNull();
    });

    it('should decode expired token (no verification)', () => {
      const expiredToken = jwt.sign(
        {
          sub: validInput.userId,
          activeTenantId: validInput.activeTenantId,
          activeOrgUnitId: validInput.activeOrgUnitId,
          tokenVersion: validInput.tokenVersion,
        },
        TEST_JWT_SECRET,
        { expiresIn: '-1s' },
      );

      // decodeAccessToken should still work for expired tokens
      const claims = jwtService.decodeAccessToken(expiredToken);

      expect(claims).not.toBeNull();
      expect(claims?.sub).toBe(validInput.userId);
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling Tests
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('should fail when JWT_SECRET is not set', () => {
      vi.stubEnv('JWT_SECRET', '');

      const freshService = JWTServiceImpl();
      const result = freshService.createAccessToken({
        userId: 'user-123',
        activeTenantId: 'tenant-456',
        activeOrgUnitId: 'orgunit-789',
        tokenVersion: 1,
      });

      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Integration/Consistency Tests
  // -------------------------------------------------------------------------

  describe('create and validate consistency', () => {
    it('should round-trip token creation and validation', () => {
      const input: CreateAccessTokenInput = {
        userId: 'roundtrip-user',
        activeTenantId: 'roundtrip-tenant',
        activeOrgUnitId: 'roundtrip-orgunit',
        tokenVersion: 42,
      };

      // Create token
      const createResult = jwtService.createAccessToken(input);
      expect(createResult.success).toBe(true);
      if (!createResult.success) return;

      // Validate token
      const validateResult = jwtService.validateAccessToken({
        token: createResult.data.token,
        expectedTokenVersion: 42,
      });
      expect(validateResult.success).toBe(true);
      if (!validateResult.success) return;

      // Verify claims match input
      expect(validateResult.data.claims.sub).toBe(input.userId);
      expect(validateResult.data.claims.activeTenantId).toBe(
        input.activeTenantId,
      );
      expect(validateResult.data.claims.activeOrgUnitId).toBe(
        input.activeOrgUnitId,
      );
      expect(validateResult.data.claims.tokenVersion).toBe(input.tokenVersion);
    });

    it('should create tokens with unique iat timestamps', async () => {
      const input: CreateAccessTokenInput = {
        userId: 'user-123',
        activeTenantId: 'tenant-456',
        activeOrgUnitId: null,
        tokenVersion: 0,
      };

      const result1 = jwtService.createAccessToken(input);

      // Wait a bit for different timestamp
      await new Promise(resolve => setTimeout(resolve, 1100));

      const result2 = jwtService.createAccessToken(input);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      if (!result1.success || !result2.success) return;

      const decoded1 = jwt.decode(result1.data.token) as Record<string, number>;
      const decoded2 = jwt.decode(result2.data.token) as Record<string, number>;

      // Timestamps should be different
      expect(decoded2.iat).toBeDefined();
      expect(decoded1.iat).toBeDefined();
      expect(decoded2.iat!).toBeGreaterThan(decoded1.iat!);
    });
  });
});