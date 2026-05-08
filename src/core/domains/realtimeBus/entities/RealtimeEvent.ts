/**
 * RealtimeEvent — Domain entity representing an event flowing through the
 * realtime event bus (WebSocket + Redis pub/sub).
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 40.1, 40.2, 40.3, 40.4, 40.5, 40.6, 41.1, 41.2, 41.3
 */

// ---------------------------------------------------------------------------
// Event Channel Constants
// ---------------------------------------------------------------------------

/**
 * Available event channels per tenant.
 * Each channel is namespaced by tenantId at runtime: `{channel}:{tenantId}`
 */
export const EVENT_CHANNELS = {
  SECURITY_EVENTS: 'security_events',
  DEVICE_EVENTS: 'device_events',
  INCIDENT_UPDATES: 'incident_updates',
  GATE_EVENTS: 'gate_events',
  CCTV_EVENTS: 'cctv_events',
  PATROL_EVENTS: 'patrol_events',
  ALARM_EVENTS: 'alarm_events',
} as const;

export type EventChannel =
  (typeof EVENT_CHANNELS)[keyof typeof EVENT_CHANNELS];

// ---------------------------------------------------------------------------
// Event Type Classification
// ---------------------------------------------------------------------------

/**
 * Shared security events — accessible by Ketua_RT, Pengurus, Security_Guard.
 * These events represent community-wide security concerns.
 *
 * @see Requirement 41.2
 */
export const SHARED_SECURITY_EVENTS = [
  'panic_button_pressed',
  'smoke_detected',
  'gate_open_too_long',
  'alarm_triggered',
  'emergency_alert',
  'motion_detection_alert',
] as const;

export type SharedSecurityEventType = (typeof SHARED_SECURITY_EVENTS)[number];

/**
 * Private home events — accessible ONLY by the Home_Owner of the associated
 * Household. These events are personal device activity.
 *
 * @see Requirement 41.3
 */
export const PRIVATE_HOME_EVENTS = [
  'smart_lock_opened',
  'smart_switch_toggled',
  'lighting_changed',
  'device_online',
  'device_offline',
  'battery_low',
] as const;

export type PrivateHomeEventType = (typeof PRIVATE_HOME_EVENTS)[number];

// ---------------------------------------------------------------------------
// Privacy Classification
// ---------------------------------------------------------------------------

export type EventPrivacy = 'shared' | 'private';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface RealtimeEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly channel: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly privacy: EventPrivacy;
  readonly targetHouseholdId?: string;
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// Event Routing
// ---------------------------------------------------------------------------

export interface EventRouting {
  readonly privacy: EventPrivacy;
  readonly targetHouseholdId?: string;
  readonly channels: readonly string[];
}

/**
 * Classify an event as shared or private based on its eventType.
 *
 * Shared security events are broadcast to Security_Guard, Pengurus, and
 * Ketua_RT. Private home events are delivered only to the Home_Owner of
 * the associated Household.
 *
 * @see Requirements 40.5, 40.6, 41.1, 41.2, 41.3
 */
export function classifyEventRouting(
  eventType: string,
  householdId?: string,
): EventRouting {
  const isShared = (SHARED_SECURITY_EVENTS as readonly string[]).includes(
    eventType,
  );

  if (isShared) {
    return {
      privacy: 'shared',
      channels: [
        EVENT_CHANNELS.SECURITY_EVENTS,
        EVENT_CHANNELS.DEVICE_EVENTS,
      ],
    };
  }

  return {
    privacy: 'private',
    targetHouseholdId: householdId,
    channels: [EVENT_CHANNELS.DEVICE_EVENTS],
  };
}
