/**
 * AlarmDevice — Domain entity representing a smart siren device
 * registered within a tenant for community alarm/alert purposes.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 36.1, 36.5, 36.6, 36.7
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type AlarmDeviceStatus = 'armed' | 'disarmed' | 'triggered' | 'offline';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface AlarmDevice {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly location: string;
  /** Associated IoT device ID (links to IoTDevice registry). */
  readonly deviceId: string;
  /** Alarm zones this siren belongs to. */
  readonly zones: string[];
  /** Time to automatically arm (HH:mm format), null if no schedule. */
  readonly scheduleArm: string | null;
  /** Time to automatically disarm (HH:mm format), null if no schedule. */
  readonly scheduleDisarm: string | null;
  readonly status: AlarmDeviceStatus;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to register a new alarm/siren device. */
export interface RegisterAlarmDeviceInput {
  readonly name: string;
  readonly location: string;
  readonly deviceId: string;
  readonly zones: string[];
  readonly scheduleArm?: string | null;
  readonly scheduleDisarm?: string | null;
}
