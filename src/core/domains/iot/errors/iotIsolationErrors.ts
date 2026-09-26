/**
 * IoT Isolation-specific error factory functions.
 *
 * Each function returns a typed AppError with a stable, searchable code.
 * Error codes follow the Authorization Error Codes specification.
 *
 * SECURITY CONSIDERATIONS:
 * - Error messages MUST NOT expose internal details
 * - Errors MUST NOT leak cross-tenant or cross-device information
 *
 * @see INV-IOT-001: IoTDevice.tenantId must match the accessor's tenant context
 * @see Task 60: IoT Device Isolation Enforcement
 */

import type { AppError } from '@core/utils';
import {
  authorizationError,
  validationError,
  businessError,
  notFoundError,
} from '@core/utils';

// ---------------------------------------------------------------------------
// Tenant Isolation Errors
// ---------------------------------------------------------------------------

/**
 * IoT device tenant does not match expected tenant.
 * INV-IOT-001 violation - tenant isolation breach attempt.
 * HTTP Status: 403
 */
export function iotDeviceTenantMismatch(): AppError {
  return authorizationError(
    'IOT_DEVICE_TENANT_MISMATCH',
    'IoT device belongs to a different tenant',
    { userMessage: 'You do not have access to this device' },
  );
}

/**
 * IoT device does not belong to the expected tenant.
 * HTTP Status: 403
 */
export function iotDeviceNotInTenant(): AppError {
  return authorizationError(
    'IOT_DEVICE_NOT_IN_TENANT',
    'IoT device is not part of the active tenant',
    { userMessage: 'This device is not part of your community' },
  );
}

/**
 * IoT device ownership validation failed.
 * HTTP Status: 403
 */
export function iotDeviceOwnershipInvalid(): AppError {
  return authorizationError(
    'IOT_DEVICE_OWNERSHIP_INVALID',
    'IoT device ownership could not be validated',
    { userMessage: 'Unable to verify device ownership' },
  );
}

// ---------------------------------------------------------------------------
// Authorization Errors
// ---------------------------------------------------------------------------

/**
 * User does not have access to the IoT device.
 * HTTP Status: 403
 */
export function iotDeviceAccessDeniedByMembership(): AppError {
  return authorizationError(
    'IOT_DEVICE_ACCESS_DENIED_BY_MEMBERSHIP',
    'User membership does not grant access to this IoT device',
    { userMessage: 'You do not have permission to access this device' },
  );
}

/**
 * User does not have the required scope to access the IoT device.
 * HTTP Status: 403
 */
export function iotDeviceOutOfScope(): AppError {
  return authorizationError(
    'IOT_DEVICE_OUT_OF_SCOPE',
    'IoT device is outside the user\'s OrgUnit scope',
    { userMessage: 'This device is outside your authorized scope' },
  );
}

/**
 * User is not a member of the household where the device is registered.
 * HTTP Status: 403
 */
export function iotDeviceHouseholdAccessDenied(): AppError {
  return authorizationError(
    'IOT_DEVICE_HOUSEHOLD_ACCESS_DENIED',
    'User is not a member of the household where the device is registered',
    { userMessage: 'You are not a member of the household for this device' },
  );
}

// ---------------------------------------------------------------------------
// Cross-Tenant Prevention Errors
// ---------------------------------------------------------------------------

/**
 * Attempted cross-tenant IoT device access denied.
 * HTTP Status: 403
 */
export function crossTenantIotAccessDenied(): AppError {
  return authorizationError(
    'CROSS_TENANT_IOT_ACCESS_DENIED',
    'Cannot access IoT device from another tenant',
    { userMessage: 'You cannot access devices from another community' },
  );
}

/**
 * IoT device belongs to a different tenant than the user's active tenant.
 * HTTP Status: 403
 */
export function iotDeviceBelongsToDifferentTenant(): AppError {
  return authorizationError(
    'IOT_DEVICE_BELONGS_TO_DIFFERENT_TENANT',
    'IoT device belongs to a different tenant',
    { userMessage: 'This device belongs to another community' },
  );
}

// ---------------------------------------------------------------------------
// Not Found Errors
// ---------------------------------------------------------------------------

/**
 * IoT device not found.
 * HTTP Status: 404
 */
export function iotDeviceNotFoundInTenant(): AppError {
  return notFoundError(
    'IOT_DEVICE_NOT_FOUND_IN_TENANT',
    'IoT device not found in the specified tenant',
    { userMessage: 'Device not found' },
  );
}

// ---------------------------------------------------------------------------
// Invariant Violation Errors
// ---------------------------------------------------------------------------

/**
 * IoT device data invariant violation.
 * INV-IOT-001: IoTDevice.tenantId must match the accessor's tenant context
 */
export function iotDeviceInvariantViolation(
  invariantId: string,
  details: string,
): AppError {
  return businessError(
    'IOT_DEVICE_INVARIANT_VIOLATION',
    `IoT device invariant ${invariantId} violated: ${details}`,
    { userMessage: 'A data integrity error occurred. Please contact support.' },
  );
}

/**
 * IoT device configuration is invalid.
 */
export function iotDeviceConfigurationInvalid(reason: string): AppError {
  return validationError(
    'IOT_DEVICE_CONFIGURATION_INVALID',
    `IoT device configuration is invalid: ${reason}`,
    { userMessage: 'Device configuration is invalid' },
  );
}

// ---------------------------------------------------------------------------
// OrgUnit Scope Errors
// ---------------------------------------------------------------------------

/**
 * IoT device OrgUnit does not belong to the same tenant.
 * HTTP Status: 403
 */
export function iotDeviceOrgUnitTenantMismatch(): AppError {
  return authorizationError(
    'IOT_DEVICE_ORGUNIT_TENANT_MISMATCH',
    'IoT device OrgUnit does not belong to the same tenant',
    { userMessage: 'Device scope configuration error' },
  );
}
