/**
 * ContextSwitchService — Domain service for switching active tenant and OrgUnit context.
 *
 * This service implements the context switch logic per Requirements 4 (AC 1-8):
 * - Validate user has ACTIVE membership in target tenant
 * - Validate target OrgUnit belongs to target tenant
 * - Validate user's membership scope includes target OrgUnit
 * - Only tenant-level admin roles can have null activeOrgUnitId
 *
 * **CRITICAL SECURITY RULES:**
 * - Always validate membership exists before allowing switch
 * - Always validate OrgUnit is within membership scope
 * - Tenant-level scope (null OrgUnit) requires PLATFORM_ADMIN or TENANT_OWNER role
 * - Cross-tenant switches require membership in target tenant
 *
 * **VALIDATION FLOW:**
 * 1. Check user has ACTIVE membership in target tenant
 * 2. For null targetOrgUnitId:
 *    - Verify user has tenant-level role (PLATFORM_ADMIN, TENANT_OWNER)
 *    - Verify membership has orgUnitId = null
 * 3. For non-null targetOrgUnitId:
 *    - Verify target OrgUnit exists and belongs to target tenant
 *    - Verify user's membership scope includes target OrgUnit
 *
 * @see FASE 1.8 Task 18: Context Switch Service
 * @see Requirements 4 (AC 1-8)
 * @see Design Context Switch Validation
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type {
  Membership,
  IMembershipRepository,
} from '@core/domains/membership';
import { isTenantLevelRole, MembershipStatus } from '@core/domains/membership';
import type { IOrgUnitHierarchyReader } from '@core/domains/orgunit';
import type {
  ContextSwitchParams,
  ContextSwitchResult,
  AvailableContexts,
  TenantContext,
  MembershipContext,
  ActiveContext,
} from '../types';
import {
  contextSwitchNoMembership,
  contextSwitchOrgUnitNotFound,
  contextSwitchOrgUnitTenantMismatch,
  contextSwitchOutOfScope,
  contextSwitchInvalidScope,
  contextSwitchUserQuarantined,
  contextSwitchMembershipInactive,
  contextSwitchAmbiguousMembership,
  // Note: contextSwitchInvalid is available but currently unused
} from '../errors';

// ---------------------------------------------------------------------------
// Dependencies Interface (for DI)
// ---------------------------------------------------------------------------

/**
 * Dependencies for the ContextSwitchService.
 */
export interface ContextSwitchServiceDependencies {
  /**
   * Repository for querying memberships.
   */
  readonly membershipRepository: IMembershipRepository;

  /**
   * Service for checking OrgUnit hierarchy relationships.
   */
  readonly orgUnitHierarchyReader: IOrgUnitHierarchyReader;

  /**
   * Optional: Resolver for tenant names (for getAvailableContexts).
   * If not provided, tenant names will use tenant ID as placeholder.
   */
  readonly tenantNameResolver?: ITenantNameResolver;

  /**
   * Optional: Resolver for OrgUnit names (for getAvailableContexts).
   * If not provided, OrgUnit names will use OrgUnit ID as placeholder.
   */
  readonly orgUnitNameResolver?: IOrgUnitNameResolver;
}

/**
 * Interface for resolving tenant names.
 */
export interface ITenantNameResolver {
  resolveName(tenantId: string): Promise<string | null>;
  resolveNames(tenantIds: string[]): Promise<Map<string, string>>;
}

/**
 * Interface for resolving OrgUnit names.
 */
export interface IOrgUnitNameResolver {
  resolveName(orgUnitId: string, tenantId: string): Promise<string | null>;
  resolveNames(
    orgUnitIds: Array<{ orgUnitId: string; tenantId: string }>,
  ): Promise<Map<string, string>>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * ContextSwitchService interface.
 *
 * This service manages the active tenant and OrgUnit context for users,
 * allowing them to switch between tenants and organizational units.
 */
export interface IContextSwitchService {
  /**
   * Switch to a new active context (tenant and/or OrgUnit).
   *
   * This validates the switch is allowed and returns the new context.
   * The caller is responsible for issuing a new JWT with updated claims.
   *
   * @param params - The context switch parameters
   * @returns DomainResult with the new context or typed error
   */
  switchContext(
    params: ContextSwitchParams,
  ): Promise<DomainResult<ContextSwitchResult>>;

  /**
   * Validate a context switch without performing it.
   *
   * Use this for pre-validation before showing confirmation dialogs or
   * for checking if a switch would be allowed without side effects.
   *
   * @param params - The context switch parameters
   * @returns DomainResult with void on success, typed error on failure
   */
  validateSwitch(params: ContextSwitchParams): Promise<DomainResult<void>>;

  /**
   * Get all available contexts for a user.
   *
   * Returns all tenants and memberships the user has access to,
   * for use in a context picker UI.
   *
   * @param userId - The user's ID
   * @returns DomainResult with available contexts or typed error
   */
  getAvailableContexts(
    userId: string,
  ): Promise<DomainResult<AvailableContexts>>;

