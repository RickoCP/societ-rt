/**
 * MembershipWriteRepository — Write repository contract for Membership operations.
 *
 * This interface extends the read-only IMembershipRepository with write operations
 * needed for membership lifecycle management.
 *
 * Write operations are separated from read operations per Clean Architecture:
 * - IMembershipRepository: Read operations (FASE 1.6)
 * - MembershipWriteRepository: Write operations (FASE 1.18)
 *
 * **SECURITY CONSIDERATIONS:**
 * - All write operations MUST validate tenant boundary
 * - Uniqueness constraints MUST be enforced at database level
 * - revokedAt MUST be set for REVOKED status transitions
 *
 * **INVARIANTS ENFORCED:**
 * - INV-MEM-001: Membership OrgUnit belongs to Membership tenant
 * - INV-MEM-002: Tenant-level membership has orgUnitId=NULL
 * - INV-MEM-003: Org-scoped roles require valid orgUnitId
 *
 * @see FASE 1.18 Task 50: Membership Lifecycle Management
 * @see Requirements 22 (AC 1-7)
 * @see Design Membership Model, Membership Invariants
 */

import type { DomainResult } from '@core/utils';
import type { Membership, CreateMembershipInput } from '../entities';
import type { MembershipStatus } from '../types';

/**
 * Update data for membership status transitions.
 */
export interface UpdateMembershipData {
  /** The new status */
  readonly status?: MembershipStatus;
  /** When the membership was revoked (required for REVOKED status) */
  readonly revokedAt?: Date;
}

/**
 * Write repository interface for Membership operations.
 *
 * All write operations are transactional and validate tenant boundaries.
 */
export interface MembershipWriteRepository {
  // ---------------------------------------------------------------------------
  // Create Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new membership record.
   *
   * IMPORTANT: This method does NOT validate:
   * - Quarantine status (caller must check)
   * - OrgUnit existence/ownership (caller must check)
   * - Delegation matrix rules (caller must check)
   *
   * This method DOES enforce:
   * - Database-level uniqueness constraints
   * - Tenant boundary (via FK constraints)
   *
   * @param input - The membership data to create
   * @returns DomainResult with created membership or error
   *
   * Possible errors:
   * - MEMBERSHIP_ALREADY_EXISTS: Duplicate membership for same scope
   * - TECHNICAL_ERROR: Database operation failed
   */
  create(input: CreateMembershipInput): Promise<DomainResult<Membership>>;

  // ---------------------------------------------------------------------------
  // Update Operations
  // ---------------------------------------------------------------------------

  /**
   * Update a membership record.
   *
   * Only status and revokedAt can be updated.
   * Role/scope changes require creating a new membership.
   *
   * IMPORTANT: This method does NOT validate:
   * - Status transition rules (caller must check with isValidStatusTransition)
   *
   * @param membershipId - The membership ID to update
   * @param tenantId - The tenant context (security boundary)
   * @param data - The update data
   * @returns DomainResult with updated membership or error
   *
   * Possible errors:
   * - MEMBERSHIP_NOT_FOUND: Membership doesn't exist in tenant
   * - TECHNICAL_ERROR: Database operation failed
   */
  update(
    membershipId: string,
    tenantId: string,
    data: UpdateMembershipData,
  ): Promise<DomainResult<Membership>>;

  // ---------------------------------------------------------------------------
  // Query Operations (needed for lifecycle management)
  // ---------------------------------------------------------------------------

  /**
   * Find a membership by ID within a tenant.
   *
   * @param membershipId - The membership ID
   * @param tenantId - The tenant context (security boundary)
   * @returns The membership if found, null otherwise
   */
  findById(membershipId: string, tenantId: string): Promise<Membership | null>;

  /**
   * Check if an active membership exists for a specific scope.
   *
   * Used for uniqueness validation before creation.
   *
   * For org-scoped memberships: checks (userId, tenantId, orgUnitId)
   * For tenant-level memberships: checks (userId, tenantId) where orgUnitId is null
   *
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @param orgUnitId - The OrgUnit ID (null for tenant-level)
   * @returns true if an ACTIVE membership exists for this scope
   */
  existsActiveMembership(
    userId: string,
    tenantId: string,
    orgUnitId: string | null,
  ): Promise<boolean>;

  /**
   * Count active memberships for a user in a tenant.
   *
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @returns Count of ACTIVE memberships
   */
  countActiveMemberships(userId: string, tenantId: string): Promise<number>;

  // ---------------------------------------------------------------------------
  // Delete Operations (soft delete via status change)
  // ---------------------------------------------------------------------------

  /**
   * Delete/remove a membership (hard delete).
   *
   * NOTE: In most cases, use revocation (status change) instead of hard delete.
   * Hard delete is only for specific cleanup scenarios.
   *
   * @param membershipId - The membership ID to delete
   * @param tenantId - The tenant context (security boundary)
   * @returns DomainResult with void on success or error
   *
   * Possible errors:
   * - MEMBERSHIP_NOT_FOUND: Membership doesn't exist in tenant
   * - TECHNICAL_ERROR: Database operation failed
   */
  delete(membershipId: string, tenantId: string): Promise<DomainResult<void>>;
}
