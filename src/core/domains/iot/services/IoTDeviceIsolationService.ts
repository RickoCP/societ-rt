/**
 * IoTDeviceIsolationService — Domain service for enforcing IoT device data isolation.
 *
 * This service enforces the INV-IOT-001 invariant and provides comprehensive
 * IoT device access control including:
 * 1. Tenant ownership validation — Each IoT device MUST belong to exactly one tenant
 * 2. Authorization via membership — Device access based on user's membership and OrgUnit scope
 * 3. Cross-tenant prevention — Prevents any cross-tenant IoT device access
 * 4. Scope validation — Validate user can access IoT device based on OrgUnit hierarchy
 *
 * **INVARIANT INV-IOT-001:**
 * IoTDevice.tenantId must match the accessor's tenant context.
 * This ensures tenants cannot access IoT device data from other tenants.
 *
 * **ACCESS LEVELS:**
 * - HOUSEHOLD_HEAD: Full access to manage devices in their household
 * - HOUSEHOLD_MEMBER: Access to devices in their household
 * - ADMIN (RT_ADMIN/ORG_ADMIN/TENANT_OWNER): Scope-based access per membership OrgUnit
 *
 * **SECURITY CONSIDERATIONS:**
 * - All operations MUST include tenantId for tenant isolation
 * - Cross-tenant access denied by default
 * - Device operations require household membership verification
 * - Admin access respects OrgUnit scope boundaries
 *
 * @see Task 60: IoT Device Isolation Enforcement (INV-IOT-001)
 * @see Design Data Entity Classification > TENANT_OWNED (iot_devices)
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { IIoTDeviceIsolationRepository, IoTDeviceWithContext } from '../repositories';
import type { IoTDevice } from '../entities';
import type { MembershipRole } from '@core/domains/membership/types';
import {
  iotDeviceTenantMismatch,
  iotDeviceNotFoundInTenant,
  iotDeviceAccessDeniedByMembership,
  iotDeviceOutOfScope,
  iotDeviceHouseholdAccessDenied,
  crossTenantIotAccessDenied,
  iotDeviceInvariantViolation,
} from '../errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Access check input for IoT device operations.
 */
export interface IoTDeviceAccessCheckInput {
  /** The user attempting access */
  readonly userId: string;
  /** The IoT device being accessed */
  readonly deviceId: string;
  /** The tenant context (security boundary) */
  readonly tenantId: string;
  /** The user's role (for admin override checks) */
  readonly userRole?: MembershipRole;
  /** The user's OrgUnit scope (for scope-based admin access) */
  readonly userOrgUnitId?: string | null;
}

/**
 * Result of IoT device access validation.
 */
export interface IoTDeviceAccessResult {
  /** Whether access is granted */
  readonly allowed: boolean;
  /** The reason for the decision */
  readonly reason: IoTDeviceAccessReason;
  /** Whether the user is the household head (device owner) */
  readonly isHouseholdHead: boolean;
  /** Whether the user is a member of the device's household */
  readonly isHouseholdMember: boolean;
  /** Whether access was granted via admin role */
  readonly isAdminAccess: boolean;
}

/**
 * Reasons for IoT device access decisions.
 */
export enum IoTDeviceAccessReason {
  /** User is the household head (device owner) */
  IS_HOUSEHOLD_HEAD = 'IS_HOUSEHOLD_HEAD',
  /** User is a member of the device's household */
  IS_HOUSEHOLD_MEMBER = 'IS_HOUSEHOLD_MEMBER',
  /** User has admin role with appropriate scope */
  ADMIN_SCOPE_ACCESS = 'ADMIN_SCOPE_ACCESS',
  /** Device not found */
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  /** User is not a member of the device's household */
  NOT_HOUSEHOLD_MEMBER = 'NOT_HOUSEHOLD_MEMBER',
  /** Tenant mismatch */
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  /** Access denied by policy */
  ACCESS_DENIED = 'ACCESS_DENIED',
  /** Device outside user's OrgUnit scope */
  OUT_OF_SCOPE = 'OUT_OF_SCOPE',
}

/**
 * Input for validating cross-tenant IoT access.
 */
