/**
 * ActivateSirenUseCase — Sends an activation command to a siren device
 * via IoTGatewayProtocol, records the event, notifies Security_Guard
 * and Ketua_RT, and handles auto-deactivation scheduling.
 *
 * Logic:
 * 1. Validate duration (default 60s, max 300s)
 * 2. Send activation command via IoTGatewayProtocol
 * 3. If command fails (timeout/error), log ALARM_DEVICE_UNRESPONSIVE,
 *    notify Security_Guard, and return error
 * 4. Activate siren in repository (set status to 'triggered')
 * 5. Record alarm event via alarmRepository.createEvent
 * 6. Publish alarm event to Realtime Bus (fire-and-forget)
 * 7. Enqueue notifications to Security_Guard and Ketua_RT (fire-and-forget)
 * 8. Enqueue audit log (fire-and-forget)
 * 9. Return ok(event)
 *
 * Note: Auto-deactivation after configured duration is handled by a
 * scheduled BullMQ delayed job (infrastructure concern). The use case
 * records the duration so the scheduler knows when to deactivate.
 *
 * @see Requirements 36.2, 36.4, 36.5, 36.8, 36.9, 36.10
 * @see Requirements 6.2, 6.5 (AuthorizationContext migration)
 */

import type {
  AuditQueueProtocol,
  NotificationQueueProtocol,
  RealtimeBusProtocol,
  IoTGatewayProtocol,
} from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, getUserId } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { fail, ok, validationError } from '@core/utils';
import type { AlarmRepository } from '../repositories/AlarmRepository';
import type { AlarmEvent, AlarmTriggerSource } from '../entities';
import { alarmDeviceUnresponsive } from '../errors/alarmErrors';
import { EVENT_CHANNELS } from '@core/domains/realtimeBus/entities';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DURATION_SECONDS = 60;
const MAX_DURATION_SECONDS = 300;
const COMMAND_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface ActivateSirenInput {
  readonly deviceId: string;
  readonly triggerSource: AlarmTriggerSource;
  readonly triggerType: string;
  readonly duration?: number;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ActivateSirenUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: ActivateSirenInput;
  }): Promise<DomainResult<AlarmEvent>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ActivateSirenUseCaseImpl = ({
  alarmRepository,
  iotGatewayProtocol,
  notificationQueueProtocol,
  realtimeBusProtocol,
  auditQueueProtocol,
}: {
  alarmRepository: AlarmRepository;
  iotGatewayProtocol: IoTGatewayProtocol;
  notificationQueueProtocol: NotificationQueueProtocol;
  realtimeBusProtocol: RealtimeBusProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): ActivateSirenUseCase => ({
  execute: async ({ authContext, data }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // 1. Validate duration
    const duration = data.duration ?? DEFAULT_DURATION_SECONDS;
    if (duration <= 0 || duration > MAX_DURATION_SECONDS) {
      return fail(
        validationError(
          'ALARM_INVALID_DURATION',
          `Alarm duration must be between 1 and ${MAX_DURATION_SECONDS} seconds`,
          {
            userMessage: `Durasi alarm harus antara 1 dan ${MAX_DURATION_SECONDS} detik.`,
          },
        ),
      );
    }

    // 2. Send activation command via IoT Gateway
    const commandResult = await iotGatewayProtocol.sendCommand(data.deviceId, {
      deviceId: data.deviceId,
      commandType: 'siren_activate',
      params: { duration },
      requestedBy: userId,
    });

    // 3. Handle unresponsive device
    if (!commandResult.success) {
      const unresponsiveError = alarmDeviceUnresponsive(data.deviceId);

      // Notify Security_Guard about unresponsive device (fire-and-forget)
      notificationQueueProtocol
        .enqueueNotification({
          tenantId,
          userId: '',
          type: 'alarm_device_unresponsive',
          title: 'Perangkat Alarm Tidak Merespons',
          body: `Perangkat alarm ${data.deviceId} tidak merespons dalam 5 detik.`,
          channels: ['push', 'inbox'],
        })
        .catch(() => {
          /* notification must not block the response */
        });

      // Audit the failure (fire-and-forget)
      auditQueueProtocol
        .enqueueAudit({
          tenantId,
          actorUserId: userId,
          actionType: 'alarm_activation_failed',
          resourceType: 'alarm_device',
          resourceId: data.deviceId,
          details: {
            triggerSource: data.triggerSource,
            triggerType: data.triggerType,
            error: 'ALARM_DEVICE_UNRESPONSIVE',
          },
        })
        .catch(() => {
          /* audit must not block the response */
        });

      return fail(unresponsiveError);
    }

    // Check if the command response indicates timeout (responseTime >= 5s)
    if (
      commandResult.data &&
      commandResult.data.responseTime >= COMMAND_TIMEOUT_MS
    ) {
      const unresponsiveError = alarmDeviceUnresponsive(data.deviceId);

      notificationQueueProtocol
        .enqueueNotification({
          tenantId,
          userId: '',
          type: 'alarm_device_unresponsive',
          title: 'Perangkat Alarm Tidak Merespons',
          body: `Perangkat alarm ${data.deviceId} tidak merespons dalam 5 detik.`,
          channels: ['push', 'inbox'],
        })
        .catch(() => {
          /* notification must not block the response */
        });

      return fail(unresponsiveError);
    }

    // 4. Activate siren in repository
    const activateResult = await alarmRepository.activateSiren(
      tenantId,
      data.deviceId,
    );

    if (!activateResult.success) {
      return fail(activateResult.error);
    }

    // 5. Record alarm event
    const eventResult = await alarmRepository.createEvent(
      tenantId,
      {
        alarmDeviceId: data.deviceId,
        triggerSource: data.triggerSource,
        triggerType: data.triggerType,
        duration,
      },
    );

    if (!eventResult.success) {
      return fail(eventResult.error);
    }

    const alarmEvent = eventResult.data;

    // 6. Publish alarm event to Realtime Bus (fire-and-forget)
    const channel = `${EVENT_CHANNELS.ALARM_EVENTS}:${tenantId}`;
    realtimeBusProtocol
      .publish(channel, {
        id: `alarm_activated_${data.deviceId}_${Date.now()}`,
        tenantId,
        channel: EVENT_CHANNELS.ALARM_EVENTS,
        eventType: 'alarm_triggered',
        payload: {
          alarmDeviceId: data.deviceId,
          triggerSource: data.triggerSource,
          triggerType: data.triggerType,
          duration,
          activatedAt: alarmEvent.activatedAt.toISOString(),
        },
        privacy: 'shared',
        timestamp: alarmEvent.activatedAt,
      })
      .catch(() => {
        /* realtime delivery must not block the response */
      });

    // 7. Enqueue notifications to Security_Guard and Ketua_RT (fire-and-forget)
    notificationQueueProtocol
      .enqueueNotification({
        tenantId,
        userId: '',
        type: 'alarm_activated',
        title: 'Alarm Aktif',
        body: `Siren telah diaktifkan (${data.triggerType}). Durasi: ${duration} detik.`,
        channels: ['push', 'inbox'],
      })
      .catch(() => {
        /* notification must not block the response */
      });

    // 8. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'alarm_activated',
        resourceType: 'alarm_device',
        resourceId: data.deviceId,
        details: {
          triggerSource: data.triggerSource,
          triggerType: data.triggerType,
          duration,
          eventId: alarmEvent.id,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 9. Return success
    return ok(alarmEvent);
  },
});
