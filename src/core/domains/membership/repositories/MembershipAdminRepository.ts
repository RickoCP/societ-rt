/**
 * MembershipAdminRepository — Repository interface for Admin UI membership operations.
 *
 * This interface defines the contract for Admin UI membership management operations,
 * including listing, viewing, inviting, and status/role management. It is separate
 * from IMembershipRepository which handles authorization context resolution.
 *
 * All methods return DomainResult<T> for explicit success/error handling.
 *
 * SECURITY CONSIDERATIONS:
 * - All operations are scoped by the caller's authorization context
 * - Tenant-level admins see all members across OrgUnits
 * - Org-scoped admins see only members within their OrgUnit and descendants
 * - Delegation matrix is enforced for invitation and role change operations
 *
 * @see Requirements 2.2-2.8 (Member List Screen)
 * @see Requirements 3.1-3.12 (Member Invitation Flow)
 * @see Requirements 4.1-4.11 (Member Status Management)
 * @see Requirements 5.1-5.11 (Member Role Change)
 * @see Design Components and Interfaces > 2. Membership Management
 */

import type { DomainResult } from '@core/utils';
import type {
  Member,
  MemberSummary,
  PaginatedMembers,
  RoleChangeHistory,
} from '../entities/Member';
import type { MemberListQueryOptions } from '../entities/MemberFilters';
import type { MembershipRole } from '../types/MembershipRole';
import type { MembershipStatus } from '../types/MembershipStatus';

/**
 * Input for inviting a new member.
 *
 * @see Requirements 3.2-3.7
 */
export interface InviteMemberInput {
  /**
   * Email address of the user to invite.
   */
  readonly email: string;

  /**
   * Role to assign to the invited member.
   * Must be within the inviter's delegation scope.
   */
  readonly role: MembershipRole;

  /**
   * OrgUnit to assign the member to.
   * Required for org-scoped roles; must be null for tenant-level roles.
   */
  readonly orgUnitId: string | null;
}

/**
 * Input for bulk invitation.
 *
 * @see Requirements 3.12 (bulk invitation)
 */
export interface BulkInviteMemberInput {
  /**
   * List of email addresses to invite (max 50).
   */
  readonly emails: string[];

  /**
   * Role to assign to all invited members.
   */
  readonly role: MembershipRole;

  /**
   * OrgUnit to assign all members to.
   */
  readonly orgUnitId: string | null;
}

/**
 * Result of a bulk invitation operation.
 */
export interface BulkInviteResult {
  /**
   * Successfully sent invitations.
   */
  readonly successes: string[];

  /**
   * Failed invitations with error details.
   */
  readonly failures: Array<{
    readonly email: string;
    readonly errorCode: string;
    readonly errorMessage: string;
  }>;
}

/**
 * Input for changing member status.
 *
 * @see Requirements 4.3-4.7
 */
export interface ChangeMemberStatusInput {
  /**
   * Target status to transition to.
   */
  readonly newStatus: MembershipStatus;

  /**
   * Reason for status change (optional, used for audit).
   */
  readonly reason?: string;
}

/**
 * Input for changing member role.
 *
 * @see Requirements 5.6-5.7
 */
export interface ChangeMemberRoleInput {
  /**
   * New role to assign.
   * Must be within the actor's delegation scope.
   */
  readonly newRole: MembershipRole;

  /**
   * New OrgUnit assignment.
   * Required for org-scoped roles; must be null for tenant-level roles.
   */
  readonly newOrgUnitId: string | null;

  /**
   * Reason for role change (optional, used for audit).
   */
  readonly reason?: string;
}

/**
 * Repository interface for Admin UI membership operations.
 *
 * All operations are scoped by the caller's tenantId and authorization context.
 * Authorization scope is passed via the actorContext parameter.
 */
export interface MembershipAdminRepository {
  // ---------------------------------------------------------------------------
  // List/Query Operations
  // ---------------------------------------------------------------------------

  /**
   * List members with pagination, sorting, and filtering.
   *
   * Members returned are scoped by the actor's authorization context:
   * - Tenant-level admins: all members in the tenant
   * - Org-scoped admins: members in their OrgUnit and descendants
   *
   * @param tenantId - The tenant to list members for
   * @param actorOrgUnitId - The actor's OrgUnit scope (null for tenant-level)
   * @param options - Query options (filters, pagination, sorting)
   * @returns Paginated list of members
   *
   * @see Requirements 2.3-2.8
   */
  listMembers(
    tenantId: string,
    actorOrgUnitId: string | null,
    options: MemberListQueryOptions,
  ): Promise<DomainResult<PaginatedMembers>>;

