/**
 * HouseholdIsolationService — Domain service for enforcing household data isolation.
 *
 * This service enforces the INV-HOUSEHOLD-001 invariant and provides comprehensive
 * household access control including:
 * 1. Tenant ownership validation — Each household MUST belong to exactly one tenant
 * 2. Household head authorization — Certain operations require household head approval
 * 3. Household member access control — Members can only access their own household
 * 4. Cross-household isolation — Prevents unauthorized access across households
 *
 * **INVARIANT INV-HOUSEHOLD-001:**
 * Household.tenantId == Resident.tenantId for all residents in household.
 * This ensures tenants cannot access household data from other tenants.
 *
 * **ACCESS LEVELS:**
 * - HOUSEHOLD_HEAD: Full access to manage household members and data
 * - HOUSEHOLD_MEMBER: Read access to own household data
 * - ADMIN (RT_ADMIN/ORG_ADMIN/TENANT_OWNER): Scope-based access per membership OrgUnit
 *
 * **SECURITY CONSIDERATIONS:**
 * - All operations MUST include tenantId for tenant isolation
 * - Cross-household access denied by default
 * - Household head operations require explicit verification
 * - Admin access respects OrgUnit scope boundaries
 *
 * @see Task 55: Household Isolation Enforcement (INV-HOUSEHOLD-001)
 * @see Design Data Entity Classification > HOUSEHOLD_SCOPED
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { IHouseholdRepository } from '../repositories';
import type { Household } from '@core/domains/resident/entities';
import type { HouseholdMember } from '../entities';
import type { MembershipRole } from '@core/domains/membership/types';
import {
  householdTenantMismatch,
  householdNotFound,
  notHouseholdHead,
  notHouseholdMember,
  householdAccessDenied,
  crossHouseholdAccessDenied,
  resourceBelongsToDifferentHousehold,
  householdInvariantViolation,
} from '../errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Access check input for household operations.
 */
export interface HouseholdAccessCheckInput {
  /** The user attempting access */
  readonly userId: string;
  /** The household being accessed */
  readonly householdId: string;
  /** The tenant context (security boundary) */
  readonly tenantId: string;
  /** The user's role (for admin override checks) */
  readonly userRole?: MembershipRole;
  /** The user's OrgUnit scope (for scope-based admin access) */
  readonly userOrgUnitId?: string | null;
}

/**
 * Result of household access validation.
 */
export interface HouseholdAccessResult {
  /** Whether access is granted */
  readonly allowed: boolean;
  /** The reason for the decision */
  readonly reason: HouseholdAccessReason;
  /** Whether the user is the household head */
  readonly isHead: boolean;
  /** Whether the user is a member of the household */
  readonly isMember: boolean;
  /** Whether access was granted via admin role */
  readonly isAdminAccess: boolean;
}

/**
 * Reasons for household access decisions.
 */
export enum HouseholdAccessReason {
  /** User is the household head */
  IS_HOUSEHOLD_HEAD = 'IS_HOUSEHOLD_HEAD',
  /** User is a household member */
  IS_HOUSEHOLD_MEMBER = 'IS_HOUSEHOLD_MEMBER',
  /** User has admin role with appropriate scope */
  ADMIN_SCOPE_ACCESS = 'ADMIN_SCOPE_ACCESS',
  /** Household not found */
  HOUSEHOLD_NOT_FOUND = 'HOUSEHOLD_NOT_FOUND',
  /** User is not a member of the household */
  NOT_A_MEMBER = 'NOT_A_MEMBER',
  /** Tenant mismatch */
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  /** Access denied by policy */
  ACCESS_DENIED = 'ACCESS_DENIED',
}

/**
 * Input for validating cross-household access.
 */
export interface CrossHouseholdValidationInput {
  /** The user attempting access */
  readonly userId: string;
  /** The source household (user's household) */
  readonly sourceHouseholdId: string;
  /** The target household being accessed */
  readonly targetHouseholdId: string;
  /** The tenant context */
  readonly tenantId: string;
  /** User's role for admin override */
  readonly userRole?: MembershipRole;
}

/**
 * Audit event types for household isolation.
 */
