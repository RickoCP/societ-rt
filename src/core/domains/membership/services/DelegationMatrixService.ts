/**
 * DelegationMatrixService — Domain service for enforcing explicit delegation rules.
 *
 * This service manages role delegation using an **explicit matrix**, NOT permission counting.
 * The delegation matrix defines which roles can grant which other roles.
 *
 * **DELEGATION MATRIX (LOCKED L9):**
 * - PLATFORM_ADMIN: []  — Cannot delegate any role (platform operations only)
 * - TENANT_OWNER: [ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT]
 * - ORG_ADMIN: [RT_ADMIN, SECURITY, RESIDENT]
 * - RT_ADMIN: [SECURITY, RESIDENT]
 * - SECURITY: []  — Cannot delegate any role
 * - RESIDENT: []  — Cannot delegate any role
 *
 * **CRITICAL SECURITY RULES:**
 * - No role can grant PLATFORM_ADMIN (platform-level operation only)
 * - No role can grant TENANT_OWNER (requires explicit ownership transfer flow - Task 52)
 * - Delegation is via explicit matrix, NOT permission counting
 * - Delegator's membership must be ACTIVE
 * - Target OrgUnit must be within delegator's scope (or descendant)
 *
 * **VIOLATIONS → AUTH_DELEGATION_VIOLATION**
 *
 * @see FASE 1.18 Task 51: Delegation Matrix Implementation
 * @see Requirements 25 (AC 1-9)
 * @see Design Section 9: Delegation Matrix
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { MembershipRole, MembershipStatus } from '../types';
import { authDelegationViolation, authMembershipInactive } from '../errors';

// ---------------------------------------------------------------------------
// Delegation Matrix Configuration (LOCKED L9)
// ---------------------------------------------------------------------------

/**
 * DELEGATION_MATRIX — Explicit configuration of which roles can grant which other roles.
 *
 * This is a LOCKED design decision (L9) from the architecture design.
 * Role delegation is via explicit matrix, NOT permission counting.
 *
 * @see Design Section 9: Delegation Matrix
 */
export const DELEGATION_MATRIX: Readonly<Record<MembershipRole, readonly MembershipRole[]>> = Object.freeze({
  /**
   * PLATFORM_ADMIN: Cannot delegate any role.
   * Platform operations only — cross-tenant operations require Privileged Execution Path.
   */
  [MembershipRole.PLATFORM_ADMIN]: Object.freeze([]),

  /**
   * TENANT_OWNER: Can delegate ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT.
   * Full tenant-wide scope.
   */
  [MembershipRole.TENANT_OWNER]: Object.freeze([
    MembershipRole.ORG_ADMIN,
    MembershipRole.RT_ADMIN,
    MembershipRole.SECURITY,
    MembershipRole.RESIDENT,
  ]),

  /**
   * ORG_ADMIN: Can delegate RT_ADMIN, SECURITY, RESIDENT.
   * Manages OrgUnit subtree.
   */
  [MembershipRole.ORG_ADMIN]: Object.freeze([
    MembershipRole.RT_ADMIN,
    MembershipRole.SECURITY,
    MembershipRole.RESIDENT,
  ]),

  /**
   * RT_ADMIN: Can delegate SECURITY, RESIDENT.
   * Manages RT-level operations.
   */
  [MembershipRole.RT_ADMIN]: Object.freeze([
    MembershipRole.SECURITY,
    MembershipRole.RESIDENT,
  ]),

  /**
   * SECURITY: Cannot delegate any role.
   * Has distinct capability set from RESIDENT.
   */
  [MembershipRole.SECURITY]: Object.freeze([]),

  /**
   * RESIDENT: Cannot delegate any role.
   * Has distinct capability set from SECURITY.
   */
  [MembershipRole.RESIDENT]: Object.freeze([]),
});

/**
 * Roles that cannot be granted by ANY role through normal delegation.
 * - PLATFORM_ADMIN: Can only be assigned through system provisioning
 * - TENANT_OWNER: Can only be assigned through explicit ownership transfer flow (Task 52)
 *
 * @see Requirements 25 (AC 4, AC 5)
 */
export const NON_DELEGATABLE_ROLES: ReadonlySet<MembershipRole> = Object.freeze(
  new Set([MembershipRole.PLATFORM_ADMIN, MembershipRole.TENANT_OWNER]),
);

// ---------------------------------------------------------------------------
// Delegation Validation Types
// ---------------------------------------------------------------------------

/**
 * Input for delegation validation.
 */
export interface DelegationValidationInput {
  /** The role of the user attempting to delegate */
  readonly delegatorRole: MembershipRole;
  /** The status of the delegator's membership */
  readonly delegatorStatus: MembershipStatus;
  /** The role being granted to the target user */
  readonly targetRole: MembershipRole;
}

