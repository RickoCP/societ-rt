/**
 * IoTDevice — Domain entity representing a smart home device paired
 * with a Household via Tuya IoT Cloud.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 37.1, 37.2, 37.3, 38.8
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type IoTDeviceType =
  | 'panic_button'
  | 'smart_siren'
  | 'smart_lock'
  | 'cctv'
  | 'motion_sensor'
  | 'smoke_detector'
  | 'door_sensor'
  | 'gate_sensor'
  | 'smart_switch'
  | 'smart_lighting';

export type IoTDeviceOnlineStatus = 'online' | 'offline';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface IoTDevice {
  readonly id: string;
  readonly tenantId: string;
  readonly householdId: string;
  readonly tuyaDeviceId: string;
  readonly deviceType: IoTDeviceType;
  readonly name: string;
  readonly onlineStatus: IoTDeviceOnlineStatus;
  readonly batteryLevel: number | null;
  readonly lastSeen: Date;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to register a new IoT device. */
export interface RegisterIoTDeviceInput {
  readonly householdId: string;
  readonly tuyaDeviceId: string;
  readonly deviceType: IoTDeviceType;
  readonly name: string;
  readonly metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/** Device status information returned from Tuya Cloud sync. */
export interface DeviceStatus {
  readonly onlineStatus: IoTDeviceOnlineStatus;
  readonly batteryLevel: number | null;
  readonly lastSeen: Date;
}

/** Command to send to a device via Tuya Cloud. */
export interface DeviceCommand {
  readonly deviceId: string;
  readonly commandType: string;
  readonly params: Record<string, unknown>;
  readonly requestedBy: string;
}

/** Result of a device command execution. */
export interface CommandResult {
  readonly success: boolean;
  readonly deviceId: string;
  readonly commandType: string;
  readonly responseTime: number;
  readonly error?: string;
}
