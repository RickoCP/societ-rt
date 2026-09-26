/**
 * E2E Auth Flow Tests — PLATFORM_ADMIN Role
 *
 * Tests the complete authentication and authorization flow for PLATFORM_ADMIN role:
 * - PLATFORM_ADMIN is a tenant-level admin with orgUnitId = null
 * - PLATFORM_ADMIN has explicit platform-level permissions ONLY
 * - NO implicit tenant data access (requires Privileged Execution Path)
 * - Can access platform management routes (platform:*, audit:read)
 * - Can provision, suspend, and terminate tenants
 * - Can manage subscription plans and anomaly remediation
 * - Verifies permissions match those defined in PermissionRegistry
 *
 * @see Requirements 13.2 — Integration test for PLATFORM_ADMIN role
 * @see FASE 2.12 — Integration Test Suite for Auth Flow
 * @see Design Components > 8. Permission Registry > PLATFORM_ADMIN Rules
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { Membership } from '@core/domains/membership/entities';
import {
  getPermissionsForRole,
  ROLE_PERMISSIONS,
} from '@core/domains/authorization/permissions/PermissionRegistry';
import {
  createPlatformAdminSetup,
  createMockAuthContext,
  createAuthenticatedRequest,
  serializeAuthContext,
  createTestUser,
  createTestTenant,
} from '../test-helpers';

// ---------------------------------------------------------------------------
// Mocks Setup
// ---------------------------------------------------------------------------

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

vi.mock('@infrastructure/utils/correlationId', () => ({
  generateCorrelationId: vi.fn(() => 'test-correlation-id-platform-admin'),
}));

// Import after mocks
import { withPermission, requirePermissions } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';

// ---------------------------------------------------------------------------
// Test Constants for PLATFORM_ADMIN Role
// ---------------------------------------------------------------------------

const TEST_TENANT_ID = 'tenant-platform-001';
const TEST_USER_ID = 'user-platform-admin-001';
const TEST_MEMBERSHIP_ID = 'membership-platform-admin-001';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock Membership entity for PLATFORM_ADMIN
 */
function createMockMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: TEST_MEMBERSHIP_ID,
    userId: TEST_USER_ID,
    tenantId: TEST_TENANT_ID,
    orgUnitId: null, // PLATFORM_ADMIN MUST have orgUnitId = null (tenant-level)
    role: MembershipRole.PLATFORM_ADMIN,
    status: MembershipStatus.ACTIVE,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    revokedAt: undefined,
    ...overrides,
  };
}

/**
 * Creates a complete AuthorizationContext for PLATFORM_ADMIN role
 */
