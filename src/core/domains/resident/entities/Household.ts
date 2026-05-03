/**
 * Household — Domain entity representing a household (Kartu Keluarga)
 * within a tenant's community.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 5.1, 6.1
 */

export interface Household {
  readonly id: string;
  readonly tenantId: string;
  readonly householdNumber: string;
  readonly address: string;
  readonly block: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a new household. */
export interface CreateHouseholdInput {
  readonly householdNumber: string;
  readonly address: string;
  readonly block?: string;
}
