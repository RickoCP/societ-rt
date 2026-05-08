/**
 * AlarmEvent — Domain entity representing a single alarm activation
 * or deactivation event recorded by the alarm system.
 *
 * Each event captures the trigger source, duration, and timestamps.
 *
 * @see Requirements 36.2, 36.4, 36.5
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type AlarmTriggerSource = 'manual' | 'automation' | 'schedule';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface AlarmEvent {
  readonly id: string;
  readonly alarmDeviceId: string;
  readonly tenantId: string;
  /** What triggered the alarm: manual user action, automation rule, or schedule. */
  readonly triggerSource: AlarmTriggerSource;
  /** Description of what triggered the alarm (e.g., rule name, user action). */
  readonly triggerType: string;
  /** Duration of the alarm in seconds. */
  readonly duration: number;
  readonly activatedAt: Date;
  readonly deactivatedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a new alarm event. */
export interface CreateAlarmEventInput {
  readonly alarmDeviceId: string;
  readonly triggerSource: AlarmTriggerSource;
  readonly triggerType: string;
  readonly duration: number;
}
