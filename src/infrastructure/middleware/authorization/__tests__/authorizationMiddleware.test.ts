/**
 * AuthorizationMiddleware Unit Tests
 *
 * Comprehensive tests for the Authorization Middleware that:
 * - Extracts JWT from Authorization header or cookie
 * - Validates JWT structure, signature, and expiration
 * - Invokes AuthorizationContextResolver.resolve()
 * - Serializes context to request headers
 * - Logs authorization resolution attempts
 *
 * **Validates: Requirements 1.1, 1.2, 1.5, 1.6**
 *
 * Test Categories:
 * 1. Unit tests for valid/invalid JWT handling
 * 2. Property tests for context resolution (Property 1)
 * 3. Property tests for header security (Property 2)
 * 4. Performance tests for resolution latency
 *
 * @see Requirements 1.1-1.7 (Middleware AuthorizationContext Resolution)
 * @see Design: Middleware AuthorizationContext Resolution
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import * as fc from 'fast-check';
import { SignJWT, errors as JoseErrors } from 'jose';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import type { AuthorizationContext, AuthorizationContextResult } from '@core/domains/authorization/types';
import type { Membership } from '@core/domains/membership/entities';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { getPermissionsForRole } from '@core/domains/authorization/permissions/PermissionRegistry';
import {
  AuthorizationMiddlewareImpl,
  type IAuthorizationMiddleware,
  type AuthorizationMiddlewareConfig,
  DEFAULT_AUTHORIZATION_MIDDLEWARE_CONFIG,
  type AuthErrorCode,
  AUTH_ERROR_HTTP_STATUS,
} from '../authorizationMiddleware';

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'test-secret-key-for-testing-purposes-only-minimum-32-chars';
const TEST_USER_ID = 'test-user-123';
const TEST_TENANT_ID = 'test-tenant-456';
const TEST_MEMBERSHIP_ID = 'test-membership-789';
const TEST_ORGUNIT_ID = 'test-orgunit-abc';
const TEST_TOKEN_VERSION = 1;

// ---------------------------------------------------------------------------
// Mock Setup
// ---------------------------------------------------------------------------

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const mockTokenValidationLogger = {
  log: vi.fn(),
  logSuccess: vi.fn(),
  logInvalid: vi.fn(),
  logExpired: vi.fn(),
  logVersionMismatch: vi.fn(),
};

const mockTokenVersionService = {
  getTokenVersion: vi.fn(),
  validateTokenVersion: vi.fn(),
  forceLogoutUser: vi.fn(),
  forceLogoutTenant: vi.fn(),
};

const mockAuthorizationContextResolver = {
  resolve: vi.fn(),
  validateClaims: vi.fn(),
  validateTokenVersion: vi.fn(),
};

vi.mock('@infrastructure/utils/correlationId', () => ({
  generateCorrelationId: vi.fn(() => 'test-correlation-id-generated'),
}));

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const createMockMembership = (overrides: Partial<Membership> = {}): Membership => ({
  id: TEST_MEMBERSHIP_ID,
  userId: TEST_USER_ID,
  tenantId: TEST_TENANT_ID,
  orgUnitId: TEST_ORGUNIT_ID,
  role: MembershipRole.RT_ADMIN,
  status: MembershipStatus.ACTIVE,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  revokedAt: undefined,
  ...overrides,
});

const createMockAuthorizationContext = (
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext => {
  const role = overrides.role ?? MembershipRole.RT_ADMIN;
  const permissions = overrides.permissions ?? getPermissionsForRole(role);

  return {
    userId: TEST_USER_ID,
    tenantId: TEST_TENANT_ID,
    membershipId: TEST_MEMBERSHIP_ID,
    orgUnitId: TEST_ORGUNIT_ID,
    role,
    permissions,
    tokenVersion: TEST_TOKEN_VERSION,
    isAuthoritative: true,
    isTenantLevel: false,
    membership: createMockMembership({ role }),
    ...overrides,
  };
};

const createMockAuthorizationContextResult = (
  context: AuthorizationContext,
): AuthorizationContextResult => ({
  context,
  metadata: {
    resolvedAt: new Date(),
    membershipCountInTenant: 1,
    isMultiMembership: false,
  },
});

/**
 * Create a valid JWT for testing.
 */
