/**
 * UnpairDeviceUseCase — Removes a device association from a Household.
 *
 * Logic:
 * 1. Validate Home_Owner role
 * 2. Revoke access tokens via IoT Gateway (Tuya Cloud)
 * 3. Remove device from local repository
 * 4. Enqueue audit log (fire-and-forget)
 * 5. Return ok(void)
 *
 * @see Requirements 37.11, 38.14
 */

import type {
  AuditQueueProtocol,
  IoTGatewayProtocol,
} from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getMembershipRole, getTenantId, getUserId } from '@core/domains/authorization/types/AuthContextCompat';
import { MembershipRole } from '@core/domains/membership/types';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import { authorizationError } from '@core/utils';
import type { IoTRepository } from '../repositories/IoTRepository';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface UnpairDeviceInput {
  readonly deviceId: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface UnpairDeviceUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: UnpairDeviceInput;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const UnpairDeviceUseCaseImpl = ({
  iotGatewayProtocol,
  iotRepository,
  auditQueueProtocol,
}: {
  iotGatewayProtocol: IoTGatewayProtocol;
  iotRepository: IoTRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): UnpairDeviceUseCase => ({
  execute: async ({ authContext, data }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);
    const role = getMembershipRole(authContext);

    // 1. Validate Home_Owner role (only Resident or RT_ADMIN can unpair devices)
    if (
      role !== MembershipRole.RESIDENT &&
      role !== MembershipRole.RT_ADMIN
    ) {
      return fail(
        authorizationError(
          'IOT_DEVICE_ACCESS_DENIED',
          'Only Home_Owner (Warga or Ketua_RT) can unpair devices',
          {
            userMessage:
              'Anda tidak memiliki akses untuk melepas perangkat ini.',
          },
        ),
      );
    }

    // 2. Revoke access tokens via IoT Gateway (Tuya Cloud)
    const unpairResult = await iotGatewayProtocol.unpairDevice(data.deviceId);

    if (!unpairResult.success) {
      return fail(unpairResult.error);
    }

    // 3. Remove device from local repository
    const removeResult = await iotRepository.removeDevice(
      tenantId,
      data.deviceId,
    );

    if (!removeResult.success) {
      return fail(removeResult.error);
    }

    // 4. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'iot_device_unpaired',
        resourceType: 'iot_device',
        resourceId: data.deviceId,
        details: {
          deviceId: data.deviceId,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 5. Return success
    return ok(undefined);
  },
});
