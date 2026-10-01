/**
 * TenantLifecycleStatus — Domain entity representing the lifecycle state
 * and transition history of a tenant.
 *
 * This entity captures the current lifecycle status, valid transitions,
 * and historical events for display in the Tenant Settings Lifecycle tab.
 *
 * **LIFECYCLE STATE MACHINE:**
 * ```
 * PROVISIONING → ACTIVE → SUSPENDED → CLOSING → CLOSED → PURGED
 *                    ↖────────↙
 * ```
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 13.1-13.11 (Tenant Lifecycle Management)
 * @see Design Document: Tenant Lifecycle State Machine
 */

// ---------------------------------------------------------------------------
// Status Constants
// ---------------------------------------------------------------------------

/**
 * Tenant lifecycle status values.
 * SEPARATE from Subscription.status.
 */
export const LifecycleStatus = {
  /** Tenant is being provisioned - initial state */
  PROVISIONING: 'PROVISIONING',
  /** Tenant is fully operational */
  ACTIVE: 'ACTIVE',
  /** Tenant operations are suspended */
  SUSPENDED: 'SUSPENDED',
  /** Tenant is being closed - data retention period */
  CLOSING: 'CLOSING',
  /** Tenant is closed - minimal access */
  CLOSED: 'CLOSED',
  /** Tenant data has been purged - terminal state */
  PURGED: 'PURGED',
} as const;

export type LifecycleStatusValue =
  (typeof LifecycleStatus)[keyof typeof LifecycleStatus];

/**
 * Valid lifecycle status transitions.
 */
export const LIFECYCLE_TRANSITIONS: Record<
  LifecycleStatusValue,
  readonly LifecycleStatusValue[]
> = {
  [LifecycleStatus.PROVISIONING]: [LifecycleStatus.ACTIVE],
  [LifecycleStatus.ACTIVE]: [
    LifecycleStatus.SUSPENDED,
    LifecycleStatus.CLOSING,
  ],
  [LifecycleStatus.SUSPENDED]: [
    LifecycleStatus.ACTIVE,
    LifecycleStatus.CLOSING,
  ],
  [LifecycleStatus.CLOSING]: [LifecycleStatus.CLOSED],
  [LifecycleStatus.CLOSED]: [LifecycleStatus.PURGED],
  [LifecycleStatus.PURGED]: [], // Terminal state - no transitions
} as const;

/**
 * Lifecycle transition actions that users can perform.
 */
export const LifecycleAction = {
  /** Suspend an active tenant (requires tenant:manage permission) */
  SUSPEND: 'SUSPEND',
  /** Reactivate a suspended tenant (requires tenant:manage permission) */
  REACTIVATE: 'REACTIVATE',
  /** Close a suspended tenant (requires PLATFORM_ADMIN role) */
  CLOSE: 'CLOSE',
} as const;

export type LifecycleActionValue =
  (typeof LifecycleAction)[keyof typeof LifecycleAction];

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * A lifecycle event representing a status transition.
 */
export interface LifecycleEvent {
  /** Unique identifier for this event. */
  readonly id: string;

  /** Tenant ID this event belongs to. */
  readonly tenantId: string;

  /** The status before the transition. */
  readonly fromStatus: LifecycleStatusValue;

  /** The status after the transition. */
  readonly toStatus: LifecycleStatusValue;

  /** The action that triggered this transition. */
  readonly action: LifecycleActionValue | string;

  /** Reason provided for the transition (e.g., suspension reason). */
  readonly reason: string | null;

  /** Timestamp when the transition occurred. */
  readonly timestamp: Date;

  /** User ID who performed the action. */
  readonly actorUserId: string;

  /** Display name of the actor. */
  readonly actorName: string | null;

  /** IP address of the request that triggered the transition. */
  readonly ipAddress: string | null;
}

/**
 * TenantLifecycleStatus represents the current lifecycle state and history.
 * All fields are readonly to enforce immutability at the domain boundary.
 */
