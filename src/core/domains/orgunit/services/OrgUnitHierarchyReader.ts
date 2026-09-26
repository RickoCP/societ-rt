/**
 * OrgUnitHierarchyReader — Domain service for OrgUnit hierarchy read operations.
 *
 * This service implements POLICY-NEUTRAL hierarchy read operations for FASE 1.6.
 * It provides primitive operations — it does NOT make authorization decisions.
 *
 * **TPR-02 APPLIED:**
 * - Task 6 is policy-neutral: read hierarchy, determine descendant/equality,
 *   query path/depth, validate invariants ONLY
 * - NO policy language (NO "grants full tenant access", NO ALLOW/DENY decisions)
 * - Policy decisions belong to FASE 1.7 OrgUnit Scope Authorizer (Task 15)
 *
 * **PRIMITIVES PROVIDED:**
 * - `isDescendantOrEqual(resourceOrgUnitId, membershipOrgUnitId, tenantId)` — check hierarchy relationship
 * - `getOrgUnitPath(orgUnitId, tenantId)` — read path array
 * - `getOrgUnitDepth(orgUnitId, tenantId)` — read depth
 * - `validatePathDepthInvariant(orgUnit)` — check INV-ORG-003
 * - `validateRootInvariant(orgUnit)` — check INV-ORG-004
 *
 * **INVARIANTS VALIDATED:**
 * - INV-ORG-001: OrgUnit parent must belong to same tenant
 * - INV-ORG-002: OrgUnit hierarchy cannot contain cycles
 * - INV-ORG-003: depth = path.length - 1
 * - INV-ORG-004: Root OrgUnit has parentId=NULL, depth=0, path=[id]
 *
 * @see FASE 1.6 Task 6: OrgUnit Hierarchy Read Support
 * @see Requirements 1 (AC 6), 6 (AC 1-2, 5)
 * @see Design OrgUnit Hierarchy Model, INV-ORG-003, INV-ORG-004
 * @see TPR-02: OrgUnit Read/Policy Separation
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { OrgUnit, PathValidationResult } from '../entities';
import type { IOrgUnitRepository } from '../repositories';
import {
  orgUnitNotFound,
  orgUnitTenantMismatch,
  orgUnitPathDepthMismatch,
  orgUnitRootInvariantViolation,
} from '../errors';

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * OrgUnitHierarchyReader interface.
 *
 * This service provides POLICY-NEUTRAL hierarchy read operations.
 * It is a PRIMITIVE layer — authorization policy is applied elsewhere.
 */
export interface IOrgUnitHierarchyReader {
  // -------------------------------------------------------------------------
  // Hierarchy Relationship Primitives
  // -------------------------------------------------------------------------