function createPlatformAdminAuthContext(
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext {
  const role = overrides.role ?? MembershipRole.PLATFORM_ADMIN;
  const permissions = overrides.permissions ?? getPermissionsForRole(role);

  return {
    userId: TEST_USER_ID,
    tenantId: TEST_TENANT_ID,
    membershipId: TEST_MEMBERSHIP_ID,
    orgUnitId: null, // PLATFORM_ADMIN MUST have orgUnitId = null
    role,
    permissions,
    tokenVersion: 1,
    isAuthoritative: true,
    isTenantLevel: true, // PLATFORM_ADMIN IS tenant-level (orgUnitId = null)
    membership: createMockMembership(),
    ...overrides,
  };
}

/**
 * Creates a NextRequest with auth context headers
 */
function createMockRequest(options: {
  headers?: Record<string, string>;
  url?: string;
  method?: string;
} = {}): NextRequest {
  const url = options.url ?? 'http://localhost:3000/api/test';
  const headers = new Headers(options.headers);
  const method = options.method ?? 'GET';

  return new NextRequest(url, { method, headers });
}

// ---------------------------------------------------------------------------
// PLATFORM_ADMIN Role Characteristics Tests
// ---------------------------------------------------------------------------

describe('PLATFORM_ADMIN Role Flow Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('PLATFORM_ADMIN Role Characteristics (Req 13.2)', () => {
    it('PLATFORM_ADMIN MUST have null orgUnitId (tenant-level)', () => {
      const authContext = createPlatformAdminAuthContext();

      // PLATFORM_ADMIN is tenant-level, must have orgUnitId = null
      expect(authContext.orgUnitId).toBeNull();
    });

    it('PLATFORM_ADMIN has isTenantLevel = true (tenant-level scope)', () => {
      const authContext = createPlatformAdminAuthContext();

      // PLATFORM_ADMIN IS tenant-level
      expect(authContext.isTenantLevel).toBe(true);
    });

    it('PLATFORM_ADMIN role is correctly set in AuthorizationContext', () => {
      const authContext = createPlatformAdminAuthContext();

      expect(authContext.role).toBe(MembershipRole.PLATFORM_ADMIN);
    });

    it('PLATFORM_ADMIN has active membership status for full access', () => {
      const authContext = createPlatformAdminAuthContext();

      expect(authContext.membership.status).toBe(MembershipStatus.ACTIVE);
      expect(authContext.isAuthoritative).toBe(true);
    });

    it('PLATFORM_ADMIN membership.orgUnitId must be null (INV-MEM-002)', () => {
      const authContext = createPlatformAdminAuthContext();

      // INV-MEM-002: PLATFORM_ADMIN MUST have orgUnitId = null
      expect(authContext.membership.orgUnitId).toBeNull();
    });
  });

  describe('PLATFORM_ADMIN Permission Validation (PermissionRegistry)', () => {
    // PLATFORM_ADMIN expected permissions from PermissionRegistry
    const PLATFORM_ADMIN_EXPECTED_PERMISSIONS = ROLE_PERMISSIONS[MembershipRole.PLATFORM_ADMIN];

    it('PLATFORM_ADMIN has all expected permissions from PermissionRegistry', () => {
      const authContext = createPlatformAdminAuthContext();

      // Verify each expected permission is present
      for (const expectedPermission of PLATFORM_ADMIN_EXPECTED_PERMISSIONS) {
        expect(
          authContext.permissions.has(expectedPermission),
          `PLATFORM_ADMIN should have permission: ${expectedPermission}`,
        ).toBe(true);
      }
    });

    it('PLATFORM_ADMIN has platform:read permission', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['platform:read'],
      );
      expect(result.success).toBe(true);
    });

    it('PLATFORM_ADMIN has platform:write permission', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['platform:write'],
      );
      expect(result.success).toBe(true);
    });

    it('PLATFORM_ADMIN has audit:read permission', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['audit:read'],
      );
      expect(result.success).toBe(true);
    });

    it('PLATFORM_ADMIN has platform:provision permission (tenant provisioning)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['platform:provision'],
      );
      expect(result.success).toBe(true);
    });

    it('PLATFORM_ADMIN has platform:suspend permission (tenant suspension)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['platform:suspend'],
      );
      expect(result.success).toBe(true);
    });

    it('PLATFORM_ADMIN has platform:terminate permission (tenant termination)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['platform:terminate'],
      );
      expect(result.success).toBe(true);
    });

    it('PLATFORM_ADMIN has platform:manage permission (subscription management)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['platform:manage'],
      );
      expect(result.success).toBe(true);
    });

    it('PLATFORM_ADMIN has platform:review permission (anomaly review)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['platform:review'],
      );
      expect(result.success).toBe(true);
    });

    it('PLATFORM_ADMIN has platform:remediate permission (anomaly remediation)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['platform:remediate'],
      );
      expect(result.success).toBe(true);
    });

    // PLATFORM_ADMIN does NOT have tenant data access (L11 principle)
    it('PLATFORM_ADMIN does NOT have tenant:manage permission (L11 - no tenant data)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['tenant:manage'],
      );

      expect(result.success).toBe(false);
    });

    it('PLATFORM_ADMIN does NOT have resident:read permission (L11 - no tenant data)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['resident:read'],
      );

      expect(result.success).toBe(false);
    });

    it('PLATFORM_ADMIN does NOT have finance:read permission (L11 - no tenant data)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['finance:read'],
      );

      expect(result.success).toBe(false);
    });

    it('PLATFORM_ADMIN does NOT have iot:read permission (L11 - no tenant data)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['iot:read'],
      );

      expect(result.success).toBe(false);
    });

    it('PLATFORM_ADMIN does NOT have emergency:create permission (L11 - no tenant data)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['emergency:create'],
      );

      expect(result.success).toBe(false);
    });

    it('PLATFORM_ADMIN does NOT have membership:delegate permission (L11 - no tenant data)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['membership:delegate'],
      );

      expect(result.success).toBe(false);
    });

    it('PLATFORM_ADMIN does NOT have orgunit:manage permission (L11 - no tenant data)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['orgunit:manage'],
      );

      expect(result.success).toBe(false);
    });

    it('PLATFORM_ADMIN does NOT have vote:cast permission (L11 - no tenant data)', () => {
      const result = requirePermissions(
        createPlatformAdminAuthContext(),
        ['vote:cast'],
      );

      expect(result.success).toBe(false);
    });
  });

  describe('PLATFORM_ADMIN withPermission Wrapper Flow Tests', () => {
    it('should allow PLATFORM_ADMIN to access routes with platform:read permission', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ data: 'platform-config' }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['platform:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/admin/config',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
      const body = await response.json();
      expect(body.data).toBe('platform-config');
    });

    it('should allow PLATFORM_ADMIN to access routes with platform:write permission', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['platform:write'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/admin/config',
        method: 'PUT',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should allow PLATFORM_ADMIN to access routes with audit:read permission', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ auditLogs: [] }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['audit:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/admin/audit',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should allow PLATFORM_ADMIN to access tenant provisioning routes', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ tenantId: 'new-tenant-001' }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['platform:provision'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/admin/tenants/provision',
        method: 'POST',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should allow PLATFORM_ADMIN to access tenant suspension routes', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ suspended: true }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['platform:suspend'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/admin/tenants/suspend',
        method: 'POST',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should allow PLATFORM_ADMIN to access subscription management routes', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ subscriptions: [] }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['platform:manage'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/admin/subscriptions',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should deny PLATFORM_ADMIN access to routes requiring resident:read (L11)', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['resident:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/residents',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
      const body = await response.json();
      expect(body.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
    });

    it('should deny PLATFORM_ADMIN access to routes requiring tenant:manage (L11)', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['tenant:manage'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/tenants/settings',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should deny PLATFORM_ADMIN access to routes requiring finance:write (L11)', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['finance:write'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/finance/transactions',
        method: 'POST',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should allow PLATFORM_ADMIN for routes requiring multiple platform permissions', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      // PLATFORM_ADMIN has all these permissions
      const wrappedHandler = withPermission(
        { permissions: ['platform:read', 'audit:read', 'platform:review'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/admin/dashboard',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should deny when PLATFORM_ADMIN is missing ANY of multiple required permissions', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      // PLATFORM_ADMIN has platform:read but NOT resident:read
      const wrappedHandler = withPermission(
        { permissions: ['platform:read', 'resident:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/combined',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('PLATFORM_ADMIN Tenant-Level Scope (L11 — No Implicit Tenant Access)', () => {
    it('PLATFORM_ADMIN context should have orgUnitId = null (tenant-level)', () => {
      const authContext = createPlatformAdminAuthContext();

      // PLATFORM_ADMIN must have orgUnitId = null for tenant-level access
      expect(authContext.orgUnitId).toBeNull();
      expect(authContext.isTenantLevel).toBe(true);
    });

    it('PLATFORM_ADMIN context should be passed to handler with null orgUnitId', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      let capturedContext: AuthorizationContext | null = null;
      const handler: AuthorizedRouteHandler = vi.fn().mockImplementation(
        (_req, ctx) => {
          capturedContext = ctx;
          return NextResponse.json({ success: true });
        },
      );
      const wrappedHandler = withPermission(
        { permissions: ['platform:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      await wrappedHandler(request);

      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.orgUnitId).toBeNull();
      expect(capturedContext!.tenantId).toBe(TEST_TENANT_ID);
      expect(capturedContext!.isTenantLevel).toBe(true);
    });

    it('PLATFORM_ADMIN tenantId should be set for RLS context', () => {
      const authContext = createPlatformAdminAuthContext();

      expect(authContext.tenantId).toBeDefined();
      expect(authContext.tenantId).toBe(TEST_TENANT_ID);
    });

    it('PLATFORM_ADMIN permissions should be EXACTLY the platform-level set (L11)', () => {
      const authContext = createPlatformAdminAuthContext();
      const expectedPermissions = new Set(ROLE_PERMISSIONS[MembershipRole.PLATFORM_ADMIN]);

      // Size should match exactly (no extra permissions)
      expect(authContext.permissions.size).toBe(expectedPermissions.size);

      // All expected permissions should be present
      for (const perm of expectedPermissions) {
        expect(authContext.permissions.has(perm)).toBe(true);
      }
    });
  });

  describe('PLATFORM_ADMIN Legacy Header Fallback', () => {
    it('should resolve PLATFORM_ADMIN context from legacy headers', async () => {
      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['platform:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: {
          'x-user-id': TEST_USER_ID,
          'x-tenant-id': TEST_TENANT_ID,
          'x-user-role': MembershipRole.PLATFORM_ADMIN,
          'x-org-unit-id': '', // Empty string for null (legacy header encoding)
          'x-membership-id': TEST_MEMBERSHIP_ID,
        },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should correctly derive PLATFORM_ADMIN permissions from role in legacy headers', async () => {
      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['resident:read'] }, // PLATFORM_ADMIN doesn't have this
        handler,
      );

      const request = createMockRequest({
        headers: {
          'x-user-id': TEST_USER_ID,
          'x-tenant-id': TEST_TENANT_ID,
          'x-user-role': MembershipRole.PLATFORM_ADMIN,
          'x-org-unit-id': '',
        },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('PLATFORM_ADMIN Membership Status Handling', () => {
    it('should allow ACTIVE PLATFORM_ADMIN to access platform routes', async () => {
      const authContext = createPlatformAdminAuthContext({
        membership: createMockMembership({ status: MembershipStatus.ACTIVE }),
      });
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['platform:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
    });

    it('should deny REVOKED PLATFORM_ADMIN access to all routes', async () => {
      const authContext = createPlatformAdminAuthContext({
        membership: createMockMembership({
          status: MembershipStatus.REVOKED,
          revokedAt: new Date(),
        }),
      });
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['platform:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
      const body = await response.json();
      expect(body.code).toBe('AUTH_MEMBERSHIP_INACTIVE');
    });

    it('should deny SUSPENDED PLATFORM_ADMIN access to non-safety routes', async () => {
      const authContext = createPlatformAdminAuthContext({
        membership: createMockMembership({ status: MembershipStatus.SUSPENDED }),
      });
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['platform:read'] }, // Not a safety route
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
      const body = await response.json();
      expect(body.code).toBe('AUTH_MEMBERSHIP_SUSPENDED');
    });

    it('PLATFORM_ADMIN does NOT have emergency:create so cannot access safety routes even with allowSuspended', async () => {
      // NOTE: PLATFORM_ADMIN has no tenant data access permissions including emergency:create
      // This test verifies L11 principle holds even for safety-critical routes
      const authContext = createPlatformAdminAuthContext({
        membership: createMockMembership({ status: MembershipStatus.ACTIVE }),
      });
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['emergency:create'], allowSuspended: true },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/emergency',
        method: 'POST',
      });

      const response = await wrappedHandler(request);

      // PLATFORM_ADMIN lacks emergency:create - L11 principle applies
      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('PLATFORM_ADMIN Authorization Logging', () => {
    it('should log authorization denial with PLATFORM_ADMIN context', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['resident:read'] }, // PLATFORM_ADMIN doesn't have this
        handler,
      );

      const request = createMockRequest({
        headers: {
          'x-authorization-context': serializedContext,
          'x-correlation-id': 'test-corr-id-platform-admin',
        },
        url: 'http://localhost:3000/api/residents',
        method: 'GET',
      });

      await wrappedHandler(request);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Authorization denied: Insufficient permissions',
        expect.objectContaining({
          correlation_id: 'test-corr-id-platform-admin',
          user_id: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
          org_unit_id: null, // PLATFORM_ADMIN has null orgUnitId
          role: MembershipRole.PLATFORM_ADMIN,
          route: '/api/residents',
          method: 'GET',
          decision: 'DENY',
        }),
      );
    });

    it('should log authorization success when logSuccess is enabled', async () => {
      const authContext = createPlatformAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['platform:read'], logSuccess: true },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/admin/config',
      });

      await wrappedHandler(request);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Authorization granted',
        expect.objectContaining({
          user_id: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
          role: MembershipRole.PLATFORM_ADMIN,
          decision: 'ALLOW',
        }),
      );
    });
  });

  describe('PLATFORM_ADMIN vs Other Roles Comparison', () => {
    it('PLATFORM_ADMIN has DISTINCT permission set from TENANT_OWNER', () => {
      const platformAdminPermissions = getPermissionsForRole(MembershipRole.PLATFORM_ADMIN);
      const tenantOwnerPermissions = getPermissionsForRole(MembershipRole.TENANT_OWNER);

      // PLATFORM_ADMIN has platform:* permissions
      expect(platformAdminPermissions.has('platform:read')).toBe(true);
      expect(platformAdminPermissions.has('platform:write')).toBe(true);
      expect(platformAdminPermissions.has('platform:provision')).toBe(true);

      // TENANT_OWNER does NOT have platform:* permissions
      expect(tenantOwnerPermissions.has('platform:read')).toBe(false);
      expect(tenantOwnerPermissions.has('platform:write')).toBe(false);
      expect(tenantOwnerPermissions.has('platform:provision')).toBe(false);

      // TENANT_OWNER has tenant data permissions
      expect(tenantOwnerPermissions.has('tenant:manage')).toBe(true);
      expect(tenantOwnerPermissions.has('resident:read')).toBe(true);
      expect(tenantOwnerPermissions.has('finance:write')).toBe(true);

      // PLATFORM_ADMIN does NOT have tenant data permissions (L11)
      expect(platformAdminPermissions.has('tenant:manage')).toBe(false);
      expect(platformAdminPermissions.has('resident:read')).toBe(false);
      expect(platformAdminPermissions.has('finance:write')).toBe(false);
    });

    it('PLATFORM_ADMIN has audit:read that other roles may lack', () => {
      const platformAdminPermissions = getPermissionsForRole(MembershipRole.PLATFORM_ADMIN);
      const rtAdminPermissions = getPermissionsForRole(MembershipRole.RT_ADMIN);
      const residentPermissions = getPermissionsForRole(MembershipRole.RESIDENT);

      // PLATFORM_ADMIN has audit:read (platform-wide audit access)
      expect(platformAdminPermissions.has('audit:read')).toBe(true);

      // RT_ADMIN and RESIDENT do NOT have audit:read
      expect(rtAdminPermissions.has('audit:read')).toBe(false);
      expect(residentPermissions.has('audit:read')).toBe(false);
    });

    it('PLATFORM_ADMIN is NOT higher privilege than TENANT_OWNER for tenant operations', () => {
      // This test ensures L11 principle: PLATFORM_ADMIN is NOT a "super-admin"
      // that has all permissions. They have DIFFERENT, platform-focused permissions.
      const platformAdminPermissions = getPermissionsForRole(MembershipRole.PLATFORM_ADMIN);

      // Verify PLATFORM_ADMIN lacks ALL tenant data permissions
      const tenantDataPermissions = [
        'tenant:manage',
        'orgunit:manage',
        'resident:read',
        'resident:write',
        'finance:read',
        'finance:write',
        'household:manage',
        'emergency:create',
        'emergency:manage',
        'iot:read',
        'iot:command',
        'vote:cast',
        'vote:manage',
      ];

      for (const perm of tenantDataPermissions) {
        expect(
          platformAdminPermissions.has(perm),
          `PLATFORM_ADMIN should NOT have tenant permission: ${perm}`,
        ).toBe(false);
      }
    });
  });

  describe('PLATFORM_ADMIN Property: No Inheritance, Explicit Permissions Only', () => {
    it('PLATFORM_ADMIN permissions are explicitly defined (not inherited)', () => {
      const explicitPermissions = ROLE_PERMISSIONS[MembershipRole.PLATFORM_ADMIN];
      const resolvedPermissions = getPermissionsForRole(MembershipRole.PLATFORM_ADMIN);

      // All resolved permissions should match explicit definition
      expect(resolvedPermissions.size).toBe(explicitPermissions.length);

      for (const perm of explicitPermissions) {
        expect(
          resolvedPermissions.has(perm),
          `Explicit permission ${perm} should be in resolved set`,
        ).toBe(true);
      }
    });

    it('PLATFORM_ADMIN permissions are ALL platform-level (domain check)', () => {
      const permissions = getPermissionsForRole(MembershipRole.PLATFORM_ADMIN);

      for (const perm of permissions) {
        // All PLATFORM_ADMIN permissions should be either 'platform:*' or 'audit:*'
        const [domain] = perm.split(':');
        expect(
          domain === 'platform' || domain === 'audit',
          `PLATFORM_ADMIN permission ${perm} should be platform or audit domain`,
        ).toBe(true);
      }
    });
  });

  describe('PLATFORM_ADMIN using Test Helper createPlatformAdminSetup', () => {
    it('should create valid PLATFORM_ADMIN setup via test helper', () => {
      const setup = createPlatformAdminSetup();

      expect(setup.role).toBe(MembershipRole.PLATFORM_ADMIN);
      expect(setup.orgUnit).toBeNull(); // Tenant-level, no orgUnit
      expect(setup.status).toBe(MembershipStatus.ACTIVE);
    });

    it('should create valid AuthorizationContext from PLATFORM_ADMIN setup', () => {
      const setup = createPlatformAdminSetup();
      const authContext = createMockAuthContext(setup);

      expect(authContext.role).toBe(MembershipRole.PLATFORM_ADMIN);
      expect(authContext.orgUnitId).toBeNull();
      expect(authContext.isTenantLevel).toBe(true);
      expect(authContext.permissions.has('platform:read')).toBe(true);
    });

    it('should allow custom tenant and user in PLATFORM_ADMIN setup', () => {
      const customTenant = createTestTenant({ id: 'custom-tenant-id', name: 'Custom Tenant' });
      const customUser = createTestUser({ id: 'custom-user-id', name: 'Custom Platform Admin' });

      const setup = createPlatformAdminSetup(customTenant, customUser);
      const authContext = createMockAuthContext(setup);

      expect(authContext.tenantId).toBe('custom-tenant-id');
      expect(authContext.userId).toBe('custom-user-id');
      expect(authContext.role).toBe(MembershipRole.PLATFORM_ADMIN);
    });
  });
});

/**
 * Validates: Requirements 13.2 — Integration Tests SHALL test PLATFORM_ADMIN role flow
 *
 * This test suite verifies:
 * 1. PLATFORM_ADMIN has tenant-level admin access (orgUnitId = null)
 * 2. PLATFORM_ADMIN can access platform management routes (platform:*, audit:read)
 * 3. PLATFORM_ADMIN has orgUnitId = null (tenant-wide scope)
 * 4. PLATFORM_ADMIN has explicit platform-level permissions ONLY (L11 principle)
 * 5. PLATFORM_ADMIN does NOT have implicit tenant data access
 * 6. Proper AuthorizationContext resolution for PLATFORM_ADMIN
 */
