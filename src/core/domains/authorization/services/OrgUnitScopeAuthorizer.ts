/**
 * OrgUnitScopeAuthorizer — Authorization POLICY for OrgUnit scope checking.
 *
 * This service implements the OrgUnit Scope Authorization logic per Requirements 6:
 * - Verifies resource tenant matches user's active tenant (FIRST)
 * - Applies authorization POLICY (tenant-level admins have full scope)
 * - Uses Task 6 primitives (isDescendantOrEqual) for hierarchy checking
 *
 * **POLICY DECISIONS (This Task 15 — NOT in Task 6):**
 * - PLATFORM_ADMIN: Has full tenant scope (for cross-tenant ops via Privileged Path)
 * - TENANT_OWNER: Has full tenant scope (orgUnitId = null means entire tenant)
 * - Other roles: Must have resource OrgUnit within their membership OrgUnit subtree
 *
 * **SECURITY ORDER (CRITICAL):**
 * 1. Tenant check FIRST (AUTH_TENANT_MISMATCH)
 * 2. Policy check (tenant-level admins)
 * 3. Hierarchy check via primitive (AUTH_OUT_OF_SCOPE)
 *
 * **TPR-02 APPLIED:**
 * - Task 6 is policy-neutral: provides isDescendantOrEqual PRIMITIVE
 * - Task 15 applies POLICY: decides who gets full scope, when to allow/deny
 *
 * @see Requirements 6 (AC 1-7)
 * @see Design OrgUnit Scope Authorization, Property 6
 * @see INV-AUTH-002: Fails closed on unknown state
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { IOrgUnitHierarchyReader } from '@core/domains/orgunit/services';
import type { AuthorizationContext } from '../types';
import {
  authTenantMismatch,
  authOutOfScope,
  authScopeCheckFailed,
} from '../errors';
import { MembershipRole } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Parameters for OrgUnit scope checking.
 */
export interface OrgUnitScopeCheckParams {
  /**
   * The resolved authorization context from the request.
   * Contains user's tenantId, orgUnitId, role, etc.
   */
  readonly authContext: AuthorizationContext;

  /**
   * The tenant ID of the resource being accessed.
   * MUST match authContext.tenantId.
   */
  readonly resourceTenantId: string;

  /**
   * The OrgUnit ID of the resource being accessed.
   * Must be within the user's membership scope (or equal).
   */
  readonly resourceOrgUnitId: string;
}

/**
 * Result of scope check with optional reason for audit logging.
 */
export interface OrgUnitScopeCheckResult {
  /**
   * Whether scope check passed.
   */
  readonly allowed: boolean;

  /**
   * Reason for the decision (for audit logging).
   */
  readonly reason: OrgUnitScopeAllowReason | OrgUnitScopeDenyReason;
}

/**
 * Reasons why scope check was allowed.
 */
export type OrgUnitScopeAllowReason =
  | 'TENANT_LEVEL_ADMIN'      // PLATFORM_ADMIN or TENANT_OWNER with null orgUnitId
  | 'SAME_ORGUNIT'            // Resource OrgUnit equals membership OrgUnit
  | 'DESCENDANT_ORGUNIT';     // Resource OrgUnit is descendant of membership OrgUnit

/**
 * Reasons why scope check was denied.
 */
export type OrgUnitScopeDenyReason =
  | 'TENANT_MISMATCH'         // Resource tenant != context tenant
  | 'OUT_OF_SCOPE';           // Resource OrgUnit not in membership scope

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * OrgUnitScopeAuthorizer interface.
 *
 * This service applies POLICY decisions for OrgUnit scope authorization.
 * It uses the OrgUnitHierarchyReader (Task 6) for primitive hierarchy operations.
 */
export interface IOrgUnitScopeAuthorizer {
  /**
   * Check if the user's membership scope includes the resource's OrgUnit.
   *
   * **Authorization Flow:**
   * 1. Tenant check (AUTH_TENANT_MISMATCH if mismatch)
   * 2. Policy check: tenant-level admins have full scope
   * 3. Hierarchy check: resource must be descendant or equal to membership scope
   *
   * @param params - The scope check parameters
   * @returns DomainResult with void on success, or typed error on failure
   *
   * @example
   * ```typescript
   * const result = await authorizer.checkScope({
   *   authContext,
   *   resourceTenantId: resident.tenantId,
   *   resourceOrgUnitId: resident.orgUnitId,
   * });
   *
   * if (!result.success) {
   *   // Handle AUTH_TENANT_MISMATCH or AUTH_OUT_OF_SCOPE
   *   return result;
   * }
   * ```
   */
  checkScope(params: OrgUnitScopeCheckParams): Promise<DomainResult<void>>;