  /**
   * Check if a resource OrgUnit is a descendant of (or equal to) a membership OrgUnit.
   *
   * This is a PRIMITIVE check — it does NOT make authorization decisions.
   * The authorization layer (FASE 1.7+) uses this primitive to decide scope.
   *
   * **POLICY-NEUTRAL:** This method returns a boolean indicating hierarchy relationship.
   * It does NOT:
   * - Return ALLOW/DENY
   * - Mention "grants access"
   * - Apply any authorization policy
   *
   * Uses path array for efficient O(1) descendant checking.
   *
   * @param resourceOrgUnitId - The OrgUnit ID of the resource being accessed
   * @param membershipOrgUnitId - The OrgUnit ID from the user's membership scope
   * @param tenantId - The tenant ID (security boundary)
   * @returns DomainResult with true if resourceOrgUnit is descendant or equal,
   *          false otherwise, or error if OrgUnits not found
   *
   * @example
   * // Check if resident's OrgUnit is within membership scope
   * const result = await reader.isDescendantOrEqual(
   *   resident.orgUnitId,    // Resource's OrgUnit
   *   membership.orgUnitId,  // Membership's scope
   *   tenantId,
   * );
   * // result.data = true means resident is in hierarchy below/at membership scope
   * // Authorization layer decides what to do with this information
   */
  isDescendantOrEqual(
    resourceOrgUnitId: string,
    membershipOrgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;

  /**
   * Check if childOrgUnitId is a descendant of parentOrgUnitId.
   *
   * Note: This does NOT include equality — use isDescendantOrEqual for that.
   *
   * @param childOrgUnitId - The potential descendant
   * @param parentOrgUnitId - The potential ancestor
   * @param tenantId - The tenant ID
   * @returns DomainResult with true if child is descendant of parent
   */
  isDescendantOf(
    childOrgUnitId: string,
    parentOrgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;

  /**
   * Check if an OrgUnit is a root node (no parent).
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID
   * @returns DomainResult with true if OrgUnit is a root
   */
  isRoot(
    orgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;

  // -------------------------------------------------------------------------
  // Path/Depth Read Operations
  // -------------------------------------------------------------------------

  /**
   * Get the path array for an OrgUnit.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID
   * @returns DomainResult with path array, or error if not found
   */
  getOrgUnitPath(
    orgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<string[]>>;

  /**
   * Get the depth of an OrgUnit.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID
   * @returns DomainResult with depth, or error if not found
   */
  getOrgUnitDepth(
    orgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<number>>;

  /**
   * Get an OrgUnit by ID with tenant boundary check.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID
   * @returns DomainResult with OrgUnit, or error if not found
   */
  getOrgUnit(
    orgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<OrgUnit>>;

  // -------------------------------------------------------------------------
  // Invariant Validation
  // -------------------------------------------------------------------------

  /**
   * Validate path/depth invariant (INV-ORG-003).
   *
   * Checks: depth = path.length - 1
   *
   * @param orgUnit - The OrgUnit to validate
   * @returns Validation result with specific error details if invalid
   */
  validatePathDepthInvariant(orgUnit: OrgUnit): PathValidationResult;

  /**
   * Validate root OrgUnit invariant (INV-ORG-004).
   *
   * Checks:
   * - parentId is NULL
   * - depth = 0
   * - path = [id]
   *
   * @param orgUnit - The OrgUnit to validate (should be a root)
   * @returns Validation result with specific error details if invalid
   */
  validateRootInvariant(orgUnit: OrgUnit): PathValidationResult;

  /**
   * Validate all hierarchy invariants for an OrgUnit.
   *
   * Validates INV-ORG-003 and INV-ORG-004 (if root).
   *
   * @param orgUnit - The OrgUnit to validate
   * @returns DomainResult with void on success, error on violation
   */
  validateOrgUnitInvariants(orgUnit: OrgUnit): DomainResult<void>;

  // -------------------------------------------------------------------------
  // Batch Operations
  // -------------------------------------------------------------------------

  /**
   * Get all ancestors of an OrgUnit (path traversal).
   *
   * Returns OrgUnits from root to parent (ordered by depth).
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID
   * @returns DomainResult with array of ancestor OrgUnits
   */
  getAncestors(
    orgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<OrgUnit[]>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an OrgUnitHierarchyReader instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param orgUnitRepository - The OrgUnit repository for data access
 * @returns An implementation of IOrgUnitHierarchyReader
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   orgUnitHierarchyReader: asFunction(OrgUnitHierarchyReaderImpl).singleton(),
 * });
 *
 * // Direct usage (for testing)
 * const reader = OrgUnitHierarchyReaderImpl({
 *   orgUnitRepository: mockRepo,
 * });
 * ```
 */
export const OrgUnitHierarchyReaderImpl = ({
  orgUnitRepository,
}: {
  orgUnitRepository: IOrgUnitRepository;
}): IOrgUnitHierarchyReader => {
  // -------------------------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------------------------

  /**
   * Check if targetId appears in the path array.
   * O(n) where n is path length (typically < 5 for hierarchy).
   */
  const isInPath = (path: string[], targetId: string): boolean => {
    return path.includes(targetId);
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    /**
     * Check if resourceOrgUnit is a descendant of (or equal to) membershipOrgUnit.
     *
     * Algorithm:
     * 1. Fetch resource OrgUnit
     * 2. If resource ID equals membership ID → return true (equality case)
     * 3. Check if membership ID appears in resource's path → true means descendant
     *
     * This uses path array for O(1) ancestor lookup without tree traversal.
     */
    async isDescendantOrEqual(
      resourceOrgUnitId: string,
      membershipOrgUnitId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      // Equality case: same OrgUnit
      if (resourceOrgUnitId === membershipOrgUnitId) {
        return ok(true);
      }

      // Fetch resource OrgUnit to get its path
      const resourceOrgUnit = await orgUnitRepository.findById(
        resourceOrgUnitId,
        tenantId,
      );

      if (!resourceOrgUnit) {
        return fail(orgUnitNotFound(resourceOrgUnitId));
      }

      // Verify membership OrgUnit exists in same tenant
      const membershipExists = await orgUnitRepository.exists(
        membershipOrgUnitId,
        tenantId,
      );

      if (!membershipExists) {
        return fail(orgUnitNotFound(membershipOrgUnitId));
      }

      // Check if membership OrgUnit ID is in resource's path
      // If membershipOrgUnitId is in the path, resource is a descendant
      const isDescendant = isInPath(resourceOrgUnit.path, membershipOrgUnitId);

      return ok(isDescendant);
    },

    /**
     * Check if child is a descendant of parent (not including equality).
     */
    async isDescendantOf(
      childOrgUnitId: string,
      parentOrgUnitId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      // Equal IDs means NOT a strict descendant
      if (childOrgUnitId === parentOrgUnitId) {
        return ok(false);
      }

      // Use isDescendantOrEqual and we already know they're not equal
      return this.isDescendantOrEqual(childOrgUnitId, parentOrgUnitId, tenantId);
    },

    /**
     * Check if OrgUnit is a root (no parent).
     */
    async isRoot(
      orgUnitId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      const orgUnit = await orgUnitRepository.findById(orgUnitId, tenantId);

      if (!orgUnit) {
        return fail(orgUnitNotFound(orgUnitId));
      }

      return ok(orgUnit.parentId === null);
    },

    /**
     * Get the path array for an OrgUnit.
     */
    async getOrgUnitPath(
      orgUnitId: string,
      tenantId: string,
    ): Promise<DomainResult<string[]>> {
      const path = await orgUnitRepository.getPath(orgUnitId, tenantId);

      if (path === null) {
        return fail(orgUnitNotFound(orgUnitId));
      }

      return ok(path);
    },

    /**
     * Get the depth of an OrgUnit.
     */
    async getOrgUnitDepth(
      orgUnitId: string,
      tenantId: string,
    ): Promise<DomainResult<number>> {
      const depth = await orgUnitRepository.getDepth(orgUnitId, tenantId);

      if (depth === null) {
        return fail(orgUnitNotFound(orgUnitId));
      }

      return ok(depth);
    },

    /**
     * Get an OrgUnit by ID with tenant boundary check.
     */
    async getOrgUnit(
      orgUnitId: string,
      tenantId: string,
    ): Promise<DomainResult<OrgUnit>> {
      const orgUnit = await orgUnitRepository.findById(orgUnitId, tenantId);

      if (!orgUnit) {
        return fail(orgUnitNotFound(orgUnitId));
      }

      // Verify tenant boundary (defense in depth)
      if (orgUnit.tenantId !== tenantId) {
        return fail(orgUnitTenantMismatch());
      }

      return ok(orgUnit);
    },

    /**
     * Validate path/depth invariant (INV-ORG-003).
     *
     * INVARIANT: depth = path.length - 1
     */
    validatePathDepthInvariant(orgUnit: OrgUnit): PathValidationResult {
      const expectedDepth = orgUnit.path.length - 1;

      if (orgUnit.depth !== expectedDepth) {
        return {
          isValid: false,
          failedInvariant: 'INV-ORG-003',
          errorMessage: `OrgUnit ${orgUnit.id} has depth=${orgUnit.depth} but path.length=${orgUnit.path.length} (expected depth=${expectedDepth})`,
        };
      }

      return { isValid: true };
    },

    /**
     * Validate root OrgUnit invariant (INV-ORG-004).
     *
     * INVARIANT for root OrgUnits:
     * - parentId is NULL
     * - depth = 0
     * - path = [id]
     */
    validateRootInvariant(orgUnit: OrgUnit): PathValidationResult {
      // Only validate if this appears to be a root (parentId === null)
      if (orgUnit.parentId !== null) {
        // Not a root, this invariant doesn't apply
        return { isValid: true };
      }

      // Check depth = 0
      if (orgUnit.depth !== 0) {
        return {
          isValid: false,
          failedInvariant: 'INV-ORG-004',
          errorMessage: `Root OrgUnit ${orgUnit.id} has depth=${orgUnit.depth} (expected 0)`,
        };
      }

      // Check path = [id]
      if (orgUnit.path.length !== 1 || orgUnit.path[0] !== orgUnit.id) {
        return {
          isValid: false,
          failedInvariant: 'INV-ORG-004',
          errorMessage: `Root OrgUnit ${orgUnit.id} has path=[${orgUnit.path.join(', ')}] (expected [${orgUnit.id}])`,
        };
      }

      return { isValid: true };
    },

    /**
     * Validate all hierarchy invariants for an OrgUnit.
     */
    validateOrgUnitInvariants(orgUnit: OrgUnit): DomainResult<void> {
      // Validate INV-ORG-003: depth = path.length - 1
      const pathDepthResult = this.validatePathDepthInvariant(orgUnit);
      if (!pathDepthResult.isValid) {
        return fail(
          orgUnitPathDepthMismatch(
            orgUnit.id,
            orgUnit.depth,
            orgUnit.path.length - 1,
          ),
        );
      }

      // Validate INV-ORG-004 (if root)
      const rootResult = this.validateRootInvariant(orgUnit);
      if (!rootResult.isValid) {
        return fail(
          orgUnitRootInvariantViolation(
            orgUnit.id,
            rootResult.errorMessage || 'Invalid root OrgUnit',
          ),
        );
      }

      return ok(undefined);
    },

    /**
     * Get all ancestors of an OrgUnit.
     */
    async getAncestors(
      orgUnitId: string,
      tenantId: string,
    ): Promise<DomainResult<OrgUnit[]>> {
      const ancestors = await orgUnitRepository.findAncestors(
        orgUnitId,
        tenantId,
      );

      // findAncestors already handles not-found case by returning empty array
      // if we need to validate the OrgUnit exists, we fetch it first
      const orgUnit = await orgUnitRepository.findById(orgUnitId, tenantId);
      if (!orgUnit) {
        return fail(orgUnitNotFound(orgUnitId));
      }

      return ok(ancestors);
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type OrgUnitHierarchyReader = IOrgUnitHierarchyReader;
