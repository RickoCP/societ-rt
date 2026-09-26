/**
 * Context Switch Types — Types for active tenant and OrgUnit context management.
 *
 * These types support the context switch service that allows users to switch
 * between tenants and organizational units within tenants.
 *
 * **SECURITY RULES:**
 * - activeOrgUnitId can only be null for tenant-level admin roles
 * - Context switch must validate membership exists in target tenant
 * - Target OrgUnit must belong to target tenant
 * - User's membership scope must include target OrgUnit
 *
 * @see FASE 1.8 Task 18: Context Switch Service
 * @see Requirements 4 (AC 1-8)
 * @see Design Context Switch Validation
 */

import type { MembershipRole } from '@core/domains/membership';

// ---------------------------------------------------------------------------
// Context Switch Parameters
// ---------------------------------------------------------------------------

/**
 * Parameters for requesting a context switch.
 */
export interface ContextSwitchParams {
  /**
   * The user's ID (from JWT sub claim).
   */
  readonly userId: string;

  /**
   * The target tenant to switch to.
   */
  readonly targetTenantId: string;

  /**
   * The target OrgUnit to switch to.
   * Can only be null for tenant-level admin roles (PLATFORM_ADMIN, TENANT_OWNER).
   */
  readonly targetOrgUnitId: string | null;
}

// ---------------------------------------------------------------------------
// Context Switch Result
// ---------------------------------------------------------------------------

/**
 * Result of a successful context switch.
 */
export interface ContextSwitchResult {
  /**
   * The new active context after the switch.
   */
  readonly newContext: ActiveContext;

  /**
   * The membership ID that was resolved for the new context.
   * This is resolved server-side, never accepted from client.
   */
  readonly membershipId: string;
}

/**
 * The active context after a successful switch.
 */
export interface ActiveContext {
  /**
   * The active tenant ID.
   */
  readonly tenantId: string;

  /**
   * The active OrgUnit ID.
   * Null only for tenant-level admin roles.
   */
  readonly orgUnitId: string | null;

  /**
   * The user's role in this context.
   */
  readonly role: MembershipRole;
}

// ---------------------------------------------------------------------------
// Available Contexts (for context picker UI)
// ---------------------------------------------------------------------------

/**
 * All available contexts for a user.
 * Used for displaying context picker in UI.
 */
export interface AvailableContexts {
  /**
   * All tenants the user has access to.
   */
  readonly tenants: readonly TenantContext[];

  /**
   * Total number of memberships across all tenants.
   */
  readonly totalMemberships: number;
}

/**
 * A tenant the user has access to, with its available memberships.
 */
export interface TenantContext {
  /**
   * The tenant's ID.
   */
  readonly tenantId: string;

  /**
   * The tenant's display name.
   */
  readonly tenantName: string;

  /**
   * All memberships the user has in this tenant.
   * A user can have multiple memberships in one tenant (e.g., different OrgUnit scopes).
   */
  readonly memberships: readonly MembershipContext[];
}

/**
 * A membership within a tenant context.
 */
export interface MembershipContext {
  /**
   * The membership ID (internal, not exposed to client for trust).
   */
  readonly membershipId: string;

  /**
   * The role associated with this membership.
   */
  readonly role: MembershipRole;

  /**
   * The OrgUnit ID for this membership.
   * Null for tenant-level admin roles.
   */
  readonly orgUnitId: string | null;

  /**
   * The OrgUnit display name.
   * Null for tenant-level admin roles (they have tenant-wide scope).
   */
  readonly orgUnitName: string | null;
}

// ---------------------------------------------------------------------------
// Context Switch Validation
// ---------------------------------------------------------------------------

/**
 * Result of context switch validation.
 */
export interface ContextSwitchValidationResult {
  /**
   * Whether the switch is valid.
   */
  readonly valid: boolean;

  /**
   * Error code if validation failed.
   */
  readonly errorCode?: string;

  /**
   * Human-readable reason if validation failed.
   */
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Type Guards and Helpers
// ---------------------------------------------------------------------------

/**
 * Check if context switch params are structurally valid.
 */
export function isValidContextSwitchParams(
  params: unknown,
): params is ContextSwitchParams {
  if (typeof params !== 'object' || params === null) {
    return false;
  }

  const p = params as Record<string, unknown>;

  // userId must be non-empty string
  if (typeof p.userId !== 'string' || p.userId.trim().length === 0) {
    return false;
  }

  // targetTenantId must be non-empty string
  if (typeof p.targetTenantId !== 'string' || p.targetTenantId.trim().length === 0) {
    return false;
  }

  // targetOrgUnitId must be null or non-empty string
  if (
    p.targetOrgUnitId !== null &&
    (typeof p.targetOrgUnitId !== 'string' || p.targetOrgUnitId.trim().length === 0)
  ) {
    return false;
  }

  return true;
}

/**
 * Create context switch params from individual values.
 */
export function createContextSwitchParams(
  userId: string,
  targetTenantId: string,
  targetOrgUnitId: string | null,
): ContextSwitchParams {
  return {
    userId,
    targetTenantId,
    targetOrgUnitId,
  };
}
