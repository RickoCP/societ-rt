/**
 * DelegatedMembershipService — Orchestrates membership creation with delegation validation.
 *
 * This service provides a high-level operation for creating memberships through delegation.
 * It integrates:
 * - DelegationMatrixService for validating delegation rules
 * - MembershipLifecycleService for creating the actual membership
 * - OrgUnitHierarchyReader for scope validation (target within delegator's scope)
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate delegator's membership is ACTIVE (Req 25 AC 8)
 * 2. Validate target role can be delegated (Req 25 AC 4, AC 5)
 * 3. Validate target role is in delegator's delegation set (Req 25 AC 2)
 * 4. Validate target OrgUnit is within delegator's scope (Req 25 AC 1)
 * 5. Create membership via MembershipLifecycleService
 * 6. Emit audit event (Req 25 AC 6)
 *
 * @see FASE 1.18 Task 51: Delegation Matrix Implementation
 * @see Requirements 25 (AC 1-9)
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { Membership } from '../entities';
import type { MembershipRole, MembershipStatus } from '../types';
import type { IOrgUnitHierarchyReader } from '@core/domains/orgunit/services';
import type {
  IDelegationMatrixService,
  DelegationCheckInput,
} from './DelegationMatrixService';
import type { IMembershipLifecycleService } from './MembershipLifecycleService';
import { authDelegationViolation, authOutOfScope } from '../errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input for delegated membership creation.
 */
export interface DelegatedCreateMembershipInput {
  /** ID of the user performing the delegation */
  readonly delegatorUserId: string;
  /** Membership of the delegator (must be ACTIVE) */
  readonly delegatorMembership: {
    readonly role: MembershipRole;
    readonly status: MembershipStatus;
    readonly orgUnitId: string | null;
  };
  /** ID of the user receiving the membership */
  readonly targetUserId: string;
  /** The tenant where membership is being created */
  readonly tenantId: string;
  /** The OrgUnit for the new membership (null for tenant-level roles) */
  readonly targetOrgUnitId: string | null;
  /** The role being assigned */
  readonly targetRole: MembershipRole;
  /** Initial status for the membership */
  readonly initialStatus: MembershipStatus;
  /** Reason for the delegation (for audit) */
  readonly reason?: string;
}

/**
 * Result of delegated membership creation.
 */
export interface DelegatedCreateMembershipResult {
  /** The created membership */
  readonly membership: Membership;
  /** Delegation was validated and allowed */
  readonly delegationAllowed: boolean;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * IDelegatedMembershipService interface.
 *
 * Provides high-level operations for creating memberships through delegation
 * with full delegation matrix validation and audit logging.
 */
export interface IDelegatedMembershipService {
  /**
   * Create a membership through delegation.
   *
   * This is the primary method for administrators to grant roles to users.
   * It validates all delegation rules before creating the membership.
   *
   * @param input - The delegated creation input
   * @returns DomainResult with created membership or error
   */
  createThroughDelegation(
    input: DelegatedCreateMembershipInput,
  ): Promise<DomainResult<DelegatedCreateMembershipResult>>;

