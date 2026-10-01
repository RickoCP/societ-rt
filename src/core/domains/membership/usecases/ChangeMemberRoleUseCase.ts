/**
 * ChangeMemberRoleUseCase — Handles member role changes for Admin UI.
 *
 * This use case orchestrates changing a member's role and/or OrgUnit assignment,
 * validating against the delegation matrix and authorization scope.
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has membership:write permission
 * 2. Validate actor's membership is ACTIVE
 * 3. Prevent self-modification (actor cannot change their own role)
 * 4. Validate actor can manage the target member's CURRENT role (delegation matrix)
 * 5. Validate actor can grant the NEW role (delegation matrix)
 * 6. Validate OrgUnit requirement based on new role
 * 7. Validate new OrgUnit is within actor's scope (if org-scoped role)
 * 8. Call repository for role change
 * 9. Return updated member
 *
 * **SECURITY RULES:**
 * - Actors can only change roles within their delegation scope
 * - New role must be within actor's delegatable roles
 * - Target OrgUnit must be within actor's authorization scope
 * - Org-scoped roles REQUIRE an OrgUnit assignment
 * - Tenant-level roles MUST NOT have OrgUnit assignment
 * - Self-modification is blocked (AUTH_SELF_MODIFICATION)
 *
 * @see Requirements 5.6-5.10 (Member Role Change)
 * @see Design Components and Interfaces > 4. Member Role Change
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, validationError, businessError } from '@core/utils';
import type { Member } from '../entities/Member';
import type {
  MembershipAdminRepository,
  ChangeMemberRoleInput,
} from '../repositories/MembershipAdminRepository';
import type { MembershipRole } from '../types/MembershipRole';
import { MembershipStatus, isOrgScopedRole, isTenantLevelRole } from '../types';
import {
  authInsufficientPermission,
  authNoMembership,
  authDelegationViolation,
  authOutOfScope,
} from '../errors';
import {
  type IDelegationMatrixService,
  canDelegate,
} from '../services/DelegationMatrixService';

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

/**
 * Input parameters for changing a member's role.
 */
export interface ChangeMemberRoleUseCaseInput {
  /**
   * The membership ID of the member whose role is being changed.
   */
  readonly membershipId: string;

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
   * Used to validate target OrgUnit is within scope.
   */
  readonly actorOrgUnitId: string | null;

  /**
   * Whether the actor has membership:write permission.
   */
  readonly hasWritePermission: boolean;

  /**
   * The current role of the target member.
   * Used to validate actor can manage this member.
   */
  readonly targetCurrentRole: MembershipRole;

  /**
   * The new role to assign to the member.
   */
  readonly newRole: MembershipRole;

  /**
   * The new OrgUnit to assign the member to.
   * Required for org-scoped roles; must be null for tenant-level roles.
   */
  readonly newOrgUnitId: string | null;

