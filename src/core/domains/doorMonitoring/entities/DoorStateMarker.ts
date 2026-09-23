/**
 * DoorStateMarker — Read model for the security door-state dashboard.
 *
 * One marker per household that has a door sensor configured, combining the
 * household's map coordinates with the current door state and monitoring info
 * so security staff can see, on a map, which doors are open.
 *
 * Plain TypeScript — no external dependencies.
 */

import type { DoorState } from './DoorSensorConfig';

export interface DoorStateMarker {
  readonly householdId: string;
  readonly householdNumber: string;
  readonly address: string;
  readonly block: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** Current physical door state. */
  readonly currentState: DoorState;
  /** Whether resident monitoring is enabled. */
  readonly monitoringEnabled: boolean;
  /** Whether the current time falls inside the monitoring window. */
  readonly withinWindow: boolean;
  readonly monitorStart: string;
  readonly monitorEnd: string;
  readonly sirenZone: string | null;
  readonly lastStateChange: Date | null;
  /** True when the door is open AND we are inside the monitoring window. */
  readonly alerting: boolean;
}
