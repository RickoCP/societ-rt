/**
 * AuditAdminRepository — Core repository interface for Admin UI audit log operations.
 *
 * This repository provides audit log query functionality for the Admin UI,
 * supporting scope-based filtering, pagination, and export operations.
 *
 * **SCOPE-BASED FILTERING:**
 * - PLATFORM_ADMIN: Can view audit logs across all tenants (with tenant column)
 * - Tenant-level admins (null actorOrgUnitId): View all audit logs within tenant
 * - Org-scoped admins (non-null actorOrgUnitId): View audit logs within their OrgUnit scope
 *
 * **SECURITY CONSIDERATIONS:**
 * - All queries MUST be tenant-scoped (except for platform admin)
 * - Sensitive details may be redacted in audit log entries
 * - IP address display may be masked based on privacy settings
 *
 * @see Requirements 17.1-17.13 (Audit Log Viewer)
 * @see Requirements 18.1-18.10 (Audit Log Export)
 */

import type { DomainResult } from '@core/utils';
import type {
  AuditLogEntry,
  PaginatedAuditLogEntries,
  AuditExportFormat,
  AuditExportResult,
} from '../entities/AuditLogEntry';
import type { AuditQueryOptions, AuditFilters } from '../entities/AuditFilters';

/**
 * Query input for listing audit logs.
 */
export interface AuditLogQueryInput {
  /** The tenant ID to query (required for tenant-scoped queries) */
  readonly tenantId: string;
  /** The actor's OrgUnit scope (null for tenant-level/platform admins) */
  readonly actorOrgUnitId: string | null;
  /** Whether the actor is a platform admin (enables cross-tenant view) */
  readonly isPlatformAdmin: boolean;
  /** Complete query options including filters, pagination, and sorting */
  readonly queryOptions: AuditQueryOptions;
}

/**
 * Export input for audit log export.
 */
export interface AuditExportInput {
  /** The tenant ID to export (required for tenant-scoped exports) */
  readonly tenantId: string;
  /** The actor's OrgUnit scope (null for tenant-level/platform admins) */
  readonly actorOrgUnitId: string | null;
  /** Whether the actor is a platform admin */
  readonly isPlatformAdmin: boolean;
  /** Export format */
  readonly format: AuditExportFormat;
  /** Filters to apply */
  readonly filters: AuditFilters;
  /** Maximum rows to export (limit 10,000) */
  readonly maxRows?: number;
}

/**
 * Count input for audit log count operation.
 */
export interface AuditCountInput {
  /** The tenant ID to count */
  readonly tenantId: string;
  /** The actor's OrgUnit scope */
  readonly actorOrgUnitId: string | null;
  /** Whether the actor is a platform admin */
  readonly isPlatformAdmin: boolean;
  /** Filters to apply */
  readonly filters: AuditFilters;
}

/**
 * AuditAdminRepository interface — Admin UI audit log operations.
 */
export interface AuditAdminRepository {
  /**
   * Query audit logs with pagination, filtering, and scope-based access control.
   *
   * @param input - The query input including scope, pagination, and filters
   * @returns DomainResult with paginated audit log entries
   *
   * @see Requirements 17.3-17.7 (Audit Log Table filtering and display)
   */
  queryAuditLogs(
    input: AuditLogQueryInput,
  ): Promise<DomainResult<PaginatedAuditLogEntries>>;

  /**
   * Get a single audit log entry by ID.
   *
   * @param tenantId - The tenant ID (for isolation)
   * @param entryId - The audit log entry ID
   * @returns DomainResult with the audit log entry or null if not found
   *
   * @see Requirements 17.12 (Row expansion for full details)
   */
  getAuditLogEntry(
    tenantId: string,
    entryId: string,
  ): Promise<DomainResult<AuditLogEntry | null>>;

  /**
   * Export audit logs to a downloadable file.
   *
   * @param input - The export input including format and filters
   * @returns DomainResult with the export download information
   *
   * @see Requirements 18.1-18.10 (Audit Log Export)
   */
  exportAuditLogs(
    input: AuditExportInput,
  ): Promise<DomainResult<AuditExportResult>>;

  /**
   * Count audit logs matching the given filters (for export row count warning).
   *
   * @param input - The count input including filters
   * @returns DomainResult with the count
   *
   * @see Requirements 18.5 (Maximum rows warning)
   */
  countAuditLogs(
    input: AuditCountInput,
  ): Promise<DomainResult<number>>;
}
