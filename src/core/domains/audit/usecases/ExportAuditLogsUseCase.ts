/**
 * ExportAuditLogsUseCase — Exports audit logs to CSV or JSON format.
 *
 * This use case orchestrates the export of audit logs for download,
 * applying authorization scope filtering based on the actor's role:
 * - PLATFORM_ADMIN: Can export audit logs across all tenants
 * - Tenant-level admins (TENANT_OWNER, ORG_ADMIN): Export all audit logs within tenant
 * - Org-scoped admins (RT_ADMIN): Export audit logs within their OrgUnit scope only
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has audit:read OR tenant:manage permission
 * 2. Validate export format (csv/json)
 * 3. Validate date range filters
 * 4. Enforce 10,000 row limit
 * 5. Call repository with scope-filtered export parameters
 * 6. Return export result with download URL
 *
 * @see Requirements 18.1-18.10 (Audit Log Export)
 * @see Task 25.1: Create ExportAuditLogs use case
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type {
  AuditExportFormat,
  AuditExportResult,
  MAX_AUDIT_EXPORT_ROWS,
} from '../entities/AuditLogEntry';
import type { AuditFilters } from '../entities/AuditFilters';
import type { AuditAdminRepository, AuditExportInput } from '../repositories/AuditAdminRepository';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum rows allowed for export.
 * @see Requirements 18.5 (Enforce 10,000 row limit)
 */
const EXPORT_MAX_ROWS = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input parameters for exporting audit logs.
 */
export interface ExportAuditLogsInput {
  /**
   * The tenant ID to export from.
   * For platform admins, this may be null/empty to export across all tenants.
   */
  readonly tenantId: string;

  /**
   * The actor's OrgUnit scope (null for tenant-level/platform admins).
   * This is the actor's orgUnitId from their membership, NOT a filter parameter.
   */
  readonly actorOrgUnitId: string | null;

  /**
   * Whether the actor is a platform admin.
   * Platform admins can export audit logs across all tenants.
   */
  readonly isPlatformAdmin: boolean;

  /**
   * Whether the actor has audit:read permission.
   * Either audit:read OR tenant:manage is required.
   *
   * @see Requirements 18.2 (Permission requirements)
   */
  readonly hasAuditReadPermission: boolean;

  /**
   * Whether the actor has tenant:manage permission.
   * Either audit:read OR tenant:manage is required.
   */
  readonly hasTenantManagePermission: boolean;

  /**
   * Export format (csv or json).
   *
   * @see Requirements 18.3 (Format selection: CSV, JSON)
   */
  readonly format: AuditExportFormat;

  /**
   * Filters to apply to the export.
   *
   * @see Requirements 18.4 (Pre-fill date range from current filter)
   */
  readonly filters: Partial<AuditFilters>;

