/**
 * AssignMembersToOrgUnitUseCase — Handles bulk member assignment to OrgUnits.
 *
 * This use case orchestrates assigning one or more members to a specific OrgUnit,
 * validating authorization scope and delegation rules, and tracking which assignments
 * would move members outside the actor's scope.
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has membership:write permission
 * 2. Validate actor's membership is ACTIVE
 * 3. Validate target OrgUnit exists and is within actor's scope
 * 4. For each member to assign:
 *    a. Validate actor can manage the member's current role
 *    b. Check if assignment changes member's scope outside actor's scope
 *    c. Call repository for OrgUnit change
 * 5. Return results with successes, failures, and scope warnings
 *
 * **SECURITY RULES:**
 * - Actors can only assign members within their delegation scope
 * - Target OrgUnit must be within actor's authorization scope
 * - Scope-changing assignments are allowed but flagged with warnings
 * - Org-scoped roles REQUIRE an OrgUnit assignment
 * - Bulk operations continue on individual failures
 *
 * @see Requirements 9.6, 9.7, 9.10 (OrgUnit Member Assignment)
 * @see Design Components and Interfaces > 7. OrgUnit Member Assignment
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, businessError } from '@core/utils';
import type { Member } from '../entities/Member';
import type {
  MembershipAdminRepository,
  ChangeMemberRoleInput,
} from '../repositories/MembershipAdminRepository';
import type { MembershipRole } from '../types/MembershipRole';
import { MembershipStatus, isTenantLevelRole } from '../types';
import {
  authInsufficientPermission,
  authNoMembership,
  authDelegationViolation,
  authOutOfScope,
} from '../errors';
import { canDelegate } from '../services/DelegationMatrixService';

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

/**
 * Information about a member to be assigned to an OrgUnit.
 */
export interface MemberAssignmentInfo {
  /**
   * The membership ID of the member to assign.
   */
  readonly membershipId: string;

  /**
   * The member's current role (for delegation validation).
   */
  readonly currentRole: MembershipRole;

  /**
   * The member's current OrgUnit ID (null for tenant-level).
   */
  readonly currentOrgUnitId: string | null;
}

/**
 * Input parameters for assigning members to an OrgUnit.
 */
export interface AssignMembersToOrgUnitInput {
  /**
   * The target OrgUnit to assign members to.
   */
  readonly targetOrgUnitId: string;

  /**
   * The tenant context for scope validation.
   */
  readonly tenantId: string;

  /**
   * The actor's membership ID (for audit trail).
   */
  readonly actorMembershipId: string;

  /**
   * The actor's role (for delegation matrix validation).
   */
  readonly actorRole: MembershipRole;

  /**
   * The actor's membership status (must be ACTIVE).
   */
  readonly actorStatus: MembershipStatus;

  /**
   * The actor's OrgUnit scope (null for tenant-level admins).
   * Used to validate target OrgUnit is within scope and detect scope-changing assignments.
   */
  readonly actorOrgUnitId: string | null;

  /**
   * Whether the actor has membership:write permission.
   */
  readonly hasWritePermission: boolean;

  /**
   * List of members to assign to the target OrgUnit.
   */
  readonly members: readonly MemberAssignmentInfo[];

  /**
   * Optional reason for the assignment (for audit).
   */
  readonly reason?: string;
}

/**
 * Result of a single member assignment operation.
 */
export interface SingleAssignmentResult {
  /**
   * The membership ID that was processed.
   */
  readonly membershipId: string;

  /**
   * Whether the assignment succeeded.
   */
  readonly success: boolean;

  /**
   * Error code if the assignment failed.
   */
  readonly errorCode?: string;

  /**
   * Error message if the assignment failed.
   */
  readonly errorMessage?: string;

  /**
   * Whether this assignment moved the member outside the actor's scope.
   * Only set for successful assignments.
   */
  readonly movedOutOfActorScope?: boolean;

  /**
   * The updated member if assignment succeeded.
   */
  readonly member?: Member;
}

/**
 * Result of bulk member assignment operation.
 */
export interface AssignMembersToOrgUnitResult {
  /**
   * Total number of members processed.
   */
  readonly total: number;

  /**
   * List of successfully assigned members.
   */
  readonly successes: SingleAssignmentResult[];

  /**
   * List of failed assignments with error details.
   */
  readonly failures: SingleAssignmentResult[];

  /**
   * List of assignments that moved members outside the actor's scope.
   * These are a subset of successes that require special attention.
   */
  readonly scopeChangingAssignments: SingleAssignmentResult[];