  /**
   * Check scope with detailed result for audit logging.
   *
   * This method returns detailed information about why the scope check
   * passed or failed, useful for audit trails.
   *
   * @param params - The scope check parameters
   * @returns DomainResult with OrgUnitScopeCheckResult containing reason
   */
  checkScopeWithReason(
    params: OrgUnitScopeCheckParams,
  ): Promise<DomainResult<OrgUnitScopeCheckResult>>;

  /**
   * Check if a role has tenant-level scope (POLICY decision).
   *
   * Tenant-level roles (PLATFORM_ADMIN, TENANT_OWNER) have full tenant scope
   * when their orgUnitId is null. This is a POLICY decision made here,
   * not in the hierarchy reader.
   *
   * @param role - The membership role
   * @param orgUnitId - The membership's OrgUnit ID (null for tenant-level)
   * @returns true if the role has tenant-level scope
   */
  hasTenantLevelScope(role: MembershipRole, orgUnitId: string | null): boolean;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Roles that can have tenant-level scope (orgUnitId = null).
 *
 * Per design:
 * - PLATFORM_ADMIN: Platform-level operations, full scope when in tenant context
 * - TENANT_OWNER: Full tenant-wide scope
 */
const TENANT_LEVEL_ROLES: ReadonlySet<MembershipRole> = new Set([
  MembershipRole.PLATFORM_ADMIN,
  MembershipRole.TENANT_OWNER,
]);

/**
 * Factory function to create an OrgUnitScopeAuthorizer instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param orgUnitHierarchyReader - Task 6 primitive for hierarchy operations
 * @returns An implementation of IOrgUnitScopeAuthorizer
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   orgUnitScopeAuthorizer: asFunction(OrgUnitScopeAuthorizerImpl).singleton(),
 * });
 *
 * // Usage in route handler
 * const authorizer = DI.resolve('orgUnitScopeAuthorizer');
 * const result = await authorizer.checkScope(params);
 * ```
 */
export const OrgUnitScopeAuthorizerImpl = ({
  orgUnitHierarchyReader,
}: {
  orgUnitHierarchyReader: IOrgUnitHierarchyReader;
}): IOrgUnitScopeAuthorizer => {
  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Check if a role is a tenant-level role.
   */
  const isTenantLevelRole = (role: MembershipRole): boolean =>
    TENANT_LEVEL_ROLES.has(role);

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    /**
     * Check if the user's membership scope includes the resource's OrgUnit.
     *
     * **Security Order (CRITICAL):**
     * 1. Tenant check FIRST — higher priority security boundary
     * 2. Policy check — tenant-level admins get full scope
     * 3. Hierarchy check — use Task 6 primitive for descendant check
     */
    async checkScope(
      params: OrgUnitScopeCheckParams,
    ): Promise<DomainResult<void>> {
      const resultWithReason = await this.checkScopeWithReason(params);
      
      if (!resultWithReason.success) {
        return resultWithReason as DomainResult<void>;
      }

      if (resultWithReason.data.allowed) {
        return ok(undefined);
      }

      // Map deny reason to appropriate error
      switch (resultWithReason.data.reason) {
        case 'TENANT_MISMATCH':
          return fail(authTenantMismatch(
            params.resourceTenantId,
            params.authContext.tenantId,
          ));
        case 'OUT_OF_SCOPE':
          return fail(authOutOfScope(
            params.resourceOrgUnitId,
            params.authContext.orgUnitId ?? undefined,
          ));
        default:
          // Should not reach here — fail closed (INV-AUTH-002)
          return fail(authScopeCheckFailed(
            new Error(`Unknown scope deny reason: ${resultWithReason.data.reason}`),
          ));
      }
    },

    /**
     * Check scope with detailed result for audit logging.
     */
    async checkScopeWithReason(
      params: OrgUnitScopeCheckParams,
    ): Promise<DomainResult<OrgUnitScopeCheckResult>> {
      try {
        const { authContext, resourceTenantId, resourceOrgUnitId } = params;

        // =====================================================================
        // STEP 1: TENANT CHECK (MANDATORY — FIRST)
        // =====================================================================
        // Requirement 6.6: Always verify resource tenantId matches user's active tenantId
        // Requirement 6.7: Tenant mismatch → AUTH_TENANT_MISMATCH
        // Design: "Tenant is the security boundary, not OrgUnit path"
        if (resourceTenantId !== authContext.tenantId) {
          return ok({
            allowed: false,
            reason: 'TENANT_MISMATCH' as OrgUnitScopeDenyReason,
          });
        }

        // =====================================================================
        // STEP 2: TENANT-LEVEL ADMIN CHECK (POLICY DECISION)
        // =====================================================================
        // Requirement 6.3: Tenant-wide scope ONLY when tenant-level admin
        // Design: "PLATFORM_ADMIN, TENANT_OWNER → full tenant scope (POLICY decision)"
        // This is the POLICY layer — NOT in Task 6 primitive
        if (this.hasTenantLevelScope(authContext.role, authContext.orgUnitId)) {
          return ok({
            allowed: true,
            reason: 'TENANT_LEVEL_ADMIN' as OrgUnitScopeAllowReason,
          });
        }

        // =====================================================================
        // STEP 3: ORG-SCOPED CHECK (via Task 6 primitive)
        // =====================================================================
        // Requirement 6.1: Resource OrgUnit must be within membership scope
        // Requirement 6.2: In scope if equal OR descendant
        // Design Property 6: OrgUnit Scope Containment
        //
        // User has org-scoped membership (not tenant-level admin)
        // Check if resource OrgUnit is within their scope

        // Edge case: org-scoped user MUST have an orgUnitId
        if (authContext.orgUnitId === null) {
          // This should not happen for non-tenant-level roles
          // Fail closed per INV-AUTH-002
          return fail(authScopeCheckFailed(
            new Error('Org-scoped role has null orgUnitId'),
          ));
        }

        // Use Task 6 PRIMITIVE for descendant checking
        // isDescendantOrEqual(resourceOrgUnitId, membershipOrgUnitId, tenantId)
        // Returns true if resource is at or below membership scope
        const hierarchyResult = await orgUnitHierarchyReader.isDescendantOrEqual(
          resourceOrgUnitId,          // Resource's OrgUnit
          authContext.orgUnitId,      // User's membership scope
          authContext.tenantId,       // Tenant boundary
        );

        if (!hierarchyResult.success) {
          // OrgUnit lookup failed — could be not found, tenant mismatch, etc.
          // Propagate the error
          return fail(hierarchyResult.error);
        }

        if (hierarchyResult.data) {
          // Resource is within scope (equal or descendant)
          // Determine if it's same OrgUnit or descendant for audit
          const reason: OrgUnitScopeAllowReason =
            resourceOrgUnitId === authContext.orgUnitId
              ? 'SAME_ORGUNIT'
              : 'DESCENDANT_ORGUNIT';
          
          return ok({ allowed: true, reason });
        }

        // Resource OrgUnit is NOT within membership scope
        return ok({
          allowed: false,
          reason: 'OUT_OF_SCOPE' as OrgUnitScopeDenyReason,
        });

      } catch (error) {
        // Fail closed on any unexpected error (INV-AUTH-002)
        return fail(authScopeCheckFailed(error));
      }
    },

    /**
     * Check if a role has tenant-level scope (POLICY decision).
     *
     * POLICY RULES:
     * 1. Role must be PLATFORM_ADMIN or TENANT_OWNER
     * 2. OrgUnitId must be null (tenant-level membership)
     *
     * Both conditions must be met for tenant-level scope.
     */
    hasTenantLevelScope(role: MembershipRole, orgUnitId: string | null): boolean {
      // Requirement 6.3: Tenant-wide scope ONLY when tenant-level admin role
      // AND orgUnitId is null (not scoped to specific OrgUnit)
      return isTenantLevelRole(role) && orgUnitId === null;
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type OrgUnitScopeAuthorizer = IOrgUnitScopeAuthorizer;
