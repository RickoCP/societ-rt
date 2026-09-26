/**
 * MembershipStatus — Lifecycle status of a membership record.
 *
 * Status transitions follow a defined state machine:
 * - INVITED → ACTIVE (on acceptance)
 * - INVITED → REVOKED (on invitation rejection/cancellation)
 * - ACTIVE → SUSPENDED (on suspension)
 * - ACTIVE → REVOKED (direct revocation)
 * - SUSPENDED → ACTIVE (on reactivation)
 * - SUSPENDED → REVOKED (on revocation)
 *
 * Note: REVOKED memberships are terminal — they cannot be reactivated.
 * A new membership record must be created instead.
 *
 * @see Requirements 22.3, Design Membership Model
 * @see FASE 1.18 Task 50: Membership Lifecycle Management
 */

export enum MembershipStatus {
  /**
   * User has been invited but has not yet accepted.
   * Authorization: NOT eligible for operations.
   */
  INVITED = 'INVITED',

  /**
   * Membership is active and fully functional.
   * Authorization: Full access based on role/permissions.
   */
  ACTIVE = 'ACTIVE',

  /**
   * Membership is temporarily suspended.
   * Authorization: Normal ops blocked; safety-critical ALLOWED (L10).
   * Safety operations trigger elevated audit logging.
   */
  SUSPENDED = 'SUSPENDED',

  /**
   * Membership has been permanently revoked.
   * Authorization: NO access, terminal state.
   * revokedAt timestamp MUST be set.
   */
  REVOKED = 'REVOKED',
}

/**
 * Statuses that are considered "authoritative" — meaning the membership
 * can potentially be used for authorization (ACTIVE always, SUSPENDED
 * for emergency operations).
 */
export const AUTHORITATIVE_STATUSES: ReadonlySet<MembershipStatus> = new Set([
  MembershipStatus.ACTIVE,
  MembershipStatus.SUSPENDED,
]);

/**
 * Statuses that are NOT authoritative — cannot be used for authorization.
 */
export const NON_AUTHORITATIVE_STATUSES: ReadonlySet<MembershipStatus> =
  new Set([MembershipStatus.INVITED, MembershipStatus.REVOKED]);

/**
 * Terminal statuses — cannot transition out of these.
 */
export const TERMINAL_STATUSES: ReadonlySet<MembershipStatus> = new Set([
  MembershipStatus.REVOKED,
]);

/**
 * Valid status transitions map.
 * Key is current status, value is set of valid next statuses.
 */
export const STATUS_TRANSITIONS: ReadonlyMap<
  MembershipStatus,
  ReadonlySet<MembershipStatus>
> = new Map([
  [MembershipStatus.INVITED, new Set([MembershipStatus.ACTIVE, MembershipStatus.REVOKED])],
  [
    MembershipStatus.ACTIVE,
    new Set([MembershipStatus.SUSPENDED, MembershipStatus.REVOKED]),
  ],
  [MembershipStatus.SUSPENDED, new Set([MembershipStatus.ACTIVE, MembershipStatus.REVOKED])],
  [MembershipStatus.REVOKED, new Set()], // Terminal, no transitions
]);

/**
 * Check if a status transition is valid.
 */
export function isValidStatusTransition(
  from: MembershipStatus,
  to: MembershipStatus,
): boolean {
  const validTargets = STATUS_TRANSITIONS.get(from);
  return validTargets?.has(to) ?? false;
}

/**
 * Check if a status is authoritative (can be used for authorization).
 */
export function isAuthoritativeStatus(status: MembershipStatus): boolean {
  return AUTHORITATIVE_STATUSES.has(status);
}

/**
 * Check if a status is terminal (cannot transition out of it).
 */
export function isTerminalStatus(status: MembershipStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * All valid MembershipStatus values for exhaustiveness checking.
 */
export const ALL_MEMBERSHIP_STATUSES: readonly MembershipStatus[] =
  Object.freeze([
    MembershipStatus.INVITED,
    MembershipStatus.ACTIVE,
    MembershipStatus.SUSPENDED,
    MembershipStatus.REVOKED,
  ]);
