/**
 * AuditAdminRepositoryImpl — Infrastructure implementation of AuditAdminRepository.
 *
 * This repository provides Admin UI audit log operations by calling the backend API
 * (AuditTrailService endpoints). It maps API responses to domain entities and
 * handles errors appropriately.
 *
 * **ENDPOINTS USED:**
 * - GET /api/admin/audit/logs - Query audit logs with filters and pagination
 * - GET /api/admin/audit/logs/:id - Get single audit log entry
 * - POST /api/admin/audit/export - Export audit logs to file
 * - GET /api/admin/audit/count - Count audit logs for export warning
 *
 * **SCOPE-BASED FILTERING:**
 * - PLATFORM_ADMIN: Can view audit logs across all tenants
 * - Tenant-level admins (null actorOrgUnitId): View all audit logs within tenant
 * - Org-scoped admins (non-null actorOrgUnitId): View audit logs within their OrgUnit scope
 * The backend API enforces scope filtering based on the authorization context.
 *
 * **ERROR HANDLING:**
 * - Maps API errors to appropriate AppError types
 * - Returns DomainResult<T> for explicit success/error handling
 * - Never exposes internal error details to callers
 *
 * @see Requirements 17.1-17.13 (Audit Log Viewer)
 * @see Requirements 18.1-18.10 (Audit Log Export)
 * @see AuditAdminRepository interface for full contract
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError, validationError } from '@core/utils';
import type {
  AuditAdminRepository,
  AuditLogQueryInput,
  AuditExportInput,
  AuditCountInput,
} from '@core/domains/audit/repositories/AuditAdminRepository';
import type {
  AuditLogEntry,
  AuditActor,
  AuditResource,
  PaginatedAuditLogEntries,
  AuditExportResult,
  AuditResourceType,
} from '@core/domains/audit/entities/AuditLogEntry';
import type { AuditEventType } from '@core/domains/audit/entities/AuditEventType';
import type { AuditFilters } from '@core/domains/audit/entities/AuditFilters';
import type { HttpProtocol } from '@core/protocols';

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

/**
 * API response for actor information.
 */
interface ActorApiResponse {
  id: string;
  name: string;
  email: string;
  isImpersonating?: boolean;
  impersonatorId?: string;
  impersonatorName?: string;
}

/**
 * API response for resource information.
 */
interface ResourceApiResponse {
  type: string;
  id: string;
  name: string;
}

/**
 * API response for a single audit log entry.
 */
interface AuditLogEntryApiResponse {
  id: string;
  timestamp: string;
  eventType: string;
  actor: ActorApiResponse;
  resource: ResourceApiResponse;
  details: Record<string, unknown>;
  ipAddress: string;
  tenantId?: string;
  tenantName?: string;
  correlationId?: string;
  sessionId?: string;
  userAgent?: string;
}

/**
 * API response for paginated audit logs.
 */
