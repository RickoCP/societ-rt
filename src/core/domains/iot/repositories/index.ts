/**
 * IoT repositories barrel export.
 *
 * @see INV-IOT-001: IoTDevice.tenantId must match the accessor's tenant context
 * @see Task 60: IoT Device Isolation Enforcement
 */

export type { IoTRepository } from './IoTRepository';

export type {
  IIoTDeviceIsolationRepository,
  IoTDeviceWithContext,
  IoTDeviceMember,
} from './IIoTDeviceIsolationRepository';
