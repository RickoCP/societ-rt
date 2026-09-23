/**
 * AlarmProtocol — Core abstraction for triggering a physical alarm/siren.
 *
 * This port is intentionally provider-agnostic: it knows nothing about Tuya,
 * Home Assistant, or any specific vendor. Infrastructure provides a concrete
 * adapter (e.g. TuyaAlarmAdapter today, HomeAssistantAlarmAdapter later) and
 * the DI container decides which one to bind. Swapping providers must not
 * require any change to callers (use cases) or the UI.
 *
 * Keep the surface minimal on purpose — only the capabilities the emergency
 * flow needs — so alternative backends stay easy to implement.
 */

import type { DomainResult } from '@core/utils';

/**
 * A request to raise the physical alarm. All fields are optional context that
 * a provider MAY use (e.g. to pick a zone, set a duration, or annotate logs),
 * but a provider is free to ignore them and simply activate the siren.
 */
export interface TriggerAlarmCommand {
  /** Tenant the alarm belongs to (for multi-tenant routing / audit). */
  readonly tenantId: string;
  /** Why the alarm was raised (e.g. 'emergency_alert'). For logging/context. */
  readonly reason?: string;
  /** Optional correlation id to tie provider logs to the originating request. */
  readonly correlationId?: string;
  /** Optional auto-stop duration in seconds (provider may ignore). */
  readonly durationSeconds?: number;
}

/** A request to silence/stop the physical alarm. */
export interface StopAlarmCommand {
  readonly tenantId: string;
  readonly reason?: string;
  readonly correlationId?: string;
}

/** Provider-neutral result of an alarm operation. */
export interface AlarmActionResult {
  /** Whether the alarm command was accepted by the provider. */
  readonly triggered: boolean;
  /** Opaque provider identifier of the target device/entity, for observability. */
  readonly target?: string;
  /** Round-trip time in milliseconds, when the provider can report it. */
  readonly responseTimeMs?: number;
}

export interface AlarmProtocol {
  /** Raise the physical alarm/siren. */
  triggerAlarm(
    command: TriggerAlarmCommand,
  ): Promise<DomainResult<AlarmActionResult>>;

  /** Silence/stop the physical alarm/siren. */
  stopAlarm(command: StopAlarmCommand): Promise<DomainResult<AlarmActionResult>>;
}