  /**
   * Maximum rows to export (defaults to 10,000).
   *
   * @see Requirements 18.5 (Enforce 10,000 row limit)
   */
  readonly maxRows?: number;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * ExportAuditLogsUseCase interface — exports audit logs to downloadable file.
 */
export interface ExportAuditLogsUseCase {
  /**
   * Execute the export audit logs operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with export result (download URL, filename, etc.) or error
   */
  execute(input: ExportAuditLogsInput): Promise<DomainResult<AuditExportResult>>;
}

// ---------------------------------------------------------------------------
// Error Factory Functions
// ---------------------------------------------------------------------------

/**
 * Creates an authorization error for insufficient permissions.
 */
function authInsufficientPermission(requiredPermissions: string[]) {
  return {
    type: 'authorization' as const,
    code: 'AUTH_INSUFFICIENT_PERMISSION',
    message: `Required permissions: ${requiredPermissions.join(' OR ')}`,
    userMessage: 'You do not have permission to export audit logs.',
    retryable: false,
  };
}

/**
 * Creates a validation error for missing tenant ID.
 */
function validationMissingTenantId() {
  return {
    type: 'validation' as const,
    code: 'VALIDATION_MISSING_TENANT_ID',
    message: 'Tenant ID is required for non-platform admin users',
    userMessage: 'Tenant context is required for this operation.',
    retryable: false,
  };
}

/**
 * Creates a validation error for invalid export format.
 */
function validationInvalidFormat(format: string) {
  return {
    type: 'validation' as const,
    code: 'AUDIT_EXPORT_INVALID_FORMAT',
    message: `Invalid export format: ${format}. Supported formats: csv, json`,
    userMessage: 'Please select a valid export format (CSV or JSON).',
    retryable: false,
  };
}

/**
 * Creates a validation error for invalid date range.
 */
function validationInvalidDateRange() {
  return {
    type: 'validation' as const,
    code: 'VALIDATION_INVALID_DATE_RANGE',
    message: 'Start date must be before or equal to end date',
    userMessage: 'The start date must be before or equal to the end date.',
    retryable: false,
  };
}

/**
 * Creates a validation error for missing date range.
 */
function validationMissingDateRange() {
  return {
    type: 'validation' as const,
    code: 'AUDIT_EXPORT_MISSING_DATE_RANGE',
    message: 'Date range is required for export',
    userMessage: 'Please specify a date range for the export.',
    retryable: false,
  };
}

/**
 * Creates a validation error for row limit exceeded.
 */
function validationRowLimitExceeded(requested: number, maxAllowed: number) {
  return {
    type: 'validation' as const,
    code: 'AUDIT_EXPORT_ROW_LIMIT_EXCEEDED',
    message: `Requested ${requested} rows exceeds maximum allowed ${maxAllowed}`,
    userMessage: `Export is limited to ${maxAllowed.toLocaleString()} rows. Please narrow your date range or filters.`,
    retryable: false,
  };
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Validates the export format.
 */
function isValidExportFormat(format: string): format is AuditExportFormat {
  return format === 'csv' || format === 'json';
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an ExportAuditLogsUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of ExportAuditLogsUseCase
 */
export const ExportAuditLogsUseCaseImpl = ({
  auditAdminRepository,
}: {
  auditAdminRepository: AuditAdminRepository;
}): ExportAuditLogsUseCase => ({
  execute: async (input: ExportAuditLogsInput): Promise<DomainResult<AuditExportResult>> => {
    const {
      tenantId,
      actorOrgUnitId,
      isPlatformAdmin,
      hasAuditReadPermission,
      hasTenantManagePermission,
      format,
      filters,
      maxRows = EXPORT_MAX_ROWS,
    } = input;

    // -------------------------------------------------------------------------
    // Step 1: Validate actor has required permission
    // Requirement 18.2: audit:read OR tenant:manage permission required
    // -------------------------------------------------------------------------
    if (!hasAuditReadPermission && !hasTenantManagePermission) {
      return fail(authInsufficientPermission(['audit:read', 'tenant:manage']));
    }

    // -------------------------------------------------------------------------
    // Step 2: Validate tenant ID for non-platform admins
    // Platform admins can export across tenants (may have empty tenantId)
    // -------------------------------------------------------------------------
    if (!isPlatformAdmin && !tenantId) {
      return fail(validationMissingTenantId());
    }

    // -------------------------------------------------------------------------
    // Step 3: Validate export format
    // Requirement 18.3: Support CSV and JSON formats
    // -------------------------------------------------------------------------
    if (!isValidExportFormat(format)) {
      return fail(validationInvalidFormat(format));
    }

    // -------------------------------------------------------------------------
    // Step 4: Validate date range
    // Requirement 18.4: Date range is required for export
    // -------------------------------------------------------------------------
    if (!filters.dateFrom || !filters.dateTo) {
      return fail(validationMissingDateRange());
    }

    if (filters.dateFrom > filters.dateTo) {
      return fail(validationInvalidDateRange());
    }

    // -------------------------------------------------------------------------
    // Step 5: Enforce row limit
    // Requirement 18.5: Maximum 10,000 rows per export
    // -------------------------------------------------------------------------
    const effectiveMaxRows = Math.min(maxRows, EXPORT_MAX_ROWS);

    if (maxRows > EXPORT_MAX_ROWS) {
      return fail(validationRowLimitExceeded(maxRows, EXPORT_MAX_ROWS));
    }

    // -------------------------------------------------------------------------
    // Step 6: Build sanitized filters with defaults for optional fields
    // -------------------------------------------------------------------------
    const sanitizedFilters: AuditFilters = {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      eventTypes: filters.eventTypes ?? [],
      actorSearch: filters.actorSearch?.trim() ?? '',
      resourceType: filters.resourceType ?? null,
      resourceId: filters.resourceId?.trim() ?? '',
    };

    // -------------------------------------------------------------------------
    // Step 7: Build export input for repository
    // -------------------------------------------------------------------------
    const exportInput: AuditExportInput = {
      tenantId,
      actorOrgUnitId,
      isPlatformAdmin,
      format,
      filters: sanitizedFilters,
      maxRows: effectiveMaxRows,
    };

    // -------------------------------------------------------------------------
    // Step 8: Call repository to perform export
    // The repository handles:
    // - Scope-based filtering based on actorOrgUnitId and isPlatformAdmin
    // - File generation in specified format
    // - Upload to storage and return download URL
    // -------------------------------------------------------------------------
    const result = await auditAdminRepository.exportAuditLogs(exportInput);

    return result;
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type ExportAuditLogsUseCaseType = ExportAuditLogsUseCase;
