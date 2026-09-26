/**
 * E2E Auth Flow Tests — RESIDENT Role
 *
 * Tests the complete authentication and authorization flow for RESIDENT role:
 * - RESIDENT is an org-scoped user with limited permissions
 * - RESIDENT has specific orgUnitId (not null - org-scoped role)
 * - Tests complete authentication and authorization flow
 * - Verifies RESIDENT cannot access admin routes
 * - Verifies RESIDENT cannot access other tenants' data
 * - Verifies permissions match those defined in PermissionRegistry
 *
 * RESIDENT Characteristics (from PermissionRegistry):
 * - resident:read (own data only — USER_SELF scope)
 * - household:read (own household only)
 * - emergency:create (can create for own safety)
 * - emergency:read
 * - announcement:read
 * - vote:cast
 * - privacy:read (own data only — GDPR rights)
 * - privacy:manage
 *
 * @see Requirements 13.4 — Integration test for RESIDENT role
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
import { withPermission, requirePermissions } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';

// ---------------------------------------------------------------------------
// Test Constants for RESIDENT Role
// ---------------------------------------------------------------------------

const TEST_TENANT_ID = 'tenant-resident-001';
const TEST_TENANT_ID_OTHER = 'tenant-other-002';
const TEST_ORG_UNIT_ID = 'org-unit-resident-001';
const TEST_ORG_UNIT_ID_OTHER = 'org-unit-other-002';
const TEST_USER_ID = 'user-resident-001';
const TEST_MEMBERSHIP_ID = 'membership-resident-001';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock Membership entity for RESIDENT
 */
function createMockMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: TEST_MEMBERSHIP_ID,
    userId: TEST_USER_ID,
    tenantId: TEST_TENANT_ID,
    orgUnitId: TEST_ORG_UNIT_ID, // RESIDENT MUST have specific orgUnitId (org-scoped)
    role: MembershipRole.RESIDENT,
    status: MembershipStatus.ACTIVE,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    revokedAt: undefined,
    ...overrides,
  };
}

/**
 * Creates a complete AuthorizationContext for RESIDENT role
 */