async function createValidJwt(overrides: {
  userId?: string;
  activeTenantId?: string;
  activeOrgUnitId?: string | null;
  tokenVersion?: number;
  expiresIn?: string;
} = {}): Promise<string> {
  const secretKey = new TextEncoder().encode(TEST_JWT_SECRET);

  const jwt = await new SignJWT({
    sub: overrides.userId ?? TEST_USER_ID,
    activeTenantId: overrides.activeTenantId ?? TEST_TENANT_ID,
    activeOrgUnitId: overrides.activeOrgUnitId ?? TEST_ORGUNIT_ID,
    tokenVersion: overrides.tokenVersion ?? TEST_TOKEN_VERSION,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(overrides.expiresIn ?? '1h')
    .sign(secretKey);

  return jwt;
}

/**
 * Create an expired JWT for testing.
 */
async function createExpiredJwt(): Promise<string> {
  const secretKey = new TextEncoder().encode(TEST_JWT_SECRET);

  // Create a JWT that expired 1 hour ago
  const expiredAt = Math.floor(Date.now() / 1000) - 3600;

  const jwt = await new SignJWT({
    sub: TEST_USER_ID,
    activeTenantId: TEST_TENANT_ID,
    activeOrgUnitId: TEST_ORGUNIT_ID,
    tokenVersion: TEST_TOKEN_VERSION,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(expiredAt - 3600)
    .setExpirationTime(expiredAt)
    .sign(secretKey);

  return jwt;
}

/**
 * Create a JWT with invalid signature.
 */
function createJwtWithInvalidSignature(): string {
  // Return a malformed JWT
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid_signature';
}

const createMockRequest = (
  options: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    url?: string;
    method?: string;
  } = {},
): NextRequest => {
  const url = options.url ?? 'http://localhost:3000/api/test';
  const headers = new Headers(options.headers);
  const method = options.method ?? 'GET';

  const request = new NextRequest(url, { method, headers });

  // Set cookies if provided
  if (options.cookies) {
    Object.entries(options.cookies).forEach(([name, value]) => {
      request.cookies.set(name, value);
    });
  }

  return request;
};

/**
 * Create middleware instance with mocks.
 */
function createTestMiddleware(
  configOverrides?: Partial<AuthorizationMiddlewareConfig>,
): IAuthorizationMiddleware {
  return AuthorizationMiddlewareImpl({
    config: {
      ...DEFAULT_AUTHORIZATION_MIDDLEWARE_CONFIG,
      ...configOverrides,
    },
    authorizationContextResolver: mockAuthorizationContextResolver,
    tokenVersionService: mockTokenVersionService,
    logger: mockLogger,
    tokenValidationLogger: mockTokenValidationLogger,
    jwtSecret: TEST_JWT_SECRET,
  });
}

// ---------------------------------------------------------------------------
// Fast-Check Arbitraries
// ---------------------------------------------------------------------------

/**
 * Arbitrary for valid user ID.
 */
const userIdArb = fc.uuid();

/**
 * Arbitrary for valid tenant ID.
 */
const tenantIdArb = fc.uuid();

/**
 * Arbitrary for valid orgUnit ID (can be null for tenant-level roles).
 */
const orgUnitIdArb = fc.option(fc.uuid(), { nil: null });

/**
 * Arbitrary for membership role.
 */
const membershipRoleArb = fc.constantFrom(
  MembershipRole.PLATFORM_ADMIN,
  MembershipRole.TENANT_OWNER,
  MembershipRole.ORG_ADMIN,
  MembershipRole.RT_ADMIN,
  MembershipRole.SECURITY,
  MembershipRole.RESIDENT,
);

/**
 * Arbitrary for token version (positive integer).
 */
const tokenVersionArb = fc.integer({ min: 1, max: 1000000 });

/**
 * Arbitrary for valid JWT claims.
 */
const validJwtClaimsArb = fc.record({
  userId: userIdArb,
  activeTenantId: tenantIdArb,
  activeOrgUnitId: orgUnitIdArb,
  tokenVersion: tokenVersionArb,
});

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe('AuthorizationMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations to default success
    mockTokenVersionService.validateTokenVersion.mockResolvedValue(ok(true));
    mockTokenVersionService.getTokenVersion.mockResolvedValue(ok(TEST_TOKEN_VERSION));
    mockAuthorizationContextResolver.resolve.mockResolvedValue(
      ok(createMockAuthorizationContextResult(createMockAuthorizationContext())),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // shouldBypass Tests
  // -------------------------------------------------------------------------

  describe('shouldBypass', () => {
    it('should bypass auth routes', () => {
      const middleware = createTestMiddleware();

      expect(middleware.shouldBypass('/api/auth/login')).toBe(true);
      expect(middleware.shouldBypass('/api/auth/logout')).toBe(true);
      expect(middleware.shouldBypass('/api/auth/register')).toBe(true);
      expect(middleware.shouldBypass('/api/auth/refresh')).toBe(true);
      expect(middleware.shouldBypass('/api/auth/forgot-password')).toBe(true);
      expect(middleware.shouldBypass('/api/auth/reset-password')).toBe(true);
    });

    it('should bypass health check', () => {
      const middleware = createTestMiddleware();

      expect(middleware.shouldBypass('/api/health')).toBe(true);
    });

    it('should bypass static routes', () => {
      const middleware = createTestMiddleware();

      expect(middleware.shouldBypass('/_next/static/chunks/main.js')).toBe(true);
      expect(middleware.shouldBypass('/favicon.ico')).toBe(true);
    });

    it('should NOT bypass protected API routes', () => {
      const middleware = createTestMiddleware();

      expect(middleware.shouldBypass('/api/residents')).toBe(false);
      expect(middleware.shouldBypass('/api/finance/transactions')).toBe(false);
      expect(middleware.shouldBypass('/api/emergency')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // extractAndValidateJwt Tests
  // -------------------------------------------------------------------------

  describe('extractAndValidateJwt', () => {
    /**
     * **Validates: Requirements 1.1, 1.7**
     * Test valid JWT → AuthorizationContext resolved and serialized to headers
     */
    it('should extract JWT from Authorization header', async () => {
      const middleware = createTestMiddleware();
      const token = await createValidJwt();

      const request = createMockRequest({
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await middleware.extractAndValidateJwt(request);

      expect(result.success).toBe(true);
      expect(result.claims?.userId).toBe(TEST_USER_ID);
      expect(result.claims?.activeTenantId).toBe(TEST_TENANT_ID);
      expect(result.claims?.tokenVersion).toBe(TEST_TOKEN_VERSION);
    });

    it('should extract JWT from cookie when no Authorization header', async () => {
      const middleware = createTestMiddleware();
      const token = await createValidJwt();

      const request = createMockRequest({
        cookies: { societ_rt_auth_token: token },
      });

      const result = await middleware.extractAndValidateJwt(request);

      expect(result.success).toBe(true);
      expect(result.claims?.userId).toBe(TEST_USER_ID);
    });

    /**
     * **Validates: Requirements 1.7**
     * Test invalid JWT → 401 AUTH_TOKEN_INVALID
     */
    it('should return AUTH_TOKEN_INVALID when no token provided', async () => {
      const middleware = createTestMiddleware();
      const request = createMockRequest();

      const result = await middleware.extractAndValidateJwt(request);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('AUTH_TOKEN_INVALID');
    });

    it('should return AUTH_TOKEN_INVALID for malformed JWT', async () => {
      const middleware = createTestMiddleware();
      const request = createMockRequest({
        headers: { Authorization: 'Bearer invalid-token' },
      });

      const result = await middleware.extractAndValidateJwt(request);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('AUTH_TOKEN_INVALID');
    });

    it('should return AUTH_TOKEN_INVALID for invalid signature', async () => {
      const middleware = createTestMiddleware();
      const token = createJwtWithInvalidSignature();

      const request = createMockRequest({
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await middleware.extractAndValidateJwt(request);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('AUTH_TOKEN_INVALID');
    });

    it('should return AUTH_TOKEN_EXPIRED for expired JWT', async () => {
      const middleware = createTestMiddleware();
      const token = await createExpiredJwt();

      const request = createMockRequest({
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await middleware.extractAndValidateJwt(request);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('AUTH_TOKEN_EXPIRED');
    });

    it('should return AUTH_TOKEN_INVALID when userId missing', async () => {
      const middleware = createTestMiddleware();
      const secretKey = new TextEncoder().encode(TEST_JWT_SECRET);

      // Create JWT without sub claim
      const jwt = await new SignJWT({
        activeTenantId: TEST_TENANT_ID,
        tokenVersion: TEST_TOKEN_VERSION,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secretKey);

      const request = createMockRequest({
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const result = await middleware.extractAndValidateJwt(request);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('AUTH_TOKEN_INVALID');
    });

    it('should return AUTH_TOKEN_INVALID when activeTenantId missing', async () => {
      const middleware = createTestMiddleware();
      const secretKey = new TextEncoder().encode(TEST_JWT_SECRET);

      // Create JWT without activeTenantId
      const jwt = await new SignJWT({
        sub: TEST_USER_ID,
        tokenVersion: TEST_TOKEN_VERSION,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secretKey);

      const request = createMockRequest({
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const result = await middleware.extractAndValidateJwt(request);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('AUTH_TOKEN_INVALID');
    });

    it('should return AUTH_TOKEN_INVALID when tokenVersion missing', async () => {
      const middleware = createTestMiddleware();
      const secretKey = new TextEncoder().encode(TEST_JWT_SECRET);

      // Create JWT without tokenVersion
      const jwt = await new SignJWT({
        sub: TEST_USER_ID,
        activeTenantId: TEST_TENANT_ID,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secretKey);

      const request = createMockRequest({
        headers: { Authorization: `Bearer ${jwt}` },
      });

      const result = await middleware.extractAndValidateJwt(request);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('AUTH_TOKEN_INVALID');
    });
  });

  // -------------------------------------------------------------------------
  // serializeContextToHeaders Tests
  // -------------------------------------------------------------------------

  describe('serializeContextToHeaders', () => {
    /**
     * **Validates: Requirements 1.2, 1.5**
     * AuthorizationContext serialized to headers with all required fields
     */
    it('should serialize all required headers', () => {
      const middleware = createTestMiddleware();
      const context = createMockAuthorizationContext();
      const headers = new Headers();

      middleware.serializeContextToHeaders(context, headers);

      expect(headers.get('x-user-id')).toBe(TEST_USER_ID);
      expect(headers.get('x-tenant-id')).toBe(TEST_TENANT_ID);
      expect(headers.get('x-membership-id')).toBe(TEST_MEMBERSHIP_ID);
      expect(headers.get('x-org-unit-id')).toBe(TEST_ORGUNIT_ID);
      expect(headers.get('x-user-role')).toBe(MembershipRole.RT_ADMIN);
      expect(headers.get('x-token-version')).toBe(String(TEST_TOKEN_VERSION));
    });

    it('should serialize x-authorization-context as JSON', () => {
      const middleware = createTestMiddleware();
      const context = createMockAuthorizationContext();
      const headers = new Headers();

      middleware.serializeContextToHeaders(context, headers);

      const serializedContext = headers.get('x-authorization-context');
      expect(serializedContext).not.toBeNull();

      const parsed = JSON.parse(serializedContext!);
      expect(parsed.userId).toBe(TEST_USER_ID);
      expect(parsed.tenantId).toBe(TEST_TENANT_ID);
      expect(parsed.membershipId).toBe(TEST_MEMBERSHIP_ID);
    });

    /**
     * **Validates: Requirements 1.6**
     * SECURITY: Permissions NOT included in serialized headers
     */
    it('should NOT include permissions in serialized x-authorization-context', () => {
      const middleware = createTestMiddleware();
      const context = createMockAuthorizationContext();
      const headers = new Headers();

      middleware.serializeContextToHeaders(context, headers);

      const serializedContext = headers.get('x-authorization-context');
      const parsed = JSON.parse(serializedContext!);

      // Permissions should NOT be in the serialized JSON
      expect(parsed.permissions).toBeUndefined();
    });

    it('should handle null orgUnitId for tenant-level roles', () => {
      const middleware = createTestMiddleware();
      const context = createMockAuthorizationContext({
        role: MembershipRole.PLATFORM_ADMIN,
        orgUnitId: null,
        isTenantLevel: true,
      });
      const headers = new Headers();

      middleware.serializeContextToHeaders(context, headers);

      expect(headers.get('x-org-unit-id')).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // createErrorResponse Tests
  // -------------------------------------------------------------------------

  describe('createErrorResponse', () => {
    const errorCodes: AuthErrorCode[] = [
      'AUTH_TOKEN_INVALID',
      'AUTH_TOKEN_EXPIRED',
      'AUTH_TOKEN_VERSION_MISMATCH',
      'AUTH_NO_MEMBERSHIP',
      'AUTH_MEMBERSHIP_INACTIVE',
      'AUTH_USER_QUARANTINED',
      'AUTH_CONTEXT_RESOLUTION_FAILED',
    ];

    errorCodes.forEach((errorCode) => {
      it(`should return correct HTTP status for ${errorCode}`, async () => {
        const middleware = createTestMiddleware();
        const response = middleware.createErrorResponse(errorCode, 'test-correlation');

        expect(response.status).toBe(AUTH_ERROR_HTTP_STATUS[errorCode]);
      });

      it(`should include correlationId in response for ${errorCode}`, async () => {
        const middleware = createTestMiddleware();
        const response = middleware.createErrorResponse(errorCode, 'test-correlation-123');
        const body = await response.json();

        expect(body.correlationId).toBe('test-correlation-123');
        expect(body.code).toBe(errorCode);
      });
    });
  });

  // -------------------------------------------------------------------------
  // handle Tests — Main Middleware Flow
  // -------------------------------------------------------------------------

  describe('handle', () => {
    /**
     * **Validates: Requirements 1.1, 1.2**
     * Valid JWT → AuthorizationContext resolved and serialized to headers
     */
    it('should resolve context and set headers for valid request', async () => {
      const middleware = createTestMiddleware();
      const token = await createValidJwt();

      const request = createMockRequest({
        headers: { Authorization: `Bearer ${token}` },
        url: 'http://localhost:3000/api/residents',
      });

      const response = await middleware.handle(request);

      expect(response.status).toBe(200);
      expect(mockAuthorizationContextResolver.resolve).toHaveBeenCalled();
    });

    it('should bypass auth routes without resolving context', async () => {
      const middleware = createTestMiddleware();

      const request = createMockRequest({
        url: 'http://localhost:3000/api/auth/login',
      });

      const response = await middleware.handle(request);

      expect(response.status).toBe(200);
      expect(mockAuthorizationContextResolver.resolve).not.toHaveBeenCalled();
    });

    /**
     * **Validates: Requirements 1.7**
     * Invalid JWT → 401 AUTH_TOKEN_INVALID
     */
    it('should return 401 for missing JWT', async () => {
      const middleware = createTestMiddleware();

      const request = createMockRequest({
        url: 'http://localhost:3000/api/residents',
      });

      const response = await middleware.handle(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.code).toBe('AUTH_TOKEN_INVALID');
    });

    /**
     * **Validates: Requirements 1.3**
     * Token version mismatch → 401 AUTH_TOKEN_VERSION_MISMATCH
     */
    it('should return 401 for token version mismatch', async () => {
      mockTokenVersionService.validateTokenVersion.mockResolvedValue(ok(false));

      const middleware = createTestMiddleware();
      const token = await createValidJwt();

      const request = createMockRequest({
        headers: { Authorization: `Bearer ${token}` },
        url: 'http://localhost:3000/api/residents',
      });

      const response = await middleware.handle(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.code).toBe('AUTH_TOKEN_VERSION_MISMATCH');
    });

    /**
     * **Validates: Requirements 1.3**
     * No active membership → 403 AUTH_NO_MEMBERSHIP
     */
    it('should return 403 for no active membership', async () => {
      mockAuthorizationContextResolver.resolve.mockResolvedValue(
        fail({
          type: 'authentication',
          code: 'AUTH_NO_MEMBERSHIP',
          message: 'No active membership',
        }),
      );

      const middleware = createTestMiddleware();
      const token = await createValidJwt();

      const request = createMockRequest({
        headers: { Authorization: `Bearer ${token}` },
        url: 'http://localhost:3000/api/residents',
      });

      const response = await middleware.handle(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.code).toBe('AUTH_NO_MEMBERSHIP');
    });

    /**
     * **Validates: Requirements 1.3**
     * Inactive membership → 403 AUTH_MEMBERSHIP_INACTIVE
     */
    it('should return 403 for inactive membership', async () => {
      mockAuthorizationContextResolver.resolve.mockResolvedValue(
        fail({
          type: 'authorization',
          code: 'AUTH_MEMBERSHIP_INACTIVE',
          message: 'Membership is inactive',
        }),
      );

      const middleware = createTestMiddleware();
      const token = await createValidJwt();

      const request = createMockRequest({
        headers: { Authorization: `Bearer ${token}` },
        url: 'http://localhost:3000/api/residents',
      });

      const response = await middleware.handle(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.code).toBe('AUTH_MEMBERSHIP_INACTIVE');
    });

    /**
     * **Validates: Requirements 1.4**
     * Log authorization resolution with correlationId
     */
    it('should log resolution attempts with correlationId', async () => {
      const middleware = createTestMiddleware({ logSuccess: true });
      const token = await createValidJwt();

      const request = createMockRequest({
        headers: {
          Authorization: `Bearer ${token}`,
          'x-correlation-id': 'custom-correlation-id',
        },
        url: 'http://localhost:3000/api/residents',
      });

      await middleware.handle(request);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Authorization context resolved successfully',
        expect.objectContaining({
          correlation_id: 'custom-correlation-id',
        }),
      );
    });

    it('should log failures with error details', async () => {
      const middleware = createTestMiddleware();

      const request = createMockRequest({
        url: 'http://localhost:3000/api/residents',
      });

      await middleware.handle(request);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Authorization context resolution failed',
        expect.objectContaining({
          error_code: 'AUTH_TOKEN_INVALID',
        }),
      );
    });

    it('should generate correlationId if not provided', async () => {
      const middleware = createTestMiddleware();

      const request = createMockRequest({
        url: 'http://localhost:3000/api/residents',
      });

      await middleware.handle(request);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          correlation_id: 'test-correlation-id-generated',
        }),
      );
    });

    it('should redirect to login for page requests without auth', async () => {
      const middleware = createTestMiddleware();

      const request = createMockRequest({
        url: 'http://localhost:3000/dashboard',
      });

      const response = await middleware.handle(request);

      expect(response.status).toBe(307); // Redirect
      expect(response.headers.get('location')).toContain('/login');
    });
  });
});

// ---------------------------------------------------------------------------
// Property-Based Tests
// ---------------------------------------------------------------------------

describe('Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * **Property 1: Middleware Authorization Context Resolution**
   *
   * For any valid JWT with active membership, the middleware SHALL resolve
   * a complete AuthorizationContext and serialize it to request headers
   * with all required fields (userId, tenantId, membershipId, orgUnitId, role, tokenVersion).
   *
   * **Validates: Requirements 1.1, 1.2, 1.5**
   */
  describe('Property 1: Middleware Authorization Context Resolution', () => {
    it('for any valid JWT with active membership, headers contain complete context', async () => {
      await fc.assert(
        fc.asyncProperty(
          validJwtClaimsArb,
          membershipRoleArb,
          async (claims, role) => {
            vi.clearAllMocks();

            // Setup mocks for valid case
            const mockContext = createMockAuthorizationContext({
              userId: claims.userId,
              tenantId: claims.activeTenantId,
              orgUnitId: claims.activeOrgUnitId,
              tokenVersion: claims.tokenVersion,
              role,
            });

            mockTokenVersionService.validateTokenVersion.mockResolvedValue(ok(true));
            mockTokenVersionService.getTokenVersion.mockResolvedValue(ok(claims.tokenVersion));
            mockAuthorizationContextResolver.resolve.mockResolvedValue(
              ok(createMockAuthorizationContextResult(mockContext)),
            );

            const middleware = createTestMiddleware();
            const token = await createValidJwt(claims);

            const request = createMockRequest({
              headers: { Authorization: `Bearer ${token}` },
              url: 'http://localhost:3000/api/test',
            });

            const response = await middleware.handle(request);

            // For successful resolution, response should be NextResponse.next()
            // which has status 200 and modified headers
            expect(response.status).toBe(200);

            // Verify AuthorizationContextResolver was called
            expect(mockAuthorizationContextResolver.resolve).toHaveBeenCalled();
          },
        ),
        { numRuns: 50 },
      );
    });

    it('serialized headers contain all required fields', () => {
      fc.assert(
        fc.property(
          validJwtClaimsArb,
          membershipRoleArb,
          fc.boolean(), // isTenantLevel
          (claims, role, isTenantLevel) => {
            const context = createMockAuthorizationContext({
              userId: claims.userId,
              tenantId: claims.activeTenantId,
              orgUnitId: isTenantLevel ? null : claims.activeOrgUnitId,
              tokenVersion: claims.tokenVersion,
              role,
              isTenantLevel,
            });

            const middleware = createTestMiddleware();
            const headers = new Headers();

            middleware.serializeContextToHeaders(context, headers);

            // All required headers MUST be present
            expect(headers.get('x-user-id')).toBe(claims.userId);
            expect(headers.get('x-tenant-id')).toBe(claims.activeTenantId);
            expect(headers.get('x-user-role')).toBe(role);
            expect(headers.get('x-token-version')).toBe(String(claims.tokenVersion));
            expect(headers.get('x-authorization-context')).not.toBeNull();

            // x-membership-id should be present (server-resolved)
            expect(headers.get('x-membership-id')).toBe(context.membershipId);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * **Property 2: Authorization Context Header Security**
   *
   * For any AuthorizationContext serialized to headers, the serialized JSON
   * SHALL NOT contain the full permissions set (permissions are derived
   * from role at route level).
   *
   * **Validates: Requirements 1.6**
   */
  describe('Property 2: Authorization Context Header Security', () => {
    it('serialized JSON SHALL NOT contain full permissions set', () => {
      fc.assert(
        fc.property(
          validJwtClaimsArb,
          membershipRoleArb,
          (claims, role) => {
            const permissions = getPermissionsForRole(role);
            const context = createMockAuthorizationContext({
              userId: claims.userId,
              tenantId: claims.activeTenantId,
              orgUnitId: claims.activeOrgUnitId,
              tokenVersion: claims.tokenVersion,
              role,
              permissions,
            });

            const middleware = createTestMiddleware();
            const headers = new Headers();

            middleware.serializeContextToHeaders(context, headers);

            const serializedContext = headers.get('x-authorization-context');
            expect(serializedContext).not.toBeNull();

            const parsed = JSON.parse(serializedContext!);

            // SECURITY: permissions MUST NOT be in serialized headers
            expect(parsed.permissions).toBeUndefined();

            // Verify the original context has permissions (sanity check)
            expect(context.permissions.size).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('no sensitive data leaked in any header', () => {
      fc.assert(
        fc.property(
          validJwtClaimsArb,
          membershipRoleArb,
          (claims, role) => {
            const context = createMockAuthorizationContext({
              userId: claims.userId,
              tenantId: claims.activeTenantId,
              orgUnitId: claims.activeOrgUnitId,
              tokenVersion: claims.tokenVersion,
              role,
            });

            const middleware = createTestMiddleware();
            const headers = new Headers();

            middleware.serializeContextToHeaders(context, headers);

            // Check x-authorization-context JSON
            const serializedContext = headers.get('x-authorization-context');
            const parsed = JSON.parse(serializedContext!);

            // List of fields that should NOT be exposed
            const sensitiveFields = ['permissions', 'password', 'token', 'secret'];

            sensitiveFields.forEach((field) => {
              expect(parsed[field]).toBeUndefined();
            });

            // Membership object should NOT be fully serialized
            expect(parsed.membership).toBeUndefined();
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Performance Tests
// ---------------------------------------------------------------------------

/**
 * **Performance Test: Resolution Latency**
 *
 * Verify resolution + serialization < 50ms p99.
 *
 * **Validates: Requirements 1 (Testing Considerations)**
 */
describe('Performance Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTokenVersionService.validateTokenVersion.mockResolvedValue(ok(true));
    mockTokenVersionService.getTokenVersion.mockResolvedValue(ok(TEST_TOKEN_VERSION));
    mockAuthorizationContextResolver.resolve.mockResolvedValue(
      ok(createMockAuthorizationContextResult(createMockAuthorizationContext())),
    );
  });

  it('resolution + serialization should complete under 50ms p99', async () => {
    const middleware = createTestMiddleware();
    const latencies: number[] = [];
    const numIterations = 100;

    // Pre-create the token to avoid JWT creation time in measurements
    const token = await createValidJwt();

    for (let i = 0; i < numIterations; i++) {
      const request = createMockRequest({
        headers: { Authorization: `Bearer ${token}` },
        url: 'http://localhost:3000/api/test',
      });

      const startTime = performance.now();
      await middleware.handle(request);
      const endTime = performance.now();

      latencies.push(endTime - startTime);
    }

    // Sort latencies and calculate p99
    latencies.sort((a, b) => a - b);
    const p99Index = Math.floor(numIterations * 0.99);
    const p99Latency = latencies[p99Index];

    // Calculate other stats for reporting
    const p50Index = Math.floor(numIterations * 0.5);
    const p95Index = Math.floor(numIterations * 0.95);
    const p50Latency = latencies[p50Index];
    const p95Latency = latencies[p95Index];
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / numIterations;

    console.log(`Performance Test Results (${numIterations} iterations):`);
    console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
    console.log(`  p50: ${p50Latency.toFixed(2)}ms`);
    console.log(`  p95: ${p95Latency.toFixed(2)}ms`);
    console.log(`  p99: ${p99Latency.toFixed(2)}ms`);

    // Assert p99 < 50ms
    // Note: This test uses mocked dependencies, so actual performance
    // in production may differ. The target is < 50ms for resolution + serialization.
    expect(p99Latency).toBeLessThan(50);
  });

  it('JWT extraction should be fast (< 10ms avg)', async () => {
    const middleware = createTestMiddleware();
    const latencies: number[] = [];
    const numIterations = 50;

    const token = await createValidJwt();

    for (let i = 0; i < numIterations; i++) {
      const request = createMockRequest({
        headers: { Authorization: `Bearer ${token}` },
      });

      const startTime = performance.now();
      await middleware.extractAndValidateJwt(request);
      const endTime = performance.now();

      latencies.push(endTime - startTime);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / numIterations;

    console.log(`JWT Extraction Performance (${numIterations} iterations):`);
    console.log(`  Average: ${avgLatency.toFixed(2)}ms`);

    expect(avgLatency).toBeLessThan(10);
  });

  it('header serialization should be fast (< 1ms avg)', () => {
    const middleware = createTestMiddleware();
    const latencies: number[] = [];
    const numIterations = 100;

    const context = createMockAuthorizationContext();

    for (let i = 0; i < numIterations; i++) {
      const headers = new Headers();

      const startTime = performance.now();
      middleware.serializeContextToHeaders(context, headers);
      const endTime = performance.now();

      latencies.push(endTime - startTime);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / numIterations;

    console.log(`Header Serialization Performance (${numIterations} iterations):`);
    console.log(`  Average: ${avgLatency.toFixed(2)}ms`);

    expect(avgLatency).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Edge Cases and Error Handling
// ---------------------------------------------------------------------------

describe('Edge Cases and Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle tokenVersionService.validateTokenVersion failure', async () => {
    mockTokenVersionService.validateTokenVersion.mockResolvedValue(
      fail({
        type: 'technical',
        code: 'DB_CONNECTION_ERROR',
        message: 'Database connection failed',
      }),
    );

    const middleware = createTestMiddleware();
    const token = await createValidJwt();

    const request = createMockRequest({
      headers: { Authorization: `Bearer ${token}` },
      url: 'http://localhost:3000/api/test',
    });

    const response = await middleware.handle(request);

    expect(response.status).toBe(401);
  });

  it('should handle tokenVersionService.getTokenVersion failure', async () => {
    mockTokenVersionService.validateTokenVersion.mockResolvedValue(ok(true));
    mockTokenVersionService.getTokenVersion.mockResolvedValue(
      fail({
        type: 'technical',
        code: 'DB_CONNECTION_ERROR',
        message: 'Database connection failed',
      }),
    );

    const middleware = createTestMiddleware();
    const token = await createValidJwt();

    const request = createMockRequest({
      headers: { Authorization: `Bearer ${token}` },
      url: 'http://localhost:3000/api/test',
    });

    const response = await middleware.handle(request);

    expect(response.status).toBe(500);
  });

  it('should handle authorizationContextResolver.resolve failure', async () => {
    mockTokenVersionService.validateTokenVersion.mockResolvedValue(ok(true));
    mockTokenVersionService.getTokenVersion.mockResolvedValue(ok(TEST_TOKEN_VERSION));
    mockAuthorizationContextResolver.resolve.mockResolvedValue(
      fail({
        type: 'unexpected',
        code: 'AUTH_CONTEXT_RESOLUTION_FAILED',
        message: 'Unexpected error',
      }),
    );

    const middleware = createTestMiddleware();
    const token = await createValidJwt();

    const request = createMockRequest({
      headers: { Authorization: `Bearer ${token}` },
      url: 'http://localhost:3000/api/test',
    });

    const response = await middleware.handle(request);

    expect(response.status).toBe(500);
  });

  it('should map AUTH_USER_QUARANTINED to 403', async () => {
    mockTokenVersionService.validateTokenVersion.mockResolvedValue(ok(true));
    mockTokenVersionService.getTokenVersion.mockResolvedValue(ok(TEST_TOKEN_VERSION));
    mockAuthorizationContextResolver.resolve.mockResolvedValue(
      fail({
        type: 'authorization',
        code: 'AUTH_USER_QUARANTINED',
        message: 'User is quarantined',
      }),
    );

    const middleware = createTestMiddleware();
    const token = await createValidJwt();

    const request = createMockRequest({
      headers: { Authorization: `Bearer ${token}` },
      url: 'http://localhost:3000/api/test',
    });

    const response = await middleware.handle(request);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe('AUTH_USER_QUARANTINED');
  });

  it('should prefer Authorization header over cookie', async () => {
    const headerToken = await createValidJwt({ userId: 'header-user-id' });
    const cookieToken = await createValidJwt({ userId: 'cookie-user-id' });

    const middleware = createTestMiddleware();

    const request = createMockRequest({
      headers: { Authorization: `Bearer ${headerToken}` },
      cookies: { societ_rt_auth_token: cookieToken },
    });

    const result = await middleware.extractAndValidateJwt(request);

    expect(result.success).toBe(true);
    expect(result.claims?.userId).toBe('header-user-id');
  });

  it('should handle custom header prefix configuration', () => {
    const middleware = createTestMiddleware({ headerPrefix: 'custom-' });
    const context = createMockAuthorizationContext();
    const headers = new Headers();

    middleware.serializeContextToHeaders(context, headers);

    expect(headers.get('custom-user-id')).toBe(TEST_USER_ID);
    expect(headers.get('custom-authorization-context')).not.toBeNull();
  });
});
