/**
 * RegisterDoorSensorUseCase — Platform-admin action that registers a physical
 * Tuya door sensor for a household and binds it (with a siren zone) to the
 * household's door-monitoring config.
 *
 * Authorization: Super_Admin ONLY. Per product decision, an RT can only
 * *request* installation (see RequestDoorSensorInstallationUseCase); the actual
 * device id is entered and registered by a platform admin.
 *
 * Logic:
 *  1. Role gate → Super_Admin only.
 *  2. Guard against double-registration for the same household.
 *  3. Register the device in the IoT registry (deviceType 'door_sensor').
 *  4. Bind the device + siren zone to the household's DoorSensorConfig.
 *  5. Audit (fire-and-forget).
 *
 * Note: `tenantId` used for registration comes from the (route-overridden)
 * auth context — for a Super_Admin acting on a specific RT, the route sets the
 * target tenant in the auth headers.
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { authInsufficientRole } from '@core/domains/auth/errors/authErrors';
import type { IoTRepository } from '@core/domains/iot/repositories/IoTRepository';
import type { DoorMonitoringRepository } from '../repositories/DoorMonitoringRepository';
import type { DoorSensorConfig, RegisterDoorSensorInput } from '../entities';
import { doorSensorAlreadyRegistered } from '../errors/doorMonitoringErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RegisterDoorSensorUseCase {
  execute(params: {
    authContext: AuthContext;
    input: RegisterDoorSensorInput;
  }): Promise<DomainResult<DoorSensorConfig>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RegisterDoorSensorUseCaseImpl = ({
  doorMonitoringRepository,
  iotRepository,
  auditQueueProtocol,
}: {
  doorMonitoringRepository: DoorMonitoringRepository;
  iotRepository: IoTRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RegisterDoorSensorUseCase => ({
  execute: async ({ authContext, input }) => {
    // 1. Role gate — platform admin only.
    if (authContext.role !== UserRole.Super_Admin) {
      return fail(authInsufficientRole());
    }

    const { tenantId } = authContext;

    // 2. Guard against double-registration.
    const existing = await doorMonitoringRepository.findByHousehold(
      tenantId,
      input.householdId,
    );
    if (!existing.success) {
      return fail(existing.error);
    }
    if (existing.data?.iotDeviceId) {
      return fail(doorSensorAlreadyRegistered(input.householdId));
    }

    // 3. Register the physical device in the IoT registry.
    const deviceResult = await iotRepository.registerDevice(tenantId, {
      householdId: input.householdId,
      tuyaDeviceId: input.tuyaDeviceId.trim(),
      deviceType: 'door_sensor',
      name: input.deviceName.trim(),
      metadata: { registeredVia: 'door_monitoring' },
    });
    if (!deviceResult.success) {
      return fail(deviceResult.error);
    }

    const device = deviceResult.data;

    // 4. Bind the device + siren zone to the household config.
    const bindResult = await doorMonitoringRepository.bindDevice(
      tenantId,
      input.householdId,
      { iotDeviceId: device.id, sirenZone: input.sirenZone.trim() },
    );
    if (!bindResult.success) {
      return fail(bindResult.error);
    }

    // 5. Audit (fire-and-forget). Never log the device id value itself.
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: authContext.userId,
        actionType: 'door_sensor_registered',
        resourceType: 'door_sensor_config',
        resourceId: input.householdId,
        details: {
          sirenZone: input.sirenZone.trim(),
          deviceConfigured: true,
        },
        impersonatorId: authContext.impersonatorId,
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(bindResult.data);
  },
});
