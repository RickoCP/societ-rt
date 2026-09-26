/**
 * SubscriptionStatus — Enum representing the subscription lifecycle states.
 *
 * Subscription status is SEPARATE from Tenant.lifecycleStatus (L8, L12).
 * This enum manages the billing/payment status of a tenant's subscription.
 *
 * Status Flow:
 * TRIAL → ACTIVE → PAST_DUE → SUSPENDED → CLOSED
 *
 * @see Requirements 18 (AC 1-7)
 * @see Design Components > Subscription Status Management
 */

/**
 * Subscription status values representing the billing lifecycle.
 */
export const SubscriptionStatus = {
  /** Trial period - tenant is evaluating the service */
  TRIAL: 'TRIAL',
  /** Active - subscription is current and paid */
  ACTIVE: 'ACTIVE',
  /** Past Due - payment is overdue but service continues */
  PAST_DUE: 'PAST_DUE',
  /** Suspended - non-critical operations restricted */
  SUSPENDED: 'SUSPENDED',
  /** Closed - all operations denied except data export */
  CLOSED: 'CLOSED',
} as const;

export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

/**
 * All valid subscription status values.
 */
export const ALL_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.SUSPENDED,
  SubscriptionStatus.CLOSED,
] as const;

/**
 * Status transition rules - defines which transitions are valid.
 * Forms a directed acyclic graph (DAG).
 *
 * Valid transitions:
 * - TRIAL → ACTIVE (subscription paid)
 * - TRIAL → CLOSED (trial expired, no conversion)
 * - ACTIVE → PAST_DUE (payment overdue)
 * - ACTIVE → SUSPENDED (manual suspension)
 * - ACTIVE → CLOSED (immediate closure)
 * - PAST_DUE → ACTIVE (payment received)
 * - PAST_DUE → SUSPENDED (grace period expired)
 * - PAST_DUE → CLOSED (immediate closure)
 * - SUSPENDED → ACTIVE (payment received, reactivated)
 * - SUSPENDED → CLOSED (closure after suspension)
 */
export const STATUS_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  [SubscriptionStatus.TRIAL]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.CLOSED,
  ],
  [SubscriptionStatus.ACTIVE]: [
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.SUSPENDED,
    SubscriptionStatus.CLOSED,
  ],
  [SubscriptionStatus.PAST_DUE]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.SUSPENDED,
    SubscriptionStatus.CLOSED,
  ],
  [SubscriptionStatus.SUSPENDED]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.CLOSED,
  ],
  [SubscriptionStatus.CLOSED]: [], // Terminal state - no transitions out
} as const;

/**
 * Statuses that allow normal operations.
 */
export const OPERATIONAL_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
] as const;

/**
 * Statuses that restrict normal operations.
 */
export const RESTRICTED_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.SUSPENDED,
  SubscriptionStatus.CLOSED,
] as const;

/**
 * Terminal status - no operations allowed except data export.
 */
export const TERMINAL_STATUS: SubscriptionStatus = SubscriptionStatus.CLOSED;

/**
 * Check if a status transition is valid.
 */
export function isValidStatusTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  const allowedTransitions = STATUS_TRANSITIONS[from];
  return allowedTransitions.includes(to);
}

/**
 * Check if status allows normal operations.
 */
export function isOperationalStatus(status: SubscriptionStatus): boolean {
  return OPERATIONAL_STATUSES.includes(status);
}

/**
 * Check if status is restricted.
 */
export function isRestrictedStatus(status: SubscriptionStatus): boolean {
  return RESTRICTED_STATUSES.includes(status);
}

/**
 * Check if status is terminal.
 */
export function isTerminalStatus(status: SubscriptionStatus): boolean {
  return status === TERMINAL_STATUS;
}

/**
 * Get allowed transitions from a given status.
 */
export function getAllowedTransitions(
  from: SubscriptionStatus,
): readonly SubscriptionStatus[] {
  return STATUS_TRANSITIONS[from];
}
