/**
 * IncidentRepository — Core repository interface for incident
 * persistence operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 32.1, 32.2, 32.4, 32.6
 */

import type { DomainResult } from '@core/utils';
import type {
  Incident,
  IncidentStatus,
  IncidentSeverity,
  IncidentCategory,
  CreateIncidentInput,
  IncidentLog,
  CreateIncidentLogInput,
} from '../entities';

// ---------------------------------------------------------------------------
// Filter & pagination types
// ---------------------------------------------------------------------------

export interface IncidentFilters {
  readonly status?: IncidentStatus;
  readonly severity?: IncidentSeverity;
  readonly category?: IncidentCategory;
}

export interface PaginatedIncidentResult {
  readonly data: Incident[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface IncidentRepository {
  /** Create a new incident within a tenant. */
  createIncident(
    tenantId: string,
    data: CreateIncidentInput,
  ): Promise<DomainResult<Incident>>;

  /** Update the status of an existing incident. */
  updateStatus(
    tenantId: string,
    incidentId: string,
    status: IncidentStatus,
  ): Promise<DomainResult<Incident>>;

  /** Add a log entry to an incident's history. */
  addLog(
    tenantId: string,
    incidentId: string,
    data: CreateIncidentLogInput,
  ): Promise<DomainResult<IncidentLog>>;

  /** Find incidents for a tenant with pagination and optional filters. */
  findByTenant(
    tenantId: string,
    page: number,
    pageSize: number,
    filters?: IncidentFilters,
  ): Promise<DomainResult<PaginatedIncidentResult>>;

  /** Find a single incident by ID within a tenant. */
  findById(
    tenantId: string,
    incidentId: string,
  ): Promise<DomainResult<Incident | null>>;

  /** Attach evidence file URLs to an incident. */
  attachEvidence(
    tenantId: string,
    incidentId: string,
    evidenceUrls: string[],
  ): Promise<DomainResult<Incident>>;
}
