/**
 * RequirePermission Middleware Unit Tests
 *
 * Tests the permission-based route authorization middleware:
 * - withPermission HOF wrapper
 * - requirePermissions helper function
 * - Permission checking logic
 * - Logging behavior
 * - Error handling (fail closed)
 *
 * @see Requirements 5 (AC 1-7)
 * @see Design Authorization Pipeline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { Membership } from '@core/domains/membership/entities';
import { getPermissionsForRole } from '@core/domains/authorization/permissions/PermissionRegistry';

// ---------------------------------------------------------------------------
// Mocks Setup
// ---------------------------------------------------------------------------

// Mock the DI container
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('@infrastructure/di/container', () => ({
  container: {
    resolve: vi.fn((key: string) => {
      if (key === 'logger') return mockLogger;
      throw new Error(`Unknown dependency: ${key}`);
    }),
  },
}));

// Mock the correlation ID generator
vi.mock('@infrastructure/utils/correlationId', () => ({
  generateCorrelationId: vi.fn(() => 'test-correlation-id'),
}));

// Import after mocks are set up
import {
  withPermission,
  requirePermissions,
} from '../requirePermission';
import type { AuthorizedRouteHandler } from '../types';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const createMockMembership = (overrides: Partial<Membership> = {}): Membership => ({
  id: 'test-membership-id',
  userId: 'test-user-id',
  tenantId: 'test-tenant-id',
  orgUnitId: 'test-orgunit-id',
  role: MembershipRole.RT_ADMIN,
  status: MembershipStatus.ACTIVE,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  revokedAt: undefined,
  ...overrides,
});

const createMockAuthContext = (
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext => {
  const role = overrides.role ?? MembershipRole.RT_ADMIN;
  // Use the imported getPermissionsForRole to get actual permissions for the role
  const permissions = overrides.permissions ?? getPermissionsForRole(role);

  return {
    userId: 'test-user-id',
    tenantId: 'test-tenant-id',
    membershipId: 'test-membership-id',
    orgUnitId: 'test-orgunit-id',
    role,
    permissions,
    tokenVersion: 1,
    isAuthoritative: true,
    isTenantLevel: false,
    membership: createMockMembership({ role }),
    ...overrides,
  };
};

const createMockRequest = (
  options: {
    headers?: Record<string, string>;
    url?: string;
    method?: string;
  } = {},
): NextRequest => {
  const url = options.url ?? 'http://localhost:3000/api/test';
  const headers = new Headers(options.headers);
  const method = options.method ?? 'GET';

  return new NextRequest(url, {
    method,
    headers,
  });
};

const createSerializedAuthContext = (
  context: AuthorizationContext,
): string => {
  // Convert permissions Set to array for JSON serialization
  return JSON.stringify({
    ...context,
    permissions: Array.from(context.permissions),
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requirePermissions helper', () => {
  describe('Permission Validation (Req 5.3)', () => {
    it('should return ok when all permissions are present', () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RT_ADMIN });

      // RT_ADMIN has finance:read permission
      const result = requirePermissions(authContext, ['finance:read']);

      expect(result.success).toBe(true);
    });

    it('should return ok when no permissions are required', () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RESIDENT });

      const result = requirePermissions(authContext, []);

      expect(result.success).toBe(true);
    });

    it('should return fail when permission is missing', () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RESIDENT });

      // RESIDENT does not have tenant:manage permission
      const result = requirePermissions(authContext, ['tenant:manage']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
      }
    });

    it('should return fail when ANY required permission is missing', () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RESIDENT });

      // RESIDENT has resident:read but not tenant:manage
      const result = requirePermissions(authContext, ['resident:read', 'tenant:manage']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
      }
    });

    it('should return ok when ALL required permissions are present', () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RT_ADMIN });

      // RT_ADMIN has both of these permissions
      const result = requirePermissions(authContext, ['resident:read', 'finance:read']);

      expect(result.success).toBe(true);
    });
  });

  describe('Unknown Permission Handling (Req 2.7)', () => {
    it('should fail closed for unknown permission codes', () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RT_ADMIN });

      // Unknown permission should fail closed
      const result = requirePermissions(authContext, ['unknown:permission']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
      }
    });
  });
});

describe('withPermission HOF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Authorization Context Resolution (Req 5.2)', () => {
    it('should return 401 when no authorization context is available', async () => {
      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission({ permissions: ['resident:read'] }, handler);

      const request = createMockRequest(); // No auth headers

      const response = await wrappedHandler(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.code).toBe('AUTH_TOKEN_INVALID');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should resolve authorization context from x-authorization-context header', async () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RT_ADMIN });
      const serializedContext = createSerializedAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission({ permissions: ['resident:read'] }, handler);

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should resolve authorization context from legacy headers', async () => {
      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission({ permissions: ['resident:read'] }, handler);

      const request = createMockRequest({
        headers: {
          'x-user-id': 'test-user-id',
          'x-tenant-id': 'test-tenant-id',
          'x-user-role': MembershipRole.RT_ADMIN,
        },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Permission Checking (Req 5.3, 5.4)', () => {
    it('should allow request when all permissions are present', async () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RT_ADMIN });
      const serializedContext = createSerializedAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission({ permissions: ['finance:read', 'resident:read'] }, handler);

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          userId: authContext.userId,
          tenantId: authContext.tenantId,
          role: authContext.role,
        }),
        undefined,
      );
    });

    it('should deny request with 403 when permission is missing', async () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RESIDENT });
      const serializedContext = createSerializedAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission({ permissions: ['tenant:manage'] }, handler);

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should allow request when no permissions are required', async () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RESIDENT });
      const serializedContext = createSerializedAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission({ permissions: [] }, handler);

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Logging Behavior (Req 5.6)', () => {
    it('should log denial with required context', async () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RESIDENT });
      const serializedContext = createSerializedAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission({ permissions: ['tenant:manage'] }, handler);

      const request = createMockRequest({
        headers: {
          'x-authorization-context': serializedContext,
          'x-correlation-id': 'custom-correlation-id',
        },
        url: 'http://localhost:3000/api/tenants',
        method: 'PUT',
      });

      await wrappedHandler(request);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Authorization denied: Insufficient permissions',
        expect.objectContaining({
          correlation_id: 'custom-correlation-id',
          user_id: authContext.userId,
          tenant_id: authContext.tenantId,
          role: authContext.role,
          route: '/api/tenants',
          method: 'PUT',
          decision: 'DENY',
        }),
      );
    });

    it('should log success when logSuccess option is true', async () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RT_ADMIN });
      const serializedContext = createSerializedAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['resident:read'], logSuccess: true },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      await wrappedHandler(request);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Authorization granted',
        expect.objectContaining({
          decision: 'ALLOW',
        }),
      );
    });

    it('should not log success by default', async () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RT_ADMIN });
      const serializedContext = createSerializedAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission({ permissions: ['resident:read'] }, handler);

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      await wrappedHandler(request);

      expect(mockLogger.info).not.toHaveBeenCalledWith(
        'Authorization granted',
        expect.anything(),
      );
    });
  });

  describe('Fail Closed Behavior (Req 5.7, INV-AUTH-002)', () => {
    it('should return 500 on unexpected error without exposing details', async () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RT_ADMIN });
      const serializedContext = createSerializedAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockRejectedValue(
        new Error('Unexpected database error'),
      );
      const wrappedHandler = withPermission({ permissions: ['resident:read'] }, handler);

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.code).toBe('AUTH_CONTEXT_RESOLUTION_FAILED');
      // Should not expose internal error details
      expect(body.message).not.toContain('database');
      expect(body.message).not.toContain('Unexpected');
    });

    it('should log unexpected errors', async () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RT_ADMIN });
      const serializedContext = createSerializedAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockRejectedValue(
        new Error('Database connection failed'),
      );
      const wrappedHandler = withPermission({ permissions: ['resident:read'] }, handler);

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      await wrappedHandler(request);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Authorization failed: Unexpected error',
        expect.objectContaining({
          error_type: 'Error',
          error_message: 'Database connection failed',
        }),
      );
    });
  });

  describe('Correlation ID Handling', () => {
    it('should use correlation ID from request header', async () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RESIDENT });
      const serializedContext = createSerializedAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission({ permissions: ['tenant:manage'] }, handler);

      const request = createMockRequest({
        headers: {
          'x-authorization-context': serializedContext,
          'x-correlation-id': 'custom-correlation-id',
        },
      });

      const response = await wrappedHandler(request);

      const body = await response.json();
      expect(body.correlationId).toBe('custom-correlation-id');
    });

    it('should generate correlation ID when not provided', async () => {
      const authContext = createMockAuthContext({ role: MembershipRole.RESIDENT });
      const serializedContext = createSerializedAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission({ permissions: ['tenant:manage'] }, handler);

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      const response = await wrappedHandler(request);

      const body = await response.json();
      expect(body.correlationId).toBe('test-correlation-id');
    });
  });
});

describe('Role-Based Permission Access', () => {
  const testCases = [
    { role: MembershipRole.PLATFORM_ADMIN, permission: 'platform:read', expected: true },
    { role: MembershipRole.PLATFORM_ADMIN, permission: 'resident:read', expected: false },
    { role: MembershipRole.TENANT_OWNER, permission: 'tenant:manage', expected: true },
    { role: MembershipRole.TENANT_OWNER, permission: 'platform:read', expected: false },
    { role: MembershipRole.ORG_ADMIN, permission: 'membership:delegate', expected: true },
    { role: MembershipRole.ORG_ADMIN, permission: 'tenant:manage', expected: false },
    { role: MembershipRole.RT_ADMIN, permission: 'iot:command', expected: true },
    { role: MembershipRole.RT_ADMIN, permission: 'tenant:manage', expected: false },
    { role: MembershipRole.SECURITY, permission: 'patrol:manage', expected: true },
    { role: MembershipRole.SECURITY, permission: 'finance:write', expected: false },
    { role: MembershipRole.RESIDENT, permission: 'emergency:create', expected: true },
    { role: MembershipRole.RESIDENT, permission: 'finance:write', expected: false },
  ];

  testCases.forEach(({ role, permission, expected }) => {
    it(`${role} ${expected ? 'has' : 'does NOT have'} ${permission} permission`, () => {
      const authContext = createMockAuthContext({ role });
      const result = requirePermissions(authContext, [permission]);
      expect(result.success).toBe(expected);
    });
  });
});

describe('Property: SECURITY and RESIDENT have DISTINCT permissions (Req 2.3)', () => {
  it('SECURITY has permissions that RESIDENT does not have', () => {
    const securityContext = createMockAuthContext({ role: MembershipRole.SECURITY });
    const residentContext = createMockAuthContext({ role: MembershipRole.RESIDENT });

    // SECURITY has patrol:manage, RESIDENT does not
    const securityResult = requirePermissions(securityContext, ['patrol:manage']);
    const residentResult = requirePermissions(residentContext, ['patrol:manage']);

    expect(securityResult.success).toBe(true);
    expect(residentResult.success).toBe(false);
  });

  it('RESIDENT has permissions that SECURITY does not have', () => {
    const securityContext = createMockAuthContext({ role: MembershipRole.SECURITY });
    const residentContext = createMockAuthContext({ role: MembershipRole.RESIDENT });

    // RESIDENT has vote:cast, SECURITY does not
    const residentResult = requirePermissions(residentContext, ['vote:cast']);
    const securityResult = requirePermissions(securityContext, ['vote:cast']);

    expect(residentResult.success).toBe(true);
    expect(securityResult.success).toBe(false);
  });
});

describe('Property: Access granted IFF ALL required permissions present (Req 5.3)', () => {
  it('partial permissions should result in denial', () => {
    const authContext = createMockAuthContext({ role: MembershipRole.RESIDENT });

    // RESIDENT has resident:read but not finance:write
    // Both are required, so access should be denied
    const result = requirePermissions(authContext, ['resident:read', 'finance:write']);

    expect(result.success).toBe(false);
  });

  it('all required permissions present should result in allow', () => {
    const authContext = createMockAuthContext({ role: MembershipRole.RT_ADMIN });

    // RT_ADMIN has both of these
    const result = requirePermissions(authContext, ['resident:read', 'finance:read']);

    expect(result.success).toBe(true);
  });
});
