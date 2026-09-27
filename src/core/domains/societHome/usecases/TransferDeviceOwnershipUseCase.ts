/**
 * TransferDeviceOwnershipUseCase — Transfer device ownership from one
 * Home_Owner to another, revoking previous owner access.
 *
 * Logic:
 * 1. Validate that the requesting user is a Warga or Ketua_RT (Home_Owner)
 * 2. Verify the user currently owns the device's household
 * 3. Transfer ownership via repository (revokes previous access)
 * 4. Enqueue audit log
 * 5. Return ok(void)
 *
 * @see Requirements 37.8, 37.11, 37.12, 41.10
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getMembershipRole } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import { authorizationError, notFoundError } from '@core/utils';
import { MembershipRole } from '@core/domains/membership/types';
import type { HomeRepository } from '../repositories/HomeRepository';
import type { TransferDeviceOwnershipInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface TransferDeviceOwnershipUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    input: TransferDeviceOwnershipInput;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const TransferDeviceOwnershipUseCaseImpl = ({
  homeRepository,
  auditQueueProtocol,
}: {
  homeRepository: HomeRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): TransferDeviceOwnershipUseCase => ({
  execute: async ({ authContext, input }) => {
    // 1. Validate role — only Warga or Ketua_RT can transfer ownership
    // Use getMembershipRole for AuthContextCompat compatibility
    const role = getMembershipRole(authContext);
    if (
      role !== MembershipRole.RESIDENT &&
      role !== MembershipRole.RT_ADMIN
    ) {
      return fail(
        authorizationError(
          'IOT_DEVICE_ACCESS_DENIED',
          'Only Home_Owner (Warga or Ketua_RT) can transfer device ownership',
          {
            userMessage:
              'Anda tidak memiliki akses untuk mentransfer kepemilikan perangkat.',
          },
        ),
      );
    }

    // 2. Verify the user owns a Home (current owner check)
    const homesResult = await homeRepository.findByOwner(
      authContext.tenantId,
      authContext.userId,
    );

    if (!homesResult.success) {
      return fail(homesResult.error);
    }

    if (homesResult.data.length === 0) {
      return fail(
        notFoundError(
          'HOME_NOT_FOUND',
          `No Home record found for user ${authContext.userId}`,
          {
            userMessage:
              'Anda tidak memiliki rumah terdaftar untuk mentransfer perangkat.',
          },
        ),
      );
    }

    // 3. Transfer device ownership (revokes previous owner access)
    const transferResult = await homeRepository.transferDeviceOwnership(
      authContext.tenantId,
      input.deviceId,
      input.newHouseholdId,
    );

    if (!transferResult.success) {
      return fail(transferResult.error);
    }

    // 4. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'device_ownership_transferred',
        resourceType: 'iot_device',
        resourceId: input.deviceId,
        details: {
          previousOwnerId: authContext.userId,
          newOwnerId: input.newOwnerId,
          newHouseholdId: input.newHouseholdId,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(undefined);
  },
});
