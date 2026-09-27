/**
 * ActivateZoneSirenUseCase — Activates only sirens in a specified zone.
 *
 * Logic:
 * 1. Validate zone exists by querying alarmRepository.findByZone
 * 2. If zone has no devices, return ALARM_ZONE_NOT_FOUND error
 * 3. For each device in the zone, send activation command via IoTGatewayProtocol
 * 4. Record alarm events for successfully activated devices
 * 5. Publish alarm event to Realtime Bus (fire-and-forget)
 * 6. Enqueue notifications to Security_Guard and Ketua_RT (fire-and-forget)
 * 7. Return ok(events) with all recorded alarm events
 *
 * @see Requirements 36.2, 36.4, 36.5, 36.6, 36.8, 36.9, 36.10
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
import { alarmZoneNotFound } from '../errors/alarmErrors';
import { EVENT_CHANNELS } from '@core/domains/realtimeBus/entities';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DURATION_SECONDS = 60;
const MAX_DURATION_SECONDS = 300;

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface ActivateZoneSirenInput {
  readonly zone: string;
  readonly triggerSource: AlarmTriggerSource;
  readonly triggerType: string;
  readonly duration?: number;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ActivateZoneSirenUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: ActivateZoneSirenInput;
  }): Promise<DomainResult<AlarmEvent[]>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ActivateZoneSirenUseCaseImpl = ({
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
}): ActivateZoneSirenUseCase => ({
  execute: async ({ authContext, data }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // Validate duration
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

    // 1. Validate zone exists by querying devices in the zone
    const devicesResult = await alarmRepository.findByZone(
      tenantId,
      data.zone,
    );

    if (!devicesResult.success) {
      return fail(devicesResult.error);
    }

    const devices = devicesResult.data;

    // 2. If zone has no devices, return zone not found error
    if (devices.length === 0) {
      return fail(alarmZoneNotFound(data.zone));
    }

    // 3. For each device in the zone, send activation command
    const activatedEvents: AlarmEvent[] = [];

    for (const device of devices) {
      // Send activation command
      const commandResult = await iotGatewayProtocol.sendCommand(
        device.deviceId,
        {
          deviceId: device.deviceId,
          commandType: 'siren_activate',
          params: { duration },
          requestedBy: userId,
        },
      );

      // Handle unresponsive device — log and notify but continue with others
      if (!commandResult.success) {
        notificationQueueProtocol
          .enqueueNotification({
            tenantId,
            userId: '',
            type: 'alarm_device_unresponsive',
            title: 'Perangkat Alarm Tidak Merespons',
            body: `Perangkat alarm ${device.name} di zona ${data.zone} tidak merespons.`,
            channels: ['push', 'inbox'],
          })
          .catch(() => {
            /* notification must not block the response */
          });

        auditQueueProtocol
          .enqueueAudit({
            tenantId,
            actorUserId: userId,
            actionType: 'alarm_activation_failed',
            resourceType: 'alarm_device',
            resourceId: device.id,
            details: {
              zone: data.zone,
              error: 'ALARM_DEVICE_UNRESPONSIVE',
            },
          })
          .catch(() => {
            /* audit must not block the response */
          });

        continue;
      }

      // Activate siren in repository
      await alarmRepository.activateSiren(tenantId, device.deviceId);

      // 4. Record alarm event
      const eventResult = await alarmRepository.createEvent(
        tenantId,
        {
          alarmDeviceId: device.deviceId,
          triggerSource: data.triggerSource,
          triggerType: data.triggerType,
          duration,
        },
      );

      if (eventResult.success) {
        activatedEvents.push(eventResult.data);
      }
    }

    // 5. Publish alarm event to Realtime Bus (fire-and-forget)
    if (activatedEvents.length > 0) {
      const channel = `${EVENT_CHANNELS.ALARM_EVENTS}:${tenantId}`;
      realtimeBusProtocol
        .publish(channel, {
          id: `alarm_zone_activated_${data.zone}_${Date.now()}`,
          tenantId,
          channel: EVENT_CHANNELS.ALARM_EVENTS,
          eventType: 'alarm_triggered',
          payload: {
            zone: data.zone,
            triggerSource: data.triggerSource,
            triggerType: data.triggerType,
            duration,
            activatedDevices: activatedEvents.length,
            totalDevices: devices.length,
          },
          privacy: 'shared',
          timestamp: new Date(),
        })
        .catch(() => {
          /* realtime delivery must not block the response */
        });

      // 6. Enqueue notifications to Security_Guard and Ketua_RT (fire-and-forget)
      notificationQueueProtocol
        .enqueueNotification({
          tenantId,
          userId: '',
          type: 'alarm_zone_activated',
          title: 'Alarm Zona Aktif',
          body: `Siren di zona ${data.zone} telah diaktifkan (${activatedEvents.length}/${devices.length} perangkat). Durasi: ${duration} detik.`,
          channels: ['push', 'inbox'],
        })
        .catch(() => {
          /* notification must not block the response */
        });

      // Audit log (fire-and-forget)
      auditQueueProtocol
        .enqueueAudit({
          tenantId,
          actorUserId: userId,
          actionType: 'alarm_zone_activated',
          resourceType: 'alarm_zone',
          resourceId: data.zone,
          details: {
            zone: data.zone,
            triggerSource: data.triggerSource,
            triggerType: data.triggerType,
            duration,
            activatedDevices: activatedEvents.length,
            totalDevices: devices.length,
          },
        })
        .catch(() => {
          /* audit must not block the response */
        });
    }

    // 7. Return success with all recorded events
    return ok(activatedEvents);
  },
});
