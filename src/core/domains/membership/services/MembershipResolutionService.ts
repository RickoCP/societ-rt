/**
 * MembershipResolutionService — Domain service for deterministic membership resolution.
 *
 * This service implements the membership resolution logic per TPR-03:
 * - Resolution returns authoritative membership state INCLUDING status
 * - Resolution is SEPARATE from operation authorization
 * - Authorization layer (FASE 1.7+) decides eligibility based on status + operation type
 *
 * **CRITICAL SECURITY RULES:**
 * - membershipId MUST be resolved server-side, NEVER from JWT
 * - Resolution MUST fail closed on ambiguous state
 * - Quarantined users MUST be rejected
 * - Resolution layer MUST NOT know whether operation is emergency (TPR-03)
 *
 * **INVARIANTS ENFORCED:**
 * - INV-MEM-002: Tenant-level membership (PLATFORM_ADMIN, TENANT_OWNER) has orgUnitId=NULL
 * - INV-MEM-003: Org-scoped roles require valid orgUnitId
 * - INV-QUARANTINE-001: Quarantined users cannot receive Membership
 *
 * **Multi-Membership Resolution Behavior Matrix:**
 * | Scenario | Resolution Strategy | Error Code (if fails) |
 * |----------|---------------------|----------------------|
 * | One membership | Direct match on (userId, tenantId) | AUTH_NO_MEMBERSHIP |
 * | Multiple tenants | activeTenantId selects tenant | CONTEXT_SWITCH_INVALID |
 * | Multiple in one tenant | activeOrgUnitId distinguishes | AUTH_MEMBERSHIP_CONTEXT_INVALID |
 * | Tenant-level membership | activeOrgUnitId = null, role ∈ {PLATFORM_ADMIN, TENANT_OWNER} | AUTH_INVALID_SCOPE |
 * | Org-scoped membership | activeOrgUnitId must match membership.orgUnitId | AUTH_OUT_OF_SCOPE |
 *
 * @see FASE 1.6 Task 5: Membership Resolution Logic
 * @see Requirements 1 (AC 2-6), 3 (AC 1-7), 4 (AC 8)
 * @see Design Membership Resolution Flow, membershipId Resolution Rules
 * @see TPR-03: Resolution returns authoritative state, no emergency policy
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { Membership } from '../entities';
import type { IMembershipRepository } from '../repositories';
import type { MembershipResolutionKey } from '../types';
import {
  isAuthoritativeStatus,
  isTenantLevelRole,
  isOrgScopedRole,
} from '../types';
import {
  authUserQuarantined,
  authMembershipContextInvalid,
  authInvalidScope,
  membershipInvariantViolation,
} from '../errors';

// ---------------------------------------------------------------------------
// Resolution Result Types
// ---------------------------------------------------------------------------

/**
 * Extended resolution result with metadata about the resolved membership.
 *
 * This allows the authorization layer to make informed decisions based on
 * the membership state without the resolution layer applying any policy.
 */
export interface MembershipResolutionResult {
  /**
   * The resolved membership entity (preserves all fields including status).
   */
  readonly membership: Membership;

  /**
   * Whether this is an authoritative membership (ACTIVE or SUSPENDED).
   * Non-authoritative memberships (INVITED, REVOKED) are resolved but marked.
   */
  readonly isAuthoritative: boolean;

  /**
   * The number of memberships the user has in this tenant.
   * Useful for multi-membership scenarios.
   */
  readonly membershipCountInTenant: number;

  /**
   * Whether the membership is tenant-level (null orgUnitId).
   * True only for PLATFORM_ADMIN and TENANT_OWNER roles.
   */
  readonly isTenantLevel: boolean;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * MembershipResolutionService interface.
 *
 * This service provides deterministic membership resolution for the
 * authorization pipeline. It wraps the repository's resolution logic
 * with additional validation and helper methods.
 */
export interface IMembershipResolutionService {
  /**
   * Resolve a membership using the 3-part resolution key.
   *
   * This is the PRIMARY method for authorization context resolution.
   * The membershipId is NEVER accepted from JWT — always resolved server-side.
   *
   * Per TPR-03: Resolution returns authoritative membership state INCLUDING
   * status. The authorization layer (FASE 1.7+) decides eligibility.
   *
   * @param key - The 3-part resolution key from JWT claims
   * @returns DomainResult with resolved membership or typed error
   */
  resolve(key: MembershipResolutionKey): Promise<DomainResult<MembershipResolutionResult>>;

  /**
   * Validate that a resolution key is structurally valid.
   *
   * This is a pre-check before resolution; it does NOT query the database.
   * Use this for fast-fail validation in middleware.
   *
   * @param key - The resolution key to validate
   * @returns Validation result with specific error if invalid
   */
  validateKey(key: MembershipResolutionKey): DomainResult<void>;

  /**
   * Check if a user is quarantined (cannot have memberships resolved).
   *
   * @param userId - The user's ID to check
   * @returns true if user is quarantined
   */
  isUserQuarantined(userId: string): Promise<boolean>;

  /**
   * Check if the user has any resolvable membership in the tenant.
   *
   * Fast existence check for context validation without full resolution.
   *
   * @param userId - The user's ID
   * @param tenantId - The tenant's ID
   * @returns true if at least one resolvable membership exists
   */
  hasResolvableMembership(
    userId: string,
    tenantId: string,
  ): Promise<boolean>;

