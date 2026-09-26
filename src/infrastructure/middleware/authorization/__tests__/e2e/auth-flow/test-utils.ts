/**
 * E2E Auth Flow Test Utilities
 *
 * Shared utilities for E2E authentication and authorization flow testing.
 * These utilities support testing complete auth flows for different roles:
 * - JWT generation and validation
 * - AuthorizationContext creation
 * - Mock request creation with auth headers
 *
 * @see Task 22.1: Create E2E test infrastructure
 * @see Requirement 13: Integration Test Suite for Auth Flow
 */

import { NextRequest, NextResponse } from 'next/server';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { Membership } from '@core/domains/membership/entities';
import { getPermissionsForRole } from '@core/domains/authorization/permissions/PermissionRegistry';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for creating a test user context
 */
export interface TestUserContext {
  userId: string;
  tenantId: string;
  orgUnitId: string | null;
  role: MembershipRole;
  membershipId: string;
  membershipStatus: MembershipStatus;
  tokenVersion: number;
}

/**
 * Configuration for creating auth flow test requests
 */
export interface AuthFlowTestConfig {
  user: TestUserContext;
  targetRoute: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  requiredPermissions: string[];
  expectedOutcome: 'allow' | 'deny_permission' | 'deny_membership_status';
}

/**
 * Result of an auth flow test
 */
export interface AuthFlowTestResult {
  request: NextRequest;
  authContext: AuthorizationContext;
  serializedContext: string;
  correlationId: string;
}

// ---------------------------------------------------------------------------
// UUID Generation
// ---------------------------------------------------------------------------

/**
 * Generate a test-friendly UUID
 */
export function generateTestUuid(prefix: string = 'test'): string {
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}-${random}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Mock Data Factories
// ---------------------------------------------------------------------------

/**
 * Creates a mock membership entity for testing
 */
export function createMockMembership(
  overrides: Partial<Membership> = {},
): Membership {
  return {
    id: overrides.id ?? generateTestUuid('membership'),
    userId: overrides.userId ?? generateTestUuid('user'),
    tenantId: overrides.tenantId ?? generateTestUuid('tenant'),
    orgUnitId: overrides.orgUnitId ?? generateTestUuid('orgunit'),
    role: overrides.role ?? MembershipRole.RESIDENT,
    status: overrides.status ?? MembershipStatus.ACTIVE,
    createdAt: overrides.createdAt ?? new Date('2024-01-01'),
    updatedAt: overrides.updatedAt ?? new Date('2024-01-01'),
    revokedAt: overrides.revokedAt,
  };
}

/**
 * Creates a mock AuthorizationContext for testing
 */
export function createMockAuthContext(
  overrides: Partial<AuthorizationContext> = {},
): AuthorizationContext {
  const role = overrides.role ?? MembershipRole.RESIDENT;
  const permissions = overrides.permissions ?? getPermissionsForRole(role);
  const membership = overrides.membership ?? createMockMembership({ role });

  return {
    userId: overrides.userId ?? membership.userId,
    tenantId: overrides.tenantId ?? membership.tenantId,
    membershipId: overrides.membershipId ?? membership.id,
    orgUnitId: overrides.orgUnitId ?? membership.orgUnitId,
    role,
    permissions,
    tokenVersion: overrides.tokenVersion ?? 1,
    isAuthoritative: overrides.isAuthoritative ?? (membership.status === MembershipStatus.ACTIVE),
    isTenantLevel: overrides.isTenantLevel ?? (membership.orgUnitId === null),
    membership,
  };
}

/**
 * Creates a test user context with default values
 */
