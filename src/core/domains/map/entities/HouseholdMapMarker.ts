/**
 * HouseholdMapMarker — Domain entity representing a household's position
 * on the community map.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 11.1, 11.2, 11.3, 11.4
 */

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface HouseholdMapMarker {
  readonly householdId: string;
  readonly householdNumber: string;
  readonly address: string;
  readonly block: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly residentCount: number;
  readonly headOfHousehold: string | null;
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

/** Filters for querying map markers within a tenant. */
export interface MapFilters {
  readonly block?: string;
  readonly status?: string;
  readonly categories?: string[];
}
