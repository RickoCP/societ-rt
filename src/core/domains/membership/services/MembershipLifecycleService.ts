/**
 * MembershipLifecycleService — Domain service for membership lifecycle management.
 *
 * This service manages the complete lifecycle of memberships:
 * - Creation (with uniqueness enforcement)
 * - Status transitions (following the state machine)
 * - Revocation
 * - Event emission for audit and downstream systems
 *
 * **STATUS STATE MACHINE:**
 * - INVITED → ACTIVE (on acceptance)
 * - ACTIVE → SUSPENDED (on suspension)
 * - SUSPENDED → ACTIVE (on reactivation)
 * - SUSPENDED → REVOKED (on revocation)
 * - ACTIVE → REVOKED (on direct revocation)
 * - INVITED → REVOKED (on invitation rejection/cancellation)
 *
 * **UNIQUENESS CONSTRAINTS:**
 * - Org-scoped: One ACTIVE membership per (userId, tenantId, orgUnitId)
 * - Tenant-level: One ACTIVE tenant-level membership per (userId, tenantId)
 *
 * **SECURITY CONSIDERATIONS:**
 * - Role assignment must respect delegation matrix - use DelegationMatrixService
 *   or DelegatedMembershipService for admin operations (validated externally)
 * - OrgUnit must belong to the same tenant (INV-MEM-001)
 * - Tenant-level roles require null orgUnitId (INV-MEM-002)
 * - Org-scoped roles require valid orgUnitId (INV-MEM-003)
 * - Quarantined users cannot receive memberships (INV-QUARANTINE-001)
 *
 * @see FASE 1.18 Task 50: Membership Lifecycle Management
 * @see FASE 1.18 Task 51: Delegation Matrix Implementation
 * @see Requirements 22 (AC 1-7), Requirements 25 (AC 1-9)
 * @see Design Membership Model, Membership Invariants, Delegation Matrix
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type {
  Membership,
  CreateMembershipInput,
} from '../entities';
import type { IMembershipRepository, MembershipWriteRepository } from '../repositories';
import type { MembershipRole, MembershipStatus } from '../types';
import {
  isValidStatusTransition,
  isTerminalStatus,
  isTenantLevelRole,
  isOrgScopedRole,
  MembershipStatus as MembershipStatusEnum,
} from '../types';
import {
  authUserQuarantined,
  membershipInvariantViolation,
} from '../errors';
import type { IOrgUnitRepository } from '@core/domains/orgunit/repositories';
import { businessError, validationError } from '@core/utils';

// ---------------------------------------------------------------------------
// Domain Events
// ---------------------------------------------------------------------------

/**
 * Event types for membership lifecycle changes.
 * These events are emitted for audit and downstream systems (session management, etc.)
 */
export enum MembershipEventType {
  /** New membership created */
  CREATED = 'MEMBERSHIP_CREATED',
  /** Status changed (includes details of transition) */
  STATUS_CHANGED = 'MEMBERSHIP_STATUS_CHANGED',
  /** Membership was revoked (terminal state reached) */
  REVOKED = 'MEMBERSHIP_REVOKED',
  /** Membership was activated (from INVITED) */
  ACTIVATED = 'MEMBERSHIP_ACTIVATED',
  /** Membership was suspended */
  SUSPENDED = 'MEMBERSHIP_SUSPENDED',
  /** Membership was reactivated (from SUSPENDED) */
  REACTIVATED = 'MEMBERSHIP_REACTIVATED',
}

/**
 * Membership lifecycle event payload.
 */
export interface MembershipLifecycleEvent {
  /** The type of event */
  readonly type: MembershipEventType;
  /** The membership ID */
  readonly membershipId: string;
  /** The user ID */
  readonly userId: string;
  /** The tenant ID */
  readonly tenantId: string;
  /** The OrgUnit ID (null for tenant-level) */
  readonly orgUnitId: string | null;
  /** The role */
  readonly role: MembershipRole;
  /** The new status (after transition) */
  readonly newStatus: MembershipStatus;
  /** The old status (before transition, null for creation) */
  readonly oldStatus: MembershipStatus | null;
  /** Timestamp of the event */
  readonly timestamp: Date;
  /** ID of the user who performed the action (for audit) */
  readonly performedBy?: string;
  /** Additional context/reason for the action */
  readonly reason?: string;
}