export function createTestUserContext(
  overrides: Partial<TestUserContext> = {},
): TestUserContext {
  return {
    userId: overrides.userId ?? generateTestUuid('user'),
    tenantId: overrides.tenantId ?? generateTestUuid('tenant'),
    orgUnitId: overrides.orgUnitId ?? generateTestUuid('orgunit'),
    role: overrides.role ?? MembershipRole.RESIDENT,
    membershipId: overrides.membershipId ?? generateTestUuid('membership'),
    membershipStatus: overrides.membershipStatus ?? MembershipStatus.ACTIVE,
    tokenVersion: overrides.tokenVersion ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Role-Specific User Context Factories
// ---------------------------------------------------------------------------

/**
 * Creates a PLATFORM_ADMIN user context (tenant-level, no orgUnitId)
 */
export function createPlatformAdminContext(
  overrides: Partial<TestUserContext> = {},
): TestUserContext {
  return createTestUserContext({
    role: MembershipRole.PLATFORM_ADMIN,
    orgUnitId: null, // Tenant-level admin
    ...overrides,
  });
}

/**
 * Creates a TENANT_OWNER user context (tenant-level, no orgUnitId)
 */
export function createTenantOwnerContext(
  overrides: Partial<TestUserContext> = {},
): TestUserContext {
  return createTestUserContext({
    role: MembershipRole.TENANT_OWNER,
    orgUnitId: null, // Tenant-level admin
    ...overrides,
  });
}

/**
 * Creates an ORG_ADMIN user context (org-scoped)
 */
export function createOrgAdminContext(
  overrides: Partial<TestUserContext> = {},
): TestUserContext {
  return createTestUserContext({
    role: MembershipRole.ORG_ADMIN,
    orgUnitId: overrides.orgUnitId ?? generateTestUuid('orgunit'),
    ...overrides,
  });
}

/**
 * Creates an RT_ADMIN user context (RT-scoped)
 */
export function createRtAdminContext(
  overrides: Partial<TestUserContext> = {},
): TestUserContext {
  return createTestUserContext({
    role: MembershipRole.RT_ADMIN,
    orgUnitId: overrides.orgUnitId ?? generateTestUuid('rt-orgunit'),
    ...overrides,
  });
}

/**
 * Creates a SECURITY user context
 */
export function createSecurityContext(
  overrides: Partial<TestUserContext> = {},
): TestUserContext {
  return createTestUserContext({
    role: MembershipRole.SECURITY,
    orgUnitId: overrides.orgUnitId ?? generateTestUuid('orgunit'),
    ...overrides,
  });
}

/**
 * Creates a RESIDENT user context (limited permissions)
 */
export function createResidentContext(
  overrides: Partial<TestUserContext> = {},
): TestUserContext {
  return createTestUserContext({
    role: MembershipRole.RESIDENT,
    orgUnitId: overrides.orgUnitId ?? generateTestUuid('orgunit'),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Request Creation
// ---------------------------------------------------------------------------

/**
 * Serializes an AuthorizationContext to JSON for header transmission
 */
export function serializeAuthContext(context: AuthorizationContext): string {
  // Convert permissions Set to array for JSON serialization
  return JSON.stringify({
    ...context,
    permissions: Array.from(context.permissions),
  });
}

/**
 * Creates a mock NextRequest with authentication headers
 */
export function createAuthenticatedRequest(
  url: string,
  method: string,
  authContext: AuthorizationContext,
  additionalHeaders: Record<string, string> = {},
): NextRequest {
  const correlationId = generateCorrelationId();
  const serializedContext = serializeAuthContext(authContext);

  const headers = new Headers({
    'x-authorization-context': serializedContext,
    'x-user-id': authContext.userId,
    'x-tenant-id': authContext.tenantId,
    'x-membership-id': authContext.membershipId,
    'x-org-unit-id': authContext.orgUnitId ?? '',
    'x-user-role': authContext.role,
    'x-token-version': authContext.tokenVersion.toString(),
    'x-correlation-id': correlationId,
    ...additionalHeaders,
  });

  return new NextRequest(url, { method, headers });
}

/**
 * Creates a mock NextRequest without authentication (for testing unauthenticated access)
 */
export function createUnauthenticatedRequest(
  url: string,
  method: string,
  additionalHeaders: Record<string, string> = {},
): NextRequest {
  const correlationId = generateCorrelationId();

  const headers = new Headers({
    'x-correlation-id': correlationId,
    ...additionalHeaders,
  });

  return new NextRequest(url, { method, headers });
}

/**
 * Creates an AuthorizationContext from a TestUserContext
 */
export function userContextToAuthContext(user: TestUserContext): AuthorizationContext {
  const membership = createMockMembership({
    id: user.membershipId,
    userId: user.userId,
    tenantId: user.tenantId,
    orgUnitId: user.orgUnitId,
    role: user.role,
    status: user.membershipStatus,
  });

  return createMockAuthContext({
    userId: user.userId,
    tenantId: user.tenantId,
    membershipId: user.membershipId,
    orgUnitId: user.orgUnitId,
    role: user.role,
    tokenVersion: user.tokenVersion,
    isAuthoritative: user.membershipStatus === MembershipStatus.ACTIVE,
    isTenantLevel: user.orgUnitId === null,
    membership,
  });
}

/**
 * Creates a full auth flow test setup
 */
export function createAuthFlowTestSetup(
  user: TestUserContext,
  route: string,
  method: string = 'GET',
): AuthFlowTestResult {
  const authContext = userContextToAuthContext(user);
  const serializedContext = serializeAuthContext(authContext);
  const correlationId = generateCorrelationId();

  const request = createAuthenticatedRequest(
    `http://localhost:3000${route}`,
    method,
    authContext,
  );

  return {
    request,
    authContext,
    serializedContext,
    correlationId,
  };
}

// ---------------------------------------------------------------------------
// Response Assertion Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts JSON body from NextResponse
 */
export async function getResponseBody<T>(response: NextResponse): Promise<T> {
  const text = await response.text();
  return JSON.parse(text) as T;
}

/**
 * Asserts that a response indicates successful authorization
 */
export function assertAuthorizationAllowed(response: NextResponse): void {
  if (response.status >= 400) {
    throw new Error(
      `Expected authorization to be allowed, but got status ${response.status}`,
    );
  }
}

/**
 * Asserts that a response indicates authorization denial due to insufficient permissions
 */
export async function assertAuthorizationDeniedPermission(
  response: NextResponse,
): Promise<void> {
  if (response.status !== 403) {
    throw new Error(
      `Expected 403 for permission denial, but got status ${response.status}`,
    );
  }

  const body = await getResponseBody<{ code: string }>(response);
  if (body.code !== 'AUTH_INSUFFICIENT_PERMISSION') {
    throw new Error(
      `Expected AUTH_INSUFFICIENT_PERMISSION, but got ${body.code}`,
    );
  }
}

/**
 * Asserts that a response indicates authorization denial due to membership status
 */
export async function assertAuthorizationDeniedMembershipStatus(
  response: NextResponse,
  expectedCode: 'AUTH_MEMBERSHIP_INACTIVE' | 'AUTH_MEMBERSHIP_SUSPENDED',
): Promise<void> {
  if (response.status !== 403) {
    throw new Error(
      `Expected 403 for membership status denial, but got status ${response.status}`,
    );
  }

  const body = await getResponseBody<{ code: string }>(response);
  if (body.code !== expectedCode) {
    throw new Error(`Expected ${expectedCode}, but got ${body.code}`);
  }
}

/**
 * Asserts that a response indicates authentication failure
 */
export async function assertAuthenticationFailed(
  response: NextResponse,
): Promise<void> {
  if (response.status !== 401) {
    throw new Error(
      `Expected 401 for authentication failure, but got status ${response.status}`,
    );
  }

  const body = await getResponseBody<{ code: string }>(response);
  if (body.code !== 'AUTH_TOKEN_INVALID') {
    throw new Error(`Expected AUTH_TOKEN_INVALID, but got ${body.code}`);
  }
}

// ---------------------------------------------------------------------------
// Permission Test Helpers
// ---------------------------------------------------------------------------

/**
 * Gets the list of permissions that a role DOES have
 */
export function getRolePermissions(role: MembershipRole): string[] {
  return Array.from(getPermissionsForRole(role));
}

/**
 * Gets a permission that the role does NOT have (for testing denial)
 */
export function getPermissionNotInRole(
  role: MembershipRole,
  excludePermissions: string[] = [],
): string {
  const rolePermissions = new Set(getPermissionsForRole(role));
  
  // List of all available permissions (from PermissionRegistry)
  const allPermissions = [
    'platform:read',
    'platform:write',
    'platform:audit',
    'platform:tenant_provision',
    'platform:tenant_suspend',
    'platform:tenant_terminate',
    'platform:subscription_manage',
    'platform:anomaly_review',
    'platform:anomaly_remediate',
    'tenant:manage',
    'orgunit:manage',
    'orgunit:read',
    'membership:delegate',
    'membership:read',
    'finance:read',
    'finance:write',
    'resident:read',
    'resident:write',
    'household:manage',
    'household:read',
    'announcement:read',
    'announcement:publish',
    'vote:manage',
    'vote:cast',
    'iot:command',
    'iot:read',
    'iot:manage',
    'emergency:create',
    'emergency:read',
    'emergency:manage',
    'security:manage',
    'security:read',
    'patrol:manage',
    'patrol:read',
    'incident:manage',
    'incident:report',
    'privacy:read',
    'privacy:manage',
  ];

  // Find a permission the role doesn't have
  for (const perm of allPermissions) {
    if (!rolePermissions.has(perm) && !excludePermissions.includes(perm)) {
      return perm;
    }
  }

  throw new Error(`No permission found that role ${role} doesn't have`);
}

/**
 * RESIDENT permissions (for test reference)
 * @see PermissionRegistry.ts
 */
export const RESIDENT_PERMISSIONS = [
  'resident:read', // own data only
  'household:read', // own household only
  'emergency:create', // can create for own safety
  'emergency:read',
  'announcement:read',
  'vote:cast',
  'privacy:read',
  'privacy:manage',
];

/**
 * Admin-only permissions that RESIDENT does NOT have
 */
export const ADMIN_ONLY_PERMISSIONS = [
  'tenant:manage',
  'orgunit:manage',
  'membership:delegate',
  'finance:write',
  'resident:write',
  'announcement:publish',
  'vote:manage',
  'iot:manage',
  'iot:command',
  'emergency:manage',
  'security:manage',
  'patrol:manage',
  'incident:manage',
];

// ---------------------------------------------------------------------------
// Multi-Tenant Test Helpers
// ---------------------------------------------------------------------------

/**
 * Creates two separate tenant contexts for cross-tenant testing
 */
export function createMultiTenantTestSetup(): {
  tenantA: { tenantId: string; orgUnitId: string };
  tenantB: { tenantId: string; orgUnitId: string };
} {
  return {
    tenantA: {
      tenantId: generateTestUuid('tenant-a'),
      orgUnitId: generateTestUuid('orgunit-a'),
    },
    tenantB: {
      tenantId: generateTestUuid('tenant-b'),
      orgUnitId: generateTestUuid('orgunit-b'),
    },
  };
}

/**
 * Creates a user in tenant A trying to access tenant B's data
 */
export function createCrossTenantTestSetup(
  role: MembershipRole = MembershipRole.RESIDENT,
): {
  userInTenantA: TestUserContext;
  tenantBId: string;
} {
  const { tenantA, tenantB } = createMultiTenantTestSetup();

  return {
    userInTenantA: createTestUserContext({
      role,
      tenantId: tenantA.tenantId,
      orgUnitId: tenantA.orgUnitId,
    }),
    tenantBId: tenantB.tenantId,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { MembershipRole, MembershipStatus };