/**
 * Extended input for complete delegation check including scope.
 */
export interface DelegationCheckInput extends DelegationValidationInput {
  /** The delegator's OrgUnit ID (null for tenant-level) */
  readonly delegatorOrgUnitId: string | null;
  /** The target OrgUnit ID where the role is being assigned (null for tenant-level) */
  readonly targetOrgUnitId: string | null;
  /** The tenant ID for security boundary check */
  readonly tenantId: string;
}

/**
 * Result of delegation validation with reason.
 */
export interface DelegationValidationResult {
  /** Whether the delegation is allowed */
  readonly allowed: boolean;
  /** Reason code for the decision */
  readonly reason: DelegationDecisionReason;
  /** Human-readable explanation */
  readonly explanation: string;
}

/**
 * Reasons for delegation decisions.
 */
export enum DelegationDecisionReason {
  /** Delegation allowed by matrix */
  ALLOWED = 'ALLOWED',
  /** Target role is not in delegator's delegation set */
  NOT_IN_MATRIX = 'NOT_IN_MATRIX',
  /** Target role cannot be delegated by any role */
  NON_DELEGATABLE_ROLE = 'NON_DELEGATABLE_ROLE',
  /** Delegator has no delegation rights */
  NO_DELEGATION_RIGHTS = 'NO_DELEGATION_RIGHTS',
  /** Delegator's membership is not ACTIVE */
  DELEGATOR_NOT_ACTIVE = 'DELEGATOR_NOT_ACTIVE',
  /** Target OrgUnit is outside delegator's scope */
  OUT_OF_SCOPE = 'OUT_OF_SCOPE',
}

// ---------------------------------------------------------------------------
// Audit Event Types
// ---------------------------------------------------------------------------

/**
 * Delegation audit event types.
 */
export enum DelegationAuditEventType {
  /** Delegation attempt allowed */
  DELEGATION_ALLOWED = 'DELEGATION_ALLOWED',
  /** Delegation attempt denied */
  DELEGATION_DENIED = 'DELEGATION_DENIED',
}

/**
 * Delegation audit event payload.
 * All delegation attempts (successful and failed) must be logged.
 *
 * @see Requirements 25 (AC 6)
 */
export interface DelegationAuditEvent {
  /** The type of audit event */
  readonly type: DelegationAuditEventType;
  /** The delegator's user ID */
  readonly delegatorUserId: string;
  /** The delegator's role */
  readonly delegatorRole: MembershipRole;
  /** The target user receiving the role */
  readonly targetUserId: string;
  /** The role being granted */
  readonly requestedRole: MembershipRole;
  /** The OrgUnit where the role is being assigned */
  readonly targetOrgUnitId: string | null;
  /** The tenant context */
  readonly tenantId: string;
  /** Whether the delegation was allowed */
  readonly decision: boolean;
  /** Reason for the decision */
  readonly reason: DelegationDecisionReason;
  /** Timestamp of the event */
  readonly timestamp: Date;
}

/**
 * Interface for delegation audit event emitter.
 */
