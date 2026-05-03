/**
 * Resident — Domain entity representing an individual resident
 * within a household.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 5.1, 5.2, 5.3, 5.5, 5.6
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type ResidencyStatus = 'tetap' | 'kontrak' | 'kos' | 'pindah';

export type ResidentCategory = 'lansia' | 'balita' | 'disabilitas';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface Resident {
  readonly id: string;
  readonly tenantId: string;
  readonly householdId: string;
  readonly name: string;
  readonly nik: string;
  readonly dateOfBirth: Date;
  readonly gender: 'male' | 'female';
  readonly phone: string | null;
  readonly status: ResidencyStatus;
  readonly categories: ResidentCategory[];
  readonly emergencyContactName: string | null;
  readonly emergencyContactPhone: string | null;
  readonly emergencyContactRelationship: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to add a new resident to a household. */
export interface CreateResidentInput {
  readonly householdId: string;
  readonly name: string;
  readonly nik: string;
  readonly dateOfBirth: Date;
  readonly gender: 'male' | 'female';
  readonly phone?: string;
  readonly status: ResidencyStatus;
  readonly categories?: ResidentCategory[];
  readonly emergencyContactName?: string;
  readonly emergencyContactPhone?: string;
  readonly emergencyContactRelationship?: string;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Summary returned after a CSV import operation. */
export interface CsvImportResult {
  readonly createdCount: number;
  readonly skippedRows: ReadonlyArray<{
    readonly row: number;
    readonly errors: readonly string[];
  }>;
}

/** Generic paginated result wrapper. */
export interface PaginatedResult<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** Filters for querying residents within a tenant. */
export interface ResidentFilters {
  readonly householdId?: string;
  readonly status?: ResidencyStatus;
  readonly categories?: ResidentCategory[];
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}