  /**
   * Validate scope consistency for a membership.
   *
   * Checks that the membership's orgUnitId is consistent with its role
   * per INV-MEM-002 and INV-MEM-003.
   *
   * @param membership - The membership to validate
   * @returns DomainResult with void on success, error on invariant violation
   */
  validateScopeInvariant(membership: Membership): DomainResult<void>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a MembershipResolutionService instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param membershipRepository - The membership repository for data access
 * @returns An implementation of IMembershipResolutionService
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   membershipResolutionService: asFunction(MembershipResolutionServiceImpl).singleton(),
 * });
 *
 * // Direct usage (for testing)
 * const service = MembershipResolutionServiceImpl({
 *   membershipRepository: mockRepo,
 * });
 * ```
 */
export const MembershipResolutionServiceImpl = ({
  membershipRepository,
}: {
  membershipRepository: IMembershipRepository;
}): IMembershipResolutionService => {
  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Validate that a membership's scope is consistent with its role.
   *
   * INV-MEM-002: Tenant-level roles (PLATFORM_ADMIN, TENANT_OWNER) MUST have orgUnitId = null
   * INV-MEM-003: Org-scoped roles MUST have valid (non-null) orgUnitId
   */
  const validateMembershipScopeInvariant = (
    membership: Membership,
  ): DomainResult<void> => {
    const { role, orgUnitId } = membership;

    // Check INV-MEM-002: Tenant-level roles must have null orgUnitId
    if (isTenantLevelRole(role) && orgUnitId !== null) {
      return fail(
        membershipInvariantViolation(
          'INV-MEM-002',
          `Tenant-level role ${role} must have orgUnitId=null, but has ${orgUnitId}`,
        ),
      );
    }

    // Check INV-MEM-003: Org-scoped roles must have valid orgUnitId
    if (isOrgScopedRole(role) && orgUnitId === null) {
      return fail(
        membershipInvariantViolation(
          'INV-MEM-003',
          `Org-scoped role ${role} requires valid orgUnitId, but has null`,
        ),
      );
    }

    return ok(undefined);
  };

  /**
   * Create the resolution result with metadata.
   */
  const createResolutionResult = (
    membership: Membership,
    membershipCount: number,
  ): MembershipResolutionResult => ({
    membership,
    isAuthoritative: isAuthoritativeStatus(membership.status),
    membershipCountInTenant: membershipCount,
    isTenantLevel: membership.orgUnitId === null,
  });

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    /**
     * Resolve a membership using the 3-part resolution key.
     *
     * Resolution flow:
     * 1. Validate key structure
     * 2. Check quarantine status
     * 3. Query repository (status-aware per TPR-04)
     * 4. Validate resolved membership invariants
     * 5. Return result with metadata
     */
    async resolve(
      key: MembershipResolutionKey,
    ): Promise<DomainResult<MembershipResolutionResult>> {
      const { userId, activeTenantId } = key;

      // Step 1: Validate key structure (fast-fail)
      const keyValidation = this.validateKey(key);
      if (!keyValidation.success) {
        return keyValidation as DomainResult<MembershipResolutionResult>;
      }

      // Step 2: Quarantine check (per INV-QUARANTINE-001)
      const isQuarantined = await membershipRepository.isQuarantined(userId);
      if (isQuarantined) {
        return fail(authUserQuarantined());
      }

      // Step 3: Delegate to repository for resolution (status-aware per TPR-04)
      // The repository handles the multi-membership resolution logic
      const resolutionResult = await membershipRepository.resolveMembership(key);

      if (!resolutionResult.success) {
        return resolutionResult as DomainResult<MembershipResolutionResult>;
      }

      const membership = resolutionResult.data;

      // Step 4: Validate membership invariants
      const invariantCheck = validateMembershipScopeInvariant(membership);
      if (!invariantCheck.success) {
        return invariantCheck as DomainResult<MembershipResolutionResult>;
      }

      // Step 5: Get membership count for multi-membership info
      // This is useful metadata for the authorization layer
      const membershipCount = await membershipRepository.countByUserAndTenant(
        userId,
        activeTenantId,
        { includeInactive: false }, // Only count resolvable memberships
      );

      // Return result with metadata
      return ok(createResolutionResult(membership, membershipCount));
    },

    /**
     * Validate that a resolution key is structurally valid.
     */
    validateKey(key: MembershipResolutionKey): DomainResult<void> {
      const { userId, activeTenantId, activeOrgUnitId } = key;

      // userId must be non-empty string
      if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        return fail(authMembershipContextInvalid());
      }

      // activeTenantId must be non-empty string
      if (
        !activeTenantId ||
        typeof activeTenantId !== 'string' ||
        activeTenantId.trim().length === 0
      ) {
        return fail(authMembershipContextInvalid());
      }

      // activeOrgUnitId must be null or non-empty string
      if (
        activeOrgUnitId !== null &&
        (typeof activeOrgUnitId !== 'string' || activeOrgUnitId.trim().length === 0)
      ) {
        return fail(authInvalidScope());
      }

      return ok(undefined);
    },

    /**
     * Check if a user is quarantined.
     */
    async isUserQuarantined(userId: string): Promise<boolean> {
      return membershipRepository.isQuarantined(userId);
    },

    /**
     * Check if the user has any resolvable membership in the tenant.
     */
    async hasResolvableMembership(
      userId: string,
      tenantId: string,
    ): Promise<boolean> {
      // Quarantined users have no resolvable memberships
      const isQuarantined = await membershipRepository.isQuarantined(userId);
      if (isQuarantined) {
        return false;
      }

      // Check for any active membership
      return membershipRepository.hasActiveMembershipInTenant(userId, tenantId);
    },

    /**
     * Validate scope consistency for a membership.
     */
    validateScopeInvariant(membership: Membership): DomainResult<void> {
      return validateMembershipScopeInvariant(membership);
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type MembershipResolutionService = IMembershipResolutionService;
