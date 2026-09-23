/**
 * DoorSensorConfig — Domain entity for a household's door-sensor monitoring
 * configuration.
 *
 * Plain TypeScript — no external dependencies.
 *
 * Responsibilities captured here:
 *  - which physical Tuya sensor (IoTDevice) is bound to the household
 *  - which siren zone to activate when the door opens during the window
 *  - the resident-configured monitoring window (HH:mm, may wrap past midnight)
 *  - the last known physical door state
 *
 * The device id (`iotDeviceId`) and `sirenZone` are set only by a platform
 * admin. The monitoring window (`monitorStart`/`monitorEnd`/`enabled`) is set
 * by the resident who owns the household.
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

/** Physical open/closed state most recently reported by the sensor. */
export type DoorState = 'open' | 'closed' | 'unknown';

/** A time-of-day in 24h HH:mm format (e.g. "22:00"). */
export type TimeOfDay = string;

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface DoorSensorConfig {
  readonly id: string;
  readonly tenantId: string;
  readonly householdId: string;
  /** FK to the registered door_sensor IoTDevice; null until an admin registers one. */
  readonly iotDeviceId: string | null;
  /** Siren zone to activate when the door opens during the monitoring window. */
  readonly sirenZone: string | null;
  /** Monitoring window start, HH:mm (24h). */
  readonly monitorStart: TimeOfDay;
  /** Monitoring window end, HH:mm (24h). May wrap past midnight. */
  readonly monitorEnd: TimeOfDay;
  /** Whether the resident has monitoring enabled. */
  readonly enabled: boolean;
  /** Last known physical door state. */
  readonly currentState: DoorState;
  readonly lastStateChange: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Data an admin provides to register (bind) a physical door sensor to a
 * household and choose the siren zone. Set only by Super_Admin.
 */
export interface RegisterDoorSensorInput {
  readonly householdId: string;
  /** Tuya device id typed in by the admin. */
  readonly tuyaDeviceId: string;
  /** Human-friendly device name shown in the device registry. */
  readonly deviceName: string;
  /** Siren zone to activate on an in-window door open. */
  readonly sirenZone: string;
}

/**
 * Data a resident provides to configure their own monitoring window.
 */
export interface SetMonitoringWindowInput {
  readonly householdId: string;
  readonly monitorStart: TimeOfDay;
  readonly monitorEnd: TimeOfDay;
  readonly enabled: boolean;
}
