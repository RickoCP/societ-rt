/**
 * IIoTDeviceIsolationRepository — Repository contract for IoT device isolation queries.
 *
 * This interface defines the contract for querying IoT device data
 * with tenant isolation enforcement, independent of database implementation
 * (Clean Architecture).
 *
 * CRITICAL SECURITY RULES:
 * - All queries MUST include tenantId for tenant isolation
 * - IoT device data MUST NOT be accessible across tenant boundaries
 * - Cross-tenant IoT access MUST be explicitly authorized
 *
 * INVARIANTS ENFORCED:
 * - INV-IOT-001: IoTDevice.tenantId must match the accessor's tenant context
 *
 * @see Task 60: IoT Device Isolation Enforcement
 * @see INV-IOT-001
 */

import type { DomainResult } from '@core/utils';
import type { IoTDevice } from '../entities';

// ---------------------------------------------------------------------------
// Types for IoT Device Isolation
// ---------------------------------------------------------------------------

/**
 * IoT device with household and OrgUnit context for access control.
 */
export interface IoTDeviceWithContext {
  /** The IoT device */
  readonly device: IoTDevice;
  /** The household ID the device belongs to (if tracked) */
  readonly householdId: string;
  /** The OrgUnit ID this device/household belongs to (if tracked) */
  readonly orgUnitId: string | null;
}

/**
 * IoT device member information for access control.
 * Represents a user's relationship to an IoT device via household membership.
 */
export interface IoTDeviceMember {
  /** The IoT device ID */
  readonly deviceId: string;
  /** The user ID if device is linked via household */
  readonly userId: string | null;
  /** The tenant ID */
  readonly tenantId: string;
  /** The household ID the device belongs to */
  readonly householdId: string;
  /** Whether this user is the household head (device owner) */
  readonly isHouseholdHead: boolean;
}

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

/**
 * Repository interface for IoT device isolation queries.
 *
 * All methods REQUIRE tenantId to ensure tenant isolation.
 * This is the read-only interface for IoT device isolation checks.
 */
export interface IIoTDeviceIsolationRepository {
  // ---------------------------------------------------------------------------
  // Device Lookup
  // ---------------------------------------------------------------------------

  /**
   * Find an IoT device by ID within a tenant.
   *
   * SECURITY: Always requires tenantId to ensure tenant boundary.
   *
   * @param deviceId - The device's ID
   * @param tenantId - The tenant's ID (security boundary)
   * @returns The IoT device if found, null otherwise
   */
  findById(deviceId: string, tenantId: string): Promise<IoTDevice | null>;

  /**
   * Check if an IoT device exists within a tenant.
   *
   * Fast existence check without loading full data.
   *
   * @param deviceId - The device's ID
   * @param tenantId - The tenant's ID
   * @returns true if device exists in tenant, false otherwise
   */
  exists(deviceId: string, tenantId: string): Promise<boolean>;

  /**
   * Find an IoT device with its context (household, OrgUnit).
   *
   * @param deviceId - The device's ID
   * @param tenantId - The tenant's ID
   * @returns Device with context if found, null otherwise
   */
  findWithContext(deviceId: string, tenantId: string): Promise<IoTDeviceWithContext | null>;

  // ---------------------------------------------------------------------------
  // Household-Device Queries
  // ---------------------------------------------------------------------------

  /**
   * Get all IoT devices for a household within a tenant.
   *
   * @param householdId - The household's ID
   * @param tenantId - The tenant's ID
   * @returns Array of IoT devices in the household
   */
  findByHousehold(householdId: string, tenantId: string): Promise<IoTDevice[]>;

  /**
   * Check if a user has access to an IoT device via household membership.
   *
   * @param userId - The user's ID
   * @param deviceId - The device's ID
   * @param tenantId - The tenant's ID
   * @returns true if user has access via household, false otherwise
   */
  isUserHouseholdMember(
    userId: string,
    deviceId: string,
    tenantId: string,
  ): Promise<boolean>;

  /**
   * Check if a user is the household head (device owner).
   *
   * @param userId - The user's ID
   * @param deviceId - The device's ID
   * @param tenantId - The tenant's ID
   * @returns true if user is the household head, false otherwise
   */
  isUserHouseholdHead(
    userId: string,
    deviceId: string,
    tenantId: string,
  ): Promise<boolean>;

  /**
   * Get the IoT devices a user has access to within a tenant.
   *
   * A user has access to devices in households they belong to.
   *
   * @param userId - The user's ID
   * @param tenantId - The tenant's ID
   * @returns Array of IoT devices the user can access
   */
  findByUserId(userId: string, tenantId: string): Promise<IoTDevice[]>;

  // ---------------------------------------------------------------------------
  // OrgUnit Scope Queries
  // ---------------------------------------------------------------------------

  /**
   * Get the OrgUnit ID for an IoT device (via its household).
   *
   * @param deviceId - The device's ID
   * @param tenantId - The tenant's ID
   * @returns The OrgUnit ID if tracked, null otherwise
   */
  getDeviceOrgUnitId(deviceId: string, tenantId: string): Promise<string | null>;

  /**
   * Find IoT devices within an OrgUnit scope.
   *
   * @param orgUnitId - The OrgUnit's ID
   * @param tenantId - The tenant's ID
   * @param includeDescendants - Whether to include devices in descendant OrgUnits
   * @returns Array of IoT devices in the OrgUnit scope
   */
  findByOrgUnit(
    orgUnitId: string,
    tenantId: string,
    includeDescendants?: boolean,
  ): Promise<IoTDevice[]>;

  // ---------------------------------------------------------------------------
  // Validation Queries
  // ---------------------------------------------------------------------------

  /**
   * Validate that an IoT device belongs to the specified tenant.
   *
   * INV-IOT-001 validation: Ensures tenant isolation.
   *
   * @param deviceId - The device's ID
   * @param tenantId - The expected tenant's ID
   * @returns DomainResult with true if valid, error otherwise
   */
  validateTenantOwnership(
    deviceId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;

  /**
   * Validate that an IoT device belongs to the same tenant as the household.
   *
   * INV-IOT-001 validation: IoTDevice.tenantId == Household.tenantId
   *
   * @param deviceId - The device's ID
   * @param householdId - The household's ID
   * @param tenantId - The expected tenant's ID
   * @returns DomainResult with true if valid, error otherwise
   */
  validateDeviceHouseholdTenant(
    deviceId: string,
    householdId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;

  /**
   * Get the household ID for a device.
   *
   * @param deviceId - The device's ID
   * @param tenantId - The tenant's ID
   * @returns The household ID if found, null otherwise
   */
  getDeviceHouseholdId(deviceId: string, tenantId: string): Promise<string | null>;
}
