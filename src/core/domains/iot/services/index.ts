/**
 * IoT services barrel export.
 *
 * @see INV-IOT-001: IoTDevice.tenantId must match the accessor's tenant context
 * @see Task 60: IoT Device Isolation Enforcement
 */

export {
  IoTDeviceIsolationServiceImpl,
  type IIoTDeviceIsolationService,
  type IoTDeviceIsolationService,
  type IIoTDeviceIsolationAuditEmitter,
  type IoTDeviceAccessCheckInput,
  type IoTDeviceAccessResult,
  type CrossTenantIoTValidationInput,
  type IoTDeviceIsolationAuditEvent,
  IoTDeviceAccessReason,
  IoTDeviceIsolationAuditEventType,
} from './IoTDeviceIsolationService';
