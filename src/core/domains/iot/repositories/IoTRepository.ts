/**
 * IoTRepository — Core repository interface for IoT device and event
 * persistence operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 38.8, 37.1, 37.2, 37.6
 */

import type { DomainResult } from '@core/utils';
import type {
  IoTDevice,
  RegisterIoTDeviceInput,
  IoTDeviceOnlineStatus,
  DeviceEvent,
  CreateDeviceEventInput,
} from '../entities';

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface IoTRepository {
  /** Register a new IoT device within a tenant. */
  registerDevice(
    tenantId: string,
    data: RegisterIoTDeviceInput,
  ): Promise<DomainResult<IoTDevice>>;

  /** Find all IoT devices belonging to a household within a tenant. */
  findByHousehold(
    tenantId: string,
    householdId: string,
  ): Promise<DomainResult<IoTDevice[]>>;

  /** Find an IoT device by its Tuya device ID. */
  findByTuyaId(tuyaDeviceId: string): Promise<DomainResult<IoTDevice | null>>;

  /** Update the online status, battery level, and last seen timestamp of a device. */
  updateStatus(
    tenantId: string,
    deviceId: string,
    status: IoTDeviceOnlineStatus,
    batteryLevel: number | null,
    lastSeen: Date,
  ): Promise<DomainResult<IoTDevice>>;

  /** Remove a device from the registry (unpair). */
  removeDevice(
    tenantId: string,
    deviceId: string,
  ): Promise<DomainResult<void>>;

  /** Create a new device event record. */
  createDeviceEvent(
    tenantId: string,
    data: CreateDeviceEventInput,
  ): Promise<DomainResult<DeviceEvent>>;

  /** Find device events for a specific device, ordered by creation time descending. */
  findEventsByDevice(
    tenantId: string,
    deviceId: string,
    limit?: number,
  ): Promise<DomainResult<DeviceEvent[]>>;
}
