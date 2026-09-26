/**
 * IMembershipRepository — Repository contract for Membership queries.
 *
 * This interface defines the contract for querying membership data,
 * independent of database implementation (Clean Architecture).
 *
 * The repository supports two query patterns per TPR-04:
 * 1. Convenience queries — ACTIVE-only, for typical authorization flows
 * 2. Authoritative queries — status-aware, preserving Membership.status
 *
 * CRITICAL SECURITY RULES:
 * - membershipId MUST NOT be accepted from external sources
 * - membershipId is ALWAYS resolved server-side using MembershipResolutionKey
 * - All queries MUST support quarantine exclusion (default: enabled)
 * - All tenant-scoped queries MUST filter by tenantId
 *
 * INVARIANTS ENFORCED:
 * - INV-MEM-001: Membership OrgUnit belongs to Membership tenant
 * - INV-MEM-002: Tenant-level membership has orgUnitId=NULL
 * - INV-MEM-003: Org-scoped roles require valid orgUnitId
 * - INV-QUARANTINE-001: Quarantined users cannot receive Membership
 *
 * @see Requirements 1 (AC 1-7)
 * @see Design Membership Resolution Flow, Membership Invariants
 * @see TPR-04: Status-Aware Membership Resolution
 */

import type { DomainResult } from '@core/utils';
import type { Membership } from '../entities';
import type { MembershipResolutionKey } from '../types';
import type {
  MembershipQueryOptions,
  FindByUserIdOptions,
} from './types';

/**
 * Repository interface for Membership queries.
 *
 * Implementations:
 * - MUST exclude quarantined users by default
 * - MUST support both ACTIVE-only and status-aware reads
 * - MUST NOT trust any external membership identity
 * - MUST preserve status field for authoritative reads
 */
export interface IMembershipRepository {
  // ---------------------------------------------------------------------------
  // User-centric Queries
  // ---------------------------------------------------------------------------

  /**
   * Find all memberships for a user, optionally filtered by tenant.
   *
   * Use cases:
   * - List all tenants a user has access to (context switching)
   * - Admin overview of user's memberships across platform
   *
   * @param userId - The user's ID (from JWT sub claim)
   * @param options - Query options including optional tenantId filter
   * @returns Array of memberships (empty if none found)
   *
   * Default behavior:
   * - Returns only ACTIVE memberships
   * - Excludes quarantined users
   * - Returns memberships across all tenants unless tenantId specified
   */
  findByUserId(
    userId: string,
    options?: FindByUserIdOptions,
  ): Promise<Membership[]>;

  // ---------------------------------------------------------------------------
  // Tenant-scoped Queries (Convenience — ACTIVE-only)
  // ---------------------------------------------------------------------------

  /**
   * Find all memberships for a user within a specific tenant.
   *
   * This is a convenience query that includes ALL statuses by default.
   * For ACTIVE-only queries, use findActiveByUserAndTenant.
   *
   * Use cases:
   * - Admin view of user's memberships in a tenant
   * - Checking if user has any membership in tenant (regardless of status)
   *
   * @param userId - The user's ID
   * @param tenantId - The tenant's ID
   * @param options - Query options (includeInactive ignored, all statuses returned)
   * @returns Array of memberships in the tenant
   *
   * Default behavior:
   * - Returns ALL membership statuses (ACTIVE, SUSPENDED, INVITED, REVOKED)
   * - Excludes quarantined users
   */
  findByUserAndTenant(
    userId: string,
    tenantId: string,
    options?: MembershipQueryOptions,
  ): Promise<Membership[]>;

  /**
   * Find ACTIVE memberships for a user within a specific tenant.
   *
   * This is a CONVENIENCE query for typical authorization flows where
   * only ACTIVE memberships are relevant.
   *
   * Use cases:
   * - Standard authorization context resolution
   * - Validating context switch target
   *
   * @param userId - The user's ID
   * @param tenantId - The tenant's ID
   * @returns Array of ACTIVE memberships only (empty if none)
   *
   * Behavior:
   * - Returns ONLY status = ACTIVE
   * - Excludes quarantined users
   * - Shorthand for findByUserAndTenant with status filter
   */
  findActiveByUserAndTenant(
    userId: string,
    tenantId: string,
  ): Promise<Membership[]>;

  // ---------------------------------------------------------------------------
  // Authoritative Status-Aware Queries (TPR-04)
  // ---------------------------------------------------------------------------

