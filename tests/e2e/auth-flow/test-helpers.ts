/**
 * E2E Test Infrastructure — Auth Flow Helpers
 *
 * Provides utilities for E2E auth flow testing including:
 * - Mock membership and authorization context creation
 * - Test data generation for different roles
 * - Request builder with proper auth headers
 * - JWT token simulation
 *
 * @see Requirements 13 (Integration Test Suite for Auth Flow)
 */

import { NextRequest } from 'next/server';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { Membership } from '@core/domains/membership/entities';
import { MembershipRole, MembershipStatus, TENANT_LEVEL_ROLES } from '@core/domains/membership/types';
import { getPermissionsForRole } from '@core/domains/authorization/permissions/PermissionRegistry';

// ---------------------------------------------------------------------------
// Test Data Interfaces
// ---------------------------------------------------------------------------

export interface TestUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly tokenVersion: number;
}

export interface TestTenant {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface TestOrgUnit {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly type: 'RW' | 'RT';
  readonly parentId: string | null;
}

export interface TestMembershipSetup {
  readonly user: TestUser;
  readonly tenant: TestTenant;
  readonly orgUnit: TestOrgUnit | null; // null for tenant-level roles
  readonly role: MembershipRole;
  readonly status?: MembershipStatus;
}

// ---------------------------------------------------------------------------
// Test Data Generators
// ---------------------------------------------------------------------------

/**
 * Creates a test user with unique identifiers.
 */
export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  const id = overrides.id ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    email: overrides.email ?? `${id}@test.societ-rt.local`,
    name: overrides.name ?? `Test User ${id.slice(-6)}`,
    tokenVersion: overrides.tokenVersion ?? 1,
  };
}

/**
 * Creates a test tenant with unique identifiers.
 */