  /**
   * Get a single member by membership ID.
   *
   * Returns the full member details including role change history.
   *
   * @param membershipId - The membership record ID
   * @param tenantId - The tenant for scope validation
   * @returns Member details or not_found error
   *
   * @see Requirements 5.1-5.2
   */
  getMember(
    membershipId: string,
    tenantId: string,
  ): Promise<DomainResult<Member>>;

  /**
   * Get role change history for a member.
   *
   * @param membershipId - The membership record ID
   * @param tenantId - The tenant for scope validation
   * @returns List of role changes ordered by timestamp (newest first)
   *
   * @see Requirements 5.11
   */
  getRoleChangeHistory(
    membershipId: string,
    tenantId: string,
  ): Promise<DomainResult<RoleChangeHistory[]>>;

  /**
   * Search members by name or email.
   *
   * Used for member search dialogs (e.g., OrgUnit member assignment).
   * Results are scoped by the actor's authorization context.
   *
   * @param tenantId - The tenant to search in
   * @param actorOrgUnitId - The actor's OrgUnit scope
   * @param query - Search query (matches name or email)
   * @param excludeIds - Member IDs to exclude from results
   * @param limit - Maximum number of results (default 20)
   * @returns List of matching member summaries
   *
   * @see Requirements 9.4-9.5
   */
  searchMembers(
    tenantId: string,
    actorOrgUnitId: string | null,
    query: string,
    excludeIds?: string[],
    limit?: number,
  ): Promise<DomainResult<MemberSummary[]>>;

  // ---------------------------------------------------------------------------
  // Invitation Operations
  // ---------------------------------------------------------------------------

  /**
   * Invite a new member to the tenant.
   *
   * Creates an invitation that sends an email to the specified address.
   * The invited user will have INVITED status until they accept.
   *
   * @param tenantId - The tenant to invite the member to
   * @param actorMembershipId - The actor's membership ID (for audit)
   * @param input - Invitation details (email, role, orgUnitId)
   * @returns The created invitation ID or error
   *
   * Possible errors:
   * - INVITATION_DUPLICATE_EMAIL: Email already has membership/invitation
   * - AUTH_DELEGATION_VIOLATION: Role not delegable by actor
   * - AUTH_OUT_OF_SCOPE: OrgUnit not in actor's scope
   * - VALIDATION_INVALID_EMAIL: Invalid email format
   *
   * @see Requirements 3.8-3.11
   */
  inviteMember(
    tenantId: string,
    actorMembershipId: string,
    input: InviteMemberInput,
  ): Promise<DomainResult<{ invitationId: string }>>;

  /**
   * Invite multiple members in a single batch.
   *
   * Processes invitations sequentially, continuing on individual failures.
   * Limited to 50 invitations per batch.
   *
   * @param tenantId - The tenant to invite members to
   * @param actorMembershipId - The actor's membership ID
   * @param input - Bulk invitation details
   * @returns Result with successes and failures
   *
   * @see Requirements 3.12
   */
  bulkInviteMembers(
    tenantId: string,
    actorMembershipId: string,
    input: BulkInviteMemberInput,
  ): Promise<DomainResult<BulkInviteResult>>;

  /**
   * Resend an invitation email.
   *
   * Only valid for INVITED status members.
   *
   * @param membershipId - The membership record ID
   * @param tenantId - The tenant for scope validation
   * @returns Success or error
   *
   * @see Requirements 4.6
   */
  resendInvitation(
    membershipId: string,
    tenantId: string,
  ): Promise<DomainResult<void>>;

  /**
   * Cancel a pending invitation.
   *
   * Only valid for INVITED status members.
   *
   * @param membershipId - The membership record ID
   * @param tenantId - The tenant for scope validation
   * @returns Success or error
   *
   * @see Requirements 4.7
   */
  cancelInvitation(
    membershipId: string,
    tenantId: string,
  ): Promise<DomainResult<void>>;

  // ---------------------------------------------------------------------------
  // Status Management Operations
  // ---------------------------------------------------------------------------