  /**
   * Find memberships with full status awareness (authoritative read).
   *
   * This is the AUTHORITATIVE query path that preserves Membership.status
   * for downstream decision-making. Use this for:
   * - Emergency access checks (SUSPENDED membership may be allowed)
   * - Membership lifecycle management
   * - Admin operations requiring full status visibility
   *
   * Per TPR-04: ACTIVE-only queries are NOT the sole authority.
   * Status-aware reads are required for emergency policy decisions.
   *
   * @param userId - The user's ID
   * @param tenantId - The tenant's ID
   * @returns Array of memberships with ALL statuses preserved
   *
   * Behavior:
   * - Returns ALL membership statuses
   * - Excludes quarantined users by default
   * - Status field is preserved for downstream policy decisions
   * - Authorization layer (FASE 1.7+) decides eligibility based on status
   */
  findByUserAndTenantWithStatus(
    userId: string,
    tenantId: string,
  ): Promise<Membership[]>;

  // ---------------------------------------------------------------------------
  // Membership Resolution (Authorization Context)
  // ---------------------------------------------------------------------------

  /**
   * Resolve a specific membership using the 3-part resolution key.
   *
   * This is the PRIMARY method for authorization context resolution.
   * The membershipId is NEVER accepted from JWT — it is always resolved
   * server-side using this method.
   *
   * Resolution behavior per design:
   * - Single membership: Direct match on (userId, tenantId)
   * - Multiple memberships in tenant: activeOrgUnitId distinguishes
   * - Tenant-level membership: activeOrgUnitId = null, role ∈ {PLATFORM_ADMIN, TENANT_OWNER}
   * - Org-scoped membership: activeOrgUnitId must match membership.orgUnitId
   *
   * Per TPR-03: Resolution returns authoritative membership state INCLUDING
   * status. Resolution is SEPARATE from operation authorization. The
   * resolution layer does NOT apply emergency policy.
   *
   * @param key - The 3-part resolution key from JWT claims
   * @returns DomainResult with resolved Membership (preserving status) or typed error
   *
   * Possible errors:
   * - AUTH_NO_MEMBERSHIP: No membership found for key
   * - AUTH_MEMBERSHIP_INACTIVE: Membership exists but not in valid state
   * - AUTH_USER_QUARANTINED: User is in quarantine manifest
   * - AUTH_MEMBERSHIP_CONTEXT_INVALID: Multiple memberships but none match key
   * - AUTH_INVALID_SCOPE: Tenant-level scope claimed without tenant-level role
   *
   * CRITICAL: The resolved membership's status is preserved, NOT filtered.
   * Authorization policy (FASE 1.7+) decides eligibility based on status + operation type.
   */
  resolveMembership(
    key: MembershipResolutionKey,
  ): Promise<DomainResult<Membership>>;

  // ---------------------------------------------------------------------------
  // Quarantine Support
  // ---------------------------------------------------------------------------

  /**
   * Check if a user is in the quarantine manifest.
   *
   * The quarantine manifest contains exactly 5 platform anomaly users
   * (PNA-01 through PNA-05) that cannot receive Membership until
   * explicit remediation (INV-QUARANTINE-001).
   *
   * Use cases:
   * - Pre-check before membership creation
   * - Authorization pipeline step 6 (quarantine check)
   * - Remediation workflow eligibility check
   *
   * @param userId - The user's ID to check
   * @returns true if user is quarantined, false otherwise
   *
   * Implementation notes:
   * - Should be fast (O(1) lookup from manifest)
   * - Manifest contains exactly 5 users per L3
   * - Does NOT query database — uses versioned configuration
   */
  isQuarantined(userId: string): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Count/Existence Queries (Optimization)
  // ---------------------------------------------------------------------------

  /**
   * Check if a user has any active membership in a tenant.
   *
   * Optimization for existence checks without loading full membership data.
   *
   * @param userId - The user's ID
   * @param tenantId - The tenant's ID
   * @returns true if at least one ACTIVE membership exists
   */
  hasActiveMembershipInTenant(
    userId: string,
    tenantId: string,
  ): Promise<boolean>;

  /**
   * Count memberships for a user in a tenant.
   *
   * Used for multi-membership detection and validation.
   *
   * @param userId - The user's ID
   * @param tenantId - The tenant's ID
   * @param options - Query options (status filtering)
   * @returns Count of matching memberships
   */
  countByUserAndTenant(
    userId: string,
    tenantId: string,
    options?: MembershipQueryOptions,
  ): Promise<number>;
}

