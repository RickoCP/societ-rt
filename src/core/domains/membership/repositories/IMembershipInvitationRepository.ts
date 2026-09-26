/**
 * IMembershipInvitationRepository — Repository contract for MembershipInvitation operations.
 *
 * This interface defines the contract for invitation persistence operations.
 * Implementations are in infrastructure layer (Prisma adapter).
 *
 * **SECURITY CONSIDERATIONS:**
 * - Tokens MUST be stored hashed (SHA-256)
 * - findByToken accepts a hash, not raw token
 * - All operations MUST respect tenant boundary
 * - Never expose raw token in any method
 *
 * @see FASE 1.18 Task 53: Membership Invitation Flow
 * @see Requirements 22, 25
 */

import type { DomainResult } from '@core/utils';
import type {
  MembershipInvitation,
  CreateInvitationInput,
  UpdateInvitationInput,
  MembershipInvitationStatus,
} from '../entities';

// ---------------------------------------------------------------------------
// Query Options
// ---------------------------------------------------------------------------

/**
 * Options for querying invitations.
 */
export interface InvitationQueryOptions {
  /** Filter by status */
  readonly status?: MembershipInvitationStatus;
  /** Include expired invitations */
  readonly includeExpired?: boolean;
}

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

/**
 * Repository interface for MembershipInvitation operations.
 *
 * All write operations are transactional and validate tenant boundaries.
 */
export interface IMembershipInvitationRepository {
  // -------------------------------------------------------------------------
  // Create Operations
  // -------------------------------------------------------------------------

  /**
   * Create a new invitation record.
   *
   * IMPORTANT: This method does NOT validate:
   * - Inviter authorization (caller must check via DelegationMatrixService)
   * - Membership exists and is INVITED (caller must ensure)
   * - Token uniqueness (caller must generate unique token)
   *
   * This method DOES enforce:
   * - Database-level constraints
   * - Tenant boundary (via FK constraints)
   *
   * @param input - The invitation data to create
   * @returns DomainResult with created invitation or error
   */
  create(input: CreateInvitationInput): Promise<DomainResult<MembershipInvitation>>;

  // -------------------------------------------------------------------------
  // Read Operations
  // -------------------------------------------------------------------------

  /**
   * Find an invitation by its token hash.
   *
   * This is the primary method for accepting invitations.
   * The token should be hashed (SHA-256) before calling.
   *
   * @param tokenHash - The SHA-256 hash of the invitation token
   * @returns The invitation if found, null otherwise
   */
  findByTokenHash(tokenHash: string): Promise<MembershipInvitation | null>;

  /**
   * Find an invitation by ID within a tenant.
   *
   * @param invitationId - The invitation ID
   * @param tenantId - The tenant context (security boundary)
   * @returns The invitation if found, null otherwise
   */
  findById(invitationId: string, tenantId: string): Promise<MembershipInvitation | null>;

  /**
   * Find an invitation by the associated membership ID.
   *
   * @param membershipId - The membership ID
   * @param tenantId - The tenant context
   * @returns The invitation if found, null otherwise
   */
  findByMembershipId(membershipId: string, tenantId: string): Promise<MembershipInvitation | null>;

  /**
   * Find all invitations for a tenant.
   *
   * @param tenantId - The tenant ID
   * @param options - Query options
   * @returns Array of invitations
   */
  findByTenant(
    tenantId: string,
    options?: InvitationQueryOptions,
  ): Promise<MembershipInvitation[]>;

  /**
   * Find all pending invitations for a user (by email or userId).
   *
   * @param tenantId - The tenant ID
   * @param invitedEmail - Optional: Filter by email
   * @param invitedUserId - Optional: Filter by user ID
   * @returns Array of pending invitations
   */
  findPendingForUser(
    tenantId: string,
    invitedEmail?: string,
    invitedUserId?: string,
  ): Promise<MembershipInvitation[]>;

  /**
   * Find all invitations created by a specific user.
   *
   * @param inviterUserId - The inviter's user ID
   * @param tenantId - The tenant context
   * @param options - Query options
   * @returns Array of invitations
   */
  findByInviter(
    inviterUserId: string,
    tenantId: string,
    options?: InvitationQueryOptions,
  ): Promise<MembershipInvitation[]>;

  // -------------------------------------------------------------------------
  // Update Operations
  // -------------------------------------------------------------------------

  /**
   * Update an invitation record.
   *
   * Only status and related timestamps can be updated.
   *
   * @param invitationId - The invitation ID to update
   * @param tenantId - The tenant context (security boundary)
   * @param data - The update data
   * @returns DomainResult with updated invitation or error
   */
  update(
    invitationId: string,
    tenantId: string,
    data: UpdateInvitationInput,
  ): Promise<DomainResult<MembershipInvitation>>;

  /**
   * Update the token hash for an invitation (for resend).
   *
   * This also updates the expiry date.
   *
   * @param invitationId - The invitation ID
   * @param tenantId - The tenant context
   * @param newTokenHash - The new token hash
   * @param newExpiresAt - The new expiry date
   * @returns DomainResult with updated invitation or error
   */
  updateToken(
    invitationId: string,
    tenantId: string,
    newTokenHash: string,
    newExpiresAt: Date,
  ): Promise<DomainResult<MembershipInvitation>>;

  // -------------------------------------------------------------------------
  // Batch Operations (for cleanup jobs)
  // -------------------------------------------------------------------------

  /**
   * Find all expired PENDING invitations.
   *
   * Used by batch job to mark expired invitations.
   *
   * @param tenantId - Optional: Filter by tenant (null = all tenants)
   * @param limit - Maximum number to return
   * @returns Array of expired pending invitations
   */
  findExpiredPending(tenantId?: string, limit?: number): Promise<MembershipInvitation[]>;

  /**
   * Bulk update status for multiple invitations.
   *
   * Used by batch job to mark expired invitations.
   *
   * @param invitationIds - Array of invitation IDs
   * @param status - The new status
   * @returns Number of updated records
   */
  bulkUpdateStatus(
    invitationIds: string[],
    status: MembershipInvitationStatus,
  ): Promise<number>;

  // -------------------------------------------------------------------------
  // Utility Operations
  // -------------------------------------------------------------------------

  /**
   * Check if a pending invitation exists for an email/userId in a tenant.
   *
   * Used to prevent duplicate invitations.
   *
   * @param tenantId - The tenant ID
   * @param invitedEmail - Optional: Check by email
   * @param invitedUserId - Optional: Check by user ID
   * @returns true if a pending invitation exists
   */
  existsPendingInvitation(
    tenantId: string,
    invitedEmail?: string,
    invitedUserId?: string,
  ): Promise<boolean>;

  /**
   * Count pending invitations for a tenant.
   *
   * @param tenantId - The tenant ID
   * @returns Count of pending invitations
   */
  countPending(tenantId: string): Promise<number>;
}