export enum HouseholdIsolationAuditEventType {
  /** Tenant ownership validated successfully */
  TENANT_OWNERSHIP_VALIDATED = 'TENANT_OWNERSHIP_VALIDATED',
  /** Tenant ownership validation failed */
  TENANT_OWNERSHIP_FAILED = 'TENANT_OWNERSHIP_FAILED',
  /** Household head authorization granted */
  HEAD_AUTHORIZATION_GRANTED = 'HEAD_AUTHORIZATION_GRANTED',
  /** Household head authorization denied */
  HEAD_AUTHORIZATION_DENIED = 'HEAD_AUTHORIZATION_DENIED',
  /** Member access granted */
  MEMBER_ACCESS_GRANTED = 'MEMBER_ACCESS_GRANTED',
  /** Member access denied */
  MEMBER_ACCESS_DENIED = 'MEMBER_ACCESS_DENIED',
  /** Cross-household access denied */
  CROSS_HOUSEHOLD_ACCESS_DENIED = 'CROSS_HOUSEHOLD_ACCESS_DENIED',
  /** Admin override access granted */
  ADMIN_OVERRIDE_GRANTED = 'ADMIN_OVERRIDE_GRANTED',
  /** Invariant violation detected */
  INVARIANT_VIOLATION = 'INVARIANT_VIOLATION',
}

/**
 * Audit event payload for household isolation.
 */
export interface HouseholdIsolationAuditEvent {
  /** Event type */
  readonly type: HouseholdIsolationAuditEventType;
  /** User ID performing the action */
  readonly userId: string;
  /** Household ID being accessed */
  readonly householdId: string;
  /** Tenant ID */
  readonly tenantId: string;
  /** User's role */
  readonly userRole?: MembershipRole;
  /** Additional context */
  readonly context?: Record<string, unknown>;
  /** Event timestamp */
  readonly timestamp: Date;
}

/**
 * Interface for household isolation audit event emitter.
 */