export interface IDelegationAuditEmitter {
  /**
   * Emit a delegation audit event.
   * @param event - The audit event to emit
   */
  emit(event: DelegationAuditEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * IDelegationMatrixService interface.
 *
 * Provides operations for validating role delegation against the explicit matrix.
 * This service DOES NOT perform permission counting or implicit hierarchy calculations.
 */
export interface IDelegationMatrixService {
  /**
   * Check if a role can delegate another role using the explicit matrix.
   *
   * This is a pure lookup against the DELEGATION_MATRIX — no permission counting.
   *
   * @param delegatorRole - The role attempting to delegate
   * @param targetRole - The role being granted
   * @returns true if delegation is allowed by the matrix
   */
  canDelegateRole(delegatorRole: MembershipRole, targetRole: MembershipRole): boolean;

  /**
   * Get the list of roles that a given role can delegate.
   *
   * @param role - The role to check
   * @returns Array of roles that can be delegated (empty array if none)
   */
  getDelegatableRoles(role: MembershipRole): readonly MembershipRole[];

  /**
   * Validate a complete delegation attempt.
   *
   * Checks:
   * 1. Delegator's membership status is ACTIVE (Req 25 AC 8)
   * 2. Target role is not PLATFORM_ADMIN (Req 25 AC 4)
   * 3. Target role is not TENANT_OWNER (Req 25 AC 5)
   * 4. Target role is in delegator's delegation set (Req 25 AC 2)
   *
   * Note: Scope checking (target OrgUnit within delegator's scope) is done
   * externally by the OrgUnitScopeAuthorizer as it requires database access.
   *
   * @param input - The delegation validation input
   * @returns DomainResult with validation result or error
   */
  validateDelegation(input: DelegationValidationInput): DomainResult<DelegationValidationResult>;

  /**
   * Validate delegation and log the audit event.
   *
   * This is the primary method for delegation checks with audit logging.
   *
   * @param input - The delegation check input
   * @param delegatorUserId - The delegator's user ID for audit
   * @param targetUserId - The target user ID for audit
   * @returns DomainResult with validation result
   */
  validateAndAudit(
    input: DelegationCheckInput,
    delegatorUserId: string,
    targetUserId: string,
  ): Promise<DomainResult<DelegationValidationResult>>;

  /**
   * Check if a role can be granted through normal delegation.
   *
   * Returns false for PLATFORM_ADMIN and TENANT_OWNER.
   *
   * @param role - The role to check
   * @returns true if the role can be delegated
   */
  isRoleDelegatable(role: MembershipRole): boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a DelegationMatrixService instance.
 *
 * @param dependencies - The service dependencies
 * @returns An implementation of IDelegationMatrixService
 */
export const DelegationMatrixServiceImpl = ({
  auditEmitter,
}: {
  auditEmitter: IDelegationAuditEmitter;
}): IDelegationMatrixService => {
  // -------------------------------------------------------------------------
  // Implementation
  // -------------------------------------------------------------------------

  /**
   * Get the delegatable roles for a given role from the matrix.
   */
  const getDelegatableRolesForRole = (role: MembershipRole): readonly MembershipRole[] => {
    return DELEGATION_MATRIX[role] ?? [];
  };

  /**
   * Check if a specific role can be delegated by any role.
   */
  const canBeGranted = (targetRole: MembershipRole): boolean => {
    return !NON_DELEGATABLE_ROLES.has(targetRole);
  };

  /**
   * Check if delegator role can grant target role via explicit matrix lookup.
   */
  const checkMatrixEntry = (delegatorRole: MembershipRole, targetRole: MembershipRole): boolean => {
    const delegatableRoles = getDelegatableRolesForRole(delegatorRole);
    return delegatableRoles.includes(targetRole);
  };

  /**
   * Build validation result with reason and explanation.
   */
  const buildValidationResult = (
    allowed: boolean,
    reason: DelegationDecisionReason,
    delegatorRole: MembershipRole,
    targetRole: MembershipRole,
  ): DelegationValidationResult => {
    let explanation: string;

    switch (reason) {
      case DelegationDecisionReason.ALLOWED:
        explanation = `Role ${delegatorRole} is allowed to delegate ${targetRole} per delegation matrix`;
        break;
      case DelegationDecisionReason.NON_DELEGATABLE_ROLE:
        explanation = `Role ${targetRole} cannot be granted through delegation (requires special flow)`;
        break;
      case DelegationDecisionReason.NOT_IN_MATRIX:
        explanation = `Role ${delegatorRole} is not authorized to delegate ${targetRole}`;
        break;
      case DelegationDecisionReason.NO_DELEGATION_RIGHTS:
        explanation = `Role ${delegatorRole} has no delegation rights`;
        break;
      case DelegationDecisionReason.DELEGATOR_NOT_ACTIVE:
        explanation = `Delegator's membership must be ACTIVE to perform delegation`;
        break;
      case DelegationDecisionReason.OUT_OF_SCOPE:
        explanation = `Target OrgUnit is outside delegator's scope`;
        break;
      default:
        explanation = `Delegation check failed`;
    }

    return { allowed, reason, explanation };
  };

  /**
   * Create audit event from validation context.
   */
  const createAuditEvent = (
    input: DelegationCheckInput,
    delegatorUserId: string,
    targetUserId: string,
    result: DelegationValidationResult,
  ): DelegationAuditEvent => ({
    type: result.allowed
      ? DelegationAuditEventType.DELEGATION_ALLOWED
      : DelegationAuditEventType.DELEGATION_DENIED,
    delegatorUserId,
    delegatorRole: input.delegatorRole,
    targetUserId,
    requestedRole: input.targetRole,
    targetOrgUnitId: input.targetOrgUnitId,
    tenantId: input.tenantId,
    decision: result.allowed,
    reason: result.reason,
    timestamp: new Date(),
  });

  return {
    canDelegateRole(delegatorRole: MembershipRole, targetRole: MembershipRole): boolean {
      // Check 1: Target role must be delegatable
      if (!canBeGranted(targetRole)) {
        return false;
      }

      // Check 2: Explicit matrix lookup
      return checkMatrixEntry(delegatorRole, targetRole);
    },

    getDelegatableRoles(role: MembershipRole): readonly MembershipRole[] {
      return getDelegatableRolesForRole(role);
    },

    validateDelegation(input: DelegationValidationInput): DomainResult<DelegationValidationResult> {
      const { delegatorRole, delegatorStatus, targetRole } = input;

      // Check 1: Delegator must have ACTIVE status (Req 25 AC 8)
      if (delegatorStatus !== MembershipStatus.ACTIVE) {
        return fail(authMembershipInactive());
      }

      // Check 2: Target role must be delegatable (Req 25 AC 4, AC 5)
      // PLATFORM_ADMIN and TENANT_OWNER cannot be granted through delegation
      if (!canBeGranted(targetRole)) {
        const reason =
          targetRole === MembershipRole.PLATFORM_ADMIN
            ? 'PLATFORM_ADMIN can only be assigned through system provisioning'
            : 'TENANT_OWNER can only be assigned through ownership transfer flow';

        return ok(buildValidationResult(
          false,
          DelegationDecisionReason.NON_DELEGATABLE_ROLE,
          delegatorRole,
          targetRole,
        ));
      }

      // Check 3: Delegator must have delegation rights (non-empty delegation set)
      const delegatableRoles = getDelegatableRolesForRole(delegatorRole);
      if (delegatableRoles.length === 0) {
        return ok(buildValidationResult(
          false,
          DelegationDecisionReason.NO_DELEGATION_RIGHTS,
          delegatorRole,
          targetRole,
        ));
      }

      // Check 4: Target role must be in delegator's delegation set (Req 25 AC 2)
      if (!checkMatrixEntry(delegatorRole, targetRole)) {
        return ok(buildValidationResult(
          false,
          DelegationDecisionReason.NOT_IN_MATRIX,
          delegatorRole,
          targetRole,
        ));
      }

      // All checks passed — delegation is allowed
      return ok(buildValidationResult(
        true,
        DelegationDecisionReason.ALLOWED,
        delegatorRole,
        targetRole,
      ));
    },

    async validateAndAudit(
      input: DelegationCheckInput,
      delegatorUserId: string,
      targetUserId: string,
    ): Promise<DomainResult<DelegationValidationResult>> {
      // Perform validation
      const validationResult = this.validateDelegation(input);

      // If validation failed with error (not just "not allowed"), return early
      if (!validationResult.success) {
        // Still audit the failed attempt
        const event = createAuditEvent(input, delegatorUserId, targetUserId, {
          allowed: false,
          reason: DelegationDecisionReason.DELEGATOR_NOT_ACTIVE,
          explanation: 'Delegator membership is not active',
        });
        await auditEmitter.emit(event);
        return validationResult;
      }

      const result = validationResult.data;

      // Emit audit event (Req 25 AC 6 - log all delegation attempts)
      const event = createAuditEvent(input, delegatorUserId, targetUserId, result);
      await auditEmitter.emit(event);

      // If delegation not allowed, return error
      if (!result.allowed) {
        return fail(authDelegationViolation(input.targetRole));
      }

      return ok(result);
    },

    isRoleDelegatable(role: MembershipRole): boolean {
      return canBeGranted(role);
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type DelegationMatrixService = IDelegationMatrixService;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Quick check if a delegation is allowed (without audit).
 *
 * Useful for UI-level checks to show/hide delegation options.
 *
 * @param delegatorRole - The role attempting to delegate
 * @param targetRole - The role being granted
 * @returns true if delegation is allowed by the matrix
 */
export function canDelegate(delegatorRole: MembershipRole, targetRole: MembershipRole): boolean {
  // Check 1: Target role must be delegatable
  if (NON_DELEGATABLE_ROLES.has(targetRole)) {
    return false;
  }

  // Check 2: Explicit matrix lookup
  const delegatableRoles = DELEGATION_MATRIX[delegatorRole] ?? [];
  return delegatableRoles.includes(targetRole);
}

/**
 * Get all roles that can be delegated by a given role.
 *
 * Useful for UI to show available role options.
 *
 * @param role - The delegator's role
 * @returns Array of delegatable roles
 */
export function getDelegatableRolesFor(role: MembershipRole): readonly MembershipRole[] {
  return DELEGATION_MATRIX[role] ?? [];
}

/**
 * Check if any role can grant the specified target role.
 *
 * @param targetRole - The role to check
 * @returns true if the role can be granted through delegation
 */
export function isGrantableThroughDelegation(role: MembershipRole): boolean {
  return !NON_DELEGATABLE_ROLES.has(role);
}
