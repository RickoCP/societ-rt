/**
 * ResidentRepository — Core repository interface for resident and
 * household operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 5.1, 5.2, 5.3, 5.7, 5.8, 5.9, 6.1
 */

import type { DomainResult } from '@core/utils';
import type {
  CreateHouseholdInput,
  CreateResidentInput,
  CsvImportResult,
  Household,
  PaginatedResult,
  Resident,
  ResidencyStatus,
  ResidentFilters,
} from '../entities';

export interface ResidentRepository {
  /** Create a new household within a tenant. */
  createHousehold(
    tenantId: string,
    data: CreateHouseholdInput,
  ): Promise<DomainResult<Household>>;

  /** Add a new resident to a household within a tenant. */
  addResident(
    tenantId: string,
    data: CreateResidentInput,
  ): Promise<DomainResult<Resident>>;

  /** Update a resident's residency status. */
  updateResidentStatus(
    tenantId: string,
    residentId: string,
    status: ResidencyStatus,
  ): Promise<DomainResult<Resident>>;

  /** Find residents within a tenant with optional filters and pagination. */
  findByTenant(
    tenantId: string,
    filters: ResidentFilters,
  ): Promise<DomainResult<PaginatedResult<Resident>>>;

  /** Export all resident data for a tenant as a CSV string. */
  exportToCsv(tenantId: string): Promise<DomainResult<string>>;

  /** Import residents from a CSV string, returning a summary of results. */
  importFromCsv(
    tenantId: string,
    csvContent: string,
  ): Promise<DomainResult<CsvImportResult>>;
}