export interface CrossTenantIoTValidationInput {
  /** The user attempting access */
  readonly userId: string;
  /** The user's active tenant */
  readonly userTenantId: string;
  /** The target device's tenant */
  readonly deviceTenantId: string;
  /** User's role for admin override */
  readonly userRole?: MembershipRole;
}

/**
 * Audit event types for IoT device isolation.
 */
export enum IoTDeviceIsolationAuditEventType {
  /** Tenant ownership validated successfully */
  TENANT_OWNERSHIP_VALIDATED = 'TENANT_OWNERSHIP_VALIDATED',
  /** Tenant ownership validation failed */
  TENANT_OWNERSHIP_FAILED = 'TENANT_OWNERSHIP_FAILED',
  /** Device access granted */
  DEVICE_ACCESS_GRANTED = 'DEVICE_ACCESS_GRANTED',
  /** Device access denied */
  DEVICE_ACCESS_DENIED = 'DEVICE_ACCESS_DENIED',
  /** Cross-tenant access denied */
  CROSS_TENANT_ACCESS_DENIED = 'CROSS_TENANT_ACCESS_DENIED',
  /** Admin override access granted */
  ADMIN_OVERRIDE_GRANTED = 'ADMIN_OVERRIDE_GRANTED',
  /** Invariant violation detected */
  INVARIANT_VIOLATION = 'INVARIANT_VIOLATION',
  /** Scope validation passed */
  SCOPE_VALIDATION_PASSED = 'SCOPE_VALIDATION_PASSED',
  /** Scope validation failed */
  SCOPE_VALIDATION_FAILED = 'SCOPE_VALIDATION_FAILED',
}

/**
 * Audit event payload for IoT device isolation.
 */
export interface IoTDeviceIsolationAuditEvent {
  /** Event type */
  readonly type: IoTDeviceIsolationAuditEventType;
  /** User ID performing the action */
  readonly userId: string;
  /** Device ID being accessed */
  readonly deviceId: string;
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
 * Interface for IoT device isolation audit event emitter.
 */
export interface IIoTDeviceIsolationAuditEmitter {
  /**
   * Emit an IoT device isolation audit event.
   * @param event - The audit event to emit
   */
  emit(event: IoTDeviceIsolationAuditEvent): Promise<void>;
}

// ---------------------------------------------------------------------------
// Admin Roles
// ---------------------------------------------------------------------------

/**
 * Roles that have administrative access to IoT devices within their scope.
 */
const IOT_ADMIN_ROLES: ReadonlySet<MembershipRole> = new Set([
  'PLATFORM_ADMIN' as MembershipRole,
  'TENANT_OWNER' as MembershipRole,
  'ORG_ADMIN' as MembershipRole,
  'RT_ADMIN' as MembershipRole,
]);

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * IIoTDeviceIsolationService interface.
 *
 * Provides operations for enforcing IoT device data isolation invariants
 * and access control.
 */
export interface IIoTDeviceIsolationService {
  // ---------------------------------------------------------------------------
  // Tenant Ownership Validation (INV-IOT-001)
  // ---------------------------------------------------------------------------

  /**
   * Validate that an IoT device belongs to exactly one tenant.
   *
   * INV-IOT-001: Each IoT device MUST belong to exactly one tenant.
   * Ensures tenant isolation at the device level.
   *
   * @param deviceId - The device ID to validate
   * @param expectedTenantId - The expected tenant ID
   * @returns DomainResult with true if valid, error otherwise
   */
  validateTenantOwnership(
    deviceId: string,
    expectedTenantId: string,
  ): Promise<DomainResult<boolean>>;

