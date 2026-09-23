/**
 * ProcessDoorEventUseCase — Core trigger logic for household door sensors.
 *
 * Invoked from the Tuya webhook pipeline whenever a door_sensor reports an
 * open/closed event. Responsibilities:
 *  1. Resolve the household's door-sensor config from the IoTDevice id.
 *  2. Update the last-known door state.
 *  3. If the door OPENED, monitoring is ENABLED, and the current time falls
 *     inside the resident-configured monitoring window → activate the siren
 *     for the configured zone (the security post zone) and publish a
 *     shared-security realtime event so the security dashboard reacts.
 *
 * The siren activation is delegated to ActivateZoneSirenUseCase so all the
 * existing siren command/notification/audit behavior is reused. This runs
 * without an interactive user, so a synthetic "system" AuthContext scoped to
 * the resolved tenant is used with triggerSource 'automation'.
 *
 * No role check here: this is a system-invoked use case behind webhook
 * signature validation, not a user-facing endpoint.
 */

import type { RealtimeBusProtocol, AuditQueueProtocol } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import {
  EVENT_CHANNELS,
  type RealtimeEvent,
} from '@core/domains/realtimeBus/entities/RealtimeEvent';
import type { ActivateZoneSirenUseCase } from '@core/domains/alarm/usecases';
import type { DoorMonitoringRepository } from '../repositories/DoorMonitoringRepository';
import type { DoorState } from '../entities';
import { isWithinMonitoringWindow } from '../utils/monitoringWindow';

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export interface ProcessDoorEventInput {
  /** The registered IoTDevice id (resolved from tuyaDeviceId upstream). */
  readonly iotDeviceId: string;
  /** New physical door state reported by the sensor. */
  readonly state: Extract<DoorState, 'open' | 'closed'>;
  /** When the sensor reported the event. */
  readonly occurredAt: Date;
}

export interface ProcessDoorEventResult {
  /** Whether the door is now open. */
  readonly opened: boolean;
  /** Whether the event fell inside the monitoring window. */
  readonly withinWindow: boolean;
  /** Whether a siren was triggered as a result. */
  readonly sirenTriggered: boolean;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ProcessDoorEventUseCase {
  execute(params: {
    data: ProcessDoorEventInput;
  }): Promise<DomainResult<ProcessDoorEventResult>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Siren duration when a door-open triggers the alarm (seconds). */
const DOOR_ALARM_DURATION_SECONDS = 60;

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ProcessDoorEventUseCaseImpl = ({
  doorMonitoringRepository,
  activateZoneSirenUseCase,
  realtimeBusProtocol,
  auditQueueProtocol,
}: {
  doorMonitoringRepository: DoorMonitoringRepository;
  activateZoneSirenUseCase: ActivateZoneSirenUseCase;
  realtimeBusProtocol: RealtimeBusProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): ProcessDoorEventUseCase => ({
  execute: async ({ data }) => {
    // 1. Resolve config bound to this device.
    const configResult = await doorMonitoringRepository.findByDeviceId(
      data.iotDeviceId,
    );
    if (!configResult.success) {
      return fail(configResult.error);
    }

    const config = configResult.data;
    if (!config) {
      // Device is a door sensor but not bound to a monitoring config; nothing
      // to do. Not an error — the raw device event is still persisted upstream.
      return ok({ opened: data.state === 'open', withinWindow: false, sirenTriggered: false });
    }

    // 2. Persist the new door state (fire-and-forget failure is acceptable but
    //    we surface a hard failure to the caller).
    const stateResult = await doorMonitoringRepository.updateDoorState(
      config.tenantId,
      config.householdId,
      data.state,
      data.occurredAt,
    );
    if (!stateResult.success) {
      return fail(stateResult.error);
    }

    const opened = data.state === 'open';
    const withinWindow =
      opened &&
      config.enabled &&
      isWithinMonitoringWindow(
        data.occurredAt,
        config.monitorStart,
        config.monitorEnd,
      );

    // 3. Nothing to trigger unless the door opened inside an enabled window.
    if (!withinWindow) {
      return ok({ opened, withinWindow: false, sirenTriggered: false });
    }

    // Without a siren zone we cannot activate a siren; record the alert event
    // anyway so security still sees it on the dashboard/realtime feed.
    let sirenTriggered = false;

    if (config.sirenZone) {
      const systemAuth = {
        userId: 'system',
        tenantId: config.tenantId,
        role: UserRole.Super_Admin,
      };

      const sirenResult = await activateZoneSirenUseCase.execute({
        authContext: systemAuth,
        data: {
          zone: config.sirenZone,
          triggerSource: 'automation',
          triggerType: 'door_open_during_window',
          duration: DOOR_ALARM_DURATION_SECONDS,
        },
      });

      sirenTriggered = sirenResult.success && sirenResult.data.length > 0;
    }

    // 4. Publish a shared-security realtime event so the security dashboard and
    //    guards are alerted regardless of whether a physical siren fired.
    const channel = `${EVENT_CHANNELS.SECURITY_EVENTS}:${config.tenantId}`;
    const event: RealtimeEvent = {
      id: `door_open_window_${config.householdId}_${Date.now()}`,
      tenantId: config.tenantId,
      channel: EVENT_CHANNELS.SECURITY_EVENTS,
      eventType: 'door_opened_during_window',
      payload: {
        householdId: config.householdId,
        sirenZone: config.sirenZone,
        sirenTriggered,
        occurredAt: data.occurredAt.toISOString(),
      },
      privacy: 'shared',
      timestamp: data.occurredAt,
    };
    realtimeBusProtocol.publish(channel, event).catch(() => {
      /* realtime delivery must not block webhook processing */
    });

    // 5. Audit (fire-and-forget).
    auditQueueProtocol
      .enqueueAudit({
        tenantId: config.tenantId,
        actorUserId: 'system',
        actionType: 'door_opened_during_window',
        resourceType: 'door_sensor_config',
        resourceId: config.householdId,
        details: {
          sirenZone: config.sirenZone,
          sirenTriggered,
          monitorStart: config.monitorStart,
          monitorEnd: config.monitorEnd,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok({ opened: true, withinWindow: true, sirenTriggered });
  },
});
