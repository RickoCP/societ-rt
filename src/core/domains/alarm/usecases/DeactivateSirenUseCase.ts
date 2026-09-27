/**
 * DeactivateSirenUseCase — Sends a deactivation command to a siren device
 * via IoTGatewayProtocol and records the deactivation event.
 *
 * Logic:
 * 1. Send deactivation command via IoTGatewayProtocol
 * 2. If command fails (timeout/error), log ALARM_DEVICE_UNRESPONSIVE,
 *    notify Security_Guard, and return error
 * 3. Deactivate siren in repository (set status back to 'armed' or 'disarmed')
 * 4. Record deactivation event via alarmRepository.createEvent
 * 5. Enqueue audit log (fire-and-forget)
 * 6. Return ok(event)
 *
 * @see Requirements 36.3, 36.5, 36.9, 36.10
 * @see Requirements 6.2, 6.5 (AuthorizationContext migration)
 */

import type {
  AuditQueueProtocol,
  NotificationQueueProtocol,
  IoTGatewayProtocol,
} from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, getUserId } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { AlarmRepository } from '../repositories/AlarmRepository';
import type { AlarmEvent, AlarmTriggerSource } from '../entities';
import { alarmDeviceUnresponsive } from '../errors/alarmErrors';

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface DeactivateSirenInput {
  readonly deviceId: string;
  readonly triggerSource: AlarmTriggerSource;
  readonly triggerType: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface DeactivateSirenUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: DeactivateSirenInput;
  }): Promise<DomainResult<AlarmEvent>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const DeactivateSirenUseCaseImpl = ({
  alarmRepository,
  iotGatewayProtocol,
  notificationQueueProtocol,
  auditQueueProtocol,
}: {
  alarmRepository: AlarmRepository;
  iotGatewayProtocol: IoTGatewayProtocol;
  notificationQueueProtocol: NotificationQueueProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): DeactivateSirenUseCase => ({
  execute: async ({ authContext, data }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // 1. Send deactivation command via IoT Gateway
    const commandResult = await iotGatewayProtocol.sendCommand(data.deviceId, {
      deviceId: data.deviceId,
      commandType: 'siren_deactivate',
      params: {},
      requestedBy: userId,
    });

    // 2. Handle unresponsive device
    if (!commandResult.success) {
      const unresponsiveError = alarmDeviceUnresponsive(data.deviceId);

      // Notify Security_Guard about unresponsive device (fire-and-forget)
      notificationQueueProtocol
        .enqueueNotification({
          tenantId,
          userId: '',
          type: 'alarm_device_unresponsive',
          title: 'Perangkat Alarm Tidak Merespons',
          body: `Perangkat alarm ${data.deviceId} tidak merespons saat deaktivasi.`,
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
          actionType: 'alarm_deactivation_failed',
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

    // 3. Deactivate siren in repository
    const deactivateResult = await alarmRepository.deactivateSiren(
      tenantId,
      data.deviceId,
    );

    if (!deactivateResult.success) {
      return fail(deactivateResult.error);
    }

    // 4. Record deactivation event
    const eventResult = await alarmRepository.createEvent(
      tenantId,
      {
        alarmDeviceId: data.deviceId,
        triggerSource: data.triggerSource,
        triggerType: data.triggerType,
        duration: 0,
      },
    );

    if (!eventResult.success) {
      return fail(eventResult.error);
    }

    const alarmEvent = eventResult.data;

    // 5. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'alarm_deactivated',
        resourceType: 'alarm_device',
        resourceId: data.deviceId,
        details: {
          triggerSource: data.triggerSource,
          triggerType: data.triggerType,
          eventId: alarmEvent.id,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 6. Return success
    return ok(alarmEvent);
  },
});
