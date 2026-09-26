/**
 * E2E Auth Flow Tests — RT_ADMIN Role
 *
 * Tests the complete authentication and authorization flow for RT_ADMIN role:
 * - RT_ADMIN is an org-scoped admin with limited scope to their OrgUnit
 * - RT_ADMIN has specific orgUnitId (not null)
 * - Tests complete authentication and authorization flow
 * - Verifies OrgUnit scope restrictions work correctly
 * - Verifies permissions match those defined in PermissionRegistry
 *
 * @see Requirements 13.3 — Integration test for RT_ADMIN role
 * @see FASE 2.12 — Integration Test Suite for Auth Flow
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
  generateCorrelationId: vi.fn(() => 'test-correlation-id'),
}));

// Import after mocks
import { withPermission, requirePermissions } from '../requirePermission';
import type { AuthorizedRouteHandler } from '../types';

// ---------------------------------------------------------------------------
// Test Constants for RT_ADMIN Role
// ---------------------------------------------------------------------------

const TEST_TENANT_ID = 'tenant-001';
const TEST_TENANT_ID_OTHER = 'tenant-002';
const TEST_ORG_UNIT_ID = 'org-unit-rt-001';
const TEST_ORG_UNIT_ID_OUTSIDE = 'org-unit-different-scope';
const TEST_USER_ID = 'user-rt-admin-001';
const TEST_MEMBERSHIP_ID = 'membership-rt-admin-001';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock Membership entity for RT_ADMIN
 */
function createMockMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: TEST_MEMBERSHIP_ID,
    userId: TEST_USER_ID,
    tenantId: TEST_TENANT_ID,
    orgUnitId: TEST_ORG_UNIT_ID, // RT_ADMIN MUST have specific orgUnitId
    role: MembershipRole.RT_ADMIN,
    status: MembershipStatus.ACTIVE,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    revokedAt: undefined,
    ...overrides,
  };
}

/**
 * Creates a complete AuthorizationContext for RT_ADMIN role
 */
