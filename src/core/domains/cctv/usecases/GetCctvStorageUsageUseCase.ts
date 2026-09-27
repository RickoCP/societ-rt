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

import type { DomainResult } from '@core/utils';
import { fail, ok, authorizationError } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { CctvRepository } from '../repositories/CctvRepository';
import type { CctvStorageUsage } from '../entities';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { hasAllowedUserRole, getTenantId } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Allowed roles
// ---------------------------------------------------------------------------

const ALLOWED_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.Security_Guard,
  UserRole.Pengurus,
  UserRole.Ketua_RT,
]);

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetCctvStorageUsageUseCase {
  execute(params: {
    authContext: AuthContextCompat;
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
    const tenantId = getTenantId(authContext);

    // 1. Validate role: only Security_Guard, Pengurus, or Ketua_RT
    if (!hasAllowedUserRole(authContext, ALLOWED_ROLES)) {
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
      tenantId,
      cameraId,
    );

    if (!result.success) {
      return fail(result.error);
    }

    // 3. Return success
    return ok(result.data);
  },
});