/**
 * Event emitter interface for membership lifecycle events.
 * Implementations can publish to event outbox, message queue, etc.
 */
export interface IMembershipEventEmitter {
  /**
   * Emit a membership lifecycle event.
   * @param event - The event to emit
   */
  emit(event: MembershipLifecycleEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * Input for creating a new membership.
 */
export interface CreateMembershipCommand {
  /** The user receiving the membership */
  readonly userId: string;
  /** The tenant the membership belongs to */
  readonly tenantId: string;
  /** The OrgUnit scope (null for tenant-level roles) */
  readonly orgUnitId: string | null;
  /** The role being assigned */
  readonly role: MembershipRole;
  /** Initial status (INVITED or ACTIVE) */
  readonly status: MembershipStatus;
  /** User performing the action (for audit) */
  readonly performedBy?: string;
  /** Reason for creating the membership */
  readonly reason?: string;
}

/**
 * Input for transitioning membership status.
 */
export interface TransitionStatusCommand {
  /** The membership ID to transition */
  readonly membershipId: string;
  /** The target status */
  readonly targetStatus: MembershipStatus;
  /** The tenant context (for security boundary) */
  readonly tenantId: string;
  /** User performing the action (for audit) */
  readonly performedBy?: string;
  /** Reason for the transition */
  readonly reason?: string;
}

/**
 * Result of membership creation.
 */
export interface CreateMembershipResult {
  /** The created membership */
  readonly membership: Membership;
  /** The event that was emitted */
  readonly event: MembershipLifecycleEvent;
}

/**
 * Result of status transition.
 */
export interface TransitionStatusResult {
  /** The updated membership */
  readonly membership: Membership;
  /** The event that was emitted */
  readonly event: MembershipLifecycleEvent;
}

/**
 * MembershipLifecycleService interface.
 *
 * Provides operations for managing the complete lifecycle of memberships
 * with proper validation, uniqueness enforcement, and event emission.
 */
export interface IMembershipLifecycleService {
  /**
   * Create a new membership.
   *
   * Validates:
   * - User is not quarantined
   * - OrgUnit belongs to tenant (if provided)
   * - Role-scope consistency (INV-MEM-002, INV-MEM-003)
   * - Uniqueness constraint (no duplicate active membership)
   *
   * @param command - The creation command
   * @returns DomainResult with created membership or error
   */
  create(command: CreateMembershipCommand): Promise<DomainResult<CreateMembershipResult>>;

  /**
   * Transition a membership to a new status.
   *
   * Validates:
   * - Membership exists and belongs to tenant
   * - Current status allows transition to target status
   * - Sets revokedAt for REVOKED transitions
   *
   * @param command - The transition command
   * @returns DomainResult with updated membership or error
   */
  transitionStatus(command: TransitionStatusCommand): Promise<DomainResult<TransitionStatusResult>>;

  /**
   * Activate a membership (INVITED → ACTIVE).
   *
   * Convenience method for accepting an invitation.
   *
   * @param membershipId - The membership to activate
   * @param tenantId - The tenant context
   * @param performedBy - User performing the action
   * @returns DomainResult with activated membership or error
   */
  activate(
    membershipId: string,
    tenantId: string,
    performedBy?: string,
  ): Promise<DomainResult<TransitionStatusResult>>;

  /**
   * Suspend a membership (ACTIVE → SUSPENDED).
   *
   * @param membershipId - The membership to suspend
   * @param tenantId - The tenant context
   * @param reason - Reason for suspension
   * @param performedBy - User performing the action
   * @returns DomainResult with suspended membership or error
   */
  suspend(
    membershipId: string,
    tenantId: string,
    reason?: string,
    performedBy?: string,
  ): Promise<DomainResult<TransitionStatusResult>>;

  /**
   * Reactivate a suspended membership (SUSPENDED → ACTIVE).
   *
   * @param membershipId - The membership to reactivate
   * @param tenantId - The tenant context
   * @param performedBy - User performing the action
   * @returns DomainResult with reactivated membership or error
   */
  reactivate(
    membershipId: string,
    tenantId: string,
    performedBy?: string,
  ): Promise<DomainResult<TransitionStatusResult>>;

  /**
   * Revoke a membership (terminal state).
   *
   * Sets revokedAt timestamp. Revoked memberships cannot be reactivated.
   *
   * @param membershipId - The membership to revoke
   * @param tenantId - The tenant context
   * @param reason - Reason for revocation
   * @param performedBy - User performing the action
   * @returns DomainResult with revoked membership or error
   */
  revoke(
    membershipId: string,
    tenantId: string,
    reason?: string,
    performedBy?: string,
  ): Promise<DomainResult<TransitionStatusResult>>;

  /**
   * Check if a membership with the same scope already exists.
   *
   * Used for uniqueness validation before creation.
   *
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @param orgUnitId - The OrgUnit ID (null for tenant-level)
   * @returns true if an active membership already exists
   */
  existsActiveMembership(
    userId: string,
    tenantId: string,
    orgUnitId: string | null,
  ): Promise<boolean>;

  /**
   * Get a membership by ID within a tenant context.
   *
   * @param membershipId - The membership ID
   * @param tenantId - The tenant context (security boundary)
   * @returns The membership if found, null otherwise
   */
  getById(membershipId: string, tenantId: string): Promise<Membership | null>;
}

// ---------------------------------------------------------------------------
// Error Helpers
// ---------------------------------------------------------------------------

/**
 * Create a membership uniqueness violation error.
 */
export function membershipAlreadyExists(): ReturnType<typeof businessError> {
  return businessError(
    'MEMBERSHIP_ALREADY_EXISTS',
    'An active membership already exists for this user, tenant, and scope combination',
    { userMessage: 'A membership already exists for this scope' },
  );
}

/**
 * Create an invalid status transition error.
 */
export function invalidStatusTransition(
  currentStatus: MembershipStatus,
  targetStatus: MembershipStatus,
): ReturnType<typeof businessError> {
  return businessError(
    'INVALID_STATUS_TRANSITION',
    `Cannot transition from ${currentStatus} to ${targetStatus}`,
    { userMessage: 'This status transition is not allowed' },
  );
}

/**
 * Create a membership not found error.
 */
export function membershipNotFound(): ReturnType<typeof businessError> {
  return businessError(
    'MEMBERSHIP_NOT_FOUND',
    'Membership not found in the specified tenant',
    { userMessage: 'Membership not found' },
  );
}

/**
 * Create an orgUnit not in tenant error.
 */
export function orgUnitNotInTenant(): ReturnType<typeof validationError> {
  return validationError(
    'ORGUNIT_NOT_IN_TENANT',
    'OrgUnit does not belong to the specified tenant',
    { userMessage: 'Invalid organization unit' },
  );
}

/**
 * Create an invalid initial status error.
 */
export function invalidInitialStatus(): ReturnType<typeof validationError> {
  return validationError(
    'INVALID_INITIAL_STATUS',
    'Initial membership status must be INVITED or ACTIVE',
    { userMessage: 'Invalid initial status' },
  );
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a MembershipLifecycleService instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param dependencies - The service dependencies
 * @returns An implementation of IMembershipLifecycleService
 */
export const MembershipLifecycleServiceImpl = ({
  membershipRepository,
  membershipWriteRepository,
  orgUnitRepository,
  eventEmitter,
}: {
  membershipRepository: IMembershipRepository;
  membershipWriteRepository: MembershipWriteRepository;
  orgUnitRepository: IOrgUnitRepository;
  eventEmitter: IMembershipEventEmitter;
}): IMembershipLifecycleService => {
  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Validate role-scope consistency per invariants.
   */
  const validateRoleScopeConsistency = (
    role: MembershipRole,
    orgUnitId: string | null,
  ): DomainResult<void> => {
    // INV-MEM-002: Tenant-level roles must have null orgUnitId
    if (isTenantLevelRole(role) && orgUnitId !== null) {
      return fail(
        membershipInvariantViolation(
          'INV-MEM-002',
          `Tenant-level role ${role} must have orgUnitId=null`,
        ),
      );
    }

    // INV-MEM-003: Org-scoped roles must have valid orgUnitId
    if (isOrgScopedRole(role) && orgUnitId === null) {
      return fail(
        membershipInvariantViolation(
          'INV-MEM-003',
          `Org-scoped role ${role} requires valid orgUnitId`,
        ),
      );
    }

    return ok(undefined);
  };

  /**
   * Create a lifecycle event.
   */
  const createEvent = (
    type: MembershipEventType,
    membership: Membership,
    oldStatus: MembershipStatus | null,
    performedBy?: string,
    reason?: string,
  ): MembershipLifecycleEvent => ({
    type,
    membershipId: membership.id,
    userId: membership.userId,
    tenantId: membership.tenantId,
    orgUnitId: membership.orgUnitId,
    role: membership.role,
    newStatus: membership.status,
    oldStatus,
    timestamp: new Date(),
    performedBy,
    reason,
  });

  /**
   * Determine the event type for a status transition.
   */
  const getEventTypeForTransition = (
    oldStatus: MembershipStatus,
    newStatus: MembershipStatus,
  ): MembershipEventType => {
    if (newStatus === MembershipStatusEnum.REVOKED) {
      return MembershipEventType.REVOKED;
    }
    if (
      oldStatus === MembershipStatusEnum.INVITED &&
      newStatus === MembershipStatusEnum.ACTIVE
    ) {
      return MembershipEventType.ACTIVATED;
    }
    if (newStatus === MembershipStatusEnum.SUSPENDED) {
      return MembershipEventType.SUSPENDED;
    }
    if (
      oldStatus === MembershipStatusEnum.SUSPENDED &&
      newStatus === MembershipStatusEnum.ACTIVE
    ) {
      return MembershipEventType.REACTIVATED;
    }
    return MembershipEventType.STATUS_CHANGED;
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    async create(
      command: CreateMembershipCommand,
    ): Promise<DomainResult<CreateMembershipResult>> {
      const { userId, tenantId, orgUnitId, role, status, performedBy, reason } = command;

      // Step 1: Validate initial status (must be INVITED or ACTIVE per Req 22.1)
      if (status !== MembershipStatusEnum.INVITED && status !== MembershipStatusEnum.ACTIVE) {
        return fail(invalidInitialStatus());
      }

      // Step 2: Check quarantine (INV-QUARANTINE-001)
      const isQuarantined = await membershipRepository.isQuarantined(userId);
      if (isQuarantined) {
        return fail(authUserQuarantined());
      }

      // Step 3: Validate role-scope consistency (INV-MEM-002, INV-MEM-003)
      const scopeValidation = validateRoleScopeConsistency(role, orgUnitId);
      if (!scopeValidation.success) {
        return fail(scopeValidation.error);
      }

      // Step 4: Validate orgUnit belongs to tenant (INV-MEM-001) - Req 22.6
      if (orgUnitId !== null) {
        const orgUnitExists = await orgUnitRepository.exists(orgUnitId, tenantId);
        if (!orgUnitExists) {
          return fail(orgUnitNotInTenant());
        }
      }

      // Step 5: Check uniqueness (Req 22.2)
      const existingMembership = await this.existsActiveMembership(userId, tenantId, orgUnitId);
      if (existingMembership) {
        return fail(membershipAlreadyExists());
      }

      // Step 6: Create the membership
      const input: CreateMembershipInput = {
        userId,
        tenantId,
        orgUnitId,
        role,
        status,
      };

      const createResult = await membershipWriteRepository.create(input);
      if (!createResult.success) {
        return createResult as DomainResult<CreateMembershipResult>;
      }

      const membership = createResult.data;

      // Step 7: Emit creation event (Req 22.7)
      const event = createEvent(
        MembershipEventType.CREATED,
        membership,
        null, // No old status for creation
        performedBy,
        reason,
      );
      await eventEmitter.emit(event);

      return ok({ membership, event });
    },

    async transitionStatus(
      command: TransitionStatusCommand,
    ): Promise<DomainResult<TransitionStatusResult>> {
      const { membershipId, targetStatus, tenantId, performedBy, reason } = command;

      // Step 1: Get the membership
      const membership = await this.getById(membershipId, tenantId);
      if (!membership) {
        return fail(membershipNotFound());
      }

      const currentStatus = membership.status;

      // Step 2: Validate the transition is allowed (Req 22.3)
      if (!isValidStatusTransition(currentStatus, targetStatus)) {
        return fail(invalidStatusTransition(currentStatus, targetStatus));
      }

      // Step 3: Check if current status is terminal (Req 22.4)
      if (isTerminalStatus(currentStatus)) {
        return fail(invalidStatusTransition(currentStatus, targetStatus));
      }

      // Step 4: Prepare update data
      const updateData: { status: MembershipStatus; revokedAt?: Date } = {
        status: targetStatus,
      };

      // Set revokedAt for REVOKED transitions (Req 22.4)
      if (targetStatus === MembershipStatusEnum.REVOKED) {
        updateData.revokedAt = new Date();
      }

      // Step 5: Update the membership
      const updateResult = await membershipWriteRepository.update(membershipId, tenantId, updateData);
      if (!updateResult.success) {
        return updateResult as DomainResult<TransitionStatusResult>;
      }

      const updatedMembership = updateResult.data;

      // Step 6: Emit transition event (Req 22.7)
      const eventType = getEventTypeForTransition(currentStatus, targetStatus);
      const event = createEvent(
        eventType,
        updatedMembership,
        currentStatus,
        performedBy,
        reason,
      );
      await eventEmitter.emit(event);

      return ok({ membership: updatedMembership, event });
    },

    async activate(
      membershipId: string,
      tenantId: string,
      performedBy?: string,
    ): Promise<DomainResult<TransitionStatusResult>> {
      return this.transitionStatus({
        membershipId,
        targetStatus: MembershipStatusEnum.ACTIVE,
        tenantId,
        performedBy,
        reason: 'Membership activated',
      });
    },

    async suspend(
      membershipId: string,
      tenantId: string,
      reason?: string,
      performedBy?: string,
    ): Promise<DomainResult<TransitionStatusResult>> {
      return this.transitionStatus({
        membershipId,
        targetStatus: MembershipStatusEnum.SUSPENDED,
        tenantId,
        performedBy,
        reason: reason ?? 'Membership suspended',
      });
    },

    async reactivate(
      membershipId: string,
      tenantId: string,
      performedBy?: string,
    ): Promise<DomainResult<TransitionStatusResult>> {
      return this.transitionStatus({
        membershipId,
        targetStatus: MembershipStatusEnum.ACTIVE,
        tenantId,
        performedBy,
        reason: 'Membership reactivated',
      });
    },

    async revoke(
      membershipId: string,
      tenantId: string,
      reason?: string,
      performedBy?: string,
    ): Promise<DomainResult<TransitionStatusResult>> {
      return this.transitionStatus({
        membershipId,
        targetStatus: MembershipStatusEnum.REVOKED,
        tenantId,
        performedBy,
        reason: reason ?? 'Membership revoked',
      });
    },

    async existsActiveMembership(
      userId: string,
      tenantId: string,
      orgUnitId: string | null,
    ): Promise<boolean> {
      return membershipWriteRepository.existsActiveMembership(userId, tenantId, orgUnitId);
    },

    async getById(membershipId: string, tenantId: string): Promise<Membership | null> {
      return membershipWriteRepository.findById(membershipId, tenantId);
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type MembershipLifecycleService = IMembershipLifecycleService;
