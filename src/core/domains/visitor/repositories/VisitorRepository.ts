/**
 * VisitorRepository — Core repository interface for visitor and package
 * logging operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 15.1, 15.2, 15.3, 15.4
 */

import type { DomainResult } from '@core/utils';
import type { VisitorLog, LogVisitorInput, PackageLog, LogPackageInput } from '../entities';

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface VisitorRepository {
  /** Log a new visitor entry within a tenant. */
  logVisitor(
    tenantId: string,
    data: LogVisitorInput,
    loggedBy: string,
  ): Promise<DomainResult<VisitorLog>>;

  /** Log a new package delivery within a tenant. */
  logPackage(
    tenantId: string,
    data: LogPackageInput,
    loggedBy: string,
  ): Promise<DomainResult<PackageLog>>;

  /** Record the exit timestamp for a visitor. */
  recordVisitorExit(
    tenantId: string,
    visitorLogId: string,
  ): Promise<DomainResult<VisitorLog>>;

  /** Find all visitor logs within a tenant. */
  findByTenant(tenantId: string): Promise<DomainResult<VisitorLog[]>>;

  /** Find a visitor log by ID within a tenant. */
  findById(
    tenantId: string,
    visitorLogId: string,
  ): Promise<DomainResult<VisitorLog | null>>;

  /** Delete a visitor log by ID within a tenant. */
  deleteVisitor(
    tenantId: string,
    visitorLogId: string,
  ): Promise<DomainResult<void>>;
}