  /**
   * Change a member's status.
   *
   * Valid transitions:
   * - ACTIVE → SUSPENDED (suspend)
   * - SUSPENDED → ACTIVE (activate)
   * - SUSPENDED → REVOKED (revoke)
   * - ACTIVE → REVOKED (direct revoke)
   *
   * @param membershipId - The membership record ID
   * @param tenantId - The tenant for scope validation
   * @param actorMembershipId - The actor's membership ID (for audit)
   * @param input - Status change details
   * @returns Updated member or error
   *
   * Possible errors:
   * - MEMBERSHIP_NOT_FOUND: Member not found
   * - MEMBERSHIP_INVALID_STATUS_TRANSITION: Invalid status transition
   * - AUTH_SELF_MODIFICATION: Cannot modify own membership
   * - AUTH_DELEGATION_VIOLATION: Member role not in actor's scope
   *
   * @see Requirements 4.3-4.5, 4.8-4.9
   */
  changeMemberStatus(
    membershipId: string,
    tenantId: string,
    actorMembershipId: string,
    input: ChangeMemberStatusInput,
  ): Promise<DomainResult<Member>>;

  // ---------------------------------------------------------------------------
  // Role Management Operations
  // ---------------------------------------------------------------------------

  /**
   * Change a member's role and/or OrgUnit assignment.
   *
   * The actor must have delegation authority over both the current role
   * and the target role. OrgUnit changes must be within actor's scope.
   *
   * @param membershipId - The membership record ID
   * @param tenantId - The tenant for scope validation
   * @param actorMembershipId - The actor's membership ID (for audit)
   * @param input - Role change details
   * @returns Updated member or error
   *
   * Possible errors:
   * - MEMBERSHIP_NOT_FOUND: Member not found
   * - AUTH_DELEGATION_VIOLATION: New role not delegable by actor
   * - AUTH_OUT_OF_SCOPE: New OrgUnit not in actor's scope
   * - VALIDATION_ORGUNIT_REQUIRED: Org-scoped role requires OrgUnit
   * - VALIDATION_ORGUNIT_FORBIDDEN: Tenant-level role cannot have OrgUnit
   *
   * @see Requirements 5.6-5.10
   */
  changeMemberRole(
    membershipId: string,
    tenantId: string,
    actorMembershipId: string,
    input: ChangeMemberRoleInput,
  ): Promise<DomainResult<Member>>;

  // ---------------------------------------------------------------------------
  // Bulk Operations
  // ---------------------------------------------------------------------------

  /**
   * Perform bulk status change on multiple members.
   *
   * Operations are processed sequentially, continuing on failures.
   * Limited to 100 members per batch.
   *
   * @param membershipIds - List of membership IDs to update
   * @param tenantId - The tenant for scope validation
   * @param actorMembershipId - The actor's membership ID
   * @param input - Status change details
   * @returns Result with successes and failures
   *
   * @see Requirements 6.4, 6.6-6.7
   */
  bulkChangeMemberStatus(
    membershipIds: string[],
    tenantId: string,
    actorMembershipId: string,
    input: ChangeMemberStatusInput,
  ): Promise<
    DomainResult<{
      successes: string[];
      failures: Array<{
        membershipId: string;
        errorCode: string;
        errorMessage: string;
      }>;
    }>
  >;

  /**
   * Perform bulk role change on multiple members.
   *
   * Operations are processed sequentially, continuing on failures.
   * Limited to 100 members per batch.
   *
   * @param membershipIds - List of membership IDs to update
   * @param tenantId - The tenant for scope validation
   * @param actorMembershipId - The actor's membership ID
   * @param input - Role change details
   * @returns Result with successes and failures
   *
   * @see Requirements 6.4
   */
  bulkChangeMemberRole(
    membershipIds: string[],
    tenantId: string,
    actorMembershipId: string,
    input: ChangeMemberRoleInput,
  ): Promise<
    DomainResult<{
      successes: string[];
      failures: Array<{
        membershipId: string;
        errorCode: string;
        errorMessage: string;
      }>;
    }>
  >;
}

/**
 * Batch size limits for bulk operations.
 */
export const BULK_OPERATION_LIMITS = {
  INVITATION: 50,
  STATUS_CHANGE: 100,
  ROLE_CHANGE: 100,
} as const;
