/**
 * Member — Domain entity representing a member in the Admin UI context.
 *
 * This entity extends the core Membership model with user profile information
 * that is needed for display and management in the Admin UI. It combines
 * membership data with user profile data (name, email, profile picture) for
 * a complete view suitable for the MemberList screen.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 2.2-2.8 (Member List Screen)
 * @see Requirements 5.1-5.11 (Member Role Change)
 * @see Design Components and Interfaces > 2. Membership Management
 */

import type { MembershipRole } from '../types/MembershipRole';
import type { MembershipStatus } from '../types/MembershipStatus';

/**
 * Member entity — combines membership data with user profile for Admin UI.
 *
 * This is the view model entity used by the Admin UI to display and manage
 * members. It enriches the Membership with profile information.
 *
 * SECURITY CONSIDERATIONS:
 * - id (membershipId) MUST NOT be accepted from external sources
 * - Displayed data is filtered by user's authorization scope
 * - All fields are readonly to enforce immutability in domain layer
 */
export interface Member {
  /**
   * Unique identifier for this membership record.
   * CRITICAL: NEVER accept this from external sources.
   */
  readonly id: string;

  /**
   * Reference to the User (global identity).
   */
  readonly userId: string;

  /**
   * Reference to the Tenant (security boundary).
   */
  readonly tenantId: string;

  /**
   * Reference to the OrgUnit within the tenant hierarchy.
   * NULL for tenant-level roles (PLATFORM_ADMIN, TENANT_OWNER).
   */
  readonly orgUnitId: string | null;

  /**
   * The OrgUnit name for display purposes.
   * NULL for tenant-level roles.
   */
  readonly orgUnitName: string | null;

  /**
   * The role assigned to the user within this membership.
   */
  readonly role: MembershipRole;

  /**
   * Current lifecycle status of the membership.
   */
  readonly status: MembershipStatus;

  /**
   * When the membership was created (joined date).
   */
  readonly createdAt: Date;

  /**
   * When the membership was last updated.
   */
  readonly updatedAt: Date;

  /**
   * When the membership was revoked (if status = REVOKED).
   */
  readonly revokedAt?: Date;

  // ---------------------------------------------------------------------------
  // User Profile Information (enriched from User table)
  // ---------------------------------------------------------------------------

  /**
   * User's display name.
   */
  readonly name: string;

  /**
   * User's email address.
   */
  readonly email: string;

  /**
   * User's profile picture URL (optional).
   */
  readonly profilePictureUrl?: string;

  /**
   * User's phone number (optional, for display).
   */
  readonly phoneNumber?: string;
}

/**
 * Summary of a member for compact display (e.g., dropdowns, search results).
 */
export interface MemberSummary {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: MembershipRole;
  readonly orgUnitId: string | null;
  readonly orgUnitName: string | null;
  readonly profilePictureUrl?: string;
}

/**
 * Role change history entry for audit display.
 *
 * @see Requirements 5.11 (Member Card change history)
 */
export interface RoleChangeHistory {
  readonly id: string;
  readonly previousRole: MembershipRole;
  readonly newRole: MembershipRole;
  readonly previousOrgUnitId: string | null;
  readonly newOrgUnitId: string | null;
  readonly changedAt: Date;
  readonly changedBy: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  };
  readonly reason?: string;
}

/**
 * Paginated result for member list queries.
 *
 * @see Requirements 2.6 (pagination support)
 */
export interface PaginatedMembers {
  readonly members: Member[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
}
