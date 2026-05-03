/**
 * MapRepository — Core repository interface for household map operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 11.1, 11.2, 11.3, 11.4
 */

import type { DomainResult } from '@core/utils';
import type { HouseholdMapMarker, MapFilters } from '../entities';

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface MapRepository {
  /** Get all household map markers for a tenant, optionally filtered. */
  getMarkersByTenant(
    tenantId: string,
    filters: MapFilters,
  ): Promise<DomainResult<HouseholdMapMarker[]>>;

  /** Update the GPS coordinates of a household. */
  updateCoordinates(
    tenantId: string,
    householdId: string,
    latitude: number,
    longitude: number,
  ): Promise<DomainResult<void>>;
}