  /**
   * Check if a delegation would be allowed without performing it.
   *
   * Useful for UI to show/hide role options.
   *
   * @param delegatorRole - The role attempting to delegate
   * @param delegatorStatus - Status of delegator's membership
   * @param delegatorOrgUnitId - OrgUnit of delegator
   * @param targetRole - The role to be granted
   * @param targetOrgUnitId - The target OrgUnit
   * @param tenantId - The tenant context
   * @returns true if delegation would be allowed
   */
  canCreateThroughDelegation(
    delegatorRole: MembershipRole,
    delegatorStatus: MembershipStatus,
    delegatorOrgUnitId: string | null,
    targetRole: MembershipRole,
    targetOrgUnitId: string | null,
    tenantId: string,
  ): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a DelegatedMembershipService instance.
 *
 * @param dependencies - The service dependencies
 * @returns An implementation of IDelegatedMembershipService
 */
export const DelegatedMembershipServiceImpl = ({
  delegationMatrixService,
  membershipLifecycleService,
  orgUnitHierarchyReader,
}: {
  delegationMatrixService: IDelegationMatrixService;
  membershipLifecycleService: IMembershipLifecycleService;
  orgUnitHierarchyReader: IOrgUnitHierarchyReader;
}): IDelegatedMembershipService => {
  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Check if target OrgUnit is within delegator's scope.
   *
   * - Tenant-level delegators (null orgUnitId) can delegate to any OrgUnit
   * - Org-scoped delegators can only delegate to descendant or same OrgUnit
   */
  const isWithinDelegatorScope = async (
    delegatorOrgUnitId: string | null,
    targetOrgUnitId: string | null,
    tenantId: string,
  ): Promise<DomainResult<boolean>> => {
    // Tenant-level delegator (TENANT_OWNER) can delegate to any OrgUnit
    if (delegatorOrgUnitId === null) {
      return ok(true);
    }

    // Target is tenant-level (null) but delegator is org-scoped → not allowed
    // Only TENANT_OWNER can create tenant-level memberships
    if (targetOrgUnitId === null) {
      return ok(false);
    }

    // Check if target is descendant or equal to delegator's OrgUnit
    return orgUnitHierarchyReader.isDescendantOrEqual(
      targetOrgUnitId,
      delegatorOrgUnitId,
      tenantId,
    );
  };

  return {
    async createThroughDelegation(
      input: DelegatedCreateMembershipInput,
    ): Promise<DomainResult<DelegatedCreateMembershipResult>> {
      const {
        delegatorUserId,
        delegatorMembership,
        targetUserId,
        tenantId,
        targetOrgUnitId,
        targetRole,
        initialStatus,
        reason,
      } = input;

      // Step 1 & 2 & 3: Validate delegation via DelegationMatrixService
      const delegationInput: DelegationCheckInput = {
        delegatorRole: delegatorMembership.role,
        delegatorStatus: delegatorMembership.status,
        targetRole,
        delegatorOrgUnitId: delegatorMembership.orgUnitId,
        targetOrgUnitId,
        tenantId,
      };

      const delegationResult = await delegationMatrixService.validateAndAudit(
        delegationInput,
        delegatorUserId,
        targetUserId,
      );

      // If delegation validation failed with error, propagate it
      if (!delegationResult.success) {
        return delegationResult as DomainResult<DelegatedCreateMembershipResult>;
      }

      // Check delegation was actually allowed (not just "success with allowed=false")
      if (!delegationResult.data.allowed) {
        return fail(authDelegationViolation(targetRole));
      }

      // Step 4: Validate target OrgUnit is within delegator's scope (Req 25 AC 1)
      const scopeResult = await isWithinDelegatorScope(
        delegatorMembership.orgUnitId,
        targetOrgUnitId,
        tenantId,
      );

      if (!scopeResult.success) {
        return fail(authOutOfScope());
      }

      if (!scopeResult.data) {
        return fail(authOutOfScope());
      }

      // Step 5: Create membership via MembershipLifecycleService
      const createResult = await membershipLifecycleService.create({
        userId: targetUserId,
        tenantId,
        orgUnitId: targetOrgUnitId,
        role: targetRole,
        status: initialStatus,
        performedBy: delegatorUserId,
        reason: reason ?? `Delegated by ${delegatorMembership.role}`,
      });

      if (!createResult.success) {
        return createResult as DomainResult<DelegatedCreateMembershipResult>;
      }

      return ok({
        membership: createResult.data.membership,
        delegationAllowed: true,
      });
    },

    async canCreateThroughDelegation(
      delegatorRole: MembershipRole,
      delegatorStatus: MembershipStatus,
      delegatorOrgUnitId: string | null,
      targetRole: MembershipRole,
      targetOrgUnitId: string | null,
      tenantId: string,
    ): Promise<boolean> {
      // Quick check: delegation matrix validation (without audit)
      const validationResult = delegationMatrixService.validateDelegation({
        delegatorRole,
        delegatorStatus,
        targetRole,
      });

      if (!validationResult.success || !validationResult.data.allowed) {
        return false;
      }

      // Check scope validity
      const scopeResult = await isWithinDelegatorScope(
        delegatorOrgUnitId,
        targetOrgUnitId,
        tenantId,
      );

      return scopeResult.success && scopeResult.data;
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type DelegatedMembershipService = IDelegatedMembershipService;