  /**
   * Get available contexts for a specific tenant.
   *
   * Returns all memberships the user has in the specified tenant.
   *
   * @param userId - The user's ID
   * @param tenantId - The tenant's ID
   * @returns DomainResult with tenant context or typed error
   */
  getAvailableContextsForTenant(
    userId: string,
    tenantId: string,
  ): Promise<DomainResult<TenantContext>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a ContextSwitchService instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param deps - The service dependencies
 * @returns An implementation of IContextSwitchService
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   contextSwitchService: asFunction(ContextSwitchServiceImpl).singleton(),
 * });
 *
 * // Direct usage (for testing)
 * const service = ContextSwitchServiceImpl({
 *   membershipRepository: mockMembershipRepo,
 *   orgUnitHierarchyReader: mockOrgUnitReader,
 * });
 * ```
 */
export const ContextSwitchServiceImpl = (
  deps: ContextSwitchServiceDependencies,
): IContextSwitchService => {
  const {
    membershipRepository,
    orgUnitHierarchyReader,
    tenantNameResolver,
    orgUnitNameResolver,
  } = deps;

  // -------------------------------------------------------------------------
  // Internal Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Find a matching membership for the target context.
   *
   * For tenant-level scope (null OrgUnit), finds tenant-level membership.
   * For org-scoped, finds membership matching the OrgUnit scope.
   */
  async function findMatchingMembership(
    memberships: Membership[],
    targetOrgUnitId: string | null,
    targetTenantId: string,
  ): Promise<DomainResult<Membership>> {
    // No active memberships
    if (memberships.length === 0) {
      return fail(contextSwitchNoMembership(targetTenantId));
    }

    // Case 1: Tenant-level scope (null OrgUnit)
    if (targetOrgUnitId === null) {
      // Find tenant-level membership
      const tenantLevelMembership = memberships.find(
        (m) => m.orgUnitId === null && isTenantLevelRole(m.role),
      );

      if (!tenantLevelMembership) {
        return fail(contextSwitchInvalidScope());
      }

      return ok(tenantLevelMembership);
    }

    // Case 2: Single membership
    if (memberships.length === 1) {
      // Safe to assert non-undefined since we just checked length === 1
      const membership = memberships[0] as Membership;

      // If single membership is tenant-level, it covers all OrgUnits
      if (membership.orgUnitId === null && isTenantLevelRole(membership.role)) {
        // Tenant-level admin has full scope, but we still verify OrgUnit exists
        const orgUnitExistsResult = await orgUnitHierarchyReader.getOrgUnit(
          targetOrgUnitId,
          targetTenantId,
        );

        if (!orgUnitExistsResult.success) {
          return fail(contextSwitchOrgUnitNotFound(targetOrgUnitId));
        }

        // Tenant-level admin can switch to any OrgUnit in tenant
        return ok(membership);
      }

      // If single membership is org-scoped, check if target is in scope
      if (membership.orgUnitId !== null) {
        const inScopeResult = await orgUnitHierarchyReader.isDescendantOrEqual(
          targetOrgUnitId,
          membership.orgUnitId,
          targetTenantId,
        );

        if (!inScopeResult.success) {
          // OrgUnit not found or tenant mismatch
          if (inScopeResult.error.code === 'ORGUNIT_NOT_FOUND') {
            return fail(contextSwitchOrgUnitNotFound(targetOrgUnitId));
          }
          return fail(contextSwitchOrgUnitTenantMismatch());
        }

        if (!inScopeResult.data) {
          return fail(contextSwitchOutOfScope());
        }

        return ok(membership);
      }
    }

    // Case 3: Multiple memberships - find exact match or best scope match
    // First, try exact match on orgUnitId
    const exactMatch = memberships.find((m) => m.orgUnitId === targetOrgUnitId);
    if (exactMatch) {
      return ok(exactMatch);
    }

    // Then, check tenant-level memberships (they cover any OrgUnit)
    const tenantLevelMembership = memberships.find(
      (m) => m.orgUnitId === null && isTenantLevelRole(m.role),
    );
    if (tenantLevelMembership) {
      // Verify OrgUnit exists
      const orgUnitExistsResult = await orgUnitHierarchyReader.getOrgUnit(
        targetOrgUnitId,
        targetTenantId,
      );

      if (!orgUnitExistsResult.success) {
        return fail(contextSwitchOrgUnitNotFound(targetOrgUnitId));
      }

      return ok(tenantLevelMembership);
    }

    // Finally, find a membership whose scope includes the target OrgUnit
    for (const membership of memberships) {
      if (membership.orgUnitId !== null) {
        const inScopeResult = await orgUnitHierarchyReader.isDescendantOrEqual(
          targetOrgUnitId,
          membership.orgUnitId,
          targetTenantId,
        );

        if (inScopeResult.success && inScopeResult.data) {
          return ok(membership);
        }
      }
    }

    // No membership matches the target
    return fail(contextSwitchAmbiguousMembership());
  }

  /**
   * Convert a Membership to MembershipContext.
   */
  async function toMembershipContext(
    membership: Membership,
  ): Promise<MembershipContext> {
    let orgUnitName: string | null = null;

    if (membership.orgUnitId !== null && orgUnitNameResolver) {
      orgUnitName = await orgUnitNameResolver.resolveName(
        membership.orgUnitId,
        membership.tenantId,
      );
    }

    return {
      membershipId: membership.id,
      role: membership.role,
      orgUnitId: membership.orgUnitId,
      orgUnitName: orgUnitName ?? membership.orgUnitId,
    };
  }

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    /**
     * Switch to a new active context (tenant and/or OrgUnit).
     */
    async switchContext(
      params: ContextSwitchParams,
    ): Promise<DomainResult<ContextSwitchResult>> {
      const { userId, targetTenantId, targetOrgUnitId } = params;

      // Step 1: Check if user is quarantined
      const isQuarantined = await membershipRepository.isQuarantined(userId);
      if (isQuarantined) {
        return fail(contextSwitchUserQuarantined());
      }

      // Step 2: Get all ACTIVE memberships in target tenant
      const activeMemberships = await membershipRepository.findActiveByUserAndTenant(
        userId,
        targetTenantId,
      );

      // Step 3: Find matching membership for target context
      const membershipResult = await findMatchingMembership(
        activeMemberships,
        targetOrgUnitId,
        targetTenantId,
      );

      if (!membershipResult.success) {
        return membershipResult as DomainResult<ContextSwitchResult>;
      }

      const membership = membershipResult.data;

      // Step 4: Verify membership is ACTIVE
      if (membership.status !== MembershipStatus.ACTIVE) {
        return fail(contextSwitchMembershipInactive());
      }

      // Step 5: Build the new context
      const newContext: ActiveContext = {
        tenantId: targetTenantId,
        orgUnitId: targetOrgUnitId,
        role: membership.role,
      };

      return ok({
        newContext,
        membershipId: membership.id,
      });
    },

    /**
     * Validate a context switch without performing it.
     */
    async validateSwitch(
      params: ContextSwitchParams,
    ): Promise<DomainResult<void>> {
      // Use switchContext internally and discard the result data
      const result = await this.switchContext(params);

      if (!result.success) {
        return result as DomainResult<void>;
      }

      return ok(undefined);
    },

    /**
     * Get all available contexts for a user.
     */
    async getAvailableContexts(
      userId: string,
    ): Promise<DomainResult<AvailableContexts>> {
      // Check if user is quarantined
      const isQuarantined = await membershipRepository.isQuarantined(userId);
      if (isQuarantined) {
        return fail(contextSwitchUserQuarantined());
      }

      // Get all memberships for user (across all tenants)
      const allMemberships = await membershipRepository.findByUserId(userId, {
        includeInactive: false, // Only ACTIVE memberships for context switching
      });

      // Group memberships by tenant
      const tenantMap = new Map<string, Membership[]>();
      for (const membership of allMemberships) {
        const existing = tenantMap.get(membership.tenantId) ?? [];
        existing.push(membership);
        tenantMap.set(membership.tenantId, existing);
      }

      // Resolve tenant names if resolver is available
      const tenantIds = Array.from(tenantMap.keys());
      let tenantNames = new Map<string, string>();
      if (tenantNameResolver && tenantIds.length > 0) {
        tenantNames = await tenantNameResolver.resolveNames(tenantIds);
      }

      // Build tenant contexts
      const tenants: TenantContext[] = [];
      for (const [tenantId, memberships] of tenantMap) {
        const membershipContexts: MembershipContext[] = [];

        for (const membership of memberships) {
          const ctx = await toMembershipContext(membership);
          membershipContexts.push(ctx);
        }

        tenants.push({
          tenantId,
          tenantName: tenantNames.get(tenantId) ?? tenantId,
          memberships: membershipContexts,
        });
      }

      return ok({
        tenants,
        totalMemberships: allMemberships.length,
      });
    },

    /**
     * Get available contexts for a specific tenant.
     */
    async getAvailableContextsForTenant(
      userId: string,
      tenantId: string,
    ): Promise<DomainResult<TenantContext>> {
      // Check if user is quarantined
      const isQuarantined = await membershipRepository.isQuarantined(userId);
      if (isQuarantined) {
        return fail(contextSwitchUserQuarantined());
      }

      // Get active memberships in tenant
      const memberships = await membershipRepository.findActiveByUserAndTenant(
        userId,
        tenantId,
      );

      if (memberships.length === 0) {
        return fail(contextSwitchNoMembership(tenantId));
      }

      // Resolve tenant name
      let tenantName = tenantId;
      if (tenantNameResolver) {
        const resolved = await tenantNameResolver.resolveName(tenantId);
        if (resolved) {
          tenantName = resolved;
        }
      }

      // Build membership contexts
      const membershipContexts: MembershipContext[] = [];
      for (const membership of memberships) {
        const ctx = await toMembershipContext(membership);
        membershipContexts.push(ctx);
      }

      return ok({
        tenantId,
        tenantName,
        memberships: membershipContexts,
      });
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type ContextSwitchService = IContextSwitchService;
