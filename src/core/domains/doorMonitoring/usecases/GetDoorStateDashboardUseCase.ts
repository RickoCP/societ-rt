/**
 * GetDoorStateDashboardUseCase — Returns door-state markers for the security
 * dashboard: every household with a configured door sensor, its coordinates,
 * current door state, monitoring status, and whether it is currently alerting
 * (open during the monitoring window).
 *
 * Authorization: security-facing roles only — Security_Guard, Ketua_RT,
 * Pengurus. Residents view/manage only their own window elsewhere.
 *
 * The `withinWindow`/`alerting` flags are recomputed at read time against the
 * current instant so the dashboard reflects live monitoring state.
 */

import type { AuthContext } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, authorizationError } from '@core/utils';
import type { DoorMonitoringRepository } from '../repositories/DoorMonitoringRepository';
import type { DoorStateMarker } from '../entities';
import { isWithinMonitoringWindow } from '../utils/monitoringWindow';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetDoorStateDashboardUseCase {
  execute(params: {
    authContext: AuthContext;
    /** Injectable clock for deterministic testing; defaults to now(). */
    now?: Date;
  }): Promise<DomainResult<DoorStateMarker[]>>;
}

// ---------------------------------------------------------------------------
// Allowed roles
// ---------------------------------------------------------------------------

const ALLOWED_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.Security_Guard,
  UserRole.Ketua_RT,
  UserRole.Pengurus,
]);

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetDoorStateDashboardUseCaseImpl = ({
  doorMonitoringRepository,
}: {
  doorMonitoringRepository: DoorMonitoringRepository;
}): GetDoorStateDashboardUseCase => ({
  execute: async ({ authContext, now }) => {
    // 1. Role gate.
    if (!ALLOWED_ROLES.has(authContext.role)) {
      return fail(
        authorizationError(
          'DOOR_MONITORING_DASHBOARD_ACCESS_DENIED',
          'User does not have permission to view the door-state dashboard',
          {
            userMessage: 'Anda tidak memiliki akses ke dasbor pintu.',
          },
        ),
      );
    }

    // 2. Load markers.
    const result = await doorMonitoringRepository.listDoorStateMarkers(
      authContext.tenantId,
    );
    if (!result.success) {
      return fail(result.error);
    }

    // 3. Recompute window/alerting flags against the current instant.
    const instant = now ?? new Date();
    const markers: DoorStateMarker[] = result.data.map(marker => {
      const withinWindow =
        marker.monitoringEnabled &&
        isWithinMonitoringWindow(
          instant,
          marker.monitorStart,
          marker.monitorEnd,
        );
      return {
        ...marker,
        withinWindow,
        alerting: withinWindow && marker.currentState === 'open',
      };
    });

    return ok(markers);
  },
});