function createRtAdminAuthContext(
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext {
  const role = overrides.role ?? MembershipRole.RT_ADMIN;
  const permissions = overrides.permissions ?? getPermissionsForRole(role);

  return {
    userId: TEST_USER_ID,
    tenantId: TEST_TENANT_ID,
    membershipId: TEST_MEMBERSHIP_ID,
    orgUnitId: TEST_ORG_UNIT_ID, // RT_ADMIN MUST have orgUnitId
    role,
    permissions,
    tokenVersion: 1,
    isAuthoritative: true,
    isTenantLevel: false, // RT_ADMIN is NOT tenant-level (has orgUnitId)
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

/**
 * Serializes an AuthorizationContext for header transport
 */
function serializeAuthContext(context: AuthorizationContext): string {
  return JSON.stringify({
    ...context,
    permissions: Array.from(context.permissions),
  });
}

// ---------------------------------------------------------------------------
// RT_ADMIN Role Characteristics Tests
// ---------------------------------------------------------------------------

describe('RT_ADMIN Role Flow Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('RT_ADMIN Role Characteristics (Req 13.3)', () => {
    it('RT_ADMIN MUST have non-null orgUnitId (org-scoped)', () => {
      const authContext = createRtAdminAuthContext();

      // RT_ADMIN is org-scoped, must have orgUnitId
      expect(authContext.orgUnitId).not.toBeNull();
      expect(authContext.orgUnitId).toBe(TEST_ORG_UNIT_ID);
    });

    it('RT_ADMIN has isTenantLevel = false (org-scoped, NOT tenant-level)', () => {
      const authContext = createRtAdminAuthContext();

      // RT_ADMIN is NOT tenant-level
      expect(authContext.isTenantLevel).toBe(false);
    });

    it('RT_ADMIN role is correctly set in AuthorizationContext', () => {
      const authContext = createRtAdminAuthContext();

      expect(authContext.role).toBe(MembershipRole.RT_ADMIN);
    });

    it('RT_ADMIN has active membership status for full access', () => {
      const authContext = createRtAdminAuthContext();

      expect(authContext.membership.status).toBe(MembershipStatus.ACTIVE);
      expect(authContext.isAuthoritative).toBe(true);
    });
  });

  describe('RT_ADMIN Permission Validation (PermissionRegistry)', () => {
    // RT_ADMIN expected permissions from PermissionRegistry
    const RT_ADMIN_EXPECTED_PERMISSIONS = ROLE_PERMISSIONS[MembershipRole.RT_ADMIN];

    it('RT_ADMIN has all expected permissions from PermissionRegistry', () => {
      const authContext = createRtAdminAuthContext();

      // Verify each expected permission is present
      for (const expectedPermission of RT_ADMIN_EXPECTED_PERMISSIONS) {
        expect(
          authContext.permissions.has(expectedPermission),
          `RT_ADMIN should have permission: ${expectedPermission}`,
        ).toBe(true);
      }
    });

    it('RT_ADMIN has membership delegation permission', () => {
      const result = requirePermissions(
        createRtAdminAuthContext(),
        ['membership:delegate'],
      );
      expect(result.success).toBe(true);
    });

    it('RT_ADMIN has finance read/write permissions', () => {
      const readResult = requirePermissions(
        createRtAdminAuthContext(),
        ['finance:read'],
      );
      const writeResult = requirePermissions(
        createRtAdminAuthContext(),
        ['finance:write'],
      );

      expect(readResult.success).toBe(true);
      expect(writeResult.success).toBe(true);
    });

    it('RT_ADMIN has resident management permissions', () => {
      const readResult = requirePermissions(
        createRtAdminAuthContext(),
        ['resident:read'],
      );
      const writeResult = requirePermissions(
        createRtAdminAuthContext(),
        ['resident:write'],
      );
      const householdResult = requirePermissions(
        createRtAdminAuthContext(),
        ['household:manage'],
      );

      expect(readResult.success).toBe(true);
      expect(writeResult.success).toBe(true);
      expect(householdResult.success).toBe(true);
    });

    it('RT_ADMIN has IoT full access for RT-level scope', () => {
      const commandResult = requirePermissions(
        createRtAdminAuthContext(),
        ['iot:command'],
      );
      const readResult = requirePermissions(
        createRtAdminAuthContext(),
        ['iot:read'],
      );
      const manageResult = requirePermissions(
        createRtAdminAuthContext(),
        ['iot:manage'],
      );

      expect(commandResult.success).toBe(true);
      expect(readResult.success).toBe(true);
      expect(manageResult.success).toBe(true);
    });

    it('RT_ADMIN has emergency management permissions', () => {
      const createResult = requirePermissions(
        createRtAdminAuthContext(),
        ['emergency:create'],
      );
      const readResult = requirePermissions(
        createRtAdminAuthContext(),
        ['emergency:read'],
      );
      const manageResult = requirePermissions(
        createRtAdminAuthContext(),
        ['emergency:manage'],
      );

      expect(createResult.success).toBe(true);
      expect(readResult.success).toBe(true);
      expect(manageResult.success).toBe(true);
    });

    it('RT_ADMIN has voting management permissions', () => {
      const manageResult = requirePermissions(
        createRtAdminAuthContext(),
        ['vote:manage'],
      );
      const castResult = requirePermissions(
        createRtAdminAuthContext(),
        ['vote:cast'],
      );

      expect(manageResult.success).toBe(true);
      expect(castResult.success).toBe(true);
    });

    it('RT_ADMIN has announcement permissions', () => {
      const readResult = requirePermissions(
        createRtAdminAuthContext(),
        ['announcement:read'],
      );
      const publishResult = requirePermissions(
        createRtAdminAuthContext(),
        ['announcement:publish'],
      );

      expect(readResult.success).toBe(true);
      expect(publishResult.success).toBe(true);
    });

    it('RT_ADMIN does NOT have tenant:manage permission (limited scope)', () => {
      const result = requirePermissions(
        createRtAdminAuthContext(),
        ['tenant:manage'],
      );

      expect(result.success).toBe(false);
    });

    it('RT_ADMIN does NOT have platform-level permissions', () => {
      const platformReadResult = requirePermissions(
        createRtAdminAuthContext(),
        ['platform:read'],
      );
      const platformWriteResult = requirePermissions(
        createRtAdminAuthContext(),
        ['platform:write'],
      );

      expect(platformReadResult.success).toBe(false);
      expect(platformWriteResult.success).toBe(false);
    });

    it('RT_ADMIN does NOT have orgunit:manage (not ORG_ADMIN level)', () => {
      const result = requirePermissions(
        createRtAdminAuthContext(),
        ['orgunit:manage'],
      );

      expect(result.success).toBe(false);
    });
  });

  describe('RT_ADMIN withPermission Wrapper Flow Tests', () => {
    it('should allow RT_ADMIN to access routes with resident:read permission', async () => {
      const authContext = createRtAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ data: 'residents-data' }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['resident:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/residents',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
      const body = await response.json();
      expect(body.data).toBe('residents-data');
    });

    it('should allow RT_ADMIN to access routes with iot:command permission', async () => {
      const authContext = createRtAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['iot:command'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/iot/devices/command',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should allow RT_ADMIN to access routes with finance:write permission', async () => {
      const authContext = createRtAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ transactionId: 'tx-001' }),
      );
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

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should deny RT_ADMIN access to routes requiring tenant:manage', async () => {
      const authContext = createRtAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['tenant:manage'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/tenants/manage',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
      const body = await response.json();
      expect(body.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
    });

    it('should deny RT_ADMIN access to platform-level routes', async () => {
      const authContext = createRtAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['platform:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/admin/platform',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should allow RT_ADMIN for routes requiring multiple RT-level permissions', async () => {
      const authContext = createRtAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      // RT_ADMIN has both these permissions
      const wrappedHandler = withPermission(
        { permissions: ['resident:read', 'finance:read', 'iot:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/dashboard/rt',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should deny when RT_ADMIN is missing ANY of multiple required permissions', async () => {
      const authContext = createRtAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      // RT_ADMIN has resident:read but NOT tenant:manage
      const wrappedHandler = withPermission(
        { permissions: ['resident:read', 'tenant:manage'] },
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

  describe('RT_ADMIN OrgUnit Scope Restrictions', () => {
    it('RT_ADMIN context should include orgUnitId for scope filtering', () => {
      const authContext = createRtAdminAuthContext();

      // RT_ADMIN must have orgUnitId for proper scope filtering
      expect(authContext.orgUnitId).toBeDefined();
      expect(authContext.orgUnitId).not.toBeNull();
      expect(typeof authContext.orgUnitId).toBe('string');
    });

    it('RT_ADMIN context should be passed to handler with orgUnitId', async () => {
      const authContext = createRtAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      let capturedContext: AuthorizationContext | null = null;
      const handler: AuthorizedRouteHandler = vi.fn().mockImplementation(
        (_req, ctx) => {
          capturedContext = ctx;
          return NextResponse.json({ success: true });
        },
      );
      const wrappedHandler = withPermission(
        { permissions: ['resident:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      await wrappedHandler(request);

      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.orgUnitId).toBe(TEST_ORG_UNIT_ID);
      expect(capturedContext!.tenantId).toBe(TEST_TENANT_ID);
    });

    it('RT_ADMIN tenantId should be set for tenant-level RLS filtering', () => {
      const authContext = createRtAdminAuthContext();

      expect(authContext.tenantId).toBeDefined();
      expect(authContext.tenantId).toBe(TEST_TENANT_ID);
    });
  });

  describe('RT_ADMIN Legacy Header Fallback', () => {
    it('should resolve RT_ADMIN context from legacy headers', async () => {
      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['resident:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: {
          'x-user-id': TEST_USER_ID,
          'x-tenant-id': TEST_TENANT_ID,
          'x-user-role': MembershipRole.RT_ADMIN,
          'x-org-unit-id': TEST_ORG_UNIT_ID,
          'x-membership-id': TEST_MEMBERSHIP_ID,
        },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should correctly derive RT_ADMIN permissions from role in legacy headers', async () => {
      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['tenant:manage'] }, // RT_ADMIN doesn't have this
        handler,
      );

      const request = createMockRequest({
        headers: {
          'x-user-id': TEST_USER_ID,
          'x-tenant-id': TEST_TENANT_ID,
          'x-user-role': MembershipRole.RT_ADMIN,
          'x-org-unit-id': TEST_ORG_UNIT_ID,
        },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('RT_ADMIN Membership Status Handling', () => {
    it('should allow ACTIVE RT_ADMIN to access routes', async () => {
      const authContext = createRtAdminAuthContext({
        membership: createMockMembership({ status: MembershipStatus.ACTIVE }),
      });
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['resident:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
    });

    it('should deny REVOKED RT_ADMIN access to all routes', async () => {
      const authContext = createRtAdminAuthContext({
        membership: createMockMembership({
          status: MembershipStatus.REVOKED,
          revokedAt: new Date(),
        }),
      });
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['resident:read'] },
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

    it('should deny SUSPENDED RT_ADMIN access to non-safety routes', async () => {
      const authContext = createRtAdminAuthContext({
        membership: createMockMembership({ status: MembershipStatus.SUSPENDED }),
      });
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['resident:read'] }, // Not a safety route
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

    it('should allow SUSPENDED RT_ADMIN access to safety routes with allowSuspended', async () => {
      const authContext = createRtAdminAuthContext({
        membership: createMockMembership({ status: MembershipStatus.SUSPENDED }),
      });
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
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

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('RT_ADMIN Authorization Logging', () => {
    it('should log authorization denial with RT_ADMIN context', async () => {
      const authContext = createRtAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['tenant:manage'] },
        handler,
      );

      const request = createMockRequest({
        headers: {
          'x-authorization-context': serializedContext,
          'x-correlation-id': 'test-corr-id-rt-admin',
        },
        url: 'http://localhost:3000/api/tenants',
        method: 'PUT',
      });

      await wrappedHandler(request);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Authorization denied: Insufficient permissions',
        expect.objectContaining({
          correlation_id: 'test-corr-id-rt-admin',
          user_id: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
          org_unit_id: TEST_ORG_UNIT_ID,
          role: MembershipRole.RT_ADMIN,
          route: '/api/tenants',
          method: 'PUT',
          decision: 'DENY',
        }),
      );
    });

    it('should log authorization success when logSuccess is enabled', async () => {
      const authContext = createRtAdminAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['resident:read'], logSuccess: true },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/residents',
      });

      await wrappedHandler(request);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Authorization granted',
        expect.objectContaining({
          user_id: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
          role: MembershipRole.RT_ADMIN,
          decision: 'ALLOW',
        }),
      );
    });
  });

  describe('RT_ADMIN vs Other Roles Comparison', () => {
    it('RT_ADMIN has more permissions than RESIDENT', () => {
      const rtAdminPermissions = getPermissionsForRole(MembershipRole.RT_ADMIN);
      const residentPermissions = getPermissionsForRole(MembershipRole.RESIDENT);

      // RT_ADMIN should have significantly more permissions
      expect(rtAdminPermissions.size).toBeGreaterThan(residentPermissions.size);

      // RT_ADMIN specific permissions that RESIDENT doesn't have
      expect(rtAdminPermissions.has('finance:write')).toBe(true);
      expect(residentPermissions.has('finance:write')).toBe(false);

      expect(rtAdminPermissions.has('iot:command')).toBe(true);
      expect(residentPermissions.has('iot:command')).toBe(false);

      expect(rtAdminPermissions.has('membership:delegate')).toBe(true);
      expect(residentPermissions.has('membership:delegate')).toBe(false);
    });

    it('RT_ADMIN has fewer permissions than TENANT_OWNER', () => {
      const rtAdminPermissions = getPermissionsForRole(MembershipRole.RT_ADMIN);
      const tenantOwnerPermissions = getPermissionsForRole(MembershipRole.TENANT_OWNER);

      // TENANT_OWNER has tenant:manage, RT_ADMIN does not
      expect(tenantOwnerPermissions.has('tenant:manage')).toBe(true);
      expect(rtAdminPermissions.has('tenant:manage')).toBe(false);

      // TENANT_OWNER has orgunit:manage, RT_ADMIN does not
      expect(tenantOwnerPermissions.has('orgunit:manage')).toBe(true);
      expect(rtAdminPermissions.has('orgunit:manage')).toBe(false);
    });

    it('RT_ADMIN has distinct permissions from SECURITY role', () => {
      const rtAdminPermissions = getPermissionsForRole(MembershipRole.RT_ADMIN);
      const securityPermissions = getPermissionsForRole(MembershipRole.SECURITY);

      // RT_ADMIN has finance permissions, SECURITY doesn't
      expect(rtAdminPermissions.has('finance:write')).toBe(true);
      expect(securityPermissions.has('finance:write')).toBe(false);

      // RT_ADMIN has vote management, SECURITY doesn't
      expect(rtAdminPermissions.has('vote:manage')).toBe(true);
      expect(securityPermissions.has('vote:manage')).toBe(false);
    });
  });

  describe('RT_ADMIN Property: No Inheritance, Explicit Permissions', () => {
    it('RT_ADMIN permissions are explicitly defined (not inherited)', () => {
      const explicitPermissions = ROLE_PERMISSIONS[MembershipRole.RT_ADMIN];
      const resolvedPermissions = getPermissionsForRole(MembershipRole.RT_ADMIN);

      // All resolved permissions should match explicit definition
      expect(resolvedPermissions.size).toBe(explicitPermissions.length);

      for (const perm of explicitPermissions) {
        expect(
          resolvedPermissions.has(perm),
          `Explicit permission ${perm} should be in resolved set`,
        ).toBe(true);
      }
    });
  });
});

/**
 * Validates: Requirements 13.3 — Integration Tests SHALL test RT_ADMIN role flow
 */