export function createTestTenant(overrides: Partial<TestTenant> = {}): TestTenant {
  const id = overrides.id ?? `tenant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    name: overrides.name ?? `Test Tenant ${id.slice(-6)}`,
    slug: overrides.slug ?? `tenant-${id.slice(-6)}`,
  };
}

/**
 * Creates a test org unit with unique identifiers.
 */
export function createTestOrgUnit(
  tenantId: string,
  overrides: Partial<Omit<TestOrgUnit, 'tenantId'>> = {},
): TestOrgUnit {
  const id = overrides.id ?? `orgunit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    tenantId,
    name: overrides.name ?? `Test OrgUnit ${id.slice(-6)}`,
    type: overrides.type ?? 'RT',
    parentId: overrides.parentId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Mock Membership and AuthorizationContext Creation
// ---------------------------------------------------------------------------

/**
 * Creates a mock Membership entity for testing.
 */
export function createMockMembership(setup: TestMembershipSetup): Membership {
  return {
    id: `membership-${setup.user.id}-${setup.tenant.id}`,
    userId: setup.user.id,
    tenantId: setup.tenant.id,
    orgUnitId: setup.orgUnit?.id ?? null,
    role: setup.role,
    status: setup.status ?? MembershipStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    revokedAt: undefined,
  };
}

/**
 * Creates a mock AuthorizationContext for testing.
 *
 * This is the primary helper for creating auth contexts in E2E tests.
 * It properly handles tenant-level vs org-scoped roles.
 */
export function createMockAuthContext(
  setup: TestMembershipSetup,
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext {
  const membership = createMockMembership(setup);
  const permissions = getPermissionsForRole(setup.role);
  const isTenantLevel = TENANT_LEVEL_ROLES.has(setup.role);

  // Validate org unit alignment with role
  if (isTenantLevel && setup.orgUnit !== null) {
    throw new Error(
      `Tenant-level role ${setup.role} must have orgUnit = null, but got orgUnit with id ${setup.orgUnit.id}`,
    );
  }
  if (!isTenantLevel && setup.orgUnit === null) {
    throw new Error(
      `Org-scoped role ${setup.role} must have an orgUnit, but got orgUnit = null`,
    );
  }

  return {
    userId: setup.user.id,
    tenantId: setup.tenant.id,
    membershipId: membership.id,
    orgUnitId: setup.orgUnit?.id ?? null,
    role: setup.role,
    permissions,
    tokenVersion: setup.user.tokenVersion,
    isAuthoritative: membership.status === MembershipStatus.ACTIVE,
    isTenantLevel,
    membership,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Request Builders
// ---------------------------------------------------------------------------

/**
 * Serializes an AuthorizationContext for header transmission.
 */
export function serializeAuthContext(context: AuthorizationContext): string {
  return JSON.stringify({
    ...context,
    permissions: Array.from(context.permissions),
  });
}

/**
 * Creates a NextRequest with proper authorization headers.
 */
export function createAuthenticatedRequest(
  url: string,
  authContext: AuthorizationContext,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const headers = new Headers({
    'x-authorization-context': serializeAuthContext(authContext),
    'x-user-id': authContext.userId,
    'x-tenant-id': authContext.tenantId,
    'x-membership-id': authContext.membershipId,
    'x-org-unit-id': authContext.orgUnitId ?? '',
    'x-user-role': authContext.role,
    'x-token-version': String(authContext.tokenVersion),
    'x-correlation-id': `test-correlation-${Date.now()}`,
    'Content-Type': 'application/json',
    ...options.headers,
  });

  const init = {
    method: options.method ?? 'GET',
    headers,
    body: undefined as string | undefined,
  };

  if (options.body && options.method !== 'GET' && options.method !== 'HEAD') {
    init.body = JSON.stringify(options.body);
  }

  return new NextRequest(`http://localhost:3000${url}`, init);
}

/**
 * Creates a request without authorization (for testing 401 responses).
 */
export function createUnauthenticatedRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'x-correlation-id': `test-correlation-${Date.now()}`,
    ...options.headers,
  });

  const init = {
    method: options.method ?? 'GET',
    headers,
    body: undefined as string | undefined,
  };

  if (options.body && options.method !== 'GET' && options.method !== 'HEAD') {
    init.body = JSON.stringify(options.body);
  }

  return new NextRequest(`http://localhost:3000${url}`, init);
}

// ---------------------------------------------------------------------------
// Pre-configured Test Setups for Common Roles
// ---------------------------------------------------------------------------

/**
 * Creates a complete PLATFORM_ADMIN test setup.
 *
 * PLATFORM_ADMIN characteristics:
 * - Has tenant-level admin access (orgUnitId = null)
 * - Can access tenant management routes
 * - Has explicit platform-level permissions only
 * - NO implicit tenant data access
 *
 * @see Requirements 13.2
 */
export function createPlatformAdminSetup(
  tenant?: TestTenant,
  user?: TestUser,
): TestMembershipSetup {
  return {
    user: user ?? createTestUser({ name: 'Platform Admin User' }),
    tenant: tenant ?? createTestTenant({ name: 'Platform Admin Tenant' }),
    orgUnit: null, // PLATFORM_ADMIN is tenant-level, orgUnitId must be null
    role: MembershipRole.PLATFORM_ADMIN,
    status: MembershipStatus.ACTIVE,
  };
}

/**
 * Creates a complete TENANT_OWNER test setup.
 *
 * TENANT_OWNER characteristics:
 * - Has tenant-level scope (orgUnitId = null)
 * - Full tenant-wide access
 * - Can delegate most roles
 */
export function createTenantOwnerSetup(
  tenant?: TestTenant,
  user?: TestUser,
): TestMembershipSetup {
  return {
    user: user ?? createTestUser({ name: 'Tenant Owner User' }),
    tenant: tenant ?? createTestTenant({ name: 'Tenant Owner Tenant' }),
    orgUnit: null, // TENANT_OWNER is tenant-level, orgUnitId must be null
    role: MembershipRole.TENANT_OWNER,
    status: MembershipStatus.ACTIVE,
  };
}

/**
 * Creates a complete RT_ADMIN test setup.
 *
 * RT_ADMIN characteristics:
 * - Has org-scoped access (orgUnitId required)
 * - Manages RT-level operations
 * - Can delegate SECURITY, RESIDENT within scope
 */
export function createRtAdminSetup(
  tenant?: TestTenant,
  user?: TestUser,
  orgUnit?: TestOrgUnit,
): TestMembershipSetup {
  const testTenant = tenant ?? createTestTenant({ name: 'RT Admin Tenant' });
  return {
    user: user ?? createTestUser({ name: 'RT Admin User' }),
    tenant: testTenant,
    orgUnit: orgUnit ?? createTestOrgUnit(testTenant.id, { name: 'RT Admin OrgUnit' }),
    role: MembershipRole.RT_ADMIN,
    status: MembershipStatus.ACTIVE,
  };
}

/**
 * Creates a complete RESIDENT test setup.
 *
 * RESIDENT characteristics:
 * - Has org-scoped access (orgUnitId required)
 * - Basic access rights for community participation
 * - Distinct permission set from SECURITY
 */
export function createResidentSetup(
  tenant?: TestTenant,
  user?: TestUser,
  orgUnit?: TestOrgUnit,
): TestMembershipSetup {
  const testTenant = tenant ?? createTestTenant({ name: 'Resident Tenant' });
  return {
    user: user ?? createTestUser({ name: 'Resident User' }),
    tenant: testTenant,
    orgUnit: orgUnit ?? createTestOrgUnit(testTenant.id, { name: 'Resident OrgUnit' }),
    role: MembershipRole.RESIDENT,
    status: MembershipStatus.ACTIVE,
  };
}

/**
 * Creates a complete SECURITY test setup.
 *
 * SECURITY characteristics:
 * - Has org-scoped access (orgUnitId required)
 * - Monitor security, respond to alerts
 * - Distinct permission set from RESIDENT
 */
export function createSecuritySetup(
  tenant?: TestTenant,
  user?: TestUser,
  orgUnit?: TestOrgUnit,
): TestMembershipSetup {
  const testTenant = tenant ?? createTestTenant({ name: 'Security Tenant' });
  return {
    user: user ?? createTestUser({ name: 'Security User' }),
    tenant: testTenant,
    orgUnit: orgUnit ?? createTestOrgUnit(testTenant.id, { name: 'Security OrgUnit' }),
    role: MembershipRole.SECURITY,
    status: MembershipStatus.ACTIVE,
  };
}

// ---------------------------------------------------------------------------
// Assertion Helpers
// ---------------------------------------------------------------------------

/**
 * Asserts that a response indicates successful authorization (2xx status).
 */
export function assertAuthorized(response: Response, statusCode = 200): void {
  if (response.status !== statusCode) {
    throw new Error(
      `Expected status ${statusCode} (authorized), but got ${response.status}`,
    );
  }
}

/**
 * Asserts that a response indicates authorization failure (401 or 403).
 */
export function assertUnauthorized(response: Response): void {
  if (response.status !== 401 && response.status !== 403) {
    throw new Error(
      `Expected status 401 or 403 (unauthorized), but got ${response.status}`,
    );
  }
}

/**
 * Asserts that a response indicates insufficient permissions (403).
 */
export function assertInsufficientPermissions(response: Response): void {
  if (response.status !== 403) {
    throw new Error(
      `Expected status 403 (insufficient permissions), but got ${response.status}`,
    );
  }
}