  /**
   * Whether all assignments succeeded.
   */
  readonly allSucceeded: boolean;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * AssignMembersToOrgUnitUseCase interface — handles bulk member assignment to OrgUnits.
 */
export interface AssignMembersToOrgUnitUseCase {
  /**
   * Execute the bulk member assignment operation.
   *
   * @param input - The assignment input parameters
   * @returns DomainResult with assignment results or error
   *
   * Possible errors (for entire operation):
   * - AUTH_INSUFFICIENT_PERMISSION: Actor lacks membership:write permission
   * - AUTH_NO_MEMBERSHIP: Invalid tenant context
   * - ACTOR_MEMBERSHIP_INACTIVE: Actor's membership is not ACTIVE
   * - AUTH_OUT_OF_SCOPE: Target OrgUnit is outside actor's scope
   * - TENANT_LEVEL_ROLE_ASSIGNMENT: Cannot assign tenant-level role to OrgUnit
   *
   * Individual assignment errors (in failures array):
   * - AUTH_DELEGATION_VIOLATION: Cannot manage member's current role
   * - MEMBERSHIP_NOT_FOUND: Member not found
   * - VALIDATION_ERROR: Various validation errors
   *
   * @see Requirements 9.6, 9.7, 9.10
   */
  execute(input: AssignMembersToOrgUnitInput): Promise<DomainResult<AssignMembersToOrgUnitResult>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Batch size limit for bulk assignment operations.
 * Prevents timeout and excessive load.
 */
export const BULK_ASSIGNMENT_LIMIT = 100;

/**
 * Factory function to create an AssignMembersToOrgUnitUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of AssignMembersToOrgUnitUseCase
 */
export const AssignMembersToOrgUnitUseCaseImpl = ({
  membershipAdminRepository,
  orgUnitScopeChecker,
}: {
  membershipAdminRepository: MembershipAdminRepository;
  /**
   * Scope checker to verify OrgUnit relationships.
   */
  orgUnitScopeChecker: {
    /**
     * Check if target OrgUnit is within actor's scope.
     */
    isOrgUnitInScope: (
      actorOrgUnitId: string | null,
      targetOrgUnitId: string | null,
      tenantId: string,
    ) => Promise<boolean>;

    /**
     * Check if target OrgUnit is a descendant of actor's OrgUnit.
     * Used to detect scope-changing assignments.
     */
    isDescendantOrEqual: (
      targetOrgUnitId: string,
      actorOrgUnitId: string,
      tenantId: string,
    ) => Promise<boolean>;
  };
}): AssignMembersToOrgUnitUseCase => {
  /**
   * Check if assignment would move member outside actor's scope.
   *
   * This happens when:
   * - Actor is org-scoped
   * - Target OrgUnit is NOT within actor's scope
   *
   * For tenant-level admins (actorOrgUnitId === null), assignments never
   * move members outside their scope.
   */
  const wouldMoveOutOfActorScope = async (
    actorOrgUnitId: string | null,
    targetOrgUnitId: string,
    tenantId: string,
  ): Promise<boolean> => {
    // Tenant-level admins have full scope
    if (actorOrgUnitId === null) {
      return false;
    }

    // Check if target is within actor's scope
    const inScope = await orgUnitScopeChecker.isDescendantOrEqual(
      targetOrgUnitId,
      actorOrgUnitId,
      tenantId,
    );

    // If target is NOT in actor's scope, the member would move out
    return !inScope;
  };

  return {
    execute: async (
      input: AssignMembersToOrgUnitInput,
    ): Promise<DomainResult<AssignMembersToOrgUnitResult>> => {
      const {
        targetOrgUnitId,
        tenantId,
        actorMembershipId,
        actorRole,
        actorStatus,
        actorOrgUnitId,
        hasWritePermission,
        members,
        reason,
      } = input;

      // ---------------------------------------------------------------------------
      // Pre-validation: Check actor permissions and target validity
      // ---------------------------------------------------------------------------

      // Step 1: Validate actor has membership:write permission
      if (!hasWritePermission) {
        return fail(authInsufficientPermission(['membership:write']));
      }

      // Step 2: Validate tenantId is provided
      if (!tenantId) {
        return fail(authNoMembership());
      }

      // Step 3: Validate actor's membership is ACTIVE
      if (actorStatus !== MembershipStatus.ACTIVE) {
        return fail(
          businessError(
            'ACTOR_MEMBERSHIP_INACTIVE',
            'Actor membership must be ACTIVE to assign members',
            { userMessage: 'Your membership is not active.' },
          ),
        );
      }

      // Step 4: Validate batch size limit
      if (members.length > BULK_ASSIGNMENT_LIMIT) {
        return fail(
          businessError(
            'BULK_OPERATION_LIMIT_EXCEEDED',
            `Cannot assign more than ${BULK_ASSIGNMENT_LIMIT} members in a single operation`,
            {
              userMessage: `Maximum ${BULK_ASSIGNMENT_LIMIT} members can be assigned at once.`,
            },
          ),
        );
      }

      // Step 5: Validate empty members list
      if (members.length === 0) {
        return ok({
          total: 0,
          successes: [],
          failures: [],
          scopeChangingAssignments: [],
          allSucceeded: true,
        });
      }

      // Step 6: Validate target OrgUnit is within actor's scope
      // Note: For tenant-level admins, all OrgUnits are in scope
      if (actorOrgUnitId !== null) {
        const targetInScope = await orgUnitScopeChecker.isOrgUnitInScope(
          actorOrgUnitId,
          targetOrgUnitId,
          tenantId,
        );

        if (!targetInScope) {
          return fail(authOutOfScope());
        }
      }

      // ---------------------------------------------------------------------------
      // Process each member assignment
      // ---------------------------------------------------------------------------

      const successes: SingleAssignmentResult[] = [];
      const failures: SingleAssignmentResult[] = [];
      const scopeChangingAssignments: SingleAssignmentResult[] = [];

      for (const memberInfo of members) {
        const { membershipId, currentRole, currentOrgUnitId } = memberInfo;

        // Skip if member is already at target OrgUnit
        if (currentOrgUnitId === targetOrgUnitId) {
          successes.push({
            membershipId,
            success: true,
            movedOutOfActorScope: false,
          });
          continue;
        }

        // Check if actor can manage the member's current role
        // Actor can manage roles they can delegate OR their own role level
        if (currentRole !== actorRole && !canDelegate(actorRole, currentRole)) {
          failures.push({
            membershipId,
            success: false,
            errorCode: 'AUTH_DELEGATION_VIOLATION',
            errorMessage: `Cannot manage member with role ${currentRole}`,
          });
          continue;
        }

        // Check if member's role is tenant-level (cannot assign to OrgUnit)
        if (isTenantLevelRole(currentRole)) {
          failures.push({
            membershipId,
            success: false,
            errorCode: 'TENANT_LEVEL_ROLE_ASSIGNMENT',
            errorMessage: `Cannot assign tenant-level role ${currentRole} to an OrgUnit`,
          });
          continue;
        }

        // Prevent self-assignment modification
        if (membershipId === actorMembershipId) {
          failures.push({
            membershipId,
            success: false,
            errorCode: 'AUTH_SELF_MODIFICATION',
            errorMessage: 'Cannot modify own OrgUnit assignment',
          });
          continue;
        }

        // Check if this assignment would move member outside actor's scope
        const wouldMoveOut = await wouldMoveOutOfActorScope(
          actorOrgUnitId,
          targetOrgUnitId,
          tenantId,
        );

        // Perform the OrgUnit assignment via changeMemberRole
        // Note: We keep the same role, only changing the OrgUnit
        const roleChangeInput: ChangeMemberRoleInput = {
          newRole: currentRole, // Keep same role
          newOrgUnitId: targetOrgUnitId, // Change OrgUnit
          reason: reason ?? 'OrgUnit assignment via Admin UI',
        };

        const result = await membershipAdminRepository.changeMemberRole(
          membershipId,
          tenantId,
          actorMembershipId,
          roleChangeInput,
        );

        if (result.success) {
          const successResult: SingleAssignmentResult = {
            membershipId,
            success: true,
            movedOutOfActorScope: wouldMoveOut,
            member: result.data,
          };

          successes.push(successResult);

          // Track scope-changing assignments separately
          if (wouldMoveOut) {
            scopeChangingAssignments.push(successResult);
          }
        } else {
          failures.push({
            membershipId,
            success: false,
            errorCode: result.error?.code ?? 'UNKNOWN_ERROR',
            errorMessage: result.error?.message ?? 'Assignment failed',
          });
        }
      }

      // ---------------------------------------------------------------------------
      // Return aggregated results
      // ---------------------------------------------------------------------------

      return ok({
        total: members.length,
        successes,
        failures,
        scopeChangingAssignments,
        allSucceeded: failures.length === 0,
      });
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type AssignMembersToOrgUnitUseCaseType = AssignMembersToOrgUnitUseCase;