  /**
   * Optional reason for the role change (for audit).
   */
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * ChangeMemberRoleUseCase interface — handles member role changes.
 */
export interface ChangeMemberRoleUseCase {
  /**
   * Execute the role change operation.
   *
   * @param input - The role change input parameters
   * @returns DomainResult with updated member or error
   *
   * Possible errors:
   * - AUTH_INSUFFICIENT_PERMISSION: Actor lacks membership:write permission
   * - AUTH_NO_MEMBERSHIP: Invalid tenant context
   * - ACTOR_MEMBERSHIP_INACTIVE: Actor's membership is not ACTIVE
   * - AUTH_SELF_MODIFICATION: Cannot modify own role
   * - AUTH_DELEGATION_VIOLATION: Cannot manage target's current role OR cannot grant new role
   * - AUTH_OUT_OF_SCOPE: New OrgUnit is outside actor's scope
   * - VALIDATION_ORGUNIT_REQUIRED: Org-scoped role requires OrgUnit
   * - VALIDATION_ORGUNIT_FORBIDDEN: Tenant-level role cannot have OrgUnit
   * - VALIDATION_SAME_ROLE: New role is same as current role (no change needed)
   *
   * @see Requirements 5.6-5.10
   */
  execute(input: ChangeMemberRoleUseCaseInput): Promise<DomainResult<Member>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a ChangeMemberRoleUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of ChangeMemberRoleUseCase
 */
export const ChangeMemberRoleUseCaseImpl = ({
  membershipAdminRepository,
  delegationMatrixService,
  orgUnitScopeChecker,
}: {
  membershipAdminRepository: MembershipAdminRepository;
  delegationMatrixService?: IDelegationMatrixService;
  /**
   * Optional scope checker to verify OrgUnit is within actor's scope.
   * If not provided, assumes repository handles scope validation.
   */
  orgUnitScopeChecker?: {
    isOrgUnitInScope: (
      actorOrgUnitId: string | null,
      targetOrgUnitId: string | null,
      tenantId: string,
    ) => Promise<boolean>;
  };
}): ChangeMemberRoleUseCase => {
  /**
   * Check if actor can delegate a role using the delegation matrix.
   */
  const canDelegateRole = (actorRole: MembershipRole, targetRole: MembershipRole): boolean => {
    return delegationMatrixService
      ? delegationMatrixService.canDelegateRole(actorRole, targetRole)
      : canDelegate(actorRole, targetRole);
  };

  /**
   * Validate OrgUnit scope (target must be within actor's scope).
   */
  const validateOrgUnitScope = async (
    actorOrgUnitId: string | null,
    targetOrgUnitId: string | null,
    tenantId: string,
  ): Promise<DomainResult<void>> => {
    // If actor is tenant-level admin (null OrgUnit), they can assign to any OrgUnit
    if (actorOrgUnitId === null) {
      return ok(undefined);
    }

    // If no target OrgUnit (tenant-level role), check is not applicable
    if (targetOrgUnitId === null) {
      return ok(undefined);
    }

    // If scope checker is provided, use it
    if (orgUnitScopeChecker) {
      const inScope = await orgUnitScopeChecker.isOrgUnitInScope(
        actorOrgUnitId,
        targetOrgUnitId,
        tenantId,
      );

      if (!inScope) {
        return fail(authOutOfScope());
      }
    }

    // If actor is org-scoped and assigning to a different OrgUnit without a checker,
    // we assume the repository will handle the validation
    // For a strict implementation, we could fail here, but the repository layer
    // should enforce scope constraints as the final check

    return ok(undefined);
  };

  return {
    execute: async (input: ChangeMemberRoleUseCaseInput): Promise<DomainResult<Member>> => {
      const {
        membershipId,
        tenantId,
        actorMembershipId,
        actorRole,
        actorStatus,
        actorOrgUnitId,
        hasWritePermission,
        targetCurrentRole,
        newRole,
        newOrgUnitId,
        reason,
      } = input;

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
            'Actor membership must be ACTIVE to change member roles',
            { userMessage: 'Your membership is not active.' },
          ),
        );
      }

      // Step 4: Prevent self-modification
      // Note: We use membershipId comparison, not userId comparison,
      // because the same user might have multiple memberships
      if (membershipId === actorMembershipId) {
        return fail(
          businessError(
            'AUTH_SELF_MODIFICATION',
            'Cannot modify own membership role',
            { userMessage: 'You cannot change your own role.' },
          ),
        );
      }

      // Step 5: Validate actor can manage the target's CURRENT role
      // The actor must have delegation authority over the target's current role
      // to be able to modify them at all
      // Exception: If target's current role equals the actor's role, they can still manage
      // (e.g., TENANT_OWNER can manage another TENANT_OWNER's assignment)
      if (targetCurrentRole !== actorRole && !canDelegateRole(actorRole, targetCurrentRole)) {
        return fail(authDelegationViolation(targetCurrentRole));
      }

      // Step 6: Validate actor can grant the NEW role
      // The actor must have delegation authority to grant the new role
      if (!canDelegateRole(actorRole, newRole)) {
        return fail(authDelegationViolation(newRole));
      }

      // Step 7: Validate OrgUnit requirement based on new role
      if (isOrgScopedRole(newRole) && !newOrgUnitId) {
        return fail(
          validationError(
            'VALIDATION_ORGUNIT_REQUIRED',
            `Role ${newRole} requires OrgUnit assignment`,
            { userMessage: 'An organization unit is required for this role.' },
          ),
        );
      }

      // Tenant-level roles should not have OrgUnit
      if (isTenantLevelRole(newRole) && newOrgUnitId) {
        return fail(
          validationError(
            'VALIDATION_ORGUNIT_FORBIDDEN',
            `Role ${newRole} cannot have OrgUnit assignment`,
            { userMessage: 'This role cannot be assigned to an organization unit.' },
          ),
        );
      }

      // Step 8: Validate new OrgUnit is within actor's scope
      const scopeValidation = await validateOrgUnitScope(actorOrgUnitId, newOrgUnitId, tenantId);
      if (!scopeValidation.success) {
        return scopeValidation;
      }

      // Step 9: Call repository for role change
      const roleChangeInput: ChangeMemberRoleInput = {
        newRole,
        newOrgUnitId,
        reason,
      };

      const result = await membershipAdminRepository.changeMemberRole(
        membershipId,
        tenantId,
        actorMembershipId,
        roleChangeInput,
      );

      // Step 10: Return result directly (repository returns DomainResult<Member>)
      return result;
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type ChangeMemberRoleUseCaseType = ChangeMemberRoleUseCase;
