/**
 * Membership — Domain entity representing a user's membership in a tenant.
 *
 * Membership links a User to a Tenant with a role, replacing the legacy
 * `User.tenantId` 1:1 relationship. A user can have multiple memberships
 * across different tenants, or even multiple memberships within the same
 * tenant at different OrgUnit scopes.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 1, 3, 22
 * @see Design Components and Interfaces > 3. Membership Model
 */

import type { MembershipRole, MembershipStatus } from '../types';

/**
 * Membership entity — the core authorization record linking users to tenants.
 *
 * SECURITY CONSIDERATIONS:
 * - id (membershipId) MUST NOT be accepted from external sources
 * - membershipId is ALWAYS resolved server-side using MembershipResolutionKey
 * - All fields are readonly to enforce immutability in domain layer
 *
 * INVARIANTS:
 * - INV-MEM-001: If orgUnitId is non-null, it MUST belong to the same tenant
 * - INV-MEM-002: PLATFORM_ADMIN and TENANT_OWNER MUST have orgUnitId = null
 * - INV-MEM-003: ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT require valid orgUnitId
 */
export interface Membership {
  /**
   * Unique identifier for this membership record.
   * CRITICAL: NEVER accept this from external sources (JWT, request body, etc.)
   */
  readonly id: string;

  /**
   * Reference to the User (global identity).
   * Users table is GLOBAL_IDENTITY — no tenant RLS.
   */
  readonly userId: string;

  /**
   * Reference to the Tenant (security boundary).
   * This field is REQUIRED — a membership always belongs to a tenant.
   */
  readonly tenantId: string;

  /**
   * Reference to the OrgUnit within the tenant hierarchy.
   *
   * - NULL for tenant-level roles (PLATFORM_ADMIN, TENANT_OWNER)
   * - NON-NULL for org-scoped roles (ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT)
   *
   * When non-null, the referenced OrgUnit MUST belong to the same tenant
   * (INV-MEM-001).
   */
  readonly orgUnitId: string | null;

  /**
   * The role assigned to the user within this membership.
   * Determines permissions via the Permission Registry (explicit mapping).
   */
  readonly role: MembershipRole;

  /**
   * Current lifecycle status of the membership.
   * Determines authorization eligibility.
   */
  readonly status: MembershipStatus;

  /**
   * When the membership was created.
   */
  readonly createdAt: Date;

  /**
   * When the membership was last updated.
   */
  readonly updatedAt: Date;

  /**
   * When the membership was revoked (if status = REVOKED).
   * MUST be set when status transitions to REVOKED.
   */
  readonly revokedAt?: Date;
}

/**
 * Data required to create a new Membership.
 * Omits auto-generated fields (id, timestamps).
 */
export interface CreateMembershipInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly orgUnitId: string | null;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
}

/**
 * Partial update for membership fields.
 * Only status can be updated; role/scope changes require new membership.
 */
export interface UpdateMembershipInput {
  readonly status?: MembershipStatus;
  readonly revokedAt?: Date;
}
