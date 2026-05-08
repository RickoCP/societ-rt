/**
 * GateRepository — Core repository interface for gate monitoring
 * persistence operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 33.1, 33.2, 33.6, 33.7, 33.8
 */

import type { DomainResult } from '@core/utils';
import type {
  Gate,
  GateStatus,
  RegisterGateInput,
  GateEvent,
  GateEventState,
  GateAnalytics,
} from '../entities';

// ---------------------------------------------------------------------------
// Filter & pagination types
// ---------------------------------------------------------------------------

export interface GateEventFilters {
  readonly gateId?: string;
  readonly from?: Date;
  readonly to?: Date;
}

export interface PaginatedGateEventResult {
  readonly data: GateEvent[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface GateRepository {
  /** Register a new gate within a tenant. */
  registerGate(
    tenantId: string,
    data: RegisterGateInput,
  ): Promise<DomainResult<Gate>>;

  /** Find all gates for a tenant. */
  findByTenant(tenantId: string): Promise<DomainResult<Gate[]>>;

  /** Update the status of a gate (open, closed, offline). */
  updateStatus(
    tenantId: string,
    gateId: string,
    status: GateStatus,
  ): Promise<DomainResult<Gate>>;

  /** Record a gate open/close event. */
  createEvent(
    tenantId: string,
    gateId: string,
    state: GateEventState,
    duration: number,
  ): Promise<DomainResult<GateEvent>>;

  /** Find gate events with pagination and optional filters. */
  findEventsByGate(
    tenantId: string,
    gateId: string,
    page: number,
    pageSize: number,
    filters?: GateEventFilters,
  ): Promise<DomainResult<PaginatedGateEventResult>>;

  /** Get aggregated analytics for a gate within a time range. */
  getGateAnalytics(
    tenantId: string,
    gateId: string,
    from: Date,
    to: Date,
  ): Promise<DomainResult<GateAnalytics>>;
}
