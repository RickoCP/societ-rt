/**
 * AuditRepository — Core repository interface for audit log persistence.
 *
 * Append-only: only create and read operations are exposed.
 * No update or delete methods — audit logs are immutable.
 *
 * @see Requirements 18.2, 18.5, 18.6
 */

import type { DomainResult } from '@core/utils';
import type { PaginatedResult } from '@core/domains/resident/entities';
import type { AuditLog, CreateAuditLogInput } from '../entities';

export interface AuditLogFilters {
  readonly actionType?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface AuditRepository {
  /** Create an audit log entry (append-only). */
  create(
    tenantId: string,
    data: CreateAuditLogInput,
  ): Promise<DomainResult<AuditLog>>;

  /** Find audit logs for a tenant (paginated, filterable). */
  findByTenant(
    tenantId: string,
    filters: AuditLogFilters,
  ): Promise<DomainResult<PaginatedResult<AuditLog>>>;
}
