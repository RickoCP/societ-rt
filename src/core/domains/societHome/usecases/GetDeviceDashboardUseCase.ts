/**
 * GetDeviceDashboardUseCase — Returns all paired devices for a Home_Owner's
 * household with current status, battery level, and last activity.
 *
 * Logic:
 * 1. Validate that the requesting user is a Warga or Ketua_RT (Home_Owner)
 * 2. Find the Home record for the user to determine their household
 * 3. Retrieve device dashboard data from the repository
 * 4. Return ok(dashboardItems)
 *
 * @see Requirements 37.2, 37.5, 37.6
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import { authorizationError, notFoundError } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { HomeRepository } from '../repositories/HomeRepository';
import type { DeviceDashboardItem } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetDeviceDashboardUseCase {
  execute(params: {
    authContext: AuthContext;
    householdId: string;
  }): Promise<DomainResult<DeviceDashboardItem[]>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetDeviceDashboardUseCaseImpl = ({
  homeRepository,
  auditQueueProtocol,
}: {
  homeRepository: HomeRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): GetDeviceDashboardUseCase => ({
  execute: async ({ authContext, householdId }) => {
    // 1. Validate role — only Warga or Ketua_RT can access device dashboard
    if (
      authContext.role !== UserRole.Warga &&
      authContext.role !== UserRole.Ketua_RT
    ) {
      return fail(
        authorizationError(
          'IOT_DEVICE_ACCESS_DENIED',
          'Only Home_Owner (Warga or Ketua_RT) can access the device dashboard',
          {
            userMessage:
              'Anda tidak memiliki akses ke dashboard perangkat.',
          },
        ),
      );
    }

    // 2. Verify the user owns a Home for this household
    const homesResult = await homeRepository.findByOwner(
      authContext.tenantId,
      authContext.userId,
    );

    if (!homesResult.success) {
      return fail(homesResult.error);
    }

    const ownsHousehold = homesResult.data.some(
      home => home.householdId === householdId,
    );

    if (!ownsHousehold) {
      return fail(
        notFoundError(
          'HOME_NOT_FOUND',
          `No Home record found for user ${authContext.userId} and household ${householdId}`,
          {
            userMessage: 'Rumah tidak ditemukan untuk akun Anda.',
          },
        ),
      );
    }

    // 3. Retrieve device dashboard
    const dashboardResult = await homeRepository.getDeviceDashboard(
      authContext.tenantId,
      householdId,
    );

    if (!dashboardResult.success) {
      return fail(dashboardResult.error);
    }

    // 4. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'device_dashboard_viewed',
        resourceType: 'home',
        resourceId: householdId,
        details: { deviceCount: dashboardResult.data.length },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    return ok(dashboardResult.data);
  },
});
