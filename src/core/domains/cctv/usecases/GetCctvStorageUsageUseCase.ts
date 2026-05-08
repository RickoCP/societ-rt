/**
 * GetCctvStorageUsageUseCase — Returns storage usage for a specific camera.
 *
 * Logic:
 * 1. Validate caller has Security_Guard, Pengurus, or Ketua_RT role
 * 2. Retrieve storage usage via cctvRepository.getStorageUsage
 * 3. Return ok(storageUsage)
 *
 * @see Requirements 34.6, 34.9
 */

import type { AuthContext } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok, authorizationError } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { CctvRepository } from '../repositories/CctvRepository';
import type { CctvStorageUsage } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetCctvStorageUsageUseCase {
  execute(params: {
    authContext: AuthContext;
    cameraId: string;
  }): Promise<DomainResult<CctvStorageUsage>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetCctvStorageUsageUseCaseImpl = ({
  cctvRepository,
}: {
  cctvRepository: CctvRepository;
}): GetCctvStorageUsageUseCase => ({
  execute: async ({ authContext, cameraId }) => {
    // 1. Validate role: only Security_Guard, Pengurus, or Ketua_RT
    if (
      authContext.role !== UserRole.Security_Guard &&
      authContext.role !== UserRole.Pengurus &&
      authContext.role !== UserRole.Ketua_RT
    ) {
      return fail(
        authorizationError(
          'AUTH_INSUFFICIENT_ROLE',
          'Only Security_Guard, Pengurus, or Ketua_RT can view CCTV storage usage',
          { userMessage: 'Anda tidak memiliki izin untuk melihat penggunaan penyimpanan CCTV.' },
        ),
      );
    }

    // 2. Retrieve storage usage via repository
    const result = await cctvRepository.getStorageUsage(
      authContext.tenantId,
      cameraId,
    );

    if (!result.success) {
      return fail(result.error);
    }

    // 3. Return success
    return ok(result.data);
  },
});