export interface IHouseholdIsolationAuditEmitter {
  /**
   * Emit a household isolation audit event.
   * @param event - The audit event to emit
   */
  emit(event: HouseholdIsolationAuditEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Admin Roles
// ---------------------------------------------------------------------------

/**
 * Roles that have administrative access to households within their scope.
 */
const HOUSEHOLD_ADMIN_ROLES: ReadonlySet<MembershipRole> = new Set([
  'PLATFORM_ADMIN' as MembershipRole,
  'TENANT_OWNER' as MembershipRole,
  'ORG_ADMIN' as MembershipRole,
  'RT_ADMIN' as MembershipRole,
]);

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * IHouseholdIsolationService interface.
 *
 * Provides operations for enforcing household data isolation invariants
 * and access control.
 */
export interface IHouseholdIsolationService {
  // ---------------------------------------------------------------------------
  // Tenant Ownership Validation (INV-HOUSEHOLD-001)
  // ---------------------------------------------------------------------------

  /**
   * Validate that a household belongs to exactly one tenant.
   *
   * INV-HOUSEHOLD-001: Each household MUST belong to exactly one tenant.
   * Ensures tenant isolation at the household level.
   *
   * @param householdId - The household ID to validate
   * @param expectedTenantId - The expected tenant ID
   * @returns DomainResult with true if valid, error otherwise
   */
  validateTenantOwnership(
    householdId: string,
    expectedTenantId: string,
  ): Promise<DomainResult<boolean>>;

  /**
   * Validate that all residents in a household belong to the same tenant.
   *
   * INV-HOUSEHOLD-001: Household.tenantId == Resident.tenantId
   * Ensures data integrity between household and residents.
   *
   * @param householdId - The household ID
   * @param tenantId - The expected tenant ID
   * @returns DomainResult with true if all residents match, error otherwise
   */
  validateHouseholdResidentsTenant(
    householdId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;

  // ---------------------------------------------------------------------------
  // Household Head Authorization
  // ---------------------------------------------------------------------------

  /**
   * Check if a user is the head of a household.
   *
   * @param userId - The user ID to check
   * @param householdId - The household ID
   * @param tenantId - The tenant context
   * @returns DomainResult with true if user is head, error otherwise
   */
  checkIsHouseholdHead(
    userId: string,
    householdId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;

  /**
   * Authorize a household head operation.
   *
   * Validates that the user is the household head and can perform
   * head-only operations (e.g., adding/removing members, editing household).
   *
   * @param userId - The user ID to authorize
   * @param householdId - The household ID
   * @param tenantId - The tenant context
   * @returns DomainResult with void on success, error otherwise
   */
  authorizeHouseholdHead(
    userId: string,
    householdId: string,
    tenantId: string,
  ): Promise<DomainResult<void>>;

  // ---------------------------------------------------------------------------
  // Household Member Access Control
  // ---------------------------------------------------------------------------

  /**
   * Check if a user is a member of a household.
   *
   * @param userId - The user ID to check
   * @param householdId - The household ID
   * @param tenantId - The tenant context
   * @returns DomainResult with true if user is member, error otherwise
   */
  checkIsMember(
    userId: string,
    householdId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;

  /**
   * Validate user has access to a household.
   *
   * Access can be granted through:
   * 1. Being the household head
   * 2. Being a household member
   * 3. Having admin role with appropriate scope
   *
   * @param input - The access check input
   * @returns DomainResult with access result
   */
  validateHouseholdAccess(
    input: HouseholdAccessCheckInput,
  ): Promise<DomainResult<HouseholdAccessResult>>;

  /**
   * Authorize access to household data.
   *
   * Fails with appropriate error if access is denied.
   *
   * @param input - The access check input
   * @returns DomainResult with void on success, error otherwise
   */
  authorizeHouseholdAccess(
    input: HouseholdAccessCheckInput,
  ): Promise<DomainResult<void>>;

  // ---------------------------------------------------------------------------
  // Cross-Household Isolation Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate cross-household access is denied.
   *
   * Ensures users cannot access data from households they don't belong to,
   * unless they have admin access.
   *
   * @param input - The cross-household validation input
   * @returns DomainResult with void if same household or admin, error otherwise
   */
  validateCrossHouseholdIsolation(
    input: CrossHouseholdValidationInput,
  ): Promise<DomainResult<void>>;

  /**
   * Check if a resource belongs to a specific household.
   *
   * @param resourceHouseholdId - The household ID the resource belongs to
   * @param userHouseholdId - The user's household ID
   * @param userId - The user ID
   * @param tenantId - The tenant context
   * @param userRole - Optional user role for admin override
   * @returns DomainResult with void if access allowed, error otherwise
   */
  validateResourceHouseholdAccess(
    resourceHouseholdId: string,
    userHouseholdId: string,
    userId: string,
    tenantId: string,
    userRole?: MembershipRole,
  ): Promise<DomainResult<void>>;

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Get the household(s) for a user within a tenant.
   *
   * @param userId - The user ID
   * @param tenantId - The tenant context
   * @returns Array of households the user belongs to
   */
  getUserHouseholds(
    userId: string,
    tenantId: string,
  ): Promise<Household[]>;

  /**
   * Get all members of a household.
   *
   * Requires tenant context for isolation.
   *
   * @param householdId - The household ID
   * @param tenantId - The tenant context
   * @returns Array of household members
   */
  getHouseholdMembers(
    householdId: string,
    tenantId: string,
  ): Promise<HouseholdMember[]>;

  /**
   * Check if user has admin role that grants household access.
   *
   * @param userRole - The user's role
   * @returns true if role is an admin role
   */
  isAdminRole(userRole: MembershipRole): boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a HouseholdIsolationService instance.
 *
 * @param dependencies - Service dependencies
 * @returns An implementation of IHouseholdIsolationService
 */
export const HouseholdIsolationServiceImpl = ({
  householdRepository,
  auditEmitter,
}: {
  householdRepository: IHouseholdRepository;
  auditEmitter: IHouseholdIsolationAuditEmitter;
}): IHouseholdIsolationService => {
  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Check if a role has admin-level household access.
   */
  const hasAdminRole = (role: MembershipRole | undefined): boolean => {
    return role !== undefined && HOUSEHOLD_ADMIN_ROLES.has(role);
  };

  /**
   * Create an audit event.
   */
  const createAuditEvent = (
    type: HouseholdIsolationAuditEventType,
    userId: string,
    householdId: string,
    tenantId: string,
    userRole?: MembershipRole,
    context?: Record<string, unknown>,
  ): HouseholdIsolationAuditEvent => ({
    type,
    userId,
    householdId,
    tenantId,
    userRole,
    context,
    timestamp: new Date(),
  });

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    async validateTenantOwnership(
      householdId: string,
      expectedTenantId: string,
    ): Promise<DomainResult<boolean>> {
      // Find the household
      const household = await householdRepository.findById(householdId, expectedTenantId);

      if (!household) {
        // Check if household exists in a different tenant (would indicate mismatch)
        // For security, we don't reveal if it exists elsewhere
        await auditEmitter.emit(createAuditEvent(
          HouseholdIsolationAuditEventType.TENANT_OWNERSHIP_FAILED,
          '', // No specific user for this check
          householdId,
          expectedTenantId,
          undefined,
          { reason: 'Household not found in tenant' },
        ));
        return fail(householdNotFound());
      }

      // Validate tenant ID matches (defense in depth)
      if (household.tenantId !== expectedTenantId) {
        await auditEmitter.emit(createAuditEvent(
          HouseholdIsolationAuditEventType.TENANT_OWNERSHIP_FAILED,
          '',
          householdId,
          expectedTenantId,
          undefined,
          { actualTenantId: household.tenantId },
        ));
        return fail(householdTenantMismatch());
      }

      await auditEmitter.emit(createAuditEvent(
        HouseholdIsolationAuditEventType.TENANT_OWNERSHIP_VALIDATED,
        '',
        householdId,
        expectedTenantId,
      ));

      return ok(true);
    },

    async validateHouseholdResidentsTenant(
      householdId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      // First validate the household exists in the tenant
      const householdValidation = await this.validateTenantOwnership(householdId, tenantId);
      if (!householdValidation.success) {
        return householdValidation;
      }

      // Get all members and verify their tenant matches
      const members = await householdRepository.getMembers(householdId, tenantId);

      for (const member of members) {
        if (member.tenantId !== tenantId) {
          await auditEmitter.emit(createAuditEvent(
            HouseholdIsolationAuditEventType.INVARIANT_VIOLATION,
            member.userId ?? '',
            householdId,
            tenantId,
            undefined,
            {
              invariant: 'INV-HOUSEHOLD-001',
              residentId: member.residentId,
              residentTenantId: member.tenantId,
            },
          ));
          return fail(householdInvariantViolation(
            'INV-HOUSEHOLD-001',
            `Resident ${member.residentId} has tenantId ${member.tenantId} but household has tenantId ${tenantId}`,
          ));
        }
      }

      return ok(true);
    },

    async checkIsHouseholdHead(
      userId: string,
      householdId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      // Validate tenant ownership first
      const tenantValidation = await this.validateTenantOwnership(householdId, tenantId);
      if (!tenantValidation.success) {
        return tenantValidation;
      }

      const isHead = await householdRepository.isUserHead(userId, householdId, tenantId);
      return ok(isHead);
    },

    async authorizeHouseholdHead(
      userId: string,
      householdId: string,
      tenantId: string,
    ): Promise<DomainResult<void>> {
      const isHeadResult = await this.checkIsHouseholdHead(userId, householdId, tenantId);
      if (!isHeadResult.success) {
        return isHeadResult as DomainResult<void>;
      }

      if (!isHeadResult.data) {
        await auditEmitter.emit(createAuditEvent(
          HouseholdIsolationAuditEventType.HEAD_AUTHORIZATION_DENIED,
          userId,
          householdId,
          tenantId,
        ));
        return fail(notHouseholdHead());
      }

      await auditEmitter.emit(createAuditEvent(
        HouseholdIsolationAuditEventType.HEAD_AUTHORIZATION_GRANTED,
        userId,
        householdId,
        tenantId,
      ));

      return ok(undefined);
    },

    async checkIsMember(
      userId: string,
      householdId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      // Validate tenant ownership first
      const tenantValidation = await this.validateTenantOwnership(householdId, tenantId);
      if (!tenantValidation.success) {
        return tenantValidation;
      }

      const isMember = await householdRepository.isUserMember(userId, householdId, tenantId);
      return ok(isMember);
    },

    async validateHouseholdAccess(
      input: HouseholdAccessCheckInput,
    ): Promise<DomainResult<HouseholdAccessResult>> {
      const { userId, householdId, tenantId, userRole } = input;

      // Step 1: Validate tenant ownership
      const tenantValidation = await this.validateTenantOwnership(householdId, tenantId);
      if (!tenantValidation.success) {
        return ok({
          allowed: false,
          reason: HouseholdAccessReason.HOUSEHOLD_NOT_FOUND,
          isHead: false,
          isMember: false,
          isAdminAccess: false,
        });
      }

      // Step 2: Check if user is household head
      const isHead = await householdRepository.isUserHead(userId, householdId, tenantId);
      if (isHead) {
        return ok({
          allowed: true,
          reason: HouseholdAccessReason.IS_HOUSEHOLD_HEAD,
          isHead: true,
          isMember: true,
          isAdminAccess: false,
        });
      }

      // Step 3: Check if user is household member
      const isMember = await householdRepository.isUserMember(userId, householdId, tenantId);
      if (isMember) {
        return ok({
          allowed: true,
          reason: HouseholdAccessReason.IS_HOUSEHOLD_MEMBER,
          isHead: false,
          isMember: true,
          isAdminAccess: false,
        });
      }

      // Step 4: Check if user has admin role (scope-based access)
      if (hasAdminRole(userRole)) {
        // Admin roles have access within their scope
        // Note: OrgUnit scope validation should be done by OrgUnitScopeAuthorizer externally
        await auditEmitter.emit(createAuditEvent(
          HouseholdIsolationAuditEventType.ADMIN_OVERRIDE_GRANTED,
          userId,
          householdId,
          tenantId,
          userRole,
        ));
        return ok({
          allowed: true,
          reason: HouseholdAccessReason.ADMIN_SCOPE_ACCESS,
          isHead: false,
          isMember: false,
          isAdminAccess: true,
        });
      }

      // Access denied
      return ok({
        allowed: false,
        reason: HouseholdAccessReason.NOT_A_MEMBER,
        isHead: false,
        isMember: false,
        isAdminAccess: false,
      });
    },

    async authorizeHouseholdAccess(
      input: HouseholdAccessCheckInput,
    ): Promise<DomainResult<void>> {
      const accessResult = await this.validateHouseholdAccess(input);
      if (!accessResult.success) {
        return accessResult as DomainResult<void>;
      }

      const result = accessResult.data;

      if (!result.allowed) {
        await auditEmitter.emit(createAuditEvent(
          HouseholdIsolationAuditEventType.MEMBER_ACCESS_DENIED,
          input.userId,
          input.householdId,
          input.tenantId,
          input.userRole,
          { reason: result.reason },
        ));

        switch (result.reason) {
          case HouseholdAccessReason.HOUSEHOLD_NOT_FOUND:
            return fail(householdNotFound());
          case HouseholdAccessReason.TENANT_MISMATCH:
            return fail(householdTenantMismatch());
          case HouseholdAccessReason.NOT_A_MEMBER:
            return fail(notHouseholdMember());
          default:
            return fail(householdAccessDenied());
        }
      }

      await auditEmitter.emit(createAuditEvent(
        HouseholdIsolationAuditEventType.MEMBER_ACCESS_GRANTED,
        input.userId,
        input.householdId,
        input.tenantId,
        input.userRole,
        {
          accessType: result.reason,
          isHead: result.isHead,
          isAdminAccess: result.isAdminAccess,
        },
      ));

      return ok(undefined);
    },

    async validateCrossHouseholdIsolation(
      input: CrossHouseholdValidationInput,
    ): Promise<DomainResult<void>> {
      const { userId, sourceHouseholdId, targetHouseholdId, tenantId, userRole } = input;

      // Same household - access allowed
      if (sourceHouseholdId === targetHouseholdId) {
        return ok(undefined);
      }

      // Admin roles can access across households within their scope
      if (hasAdminRole(userRole)) {
        await auditEmitter.emit(createAuditEvent(
          HouseholdIsolationAuditEventType.ADMIN_OVERRIDE_GRANTED,
          userId,
          targetHouseholdId,
          tenantId,
          userRole,
          { sourceHouseholdId, operation: 'cross_household_access' },
        ));
        return ok(undefined);
      }

      // Cross-household access denied for non-admin users
      await auditEmitter.emit(createAuditEvent(
        HouseholdIsolationAuditEventType.CROSS_HOUSEHOLD_ACCESS_DENIED,
        userId,
        targetHouseholdId,
        tenantId,
        userRole,
        { sourceHouseholdId },
      ));

      return fail(crossHouseholdAccessDenied());
    },

    async validateResourceHouseholdAccess(
      resourceHouseholdId: string,
      userHouseholdId: string,
      userId: string,
      tenantId: string,
      userRole?: MembershipRole,
    ): Promise<DomainResult<void>> {
      // Validate resource household belongs to tenant
      const resourceTenantValidation = await this.validateTenantOwnership(
        resourceHouseholdId,
        tenantId,
      );
      if (!resourceTenantValidation.success) {
        return resourceTenantValidation as DomainResult<void>;
      }

      // If user belongs to the same household, allow access
      if (resourceHouseholdId === userHouseholdId) {
        return ok(undefined);
      }

      // Check if user is a member of the resource household
      const isMember = await householdRepository.isUserMember(
        userId,
        resourceHouseholdId,
        tenantId,
      );
      if (isMember) {
        return ok(undefined);
      }

      // Check admin access
      if (hasAdminRole(userRole)) {
        return ok(undefined);
      }

      // Access denied
      return fail(resourceBelongsToDifferentHousehold());
    },

    async getUserHouseholds(
      userId: string,
      tenantId: string,
    ): Promise<Household[]> {
      return householdRepository.findByUserId(userId, tenantId);
    },

    async getHouseholdMembers(
      householdId: string,
      tenantId: string,
    ): Promise<HouseholdMember[]> {
      // Validate tenant ownership first
      const tenantValidation = await this.validateTenantOwnership(householdId, tenantId);
      if (!tenantValidation.success) {
        return [];
      }

      return householdRepository.getMembers(householdId, tenantId);
    },

    isAdminRole(userRole: MembershipRole): boolean {
      return hasAdminRole(userRole);
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type HouseholdIsolationService = IHouseholdIsolationService;
