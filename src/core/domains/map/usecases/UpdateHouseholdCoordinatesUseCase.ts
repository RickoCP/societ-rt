/**
 * UpdateHouseholdCoordinatesUseCase — Updates GPS coordinates for a household.
 *
 * Logic:
 * 1. Update coordinates via mapRepository.updateCoordinates
 * 2. Enqueue audit (action: 'household_coordinates_updated', fire-and-forget)
 * 3. Return ok(undefined)
 *
 * @see Requirements 11.4
 * @see Requirements 6.2, 6.5 (AuthorizationContext migration)
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { MapRepository } from '../repositories/MapRepository';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface UpdateHouseholdCoordinatesUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    householdId: string;
    latitude: number;
    longitude: number;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const UpdateHouseholdCoordinatesUseCaseImpl = ({
  mapRepository,
  auditQueueProtocol,
}: {
  mapRepository: MapRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): UpdateHouseholdCoordinatesUseCase => ({
  execute: async ({ authContext, householdId, latitude, longitude }) => {
    // 1. Update coordinates via repository
    const result = await mapRepository.updateCoordinates(
      authContext.tenantId,
      householdId,
      latitude,
      longitude,
    );

    if (!result.success) {
      return fail(result.error);
    }

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'household_coordinates_updated',
        resourceType: 'household',
        resourceId: householdId,
        details: { latitude, longitude },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(undefined);
  },
});