  /**
   * Validate that an IoT device and its household belong to the same tenant.
   *
   * INV-IOT-001: IoTDevice.tenantId == Household.tenantId
   * Ensures data integrity between device and household.
   *
   * @param deviceId - The device ID
   * @param tenantId - The expected tenant ID
   * @returns DomainResult with true if valid, error otherwise
   */
  validateDeviceHouseholdTenant(
    deviceId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;

  // ---------------------------------------------------------------------------
  // Authorization via Membership
  // ---------------------------------------------------------------------------

  /**
   * Check if a user has access to an IoT device via household membership.
   *
   * @param userId - The user ID to check
   * @param deviceId - The device ID
   * @param tenantId - The tenant context
   * @returns DomainResult with true if user has access, false otherwise
   */
  checkIsHouseholdMember(
    userId: string,
    deviceId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;

  /**
   * Check if a user is the household head (device owner).
   *
   * @param userId - The user ID to check
   * @param deviceId - The device ID
   * @param tenantId - The tenant context
   * @returns DomainResult with true if user is household head, false otherwise
   */
  checkIsHouseholdHead(
    userId: string,
    deviceId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;

  /**
   * Validate user has access to an IoT device.
   *
   * Access can be granted through:
   * 1. Being the household head (device owner)
   * 2. Being a member of the device's household
   * 3. Having admin role with appropriate OrgUnit scope
   *
   * @param input - The access check input
   * @returns DomainResult with access result
   */
  validateDeviceAccess(
    input: IoTDeviceAccessCheckInput,
  ): Promise<DomainResult<IoTDeviceAccessResult>>;

  /**
   * Authorize access to IoT device data.
   *
   * Fails with appropriate error if access is denied.
   *
   * @param input - The access check input
   * @returns DomainResult with void on success, error otherwise
   */
  authorizeDeviceAccess(
    input: IoTDeviceAccessCheckInput,
  ): Promise<DomainResult<void>>;

  // ---------------------------------------------------------------------------
  // Cross-Tenant Prevention
  // ---------------------------------------------------------------------------

  /**
   * Validate cross-tenant IoT access is denied.
   *
   * Ensures users cannot access IoT devices from tenants they don't belong to.
   *
   * @param input - The cross-tenant validation input
   * @returns DomainResult with void if same tenant, error otherwise
   */
  validateCrossTenantIsolation(
    input: CrossTenantIoTValidationInput,
  ): Promise<DomainResult<void>>;

  // ---------------------------------------------------------------------------
  // Scope Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate user can access IoT device based on OrgUnit hierarchy.
   *
   * For admin roles, validates that the device's OrgUnit is within
   * the user's membership OrgUnit scope.
   *
   * @param userId - The user ID
   * @param deviceId - The device ID
   * @param tenantId - The tenant context
   * @param userOrgUnitId - The user's OrgUnit scope (null for tenant-level admins)
   * @param userRole - The user's role
   * @returns DomainResult with void if in scope, error otherwise
   */
  validateOrgUnitScope(
    userId: string,
    deviceId: string,
    tenantId: string,
    userOrgUnitId: string | null,
    userRole: MembershipRole,
  ): Promise<DomainResult<void>>;

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Get IoT devices accessible by a user within a tenant.
   *
   * @param userId - The user ID
   * @param tenantId - The tenant context
   * @returns Array of IoT devices the user can access
   */
  getUserAccessibleDevices(
    userId: string,
    tenantId: string,
  ): Promise<IoTDevice[]>;

  /**
   * Get IoT device with its context (household, OrgUnit).
   *
   * Requires tenant context for isolation.
   *
   * @param deviceId - The device ID
   * @param tenantId - The tenant context
   * @returns Device with context if found, null otherwise
   */
  getDeviceWithContext(
    deviceId: string,
    tenantId: string,
  ): Promise<IoTDeviceWithContext | null>;

  /**
   * Check if user has admin role that grants IoT device access.
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
 * Factory function to create an IoTDeviceIsolationService instance.
 *
 * @param dependencies - Service dependencies
 * @returns An implementation of IIoTDeviceIsolationService
 */
export const IoTDeviceIsolationServiceImpl = ({
  iotDeviceIsolationRepository,
  iotDeviceIsolationAuditEmitter: auditEmitter,
}: {
  iotDeviceIsolationRepository: IIoTDeviceIsolationRepository;
  iotDeviceIsolationAuditEmitter: IIoTDeviceIsolationAuditEmitter;
}): IIoTDeviceIsolationService => {
  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Check if a role has admin-level IoT device access.
   */
  const hasAdminRole = (role: MembershipRole | undefined): boolean => {
    return role !== undefined && IOT_ADMIN_ROLES.has(role);
  };

  /**
   * Create an audit event.
   */
  const createAuditEvent = (
    type: IoTDeviceIsolationAuditEventType,
    userId: string,
    deviceId: string,
    tenantId: string,
    userRole?: MembershipRole,
    context?: Record<string, unknown>,
  ): IoTDeviceIsolationAuditEvent => ({
    type,
    userId,
    deviceId,
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
      deviceId: string,
      expectedTenantId: string,
    ): Promise<DomainResult<boolean>> {
      // Find the device
      const device = await iotDeviceIsolationRepository.findById(deviceId, expectedTenantId);

      if (!device) {
        // For security, we don't reveal if device exists elsewhere
        await auditEmitter.emit(createAuditEvent(
          IoTDeviceIsolationAuditEventType.TENANT_OWNERSHIP_FAILED,
          '', // No specific user for this check
          deviceId,
          expectedTenantId,
          undefined,
          { reason: 'Device not found in tenant' },
        ));
        return fail(iotDeviceNotFoundInTenant());
      }

      // Validate tenant ID matches (defense in depth)
      if (device.tenantId !== expectedTenantId) {
        await auditEmitter.emit(createAuditEvent(
          IoTDeviceIsolationAuditEventType.TENANT_OWNERSHIP_FAILED,
          '',
          deviceId,
          expectedTenantId,
          undefined,
          { actualTenantId: device.tenantId },
        ));
        return fail(iotDeviceTenantMismatch());
      }

      await auditEmitter.emit(createAuditEvent(
        IoTDeviceIsolationAuditEventType.TENANT_OWNERSHIP_VALIDATED,
        '',
        deviceId,
        expectedTenantId,
      ));

      return ok(true);
    },

    async validateDeviceHouseholdTenant(
      deviceId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      // First validate the device exists in the tenant
      const deviceValidation = await this.validateTenantOwnership(deviceId, tenantId);
      if (!deviceValidation.success) {
        return deviceValidation;
      }

      // Get device with context to check household tenant
      const deviceContext = await iotDeviceIsolationRepository.findWithContext(deviceId, tenantId);

      if (!deviceContext) {
        return fail(iotDeviceNotFoundInTenant());
      }

      // The repository should ensure household belongs to same tenant
      // This is a defense-in-depth check
      const householdId = deviceContext.householdId;
      const validation = await iotDeviceIsolationRepository.validateDeviceHouseholdTenant(
        deviceId,
        householdId,
        tenantId,
      );

      if (!validation.success) {
        await auditEmitter.emit(createAuditEvent(
          IoTDeviceIsolationAuditEventType.INVARIANT_VIOLATION,
          '',
          deviceId,
          tenantId,
          undefined,
          {
            invariant: 'INV-IOT-001',
            householdId,
            message: 'Device and household tenant mismatch',
          },
        ));
        return fail(iotDeviceInvariantViolation(
          'INV-IOT-001',
          `Device ${deviceId} and household ${householdId} have mismatched tenants`,
        ));
      }

      return ok(true);
    },

    async checkIsHouseholdMember(
      userId: string,
      deviceId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      // Validate tenant ownership first
      const tenantValidation = await this.validateTenantOwnership(deviceId, tenantId);
      if (!tenantValidation.success) {
        return tenantValidation;
      }

      const isMember = await iotDeviceIsolationRepository.isUserHouseholdMember(
        userId,
        deviceId,
        tenantId,
      );
      return ok(isMember);
    },

    async checkIsHouseholdHead(
      userId: string,
      deviceId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      // Validate tenant ownership first
      const tenantValidation = await this.validateTenantOwnership(deviceId, tenantId);
      if (!tenantValidation.success) {
        return tenantValidation;
      }

      const isHead = await iotDeviceIsolationRepository.isUserHouseholdHead(
        userId,
        deviceId,
        tenantId,
      );
      return ok(isHead);
    },

    async validateDeviceAccess(
      input: IoTDeviceAccessCheckInput,
    ): Promise<DomainResult<IoTDeviceAccessResult>> {
      const { userId, deviceId, tenantId, userRole, userOrgUnitId } = input;

      // Step 1: Validate tenant ownership
      const tenantValidation = await this.validateTenantOwnership(deviceId, tenantId);
      if (!tenantValidation.success) {
        return ok({
          allowed: false,
          reason: IoTDeviceAccessReason.DEVICE_NOT_FOUND,
          isHouseholdHead: false,
          isHouseholdMember: false,
          isAdminAccess: false,
        });
      }

      // Step 2: Check if user is household head (device owner)
      const isHead = await iotDeviceIsolationRepository.isUserHouseholdHead(
        userId,
        deviceId,
        tenantId,
      );
      if (isHead) {
        return ok({
          allowed: true,
          reason: IoTDeviceAccessReason.IS_HOUSEHOLD_HEAD,
          isHouseholdHead: true,
          isHouseholdMember: true,
          isAdminAccess: false,
        });
      }

      // Step 3: Check if user is household member
      const isMember = await iotDeviceIsolationRepository.isUserHouseholdMember(
        userId,
        deviceId,
        tenantId,
      );
      if (isMember) {
        return ok({
          allowed: true,
          reason: IoTDeviceAccessReason.IS_HOUSEHOLD_MEMBER,
          isHouseholdHead: false,
          isHouseholdMember: true,
          isAdminAccess: false,
        });
      }

      // Step 4: Check if user has admin role (scope-based access)
      if (hasAdminRole(userRole)) {
        // For admin roles, validate OrgUnit scope if provided
        if (userOrgUnitId !== undefined) {
          const scopeValidation = await this.validateOrgUnitScope(
            userId,
            deviceId,
            tenantId,
            userOrgUnitId,
            userRole!,
          );

          if (!scopeValidation.success) {
            return ok({
              allowed: false,
              reason: IoTDeviceAccessReason.OUT_OF_SCOPE,
              isHouseholdHead: false,
              isHouseholdMember: false,
              isAdminAccess: false,
            });
          }
        }

        await auditEmitter.emit(createAuditEvent(
          IoTDeviceIsolationAuditEventType.ADMIN_OVERRIDE_GRANTED,
          userId,
          deviceId,
          tenantId,
          userRole,
        ));
        return ok({
          allowed: true,
          reason: IoTDeviceAccessReason.ADMIN_SCOPE_ACCESS,
          isHouseholdHead: false,
          isHouseholdMember: false,
          isAdminAccess: true,
        });
      }

      // Access denied
      return ok({
        allowed: false,
        reason: IoTDeviceAccessReason.NOT_HOUSEHOLD_MEMBER,
        isHouseholdHead: false,
        isHouseholdMember: false,
        isAdminAccess: false,
      });
    },

    async authorizeDeviceAccess(
      input: IoTDeviceAccessCheckInput,
    ): Promise<DomainResult<void>> {
      const accessResult = await this.validateDeviceAccess(input);
      if (!accessResult.success) {
        return accessResult as DomainResult<void>;
      }

      const result = accessResult.data;

      if (!result.allowed) {
        await auditEmitter.emit(createAuditEvent(
          IoTDeviceIsolationAuditEventType.DEVICE_ACCESS_DENIED,
          input.userId,
          input.deviceId,
          input.tenantId,
          input.userRole,
          { reason: result.reason },
        ));

        switch (result.reason) {
          case IoTDeviceAccessReason.DEVICE_NOT_FOUND:
            return fail(iotDeviceNotFoundInTenant());
          case IoTDeviceAccessReason.TENANT_MISMATCH:
            return fail(iotDeviceTenantMismatch());
          case IoTDeviceAccessReason.NOT_HOUSEHOLD_MEMBER:
            return fail(iotDeviceHouseholdAccessDenied());
          case IoTDeviceAccessReason.OUT_OF_SCOPE:
            return fail(iotDeviceOutOfScope());
          default:
            return fail(iotDeviceAccessDeniedByMembership());
        }
      }

      await auditEmitter.emit(createAuditEvent(
        IoTDeviceIsolationAuditEventType.DEVICE_ACCESS_GRANTED,
        input.userId,
        input.deviceId,
        input.tenantId,
        input.userRole,
        {
          accessType: result.reason,
          isHouseholdHead: result.isHouseholdHead,
          isAdminAccess: result.isAdminAccess,
        },
      ));

      return ok(undefined);
    },

    async validateCrossTenantIsolation(
      input: CrossTenantIoTValidationInput,
    ): Promise<DomainResult<void>> {
      const { userId, userTenantId, deviceTenantId, userRole } = input;

      // Same tenant - access allowed (subject to other checks)
      if (userTenantId === deviceTenantId) {
        return ok(undefined);
      }

      // Cross-tenant access is NEVER allowed for IoT devices
      // Even PLATFORM_ADMIN cannot bypass this without privileged execution path
      await auditEmitter.emit(createAuditEvent(
        IoTDeviceIsolationAuditEventType.CROSS_TENANT_ACCESS_DENIED,
        userId,
        '', // No specific device ID for this check
        userTenantId,
        userRole,
        {
          targetTenantId: deviceTenantId,
          operation: 'cross_tenant_iot_access',
        },
      ));

      return fail(crossTenantIotAccessDenied());
    },

    async validateOrgUnitScope(
      userId: string,
      deviceId: string,
      tenantId: string,
      userOrgUnitId: string | null,
      userRole: MembershipRole,
    ): Promise<DomainResult<void>> {
      // Tenant-level admins (null orgUnitId) have full tenant scope
      if (userOrgUnitId === null && hasAdminRole(userRole)) {
        await auditEmitter.emit(createAuditEvent(
          IoTDeviceIsolationAuditEventType.SCOPE_VALIDATION_PASSED,
          userId,
          deviceId,
          tenantId,
          userRole,
          { scope: 'tenant-level' },
        ));
        return ok(undefined);
      }

      // Get device's OrgUnit
      const deviceOrgUnitId = await iotDeviceIsolationRepository.getDeviceOrgUnitId(
        deviceId,
        tenantId,
      );

      // If device has no OrgUnit scope, allow access for any admin
      if (deviceOrgUnitId === null) {
        await auditEmitter.emit(createAuditEvent(
          IoTDeviceIsolationAuditEventType.SCOPE_VALIDATION_PASSED,
          userId,
          deviceId,
          tenantId,
          userRole,
          { scope: 'device-unscoped' },
        ));
        return ok(undefined);
      }

      // For org-scoped admins, we need to check if the device's OrgUnit
      // is within the user's OrgUnit hierarchy
      // This would typically use OrgUnitHierarchyReader.isDescendantOrEqual
      // For now, we do a simple check (exact match or tenant-level)
      // The full hierarchy check should be done by OrgUnitScopeAuthorizer externally
      if (userOrgUnitId === deviceOrgUnitId) {
        await auditEmitter.emit(createAuditEvent(
          IoTDeviceIsolationAuditEventType.SCOPE_VALIDATION_PASSED,
          userId,
          deviceId,
          tenantId,
          userRole,
          { scope: 'exact-match', userOrgUnitId, deviceOrgUnitId },
        ));
        return ok(undefined);
      }

      // Scope validation failed - device is outside user's OrgUnit scope
      await auditEmitter.emit(createAuditEvent(
        IoTDeviceIsolationAuditEventType.SCOPE_VALIDATION_FAILED,
        userId,
        deviceId,
        tenantId,
        userRole,
        { userOrgUnitId, deviceOrgUnitId },
      ));

      return fail(iotDeviceOutOfScope());
    },

    async getUserAccessibleDevices(
      userId: string,
      tenantId: string,
    ): Promise<IoTDevice[]> {
      return iotDeviceIsolationRepository.findByUserId(userId, tenantId);
    },

    async getDeviceWithContext(
      deviceId: string,
      tenantId: string,
    ): Promise<IoTDeviceWithContext | null> {
      // Validate tenant ownership first
      const tenantValidation = await this.validateTenantOwnership(deviceId, tenantId);
      if (!tenantValidation.success) {
        return null;
      }

      return iotDeviceIsolationRepository.findWithContext(deviceId, tenantId);
    },

    isAdminRole(userRole: MembershipRole): boolean {
      return hasAdminRole(userRole);
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type IoTDeviceIsolationService = IIoTDeviceIsolationService;
