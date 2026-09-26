/**
 * IoT errors barrel export.
 *
 * @see INV-IOT-001: IoTDevice.tenantId must match the accessor's tenant context
 * @see Task 60: IoT Device Isolation Enforcement
 */

// Base IoT errors
export {
  iotCommandFailed,
  iotDeviceAccessDenied,
  iotWebhookSignatureInvalid,
  iotCloudUnavailable,
  iotDeviceOffline,
  iotPairingFailed,
  iotRateLimitExceeded,
} from './iotErrors';

// IoT Isolation errors (INV-IOT-001)
export {
  // Tenant Isolation Errors
  iotDeviceTenantMismatch,
  iotDeviceNotInTenant,
  iotDeviceOwnershipInvalid,
  // Authorization Errors
  iotDeviceAccessDeniedByMembership,
  iotDeviceOutOfScope,
  iotDeviceHouseholdAccessDenied,
  // Cross-Tenant Prevention Errors
  crossTenantIotAccessDenied,
  iotDeviceBelongsToDifferentTenant,
  // Not Found Errors
  iotDeviceNotFoundInTenant,
  // Invariant Violation Errors
  iotDeviceInvariantViolation,
  iotDeviceConfigurationInvalid,
  // OrgUnit Scope Errors
  iotDeviceOrgUnitTenantMismatch,
} from './iotIsolationErrors';
