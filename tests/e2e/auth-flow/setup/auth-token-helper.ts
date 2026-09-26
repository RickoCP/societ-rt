/**
 * Auth Token Helper — E2E Auth Flow Tests
 *
 * Provides utilities for generating valid JWT tokens for different roles
 * and scenarios in E2E auth flow tests.
 *
 * This helper integrates with the existing JWTService to create tokens
 * that are indistinguishable from production tokens.
 *
 * @see Requirements 13.1 — E2E test infrastructure setup
 * @see Design Integration Test Suite for Auth Flow
 */

import type { DomainResult } from '@core/utils';
import type { JWTClaims, AuthorizationContext } from '@core/domains/authorization/types';
import type { Membership } from '@core/domains/membership/entities';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import { getPermissionsForRole } from '@core/domains/authorization/permissions/PermissionRegistry';
import {
  JWTServiceImpl,
  type CreateAccessTokenInput,
  type AccessTokenResult,
  type IJWTService,
} from '@infrastructure/utils/jwtService';

// ---------------------------------------------------------------------------
// Token Helper Service
// ---------------------------------------------------------------------------

/**
 * Singleton JWT service for test token generation.
 */
let testJwtService: IJWTService | null = null;

/**
 * Get or create the test JWT service.
 */
function getTestJwtService(): IJWTService {
  if (!testJwtService) {
    testJwtService = JWTServiceImpl();
  }
  return testJwtService;
}

// ---------------------------------------------------------------------------
// Token Generation Types
// ---------------------------------------------------------------------------

/**
 * Input for generating a test access token.
 */
export interface GenerateTestTokenInput {
  /** User ID */
  readonly userId: string;
  /** Active tenant ID */
  readonly tenantId: string;
  /** Active OrgUnit ID (null for tenant-level admins) */
  readonly orgUnitId: string | null;
  /** Token version (defaults to 1) */
  readonly tokenVersion?: number;
}

/**
 * Result of test token generation.
 */
export interface TestTokenResult {
  /** The signed JWT access token */
  readonly accessToken: string;
  /** Token expiration timestamp (Unix epoch seconds) */
  readonly expiresAt: number;
  /** The claims embedded in the token */
  readonly claims: {
    readonly userId: string;
    readonly tenantId: string;
    readonly orgUnitId: string | null;
    readonly tokenVersion: number;
  };
}

/**
 * Full test auth context including token and resolved context.
 */