interface PaginatedAuditLogsApiResponse {
  entries: AuditLogEntryApiResponse[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/**
 * API response for export result.
 */
interface AuditExportApiResponse {
  downloadUrl: string;
  filename: string;
  rowCount: number;
  wasTruncated: boolean;
  sizeBytes: number;
}

/**
 * API response for count.
 */
interface AuditCountApiResponse {
  count: number;
}

/**
 * API error response.
 */
interface ApiErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Maps API actor response to domain AuditActor.
 */
function mapActorFromApi(api: ActorApiResponse): AuditActor {
  return {
    id: api.id,
    name: api.name,
    email: api.email,
    isImpersonating: api.isImpersonating,
    impersonatorId: api.impersonatorId,
    impersonatorName: api.impersonatorName,
  };
}

/**
 * Maps API resource response to domain AuditResource.
 */
function mapResourceFromApi(api: ResourceApiResponse): AuditResource {
  return {
    type: api.type as AuditResourceType,
    id: api.id,
    name: api.name,
  };
}

/**
 * Maps API audit log entry to domain AuditLogEntry.
 */
function mapAuditLogEntryFromApi(api: AuditLogEntryApiResponse): AuditLogEntry {
  return {
    id: api.id,
    timestamp: new Date(api.timestamp),
    eventType: api.eventType as AuditEventType,
    actor: mapActorFromApi(api.actor),
    resource: mapResourceFromApi(api.resource),
    details: api.details,
    ipAddress: api.ipAddress,
    tenantId: api.tenantId,
    tenantName: api.tenantName,
    correlationId: api.correlationId,
    sessionId: api.sessionId,
    userAgent: api.userAgent,
  };
}

/**
 * Maps API paginated response to domain PaginatedAuditLogEntries.
 */
function mapPaginatedAuditLogsFromApi(
  api: PaginatedAuditLogsApiResponse,
): PaginatedAuditLogEntries {
  return {
    entries: api.entries.map(mapAuditLogEntryFromApi),
    page: api.page,
    pageSize: api.pageSize,
    totalCount: api.totalCount,
    totalPages: api.totalPages,
    hasNextPage: api.page < api.totalPages,
    hasPreviousPage: api.page > 1,
  };
}

/**
 * Maps API export response to domain AuditExportResult.
 */
function mapExportResultFromApi(api: AuditExportApiResponse): AuditExportResult {
  return {
    downloadUrl: api.downloadUrl,
    filename: api.filename,
    rowCount: api.rowCount,
    wasTruncated: api.wasTruncated,
    sizeBytes: api.sizeBytes,
  };
}

/**
 * Maps API error to DomainResult failure.
 */
function mapApiError<T>(error: unknown): DomainResult<T> {
  // Handle axios-like error response
  const errorResponse = error as { response?: { status?: number; data?: ApiErrorResponse } };
  const status = errorResponse?.response?.status;
  const data = errorResponse?.response?.data;

  if (status === 404) {
    return fail(notFoundError(
      data?.code ?? 'AUDIT_LOG_NOT_FOUND',
      data?.message ?? 'Audit log entry not found',
    ));
  }

  if (status === 400) {
    return fail(validationError(
      data?.code ?? 'VALIDATION_ERROR',
      data?.message ?? 'Invalid request',
    ));
  }

  if (status === 403) {
    return fail({
      type: 'authorization',
      code: data?.code ?? 'AUTH_FORBIDDEN',
      message: data?.message ?? 'Access denied to audit logs',
      retryable: false,
    });
  }

  if (status === 413) {
    // Export too large
    return fail({
      type: 'business',
      code: data?.code ?? 'AUDIT_EXPORT_TOO_LARGE',
      message: data?.message ?? 'Export exceeds maximum row limit',
      retryable: false,
    });
  }

  // Generic technical error for unknown cases
  return fail(technicalError(
    data?.code ?? 'AUDIT_API_ERROR',
    data?.message ?? 'Failed to process audit log operation',
    { retryable: true },
  ));
}

/**
 * Builds query parameters from filters.
 */
function buildFilterParams(filters: AuditFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.dateFrom) {
    params.set('dateFrom', filters.dateFrom.toISOString());
  }
  if (filters.dateTo) {
    params.set('dateTo', filters.dateTo.toISOString());
  }
  if (filters.eventTypes.length > 0) {
    params.set('eventTypes', filters.eventTypes.join(','));
  }
  if (filters.actorSearch) {
    params.set('actorSearch', filters.actorSearch);
  }
  if (filters.resourceType) {
    params.set('resourceType', filters.resourceType);
  }
  if (filters.resourceId) {
    params.set('resourceId', filters.resourceId);
  }

  return params;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an AuditAdminRepository implementation.
 *
 * @param dependencies - The repository dependencies
 * @returns An implementation of AuditAdminRepository
 */
export const AuditAdminRepositoryImpl = ({
  httpProtocol,
}: {
  httpProtocol: HttpProtocol;
}): AuditAdminRepository => {
  const baseUrl = '/api/admin/audit';

  return {
    // -------------------------------------------------------------------------
    // Query Audit Logs
    // -------------------------------------------------------------------------

    /**
     * Query audit logs with pagination, filtering, and scope-based access control.
     *
     * @see AuditAdminRepository.queryAuditLogs
     * @see Requirements 17.3-17.7 (Audit Log Table filtering and display)
     */
    async queryAuditLogs(
      input: AuditLogQueryInput,
    ): Promise<DomainResult<PaginatedAuditLogEntries>> {
      try {
        const {
          tenantId,
          actorOrgUnitId,
          isPlatformAdmin,
          queryOptions,
        } = input;

        const { filters, page, pageSize, sortBy, sortOrder } = queryOptions;

        // Build query parameters
        const params = buildFilterParams(filters);

        // Add required parameters
        if (tenantId) {
          params.set('tenantId', tenantId);
        }
        if (actorOrgUnitId !== null) {
          params.set('actorOrgUnitId', actorOrgUnitId);
        }
        if (isPlatformAdmin) {
          params.set('isPlatformAdmin', 'true');
        }

        // Pagination
        params.set('page', String(page));
        params.set('pageSize', String(pageSize));

        // Sorting
        if (sortBy) {
          params.set('sortBy', sortBy);
        }
        if (sortOrder) {
          params.set('sortOrder', sortOrder);
        }

        const response = await httpProtocol.get<PaginatedAuditLogsApiResponse>(
          `${baseUrl}/logs?${params.toString()}`,
        );

        return ok(mapPaginatedAuditLogsFromApi(response));
      } catch (error) {
        return mapApiError<PaginatedAuditLogEntries>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Get Single Audit Log Entry
    // -------------------------------------------------------------------------

    /**
     * Get a single audit log entry by ID.
     *
     * @see AuditAdminRepository.getAuditLogEntry
     * @see Requirements 17.12 (Row expansion for full details)
     */
    async getAuditLogEntry(
      tenantId: string,
      entryId: string,
    ): Promise<DomainResult<AuditLogEntry | null>> {
      try {
        const params = new URLSearchParams({ tenantId });

        const response = await httpProtocol.get<AuditLogEntryApiResponse>(
          `${baseUrl}/logs/${entryId}?${params.toString()}`,
        );

        return ok(mapAuditLogEntryFromApi(response));
      } catch (error) {
        // Handle 404 as null (not found)
        const errorResponse = error as { response?: { status?: number } };
        if (errorResponse?.response?.status === 404) {
          return ok(null);
        }
        return mapApiError<AuditLogEntry | null>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Export Audit Logs
    // -------------------------------------------------------------------------

    /**
     * Export audit logs to a downloadable file.
     *
     * @see AuditAdminRepository.exportAuditLogs
     * @see Requirements 18.1-18.10 (Audit Log Export)
     */
    async exportAuditLogs(
      input: AuditExportInput,
    ): Promise<DomainResult<AuditExportResult>> {
      try {
        const {
          tenantId,
          actorOrgUnitId,
          isPlatformAdmin,
          format,
          filters,
          maxRows,
        } = input;

        // Build request body
        const requestBody: Record<string, unknown> = {
          tenantId,
          format,
          isPlatformAdmin,
        };

        if (actorOrgUnitId !== null) {
          requestBody.actorOrgUnitId = actorOrgUnitId;
        }
        if (filters.dateFrom) {
          requestBody.dateFrom = filters.dateFrom.toISOString();
        }
        if (filters.dateTo) {
          requestBody.dateTo = filters.dateTo.toISOString();
        }
        if (maxRows !== undefined) {
          requestBody.maxRows = maxRows;
        }

        // Add filters to request body
        if (filters.eventTypes.length > 0) {
          requestBody.eventTypes = filters.eventTypes;
        }
        if (filters.actorSearch) {
          requestBody.actorSearch = filters.actorSearch;
        }
        if (filters.resourceType) {
          requestBody.resourceType = filters.resourceType;
        }
        if (filters.resourceId) {
          requestBody.resourceId = filters.resourceId;
        }

        const response = await httpProtocol.post<AuditExportApiResponse>(
          `${baseUrl}/export`,
          requestBody,
        );

        return ok(mapExportResultFromApi(response));
      } catch (error) {
        return mapApiError<AuditExportResult>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Count Audit Logs
    // -------------------------------------------------------------------------

    /**
     * Count audit logs matching the given filters.
     *
     * @see AuditAdminRepository.countAuditLogs
     * @see Requirements 18.5 (Maximum rows warning)
     */
    async countAuditLogs(
      input: AuditCountInput,
    ): Promise<DomainResult<number>> {
      try {
        const { tenantId, actorOrgUnitId, isPlatformAdmin, filters } = input;

        // Build query parameters
        const params = buildFilterParams(filters);

        // Add required parameters
        if (tenantId) {
          params.set('tenantId', tenantId);
        }
        if (actorOrgUnitId !== null) {
          params.set('actorOrgUnitId', actorOrgUnitId);
        }
        if (isPlatformAdmin) {
          params.set('isPlatformAdmin', 'true');
        }

        const response = await httpProtocol.get<AuditCountApiResponse>(
          `${baseUrl}/count?${params.toString()}`,
        );

        return ok(response.count);
      } catch (error) {
        return mapApiError<number>(error);
      }
    },
  };
};
