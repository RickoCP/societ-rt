/**
 * PairDeviceUseCase — Pairs a new IoT device with a Home_Owner's Household.
 *
 * Logic:
 * 1. Validate that the requesting user has Home_Owner role (Warga who owns the household)
 * 2. Generate a pairing token (UUID-based)
 * 3. Pair device via IoTGatewayProtocol (Tuya Cloud)
 * 4. Register device in local repository
 * 5. Enqueue audit log (fire-and-forget)
 * 6. Return ok(device)
 *
 * @see Requirements 37.1, 37.4, 37.6, 38.2, 38.14
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { IoTGatewayProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getMembershipRole, getTenantId, getUserId } from '@core/domains/authorization/types/AuthContextCompat';
import { MembershipRole } from '@core/domains/membership/types';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import { authorizationError } from '@core/utils';
import type { IoTRepository } from '../repositories/IoTRepository';
import type { IoTDevice, IoTDeviceType } from '../entities';
import { iotPairingFailed } from '../errors/iotErrors';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface PairDeviceInput {
  readonly householdId: string;
  readonly deviceType: IoTDeviceType;
  readonly name: string;
  readonly metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface PairDeviceUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: PairDeviceInput;
  }): Promise<DomainResult<IoTDevice>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const PairDeviceUseCaseImpl = ({
  iotGatewayProtocol,
  iotRepository,
  auditQueueProtocol,
}: {
  iotGatewayProtocol: IoTGatewayProtocol;
  iotRepository: IoTRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): PairDeviceUseCase => ({
  execute: async ({ authContext, data }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);
    const role = getMembershipRole(authContext);

    // 1. Validate Home_Owner role (only Resident or RT_ADMIN can pair devices)
    if (
      role !== MembershipRole.RESIDENT &&
      role !== MembershipRole.RT_ADMIN
    ) {
      return fail(
        authorizationError(
          'IOT_DEVICE_ACCESS_DENIED',
          'Only Home_Owner (Warga or Ketua_RT) can pair devices',
          {
            userMessage: 'Anda tidak memiliki akses untuk memasangkan perangkat.',
          },
        ),
      );
    }

    // 2. Generate pairing token
    const pairingToken = crypto.randomUUID();

    // 3. Pair device via IoT Gateway (Tuya Cloud)
    const gatewayResult = await iotGatewayProtocol.pairDevice(
      tenantId,
      data.householdId,
      pairingToken,
    );

    if (!gatewayResult.success) {
      return fail(iotPairingFailed(gatewayResult.error));
    }

    // 4. Register device in local repository
    const registerResult = await iotRepository.registerDevice(
      tenantId,
      {
        householdId: data.householdId,
        tuyaDeviceId: gatewayResult.data.tuyaDeviceId,
        deviceType: data.deviceType,
        name: data.name,
        metadata: data.metadata ?? {},
      },
    );

    if (!registerResult.success) {
      return fail(registerResult.error);
    }

    const device = registerResult.data;

    // 5. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'iot_device_paired',
        resourceType: 'iot_device',
        resourceId: device.id,
        details: {
          householdId: data.householdId,
          deviceType: data.deviceType,
          deviceName: data.name,
          tuyaDeviceId: device.tuyaDeviceId,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 6. Return success
    return ok(device);
  },
});
