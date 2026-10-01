/**
 * QueryAuditLogsUseCase — Retrieves paginated audit logs for Admin UI with scope-based filtering.
 *
 * This use case orchestrates the retrieval of audit logs for the Audit Log Viewer screen,
 * applying authorization scope filtering based on the actor's role:
 * - PLATFORM_ADMIN: Can view audit logs across all tenants (cross-tenant view)
 * - Tenant-level admins (TENANT_OWNER, ORG_ADMIN): View all audit logs within tenant
 * - Org-scoped admins (RT_ADMIN): View audit logs within their OrgUnit scope only
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has audit:read OR tenant:manage permission
 * 2. Determine actor's authorization scope
 * 3. Validate and sanitize filter inputs
 * 4. Call repository with scope-filtered query options
 * 5. Return paginated audit logs
 *
 * @see Requirements 17.1-17.13 (Audit Log Viewer)
 * @see Design Components and Interfaces > 10. Audit Log
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { PaginatedAuditLogEntries } from '../entities/AuditLogEntry';
import type { AuditFilters, AuditQueryOptions, AuditSortField } from '../entities/AuditFilters';
import type { AuditAdminRepository } from '../repositories/AuditAdminRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Input parameters for querying audit logs.
 */
export interface QueryAuditLogsInput {
  /**
   * The tenant ID to query.
   * For platform admins, this may be null/empty to query across all tenants.
   */
  readonly tenantId: string;

  /**
   * The actor's OrgUnit scope (null for tenant-level/platform admins).
   * This is the actor's orgUnitId from their membership, NOT a filter parameter.
   */
  readonly actorOrgUnitId: string | null;

  /**
   * Whether the actor is a platform admin.
   * Platform admins can view audit logs across all tenants.
   *
   * @see Requirements 17.5 (PLATFORM_ADMIN cross-tenant view)
   */
  readonly isPlatformAdmin: boolean;

  /**
   * Whether the actor has audit:read permission.
   * Either audit:read OR tenant:manage is required.
   *
   * @see Requirements 17.2 (Permission requirements)
   */
  readonly hasAuditReadPermission: boolean;

  /**
   * Whether the actor has tenant:manage permission.
   * Either audit:read OR tenant:manage is required.
   *
   * @see Requirements 17.2 (Permission requirements)
   */
  readonly hasTenantManagePermission: boolean;

  /**
   * Pagination options.
   *
   * @see Requirements 17.10 (Pagination with configurable page size)
   */
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
  };

  /**
   * Optional filters.
   *
   * @see Requirements 17.8, 17.9 (Filter Panel)
   */
  readonly filters?: Partial<AuditFilters>;

  /**
   * Optional sort options.
   */
  readonly sort?: {
    readonly column: AuditSortField;
    readonly direction: 'asc' | 'desc';
  };
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * QueryAuditLogsUseCase interface — retrieves paginated audit logs with scope filtering.
 */
export interface QueryAuditLogsUseCase {
  /**
   * Execute the query audit logs operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with paginated audit logs or error
   */
  execute(input: QueryAuditLogsInput): Promise<DomainResult<PaginatedAuditLogEntries>>;
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
    retryable: false,
  };
}

/**
 * Creates a validation error for invalid pagination parameters.
 */
function validationInvalidPagination(message: string) {
  return {
    type: 'validation' as const,
    code: 'VALIDATION_INVALID_PAGINATION',
    message,
    retryable: false,
  };
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a QueryAuditLogsUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of QueryAuditLogsUseCase
 */
export const QueryAuditLogsUseCaseImpl = ({
  auditAdminRepository,
}: {
  auditAdminRepository: AuditAdminRepository;
}): QueryAuditLogsUseCase => ({
  execute: async (input: QueryAuditLogsInput): Promise<DomainResult<PaginatedAuditLogEntries>> => {
    const {
      tenantId,
      actorOrgUnitId,
      isPlatformAdmin,
      hasAuditReadPermission,
      hasTenantManagePermission,
      pagination,
      filters,
      sort,
    } = input;

    // -------------------------------------------------------------------------
    // Step 1: Validate actor has required permission
    // Requirement 17.2: audit:read OR tenant:manage permission required
    // -------------------------------------------------------------------------
    if (!hasAuditReadPermission && !hasTenantManagePermission) {
      return fail(authInsufficientPermission(['audit:read', 'tenant:manage']));
    }

    // -------------------------------------------------------------------------
    // Step 2: Validate tenant ID for non-platform admins
    // Platform admins can query across tenants (may have empty tenantId)
    // -------------------------------------------------------------------------
    if (!isPlatformAdmin && !tenantId) {
      return fail(validationMissingTenantId());
    }

    // -------------------------------------------------------------------------
    // Step 3: Validate pagination parameters
    // -------------------------------------------------------------------------
    const { page, pageSize } = pagination;

    if (page < 1) {
      return fail(validationInvalidPagination('Page must be >= 1'));
    }

    if (pageSize < 1 || pageSize > 100) {
      return fail(validationInvalidPagination('Page size must be between 1 and 100'));
    }

    // -------------------------------------------------------------------------
    // Step 4: Validate and sanitize filter inputs
    // -------------------------------------------------------------------------
    if (filters?.dateFrom && filters?.dateTo) {
      if (filters.dateFrom > filters.dateTo) {
        return fail(validationInvalidDateRange());
      }
    }

    // Build complete AuditFilters with defaults for optional fields
    const sanitizedFilters: AuditFilters = {
      dateFrom: filters?.dateFrom ?? null,
      dateTo: filters?.dateTo ?? null,
      eventTypes: filters?.eventTypes ?? [],
      actorSearch: filters?.actorSearch?.trim() ?? '',
      resourceType: filters?.resourceType ?? null,
      resourceId: filters?.resourceId?.trim() ?? '',
    };

    // -------------------------------------------------------------------------
    // Step 5: Build query options with scope filtering
    // -------------------------------------------------------------------------
    const queryOptions: AuditQueryOptions = {
      filters: sanitizedFilters,
      page,
      pageSize,
      sortBy: sort?.column ?? 'timestamp',
      sortOrder: sort?.direction ?? 'desc',
      tenantId: isPlatformAdmin ? (tenantId || null) : tenantId,
    };

    // -------------------------------------------------------------------------
    // Step 6: Call repository and return result
    // The repository handles scope-based filtering:
    // - isPlatformAdmin = true → cross-tenant view with tenant column
    // - actorOrgUnitId = null → tenant-level admin, sees all tenant audit logs
    // - actorOrgUnitId != null → org-scoped admin, sees only their scope
    // -------------------------------------------------------------------------
    const result = await auditAdminRepository.queryAuditLogs({
      tenantId,
      actorOrgUnitId,
      isPlatformAdmin,
      queryOptions,
    });

    return result;
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type QueryAuditLogsUseCaseType = QueryAuditLogsUseCase;
