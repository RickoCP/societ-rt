/**
 * Membership Repository Query Options and Types.
 *
 * These types define the query options and result structures for membership
 * repository operations, supporting both convenience (ACTIVE-only) and
 * authoritative (status-aware) reads.
 *
 * SECURITY CONSIDERATIONS:
 * - excludeQuarantined defaults to true for all queries
 * - All queries must include tenantId filtering capability
 * - Authoritative queries preserve membership status for downstream decisions
 *
 * @see Requirements 1 (AC 1-7)
 * @see Design Membership Resolution Flow, TPR-04
 */

/**
 * Options for membership queries.
 *
 * @property includeInactive - If true, include SUSPENDED, INVITED, REVOKED
 *           statuses. Default false (ACTIVE only for convenience queries).
 * @property excludeQuarantined - If true (default), exclude users in quarantine
 *           manifest. Set to false only for explicit quarantine management.
 */
export interface MembershipQueryOptions {
  /**
   * Include memberships with non-ACTIVE statuses (SUSPENDED, INVITED, REVOKED).
   * Default: false (returns only ACTIVE memberships)
   *
   * Set to true for:
   * - Status-aware authoritative reads (TPR-04)
   * - Admin membership management
   * - Emergency access checks (SUSPENDED allowed)
   */
  readonly includeInactive?: boolean;

  /**
   * Exclude users in the quarantine manifest (PNA-01 through PNA-05).
   * Default: true (quarantined users are always excluded)
   *
   * Set to false only for:
   * - Quarantine management operations
   * - Platform admin anomaly review
   *
   * CRITICAL: Setting this to false requires platform-level privileges.
   */
  readonly excludeQuarantined?: boolean;
}

/**
 * Options for finding memberships by user ID across all tenants.
 * Extends base options with optional tenant filtering.
 */
export interface FindByUserIdOptions extends MembershipQueryOptions {
  /**
   * Optional tenant ID to filter results.
   * If provided, returns only memberships for this tenant.
   * If omitted, returns memberships across all tenants.
   */
  readonly tenantId?: string;
}

/**
 * Resolved defaults for query options.
 * Used internally by repository implementations.
 */
export interface ResolvedQueryOptions {
  readonly includeInactive: boolean;
  readonly excludeQuarantined: boolean;
}

/**
 * Resolve query options with defaults applied.
 *
 * Defaults:
 * - includeInactive: false (ACTIVE-only queries)
 * - excludeQuarantined: true (always exclude quarantined)
 */
export function resolveQueryOptions(
  options?: MembershipQueryOptions,
): ResolvedQueryOptions {
  return {
    includeInactive: options?.includeInactive ?? false,
    excludeQuarantined: options?.excludeQuarantined ?? true,
  };
}

