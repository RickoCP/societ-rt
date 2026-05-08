/**
 * SecurityEventRouter — Documents and verifies all security domain event
 * routing to WebSocket channels.
 *
 * Event routing map (domain → channel):
 * - Incident created/updated/escalated → incident_updates:{tenantId}
 * - Gate open/closed/open_too_long → gate_events:{tenantId}
 * - Patrol started/completed/deviation → patrol_events:{tenantId}
 * - Alarm activated/deactivated → alarm_events:{tenantId}
 * - CCTV motion detected → cctv_events:{tenantId}
 * - Device events (IoT) → device_events:{tenantId} or security_events:{tenantId}
 * - Emergency alerts → security_events:{tenantId}
 *
 * @see Requirements 31.2, 31.8, 40.3, 40.4, 40.5, 40.6
 */

import { EVENT_CHANNELS } from '@core/domains/realtimeBus/entities';

const EVENT_CHANNEL_MAP: Record<string, string> = {
  incident_created: EVENT_CHANNELS.INCIDENT_UPDATES,
  incident_status_updated: EVENT_CHANNELS.INCIDENT_UPDATES,
  incident_escalated: EVENT_CHANNELS.INCIDENT_UPDATES,
  gate_open: EVENT_CHANNELS.GATE_EVENTS,
  gate_closed: EVENT_CHANNELS.GATE_EVENTS,
  gate_open_too_long: EVENT_CHANNELS.GATE_EVENTS,
  patrol_started: EVENT_CHANNELS.PATROL_EVENTS,
  patrol_completed: EVENT_CHANNELS.PATROL_EVENTS,
  patrol_deviation_detected: EVENT_CHANNELS.PATROL_EVENTS,
  alarm_triggered: EVENT_CHANNELS.ALARM_EVENTS,
  alarm_activated: EVENT_CHANNELS.ALARM_EVENTS,
  alarm_deactivated: EVENT_CHANNELS.ALARM_EVENTS,
  cctv_motion_detected: EVENT_CHANNELS.CCTV_EVENTS,
  motion_detection_alert: EVENT_CHANNELS.CCTV_EVENTS,
  panic_button_pressed: EVENT_CHANNELS.SECURITY_EVENTS,
  smoke_detected: EVENT_CHANNELS.SECURITY_EVENTS,
  emergency_alert: EVENT_CHANNELS.SECURITY_EVENTS,
  device_online: EVENT_CHANNELS.DEVICE_EVENTS,
  device_offline: EVENT_CHANNELS.DEVICE_EVENTS,
  battery_low: EVENT_CHANNELS.DEVICE_EVENTS,
};

export function getChannelForEvent(eventType: string): string {
  return EVENT_CHANNEL_MAP[eventType] ?? EVENT_CHANNELS.SECURITY_EVENTS;
}

export function getNamespacedChannel(eventType: string, tenantId: string): string {
  return `${getChannelForEvent(eventType)}:${tenantId}`;
}

export function isCriticalDashboardEvent(eventType: string): boolean {
  const critical = new Set(['panic_button_pressed', 'smoke_detected', 'emergency_alert', 'alarm_triggered', 'incident_escalated']);
  return critical.has(eventType);
}
