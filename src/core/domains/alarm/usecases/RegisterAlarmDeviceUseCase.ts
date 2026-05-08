/**
 * RegisterAlarmDeviceUseCase — Registers a new smart siren device with
 * zones and optional schedule.
 *
 * Logic:
 * 1. Validate caller has Ketua_RT or Pengurus role
 * 2. Register device via alarmRepository.registerDevice
 * 3. Enqueue audit log via AuditQueueProtocol (fire-and-forget)
 * 4. Return ok(device)
 *
 * @see Requirements 36.1, 36.6, 36.7, 36.10
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok, authorizationError } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { AlarmRepository } from '../repositories/AlarmRepository';
import type { AlarmDevice, RegisterAlarmDeviceInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RegisterAlarmDeviceUseCase {
  execute(params: {
    authContext: AuthContext;
    data: RegisterAlarmDeviceInput;
  }): Promise<DomainResult<AlarmDevice>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RegisterAlarmDeviceUseCaseImpl = ({
  alarmRepository,
  auditQueueProtocol,
}: {
  alarmRepository: AlarmRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RegisterAlarmDeviceUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Validate role: only Ketua_RT or Pengurus can register alarm devices
    if (
      authContext.role !== UserRole.Ketua_RT &&
      authContext.role !== UserRole.Pengurus
    ) {
      return fail(
        authorizationError(
          'AUTH_INSUFFICIENT_ROLE',
          'Only Ketua_RT or Pengurus can register alarm devices',
          {
            userMessage:
              'Anda tidak memiliki izin untuk mendaftarkan perangkat alarm.',
          },
        ),
      );
    }

    // 2. Register device via repository
    const result = await alarmRepository.registerDevice(
      authContext.tenantId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const device = result.data;

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'alarm_device_registered',
        resourceType: 'alarm_device',
        resourceId: device.id,
        details: {
          name: device.name,
          location: device.location,
          deviceId: device.deviceId,
          zones: device.zones,
          scheduleArm: device.scheduleArm,
          scheduleDisarm: device.scheduleDisarm,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(device);
  },
});
