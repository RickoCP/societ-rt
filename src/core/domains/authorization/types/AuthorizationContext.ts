/**
 * AuthorizationContext — Resolved server-side for every protected request.
 *
 * CRITICAL: membershipId is NEVER accepted from JWT — always resolved server-side.
 * JWT carries identity/context only, NOT authorization authority.
 *
 * This context represents the fully resolved authorization state for a request,
 * including:
 * - User identity (from JWT)
 * - Tenant context (from JWT, validated against membership)
 * - OrgUnit scope (from JWT, validated against membership)
 * - Role and permissions (from Permission Registry based on membership)
 *
 * @see Requirements 3 (AC 1-7)
 * @see Design Authorization Context Resolution
 * @see INV-AUTH-001: JWT role/permission claims are never authorization authority
 */

import type { Membership } from '@core/domains/membership/entities';
import type { MembershipRole } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Authorization Context Types
// ---------------------------------------------------------------------------

/**
 * AuthorizationContext — The complete authorization state for a request.
 *
 * This is the result of the Authorization Context Resolution process.
 * All fields are resolved server-side from the JWT claims and database.
 *
 * SECURITY INVARIANTS:
 * - INV-AUTH-001: role and permissions are NEVER from JWT; always resolved
 * - INV-AUTH-002: Fails closed when context cannot be resolved
 * - membershipId is NEVER accepted from JWT
 */
export interface AuthorizationContext {
  /**
   * The user's unique identifier (from JWT `sub` claim).
   */
  readonly userId: string;

  /**
   * The active tenant ID (from JWT `activeTenantId` claim).
   * Validated against resolved membership.
   */
  readonly tenantId: string;

  /**
   * The resolved membership ID (server-resolved, NEVER from JWT).
   */
  readonly membershipId: string;

  /**
   * The active OrgUnit ID (from JWT `activeOrgUnitId` claim).
   * NULL only for tenant-level admins (PLATFORM_ADMIN, TENANT_OWNER).
   */
  readonly orgUnitId: string | null;

  /**
   * The user's role within this membership.
   * Resolved from membership, NOT from JWT.
   */
  readonly role: MembershipRole;

  /**
   * The complete set of permissions for this role.
   * Resolved from Permission Registry based on role.
   */
  readonly permissions: ReadonlySet<string>;

  /**
   * The JWT token version at the time of resolution.
   * Used for token version validation.
   */
  readonly tokenVersion: number;

  /**
   * Whether this is an authoritative membership (ACTIVE or SUSPENDED).
   * Non-authoritative memberships may have limited access.
   */
  readonly isAuthoritative: boolean;

  /**
   * Whether this is a tenant-level membership (orgUnitId = null).
   * True only for PLATFORM_ADMIN and TENANT_OWNER roles.
   */
  readonly isTenantLevel: boolean;

  /**
   * The full resolved membership entity for advanced authorization checks.
   * Includes status for emergency operation eligibility.
   */
  readonly membership: Membership;
}

/**
 * JWT claims structure for authorization context resolution.
 *
 * This represents the claims extracted from a valid JWT token.
 * Note: role and permissions are NEVER stored in JWT (INV-AUTH-001).
 *
 * @see Requirements 44 (JWT Claims Structure Update)
 */
export interface JWTClaims {
  /**
   * User ID (subject claim).
   */
  readonly sub: string;

  /**
   * Current active tenant ID.
   */
  readonly activeTenantId: string;

  /**
   * Current active OrgUnit ID.
   * NULL only for tenant-level admins.
   */
  readonly activeOrgUnitId: string | null;

  /**
   * Token version for forced invalidation.
   */
  readonly tokenVersion: number;

  /**
   * Issued at timestamp (Unix epoch seconds).
   */
  readonly iat: number;

  /**
   * Expiration timestamp (Unix epoch seconds).
   */
  readonly exp: number;
}

/**
 * Partial JWT claims for context resolution.
 *
 * This is used when JWT claims have already been parsed and validated
 * for structure, but not yet resolved against the database.
 */
export interface PartialJWTClaims {
  readonly userId: string;
  readonly activeTenantId: string;
  readonly activeOrgUnitId: string | null;
  readonly tokenVersion: number;
}

// ---------------------------------------------------------------------------
// Context Creation Input
// ---------------------------------------------------------------------------

/**
 * Input for creating an AuthorizationContext.
 *
 * This combines JWT claims with the resolution key for membership lookup.
 */
export interface AuthorizationContextInput {
  /**
   * Extracted JWT claims (after signature validation).
   */
  readonly jwtClaims: PartialJWTClaims;

  /**
   * The current tokenVersion from the User record.
   * Used for exact match validation.
   */
  readonly currentTokenVersion: number;
}

// ---------------------------------------------------------------------------
// Resolution Result
// ---------------------------------------------------------------------------

/**
 * Extended metadata about the authorization context resolution.
 *
 * This provides additional information for logging and auditing.
 */
export interface AuthorizationContextMetadata {
  /**
   * Timestamp when the context was resolved.
   */
  readonly resolvedAt: Date;

  /**
   * Number of memberships the user has in this tenant.
   */
  readonly membershipCountInTenant: number;

  /**
   * Whether the user has multiple memberships in this tenant.
   */
  readonly isMultiMembership: boolean;
}

/**
 * Complete authorization context resolution result.
 */
export interface AuthorizationContextResult {
  /**
   * The resolved authorization context.
   */
  readonly context: AuthorizationContext;

  /**
   * Additional metadata about the resolution.
   */
  readonly metadata: AuthorizationContextMetadata;
}