export interface TenantLifecycleStatus {
  /** Tenant unique identifier. */
  readonly tenantId: string;

  /** Current lifecycle status. */
  readonly currentStatus: LifecycleStatusValue;

  /** Array of possible next status values based on current status. */
  readonly availableTransitions: readonly LifecycleStatusValue[];

  /** Array of available actions the current user can perform. */
  readonly availableActions: readonly LifecycleActionValue[];

  /** History of lifecycle transitions, ordered most recent first. */
  readonly history: readonly LifecycleEvent[];

  /** Timestamp when the tenant entered the current status. */
  readonly statusChangedAt: Date;

  /** User ID who last changed the status. */
  readonly statusChangedBy: string | null;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Input for performing a lifecycle transition.
 */
export interface LifecycleTransitionInput {
  /** Tenant ID to transition. */
  readonly tenantId: string;

  /** Target lifecycle status. */
  readonly targetStatus: LifecycleStatusValue;

  /** Action being performed. */
  readonly action: LifecycleActionValue;

  /** Reason for the transition (required for SUSPEND, optional for others). */
  readonly reason?: string;

  /** User ID performing the action (for audit). */
  readonly actorUserId: string;

  /** IP address of the request (for audit). */
  readonly ipAddress?: string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Check if a lifecycle transition is valid.
 *
 * @param from - Current status
 * @param to - Target status
 * @returns true if the transition is valid
 */
export function isValidLifecycleTransition(
  from: LifecycleStatusValue,
  to: LifecycleStatusValue,
): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

/**
 * Get the target status for a given action from the current status.
 *
 * @param currentStatus - Current lifecycle status
 * @param action - Action to perform
 * @returns Target status or null if action is not valid from current status
 */
export function getTargetStatusForAction(
  currentStatus: LifecycleStatusValue,
  action: LifecycleActionValue,
): LifecycleStatusValue | null {
  switch (action) {
    case LifecycleAction.SUSPEND:
      return currentStatus === LifecycleStatus.ACTIVE
        ? LifecycleStatus.SUSPENDED
        : null;
    case LifecycleAction.REACTIVATE:
      return currentStatus === LifecycleStatus.SUSPENDED
        ? LifecycleStatus.ACTIVE
        : null;
    case LifecycleAction.CLOSE:
      return currentStatus === LifecycleStatus.SUSPENDED
        ? LifecycleStatus.CLOSING
        : null;
    default:
      return null;
  }
}

/**
 * Get available actions for a given lifecycle status.
 *
 * @param status - Current lifecycle status
 * @param isPlatformAdmin - Whether the user is a PLATFORM_ADMIN
 * @returns Array of available actions
 */
export function getAvailableActions(
  status: LifecycleStatusValue,
  isPlatformAdmin: boolean,
): readonly LifecycleActionValue[] {
  const actions: LifecycleActionValue[] = [];

  switch (status) {
    case LifecycleStatus.ACTIVE:
      actions.push(LifecycleAction.SUSPEND);
      break;
    case LifecycleStatus.SUSPENDED:
      actions.push(LifecycleAction.REACTIVATE);
      // Only PLATFORM_ADMIN can close tenants
      if (isPlatformAdmin) {
        actions.push(LifecycleAction.CLOSE);
      }
      break;
    // No actions available for PROVISIONING, CLOSING, CLOSED, or PURGED
  }

  return actions;
}

/**
 * Check if a status is a terminal state (no further transitions possible).
 */
export function isTerminalStatus(status: LifecycleStatusValue): boolean {
  return LIFECYCLE_TRANSITIONS[status].length === 0;
}

/**
 * Check if a status allows normal tenant operations.
 */
export function isOperationalStatus(status: LifecycleStatusValue): boolean {
  return status === LifecycleStatus.ACTIVE;
}

/**
 * Check if the CLOSE action requires PLATFORM_ADMIN permission.
 */
export function requiresPlatformAdminForAction(
  action: LifecycleActionValue,
): boolean {
  return action === LifecycleAction.CLOSE;
}