export interface TestAuthContext {
  /** The access token */
  readonly accessToken: string;
  /** Full authorization context for test assertions */
  readonly authContext: AuthorizationContext;
  /** Serialized authorization context for headers */
  readonly serializedContext: string;
  /** HTTP headers for making authenticated requests */
  readonly headers: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Token Generation Functions
// ---------------------------------------------------------------------------

/**
 * Generate a valid JWT access token for E2E tests.
 *
 * This creates a real JWT token using the same service as production.
 * The token will be valid for 15 minutes (production default).
 *
 * @param input - Token generation parameters
 * @returns Token result or throws on failure
 *
 * @example
 * ```typescript
 * const token = generateTestAccessToken({
 *   userId: 'test-user-1',
 *   tenantId: 'test-tenant-1',
 *   orgUnitId: 'test-orgunit-1',
 * });
 * ```
 */
export function generateTestAccessToken(
  input: GenerateTestTokenInput,
): TestTokenResult {
  const jwtService = getTestJwtService();

  const createInput: CreateAccessTokenInput = {
    userId: input.userId,
    activeTenantId: input.tenantId,
    activeOrgUnitId: input.orgUnitId,
    tokenVersion: input.tokenVersion ?? 1,
  };

  const result: DomainResult<AccessTokenResult> = jwtService.createAccessToken(createInput);

  if (!result.success) {
    throw new Error(`Failed to generate test token: ${result.error.message}`);
  }

  return {
    accessToken: result.data.token,
    expiresAt: result.data.expiresAt,
    claims: {
      userId: input.userId,
      tenantId: input.tenantId,
      orgUnitId: input.orgUnitId,
      tokenVersion: input.tokenVersion ?? 1,
    },
  };
}

/**
 * Validate a test token and extract claims.
 *
 * @param token - The JWT token to validate
 * @param expectedTokenVersion - Optional expected token version
 * @returns Decoded claims or null if invalid
 */
export function validateTestToken(
  token: string,
  expectedTokenVersion?: number,
): JWTClaims | null {
  const jwtService = getTestJwtService();

  const result = jwtService.validateAccessToken({
    token,
    expectedTokenVersion,
  });

  if (!result.success) {
    return null;
  }

  return result.data.claims;
}

/**
 * Decode a test token without validation.
 *
 * @param token - The JWT token to decode
 * @returns Decoded claims or null if malformed
 */
export function decodeTestToken(token: string): JWTClaims | null {
  const jwtService = getTestJwtService();
  return jwtService.decodeAccessToken(token);
}

// ---------------------------------------------------------------------------
// Full Auth Context Generation
// ---------------------------------------------------------------------------

/**
 * Input for generating a complete test auth context.
 */
export interface GenerateTestAuthContextInput {
  /** User ID */
  readonly userId: string;
  /** Tenant ID */
  readonly tenantId: string;
  /** Membership ID */
  readonly membershipId: string;
  /** OrgUnit ID (null for tenant-level admins) */
  readonly orgUnitId: string | null;
  /** User's role */
  readonly role: MembershipRole;
  /** Membership status (defaults to ACTIVE) */
  readonly membershipStatus?: MembershipStatus;
  /** Token version (defaults to 1) */
  readonly tokenVersion?: number;
}

/**
 * Generate a complete test auth context with token and headers.
 *
 * This creates:
 * 1. A valid JWT access token
 * 2. A complete AuthorizationContext object
 * 3. Serialized context for x-authorization-context header
 * 4. All required HTTP headers for authenticated requests
 *
 * @param input - Auth context generation parameters
 * @returns Complete test auth context
 *
 * @example
 * ```typescript
 * const auth = generateTestAuthContext({
 *   userId: 'test-user-1',
 *   tenantId: 'test-tenant-1',
 *   membershipId: 'test-membership-1',
 *   orgUnitId: 'test-orgunit-1',
 *   role: MembershipRole.RT_ADMIN,
 * });
 *
 * // Use in fetch request
 * const response = await fetch('/api/residents', {
 *   headers: auth.headers,
 * });
 * ```
 */
export function generateTestAuthContext(
  input: GenerateTestAuthContextInput,
): TestAuthContext {
  const tokenVersion = input.tokenVersion ?? 1;
  const membershipStatus = input.membershipStatus ?? MembershipStatus.ACTIVE;

  // Generate access token
  const tokenResult = generateTestAccessToken({
    userId: input.userId,
    tenantId: input.tenantId,
    orgUnitId: input.orgUnitId,
    tokenVersion,
  });

  // Get permissions for role
  const permissions = getPermissionsForRole(input.role);

  // Create mock membership entity
  const membership: Membership = {
    id: input.membershipId,
    userId: input.userId,
    tenantId: input.tenantId,
    orgUnitId: input.orgUnitId,
    role: input.role,
    status: membershipStatus,
    createdAt: new Date(),
    updatedAt: new Date(),
    revokedAt: membershipStatus === MembershipStatus.REVOKED ? new Date() : undefined,
  };

  // Build full authorization context
  const authContext: AuthorizationContext = {
    userId: input.userId,
    tenantId: input.tenantId,
    membershipId: input.membershipId,
    orgUnitId: input.orgUnitId,
    role: input.role,
    permissions,
    tokenVersion,
    isAuthoritative: membershipStatus === MembershipStatus.ACTIVE || membershipStatus === MembershipStatus.SUSPENDED,
    isTenantLevel: input.orgUnitId === null,
    membership,
  };

  // Serialize context for header (convert Set to Array)
  const serializedContext = JSON.stringify({
    ...authContext,
    permissions: Array.from(permissions),
  });

  // Build headers for authenticated requests
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${tokenResult.accessToken}`,
    'x-authorization-context': serializedContext,
    'x-user-id': input.userId,
    'x-tenant-id': input.tenantId,
    'x-membership-id': input.membershipId,
    'x-org-unit-id': input.orgUnitId ?? '',
    'x-user-role': input.role,
    'x-token-version': String(tokenVersion),
    'Content-Type': 'application/json',
  };

  return {
    accessToken: tokenResult.accessToken,
    authContext,
    serializedContext,
    headers,
  };
}

// ---------------------------------------------------------------------------
// Specialized Token Generators
// ---------------------------------------------------------------------------

/**
 * Generate auth context for a PLATFORM_ADMIN user.
 *
 * PLATFORM_ADMIN is a tenant-level role (orgUnitId = null).
 */
export function generatePlatformAdminAuth(
  userId: string,
  tenantId: string,
  membershipId: string,
  options?: { tokenVersion?: number },
): TestAuthContext {
  return generateTestAuthContext({
    userId,
    tenantId,
    membershipId,
    orgUnitId: null, // Tenant-level
    role: MembershipRole.PLATFORM_ADMIN,
    tokenVersion: options?.tokenVersion,
  });
}

/**
 * Generate auth context for a TENANT_OWNER user.
 *
 * TENANT_OWNER is a tenant-level role (orgUnitId = null).
 */
export function generateTenantOwnerAuth(
  userId: string,
  tenantId: string,
  membershipId: string,
  options?: { tokenVersion?: number },
): TestAuthContext {
  return generateTestAuthContext({
    userId,
    tenantId,
    membershipId,
    orgUnitId: null, // Tenant-level
    role: MembershipRole.TENANT_OWNER,
    tokenVersion: options?.tokenVersion,
  });
}

/**
 * Generate auth context for an RT_ADMIN user.
 *
 * RT_ADMIN is an org-scoped role (requires orgUnitId).
 */
export function generateRtAdminAuth(
  userId: string,
  tenantId: string,
  membershipId: string,
  orgUnitId: string,
  options?: { tokenVersion?: number },
): TestAuthContext {
  return generateTestAuthContext({
    userId,
    tenantId,
    membershipId,
    orgUnitId,
    role: MembershipRole.RT_ADMIN,
    tokenVersion: options?.tokenVersion,
  });
}

/**
 * Generate auth context for an ORG_ADMIN user.
 *
 * ORG_ADMIN is an org-scoped role (requires orgUnitId).
 */
export function generateOrgAdminAuth(
  userId: string,
  tenantId: string,
  membershipId: string,
  orgUnitId: string,
  options?: { tokenVersion?: number },
): TestAuthContext {
  return generateTestAuthContext({
    userId,
    tenantId,
    membershipId,
    orgUnitId,
    role: MembershipRole.ORG_ADMIN,
    tokenVersion: options?.tokenVersion,
  });
}

/**
 * Generate auth context for a SECURITY user.
 *
 * SECURITY is an org-scoped role (requires orgUnitId).
 */
export function generateSecurityAuth(
  userId: string,
  tenantId: string,
  membershipId: string,
  orgUnitId: string,
  options?: { tokenVersion?: number },
): TestAuthContext {
  return generateTestAuthContext({
    userId,
    tenantId,
    membershipId,
    orgUnitId,
    role: MembershipRole.SECURITY,
    tokenVersion: options?.tokenVersion,
  });
}

/**
 * Generate auth context for a RESIDENT user.
 *
 * RESIDENT is an org-scoped role (requires orgUnitId).
 */
export function generateResidentAuth(
  userId: string,
  tenantId: string,
  membershipId: string,
  orgUnitId: string,
  options?: { tokenVersion?: number; membershipStatus?: MembershipStatus },
): TestAuthContext {
  return generateTestAuthContext({
    userId,
    tenantId,
    membershipId,
    orgUnitId,
    role: MembershipRole.RESIDENT,
    tokenVersion: options?.tokenVersion,
    membershipStatus: options?.membershipStatus,
  });
}

// ---------------------------------------------------------------------------
// Token Manipulation for Testing Edge Cases
// ---------------------------------------------------------------------------

/**
 * Generate an expired token for testing expired token handling.
 *
 * Note: This requires directly using jwt library as the service
 * doesn't support creating expired tokens.
 */
export function generateExpiredToken(
  input: GenerateTestTokenInput,
): string {
  // Import jwt directly for this edge case
  const jwt = require('jsonwebtoken');

  const payload = {
    sub: input.userId,
    activeTenantId: input.tenantId,
    activeOrgUnitId: input.orgUnitId,
    tokenVersion: input.tokenVersion ?? 1,
  };

  // Create token that expired 1 hour ago
  return jwt.sign(payload, process.env.JWT_SECRET || 'test-secret', {
    algorithm: 'HS256',
    expiresIn: -3600, // Negative = already expired
  });
}

/**
 * Generate a token with mismatched version for invalidation tests.
 */
export function generateStaleVersionToken(
  input: GenerateTestTokenInput,
  staleVersion: number,
): TestTokenResult {
  return generateTestAccessToken({
    ...input,
    tokenVersion: staleVersion,
  });
}

/**
 * Generate an invalid/malformed token for error handling tests.
 */
export function generateInvalidToken(): string {
  return 'invalid.jwt.token';
}

/**
 * Generate a token with wrong signature.
 */
export function generateWrongSignatureToken(
  input: GenerateTestTokenInput,
): string {
  const jwt = require('jsonwebtoken');

  const payload = {
    sub: input.userId,
    activeTenantId: input.tenantId,
    activeOrgUnitId: input.orgUnitId,
    tokenVersion: input.tokenVersion ?? 1,
  };

  // Sign with wrong secret
  return jwt.sign(payload, 'wrong-secret-key', {
    algorithm: 'HS256',
    expiresIn: 900,
  });
}