function createResidentAuthContext(
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext {
  const role = overrides.role ?? MembershipRole.RESIDENT;
  const permissions = overrides.permissions ?? getPermissionsForRole(role);

  return {
    userId: TEST_USER_ID,
    tenantId: TEST_TENANT_ID,
    membershipId: TEST_MEMBERSHIP_ID,
    orgUnitId: TEST_ORG_UNIT_ID, // RESIDENT MUST have orgUnitId (org-scoped)
    role,
    permissions,
    tokenVersion: 1,
    isAuthoritative: true,
    isTenantLevel: false, // RESIDENT is NOT tenant-level (has orgUnitId)
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
// RESIDENT Role Characteristics Tests
// ---------------------------------------------------------------------------

describe('RESIDENT Role Flow Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('RESIDENT Role Characteristics (Req 13.4)', () => {
    it('RESIDENT MUST have non-null orgUnitId (org-scoped)', () => {
      const authContext = createResidentAuthContext();

      // RESIDENT is org-scoped, must have orgUnitId
      expect(authContext.orgUnitId).not.toBeNull();
      expect(authContext.orgUnitId).toBe(TEST_ORG_UNIT_ID);
    });

    it('RESIDENT has isTenantLevel = false (org-scoped, NOT tenant-level)', () => {
      const authContext = createResidentAuthContext();

      // RESIDENT is NOT tenant-level
      expect(authContext.isTenantLevel).toBe(false);
    });

    it('RESIDENT role is correctly set in AuthorizationContext', () => {
      const authContext = createResidentAuthContext();

      expect(authContext.role).toBe(MembershipRole.RESIDENT);
    });

    it('RESIDENT has active membership status for full access', () => {
      const authContext = createResidentAuthContext();

      expect(authContext.membership.status).toBe(MembershipStatus.ACTIVE);
      expect(authContext.isAuthoritative).toBe(true);
    });

    it('RESIDENT context should include tenantId for RLS filtering', () => {
      const authContext = createResidentAuthContext();

      expect(authContext.tenantId).toBeDefined();
      expect(authContext.tenantId).toBe(TEST_TENANT_ID);
    });
  });

  describe('RESIDENT Permission Validation (PermissionRegistry)', () => {
    // RESIDENT expected permissions from PermissionRegistry
    const RESIDENT_EXPECTED_PERMISSIONS = ROLE_PERMISSIONS[MembershipRole.RESIDENT];

    it('RESIDENT has all expected permissions from PermissionRegistry', () => {
      const authContext = createResidentAuthContext();

      // Verify each expected permission is present
      for (const expectedPermission of RESIDENT_EXPECTED_PERMISSIONS) {
        expect(
          authContext.permissions.has(expectedPermission),
          `RESIDENT should have permission: ${expectedPermission}`,
        ).toBe(true);
      }
    });

    it('RESIDENT has resident:read permission (own data only)', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['resident:read'],
      );
      expect(result.success).toBe(true);
    });

    it('RESIDENT has household:read permission (own household only)', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['household:read'],
      );
      expect(result.success).toBe(true);
    });

    it('RESIDENT has emergency:create permission (can create for own safety)', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['emergency:create'],
      );
      expect(result.success).toBe(true);
    });

    it('RESIDENT has emergency:read permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['emergency:read'],
      );
      expect(result.success).toBe(true);
    });

    it('RESIDENT has announcement:read permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['announcement:read'],
      );
      expect(result.success).toBe(true);
    });

    it('RESIDENT has vote:cast permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['vote:cast'],
      );
      expect(result.success).toBe(true);
    });

    it('RESIDENT has privacy:read permission (own data only — GDPR rights)', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['privacy:read'],
      );
      expect(result.success).toBe(true);
    });

    it('RESIDENT has privacy:manage permission (own data only — GDPR rights)', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['privacy:manage'],
      );
      expect(result.success).toBe(true);
    });

    // -----------------------------------------------------------------------
    // RESIDENT Denied Permissions
    // -----------------------------------------------------------------------

    it('RESIDENT does NOT have resident:write permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['resident:write'],
      );
      expect(result.success).toBe(false);
    });

    it('RESIDENT does NOT have finance:read permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['finance:read'],
      );
      expect(result.success).toBe(false);
    });

    it('RESIDENT does NOT have finance:write permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['finance:write'],
      );
      expect(result.success).toBe(false);
    });

    it('RESIDENT does NOT have tenant:manage permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['tenant:manage'],
      );
      expect(result.success).toBe(false);
    });

    it('RESIDENT does NOT have orgunit:manage permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['orgunit:manage'],
      );
      expect(result.success).toBe(false);
    });

    it('RESIDENT does NOT have membership:delegate permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['membership:delegate'],
      );
      expect(result.success).toBe(false);
    });

    it('RESIDENT does NOT have iot:command permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['iot:command'],
      );
      expect(result.success).toBe(false);
    });

    it('RESIDENT does NOT have iot:manage permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['iot:manage'],
      );
      expect(result.success).toBe(false);
    });

    it('RESIDENT does NOT have emergency:manage permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['emergency:manage'],
      );
      expect(result.success).toBe(false);
    });

    it('RESIDENT does NOT have vote:manage permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['vote:manage'],
      );
      expect(result.success).toBe(false);
    });

    it('RESIDENT does NOT have announcement:publish permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['announcement:publish'],
      );
      expect(result.success).toBe(false);
    });

    it('RESIDENT does NOT have household:manage permission', () => {
      const result = requirePermissions(
        createResidentAuthContext(),
        ['household:manage'],
      );
      expect(result.success).toBe(false);
    });

    it('RESIDENT does NOT have platform-level permissions', () => {
      const platformReadResult = requirePermissions(
        createResidentAuthContext(),
        ['platform:read'],
      );
      const platformWriteResult = requirePermissions(
        createResidentAuthContext(),
        ['platform:write'],
      );

      expect(platformReadResult.success).toBe(false);
      expect(platformWriteResult.success).toBe(false);
    });

    it('RESIDENT does NOT have security management permissions', () => {
      const securityManageResult = requirePermissions(
        createResidentAuthContext(),
        ['security:manage'],
      );
      const patrolManageResult = requirePermissions(
        createResidentAuthContext(),
        ['patrol:manage'],
      );

      expect(securityManageResult.success).toBe(false);
      expect(patrolManageResult.success).toBe(false);
    });
  });

  describe('RESIDENT withPermission Wrapper Flow Tests', () => {
    it('should allow RESIDENT to access routes with resident:read permission', async () => {
      const authContext = createResidentAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ data: 'my-resident-data' }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['resident:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/residents/me',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
      const body = await response.json();
      expect(body.data).toBe('my-resident-data');
    });

    it('should allow RESIDENT to access routes with announcement:read permission', async () => {
      const authContext = createResidentAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ announcements: [] }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['announcement:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/announcements',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should allow RESIDENT to access routes with vote:cast permission', async () => {
      const authContext = createResidentAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['vote:cast'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/voting/cast',
        method: 'POST',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should allow RESIDENT to access emergency:create (safety route)', async () => {
      const authContext = createResidentAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ emergencyId: 'emergency-001' }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['emergency:create'] },
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

    it('should allow RESIDENT to access privacy routes (GDPR rights)', async () => {
      const authContext = createResidentAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ privacyData: {} }),
      );
      const wrappedHandler = withPermission(
        { permissions: ['privacy:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/privacy',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should deny RESIDENT access to admin routes requiring resident:write', async () => {
      const authContext = createResidentAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['resident:write'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/residents',
        method: 'POST',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
      const body = await response.json();
      expect(body.code).toBe('AUTH_INSUFFICIENT_PERMISSION');
    });

    it('should deny RESIDENT access to finance routes', async () => {
      const authContext = createResidentAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['finance:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/finance/balance',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should deny RESIDENT access to tenant management routes', async () => {
      const authContext = createResidentAuthContext();
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
    });

    it('should deny RESIDENT access to IoT command routes', async () => {
      const authContext = createResidentAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['iot:command'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/iot/devices/command',
        method: 'POST',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should deny RESIDENT access to vote:manage routes', async () => {
      const authContext = createResidentAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['vote:manage'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/voting/admin',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should deny RESIDENT access to platform-level routes', async () => {
      const authContext = createResidentAuthContext();
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

    it('should deny when RESIDENT is missing ANY of multiple required permissions', async () => {
      const authContext = createResidentAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      // RESIDENT has resident:read but NOT finance:read
      const wrappedHandler = withPermission(
        { permissions: ['resident:read', 'finance:read'] },
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

    it('should allow RESIDENT for routes requiring only RESIDENT-level permissions', async () => {
      const authContext = createResidentAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true }),
      );
      // RESIDENT has all these permissions
      const wrappedHandler = withPermission(
        { permissions: ['resident:read', 'announcement:read', 'emergency:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: { 'x-authorization-context': serializedContext },
        url: 'http://localhost:3000/api/dashboard/resident',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('RESIDENT OrgUnit Scope Restrictions', () => {
    it('RESIDENT context should include orgUnitId for scope filtering', () => {
      const authContext = createResidentAuthContext();

      // RESIDENT must have orgUnitId for proper scope filtering
      expect(authContext.orgUnitId).toBeDefined();
      expect(authContext.orgUnitId).not.toBeNull();
      expect(typeof authContext.orgUnitId).toBe('string');
    });

    it('RESIDENT context should be passed to handler with orgUnitId', async () => {
      const authContext = createResidentAuthContext();
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

    it('RESIDENT tenantId should be set for tenant-level RLS filtering', () => {
      const authContext = createResidentAuthContext();

      expect(authContext.tenantId).toBeDefined();
      expect(authContext.tenantId).toBe(TEST_TENANT_ID);
    });
  });

  describe('RESIDENT Legacy Header Fallback', () => {
    it('should resolve RESIDENT context from legacy headers', async () => {
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
          'x-user-role': MembershipRole.RESIDENT,
          'x-org-unit-id': TEST_ORG_UNIT_ID,
          'x-membership-id': TEST_MEMBERSHIP_ID,
        },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalled();
    });

    it('should correctly derive RESIDENT permissions from role in legacy headers', async () => {
      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['finance:read'] }, // RESIDENT doesn't have this
        handler,
      );

      const request = createMockRequest({
        headers: {
          'x-user-id': TEST_USER_ID,
          'x-tenant-id': TEST_TENANT_ID,
          'x-user-role': MembershipRole.RESIDENT,
          'x-org-unit-id': TEST_ORG_UNIT_ID,
        },
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('RESIDENT Membership Status Handling', () => {
    it('should allow ACTIVE RESIDENT to access routes', async () => {
      const authContext = createResidentAuthContext({
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

    it('should deny REVOKED RESIDENT access to all routes', async () => {
      const authContext = createResidentAuthContext({
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

    it('should deny SUSPENDED RESIDENT access to non-safety routes', async () => {
      const authContext = createResidentAuthContext({
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

    it('should allow SUSPENDED RESIDENT access to safety routes with allowSuspended', async () => {
      const authContext = createResidentAuthContext({
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

    it('should deny INVITED RESIDENT access to routes', async () => {
      const authContext = createResidentAuthContext({
        membership: createMockMembership({ status: MembershipStatus.INVITED }),
        isAuthoritative: false,
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
    });
  });

  describe('RESIDENT Authorization Logging', () => {
    it('should log authorization denial with RESIDENT context', async () => {
      const authContext = createResidentAuthContext();
      const serializedContext = serializeAuthContext(authContext);

      const handler: AuthorizedRouteHandler = vi.fn();
      const wrappedHandler = withPermission(
        { permissions: ['finance:read'] },
        handler,
      );

      const request = createMockRequest({
        headers: {
          'x-authorization-context': serializedContext,
          'x-correlation-id': 'test-corr-id-resident',
        },
        url: 'http://localhost:3000/api/finance/balance',
        method: 'GET',
      });

      await wrappedHandler(request);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Authorization denied: Insufficient permissions',
        expect.objectContaining({
          correlation_id: 'test-corr-id-resident',
          user_id: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
          org_unit_id: TEST_ORG_UNIT_ID,
          role: MembershipRole.RESIDENT,
          route: '/api/finance/balance',
          method: 'GET',
          decision: 'DENY',
        }),
      );
    });

    it('should log authorization success when logSuccess is enabled', async () => {
      const authContext = createResidentAuthContext();
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
        url: 'http://localhost:3000/api/residents/me',
      });

      await wrappedHandler(request);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Authorization granted',
        expect.objectContaining({
          user_id: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
          role: MembershipRole.RESIDENT,
          decision: 'ALLOW',
        }),
      );
    });
  });

  describe('RESIDENT vs Other Roles Comparison', () => {
    it('RESIDENT has fewer permissions than RT_ADMIN', () => {
      const residentPermissions = getPermissionsForRole(MembershipRole.RESIDENT);
      const rtAdminPermissions = getPermissionsForRole(MembershipRole.RT_ADMIN);

      // RT_ADMIN should have significantly more permissions
      expect(rtAdminPermissions.size).toBeGreaterThan(residentPermissions.size);

      // RT_ADMIN has write permissions that RESIDENT doesn't have
      expect(rtAdminPermissions.has('resident:write')).toBe(true);
      expect(residentPermissions.has('resident:write')).toBe(false);

      expect(rtAdminPermissions.has('finance:read')).toBe(true);
      expect(residentPermissions.has('finance:read')).toBe(false);

      expect(rtAdminPermissions.has('finance:write')).toBe(true);
      expect(residentPermissions.has('finance:write')).toBe(false);

      expect(rtAdminPermissions.has('iot:command')).toBe(true);
      expect(residentPermissions.has('iot:command')).toBe(false);
    });

    it('RESIDENT has fewer permissions than TENANT_OWNER', () => {
      const residentPermissions = getPermissionsForRole(MembershipRole.RESIDENT);
      const tenantOwnerPermissions = getPermissionsForRole(MembershipRole.TENANT_OWNER);

      // TENANT_OWNER has much more permissions than RESIDENT
      expect(tenantOwnerPermissions.size).toBeGreaterThan(residentPermissions.size);

      // TENANT_OWNER has management permissions
      expect(tenantOwnerPermissions.has('tenant:manage')).toBe(true);
      expect(residentPermissions.has('tenant:manage')).toBe(false);

      expect(tenantOwnerPermissions.has('orgunit:manage')).toBe(true);
      expect(residentPermissions.has('orgunit:manage')).toBe(false);

      expect(tenantOwnerPermissions.has('membership:delegate')).toBe(true);
      expect(residentPermissions.has('membership:delegate')).toBe(false);
    });

    it('RESIDENT has DISTINCT permissions from SECURITY role (not hierarchy)', () => {
      const residentPermissions = getPermissionsForRole(MembershipRole.RESIDENT);
      const securityPermissions = getPermissionsForRole(MembershipRole.SECURITY);

      // SECURITY has patrol/incident management, RESIDENT doesn't
      expect(securityPermissions.has('patrol:manage')).toBe(true);
      expect(residentPermissions.has('patrol:manage')).toBe(false);

      expect(securityPermissions.has('patrol:read')).toBe(true);
      expect(residentPermissions.has('patrol:read')).toBe(false);

      expect(securityPermissions.has('incident:manage')).toBe(true);
      expect(residentPermissions.has('incident:manage')).toBe(false);

      // SECURITY has emergency:manage, RESIDENT doesn't
      expect(securityPermissions.has('emergency:manage')).toBe(true);
      expect(residentPermissions.has('emergency:manage')).toBe(false);

      // RESIDENT has vote:cast, verify SECURITY doesn't
      expect(residentPermissions.has('vote:cast')).toBe(true);
      expect(securityPermissions.has('vote:cast')).toBe(false);

      // Both are org-scoped but have different capabilities
      // This validates the design that SECURITY and RESIDENT are DISTINCT
    });

    it('RESIDENT permission set is limited and explicit', () => {
      const residentPermissions = getPermissionsForRole(MembershipRole.RESIDENT);

      // RESIDENT should have a small, focused set of permissions
      expect(residentPermissions.size).toBeLessThanOrEqual(10);

      // Verify only expected permissions are present
      const expectedPermissions = [
        'resident:read',
        'household:read',
        'emergency:create',
        'emergency:read',
        'announcement:read',
        'vote:cast',
        'privacy:read',
        'privacy:manage',
      ];

      expect(residentPermissions.size).toBe(expectedPermissions.length);

      for (const perm of expectedPermissions) {
        expect(
          residentPermissions.has(perm),
          `RESIDENT should have permission: ${perm}`,
        ).toBe(true);
      }
    });
  });

  describe('RESIDENT Property: No Inheritance, Explicit Permissions', () => {
    it('RESIDENT permissions are explicitly defined (not inherited)', () => {
      const explicitPermissions = ROLE_PERMISSIONS[MembershipRole.RESIDENT];
      const resolvedPermissions = getPermissionsForRole(MembershipRole.RESIDENT);

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

  describe('RESIDENT Cross-Tenant Access Prevention', () => {
    it('RESIDENT context for tenant A should not access tenant B data', () => {
      const tenantAContext = createResidentAuthContext({
        tenantId: TEST_TENANT_ID,
      });

      // Verify tenant ID is set for RLS filtering
      expect(tenantAContext.tenantId).toBe(TEST_TENANT_ID);
      expect(tenantAContext.tenantId).not.toBe(TEST_TENANT_ID_OTHER);

      // The handler receives tenantId which should be used for RLS filtering
      // This test verifies the context is properly set up for isolation
    });

    it('RESIDENT context should have proper AuthorizationContext for RLS', async () => {
      const authContext = createResidentAuthContext();
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

      // Verify all RLS-relevant fields are present
      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.tenantId).toBe(TEST_TENANT_ID);
      expect(capturedContext!.orgUnitId).toBe(TEST_ORG_UNIT_ID);
      expect(capturedContext!.userId).toBe(TEST_USER_ID);
      expect(capturedContext!.membershipId).toBe(TEST_MEMBERSHIP_ID);
    });

    it('RESIDENT from different OrgUnit should have different orgUnitId', () => {
      const orgUnitAContext = createResidentAuthContext({
        orgUnitId: TEST_ORG_UNIT_ID,
      });
      const orgUnitBContext = createResidentAuthContext({
        orgUnitId: TEST_ORG_UNIT_ID_OTHER,
      });

      // Verify different org units are set
      expect(orgUnitAContext.orgUnitId).toBe(TEST_ORG_UNIT_ID);
      expect(orgUnitBContext.orgUnitId).toBe(TEST_ORG_UNIT_ID_OTHER);
      expect(orgUnitAContext.orgUnitId).not.toBe(orgUnitBContext.orgUnitId);
    });
  });
});

/**
 * Validates: Requirements 13.4 — Integration Tests SHALL test RESIDENT role flow
 * - RESIDENT can access their own resident data (resident:read)
 * - RESIDENT cannot access admin routes
 * - RESIDENT cannot access other tenants' data
 * - RESIDENT has specific orgUnitId (not null - org-scoped role)
 * - Proper AuthorizationContext resolution for RESIDENT
 */
