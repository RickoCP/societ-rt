/**
 * GetMapMarkersUseCase — Retrieves household map markers for a tenant.
 *
 * Logic:
 * 1. Delegate to mapRepository.getMarkersByTenant with filters
 * 2. Return the result
 *
 * @see Requirements 11.1, 11.2, 11.3
 */

import type { AuthContext } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail } from '@core/utils';
import type { MapRepository } from '../repositories/MapRepository';
import type { HouseholdMapMarker, MapFilters } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetMapMarkersUseCase {
  execute(params: {
    authContext: AuthContext;
    filters: MapFilters;
  }): Promise<DomainResult<HouseholdMapMarker[]>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetMapMarkersUseCaseImpl = ({
  mapRepository,
}: {
  mapRepository: MapRepository;
}): GetMapMarkersUseCase => ({
  execute: async ({ authContext, filters }) => {
    const result = await mapRepository.getMarkersByTenant(
      authContext.tenantId,
      filters,
    );

    if (!result.success) {
      return fail(result.error);
    }

    return result;
  },
});
