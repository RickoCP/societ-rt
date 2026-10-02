/**
 * PlatformRepositoryImpl — Infrastructure implementation of PlatformRepository.
 *
 * This repository provides Platform Admin operations by calling the backend API
 * endpoints using privileged execution path for cross-tenant access.
 * All operations are logged to audit trail.
 *
 * **ENDPOINTS USED:**
 * - GET /api/admin/platform/metrics - Get platform-wide metrics
 * - GET /api/admin/platform/tenants - Query tenant overviews
 * - GET /api/admin/platform/tenants/:id - Get single tenant overview
 * - GET /api/admin/platform/security-events - Query security events
 * - GET /api/admin/platform/security-events/:id - Get single security event
 * - POST /api/admin/platform/security-events/:id/acknowledge - Acknowledge event
 * - GET /api/admin/platform/security-events/trend - Get security event trend
 * - GET /api/admin/platform/security-events/unacknowledged-count - Get unacknowledged count
 * - POST /api/admin/platform/impersonation/start - Start tenant impersonation
 * - POST /api/admin/platform/impersonation/end - End tenant impersonation
 *
 * **PRIVILEGED EXECUTION PATH:**
 * All operations use privileged execution path for cross-tenant access.
 * Access is validated server-side and logged to audit trail.
 *
 * **ERROR HANDLING:**
 * - Maps API errors to appropriate AppError types
 * - Returns DomainResult<T> for explicit success/error handling
 * - Never exposes internal error details to callers
 *
 * @see Requirements 19.1-19.11 (Platform Admin Dashboard)
 * @see Requirements 20.1-20.9 (Platform Admin Tenant Operations)
 * @see Requirements 21.1-21.10 (Security Event Alerts)
 * @see PlatformRepository interface for full contract
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError, validationError } from '@core/utils';
import type {
  PlatformRepository,
  GetPlatformMetricsInput,
  GetTenantsOverviewInput,
  GetSecurityEventsInput,
  AcknowledgeSecurityEventInput,
  GetSecurityEventTrendInput,
  ImpersonationResult,
  StartTenantImpersonationInput,
  EndTenantImpersonationInput,
  EndImpersonationResult,
} from '@core/domains/platform/repositories/PlatformRepository';
import type {
  PlatformMetrics,
  SystemHealth,
  TenantCountsByStatus as TenantStatusCounts,
} from '@core/domains/platform/entities/PlatformMetrics';
import type { LifecycleStatusValue as TenantLifecycleStatus } from '@core/domains/tenant/entities/TenantLifecycleStatus';
import type {
  TenantOverview,
  PaginatedTenantOverviews,
} from '@core/domains/platform/entities/TenantOverview';
import type {
  SecurityEvent,
  PaginatedSecurityEvents,
  SecurityEventTrend,
  SecurityEventTrendPoint,
  SecurityEventSeverity,
  SecurityEventType,
} from '@core/domains/platform/entities/SecurityEvent';
import type { HttpProtocol } from '@core/protocols';

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

/**
 * API response for system health.
 */
interface SystemHealthApiResponse {
  apiResponseTime: number;
  databaseLatency: number;
  errorRate: number;
  status: 'healthy' | 'degraded' | 'critical';
}

/**
 * API response for alert counts.
 */
interface AlertCountsApiResponse {
  failedPayments: number;
  securityEvents: number;
  rateLimitViolations: number;
  subscriptionsExpiringSoon: number;
}

/**
 * API response for platform metrics.
 */
interface PlatformMetricsApiResponse {
  tenantsByStatus: Record<string, number>;
  totalMembers: number;
  activeSessions: number;
  systemHealth: SystemHealthApiResponse;
  capturedAt: string;
  alertCounts?: AlertCountsApiResponse;
}

/**
 * API response for subscription plan info.
 */
interface SubscriptionPlanApiResponse {
  id: string;
  name: string;
  tier: string;
}

/**
 * API response for tenant overview.
 */
interface TenantOverviewApiResponse {
  id: string;
  name: string;
  status: string;
  memberCount: number;
  subscriptionPlan: SubscriptionPlanApiResponse;
  createdAt: string;
  lastActivityAt: string | null;
  logoUrl?: string;
  rtRwNumber?: string;
  region?: string;
  contactPerson?: string;
  contactEmail?: string;
  orgUnitCount?: number;
}

/**
 * API response for paginated tenant overviews.
 */
interface PaginatedTenantOverviewsApiResponse {
  tenants: TenantOverviewApiResponse[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/**
 * API response for security event.
 */
interface SecurityEventApiResponse {
  id: string;
  timestamp: string;
  type: string;
  severity: string;
  tenantId: string | null;
  tenantName?: string;
  userId: string | null;
  userName?: string;
  userEmail?: string;
  details: string;
  ipAddress: string;
  userAgent?: string;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedByName?: string;
  acknowledgedAt: string | null;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

/**
 * API response for paginated security events.
 */
interface PaginatedSecurityEventsApiResponse {
  events: SecurityEventApiResponse[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  unacknowledgedHighSeverityCount: number;
}

/**
 * API response for security event trend point.
 */
interface SecurityEventTrendPointApiResponse {
  timestamp: string;
  count: number;
  bySeverity: Record<string, number>;
}

/**
 * API response for security event trend.
 */
interface SecurityEventTrendApiResponse {
  period: '24h' | '7d' | '30d';
  dataPoints: SecurityEventTrendPointApiResponse[];
  totalCount: number;
}

/**
 * API error response.
 */
interface ApiErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * API response for starting impersonation.
 */
interface ImpersonationApiResponse {
  accessToken: string;
  expiresAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  impersonationSessionId: string;
}

/**
 * API response for ending impersonation.
 */
interface EndImpersonationApiResponse {
  success: boolean;
  sessionId: string;
  endedAt: string;
  impersonatedTenantId: string;
  impersonatedTenantName: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Maps API tenant status counts to domain TenantStatusCounts.
 */
function mapTenantStatusCountsFromApi(api: Record<string, number>): TenantStatusCounts {
  return {
    active: api.ACTIVE ?? 0,
    suspended: api.SUSPENDED ?? 0,
    closed: (api.CLOSING ?? 0) + (api.CLOSED ?? 0) + (api.PURGED ?? 0),
    provisioning: api.PROVISIONING ?? 0,
    total: (api.ACTIVE ?? 0) + (api.SUSPENDED ?? 0) + (api.CLOSING ?? 0) + (api.CLOSED ?? 0) + (api.PURGED ?? 0) + (api.PROVISIONING ?? 0),
  };
}

/**
 * Maps API system health to domain SystemHealth.
 */
function mapSystemHealthFromApi(api: SystemHealthApiResponse): SystemHealth {
  return {
    apiResponseTimeMs: api.apiResponseTime,
    databaseLatencyMs: api.databaseLatency,
    errorRatePercent: api.errorRate,
    status: api.status,
    collectedAt: new Date(),
  };
}

/**
 * Maps API platform metrics to domain PlatformMetrics.
 */
function mapPlatformMetricsFromApi(api: PlatformMetricsApiResponse): PlatformMetrics {
  return {
    tenantsByStatus: mapTenantStatusCountsFromApi(api.tenantsByStatus),
    totalMembers: api.totalMembers,
    activeSessions: api.activeSessions,
    systemHealth: mapSystemHealthFromApi(api.systemHealth),
    lastRefreshedAt: new Date(api.capturedAt),
    refreshIntervalSeconds: 60,
  };
}

/**
 * Maps API tenant overview to domain TenantOverview.
 */
function mapTenantOverviewFromApi(api: TenantOverviewApiResponse): TenantOverview {
  return {
    id: api.id,
    name: api.name,
    slug: api.name.toLowerCase().replace(/\s+/g, '-'),
    status: api.status as TenantLifecycleStatus,
    memberCount: api.memberCount,
    activeMemberCount: api.memberCount, // Default to member count
    subscription: {
      planId: api.subscriptionPlan.id,
      planName: api.subscriptionPlan.name,
      status: 'ACTIVE', // Default status
      isTrial: false,
      trialDaysRemaining: null,
      periodEndDate: null,
    },
    createdAt: new Date(api.createdAt),
    lastActivityAt: api.lastActivityAt ? new Date(api.lastActivityAt) : null,
    logoUrl: api.logoUrl ?? null,
    region: api.region ?? null,
    contactPerson: api.contactPerson ?? null,
    contactEmail: api.contactEmail ?? null,
    hasPendingAlerts: false,
    pendingAlertCount: 0,
  };
}

/**
 * Maps API paginated tenant overviews to domain PaginatedTenantOverviews.
 */
function mapPaginatedTenantOverviewsFromApi(
  api: PaginatedTenantOverviewsApiResponse,
): PaginatedTenantOverviews {
  return {
    tenants: api.tenants.map(mapTenantOverviewFromApi),
    page: api.page,
    pageSize: api.pageSize,
    totalCount: api.totalCount,
    totalPages: api.totalPages,
    hasNextPage: api.page < api.totalPages,
    hasPreviousPage: api.page > 1,
  };
}

/**
 * Maps API security event to domain SecurityEvent.
 */
function mapSecurityEventFromApi(api: SecurityEventApiResponse): SecurityEvent {
  return {
    id: api.id,
    timestamp: new Date(api.timestamp),
    type: api.type as SecurityEventType,
    severity: api.severity as SecurityEventSeverity,
    tenantId: api.tenantId,
    tenantName: api.tenantName,
    userId: api.userId,
    userName: api.userName,
    userEmail: api.userEmail,
    details: api.details,
    ipAddress: api.ipAddress,
    userAgent: api.userAgent,
    acknowledged: api.acknowledged,
    acknowledgedBy: api.acknowledgedBy,
    acknowledgedByName: api.acknowledgedByName,
    acknowledgedAt: api.acknowledgedAt ? new Date(api.acknowledgedAt) : null,
    metadata: api.metadata,
    correlationId: api.correlationId,
  };
}

/**
 * Maps API paginated security events to domain PaginatedSecurityEvents.
 */
function mapPaginatedSecurityEventsFromApi(
  api: PaginatedSecurityEventsApiResponse,
): PaginatedSecurityEvents {
  return {
    events: api.events.map(mapSecurityEventFromApi),
    page: api.page,
    pageSize: api.pageSize,
    totalCount: api.totalCount,
    totalPages: api.totalPages,
    hasNextPage: api.page < api.totalPages,
    hasPreviousPage: api.page > 1,
    unacknowledgedHighSeverityCount: api.unacknowledgedHighSeverityCount,
  };
}

/**
 * Maps API security event trend point to domain SecurityEventTrendPoint.
 */
function mapSecurityEventTrendPointFromApi(
  api: SecurityEventTrendPointApiResponse,
): SecurityEventTrendPoint {
  return {
    timestamp: new Date(api.timestamp),
    count: api.count,
    bySeverity: {
      critical: api.bySeverity.critical ?? 0,
      high: api.bySeverity.high ?? 0,
      medium: api.bySeverity.medium ?? 0,
      low: api.bySeverity.low ?? 0,
    },
  };
}

/**
 * Maps API security event trend to domain SecurityEventTrend.
 */
function mapSecurityEventTrendFromApi(
  api: SecurityEventTrendApiResponse,
): SecurityEventTrend {
  return {
    period: api.period,
    dataPoints: api.dataPoints.map(mapSecurityEventTrendPointFromApi),
    totalCount: api.totalCount,
  };
}

/**
 * Maps API impersonation result to domain ImpersonationResult.
 */
function mapImpersonationResultFromApi(
  api: ImpersonationApiResponse,
): ImpersonationResult {
  return {
    accessToken: api.accessToken,
    expiresAt: new Date(api.expiresAt),
    tenant: {
      id: api.tenant.id,
      name: api.tenant.name,
      slug: api.tenant.slug,
    },
    impersonationSessionId: api.impersonationSessionId,
  };
}

/**
 * Maps API end impersonation result to domain EndImpersonationResult.
 */
function mapEndImpersonationResultFromApi(
  api: EndImpersonationApiResponse,
): EndImpersonationResult {
  return {
    success: api.success,
    sessionId: api.sessionId,
    endedAt: new Date(api.endedAt),
    impersonatedTenantId: api.impersonatedTenantId,
    impersonatedTenantName: api.impersonatedTenantName,
  };
}

/**
 * Maps API error to DomainResult failure.
 */
function mapApiError<T>(error: unknown): DomainResult<T> {
  // Handle axios-like error response
  const errorResponse = error as {
    response?: { status?: number; data?: ApiErrorResponse };
  };
  const status = errorResponse?.response?.status;
  const data = errorResponse?.response?.data;

  if (status === 404) {
    return fail(
      notFoundError(
        data?.code ?? 'PLATFORM_RESOURCE_NOT_FOUND',
        data?.message ?? 'Resource not found',
      ),
    );
  }

  if (status === 400) {
    return fail(
      validationError(
        data?.code ?? 'VALIDATION_ERROR',
        data?.message ?? 'Invalid request',
      ),
    );
  }

  if (status === 403) {
    return fail({
      type: 'authorization',
      code: data?.code ?? 'AUTH_PLATFORM_ADMIN_REQUIRED',
      message: data?.message ?? 'Platform admin access required',
      userMessage: 'platform.unauthorized',
      retryable: false,
    });
  }

  // Generic technical error for unknown cases
  return fail(
    technicalError(
      data?.code ?? 'PLATFORM_API_ERROR',
      data?.message ?? 'Failed to process platform operation',
      { retryable: true },
    ),
  );
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Builds query parameters for tenant overview filters.
 */
function buildTenantOverviewParams(
  input: GetTenantsOverviewInput,
): URLSearchParams {
  const { queryOptions } = input;
  const { filters, page, pageSize, sortBy, sortOrder } = queryOptions;
  const params = new URLSearchParams();

  // Pagination
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));

  // Sorting
  params.set('sortBy', sortBy);
  params.set('sortOrder', sortOrder);

  // Filters
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.subscriptionTier) {
    params.set('subscriptionTier', filters.subscriptionTier);
  }
  if (filters.search) {
    params.set('search', filters.search);
  }
  if (filters.region) {
    params.set('region', filters.region);
  }

  return params;
}

/**
 * Builds query parameters for security event filters.
 */
function buildSecurityEventParams(
  input: GetSecurityEventsInput,
): URLSearchParams {
  const { queryOptions } = input;
  const { filters, page, pageSize, sortBy, sortOrder } = queryOptions;
  const params = new URLSearchParams();

  // Pagination
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));

  // Sorting
  params.set('sortBy', sortBy);
  params.set('sortOrder', sortOrder);

  // Filters
  if (filters.severities && filters.severities.length > 0) {
    params.set('severities', filters.severities.join(','));
  }
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    params.set('eventTypes', filters.eventTypes.join(','));
  }
  if (filters.tenantId) {
    params.set('tenantId', filters.tenantId);
  }
  if (filters.userId) {
    params.set('userId', filters.userId);
  }
  if (filters.acknowledged !== null && filters.acknowledged !== undefined) {
    params.set('acknowledged', String(filters.acknowledged));
  }
  if (filters.dateFrom) {
    params.set('dateFrom', filters.dateFrom.toISOString());
  }
  if (filters.dateTo) {
    params.set('dateTo', filters.dateTo.toISOString());
  }
  if (filters.ipAddress) {
    params.set('ipAddress', filters.ipAddress);
  }

  return params;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a PlatformRepository implementation.
 *
 * @param dependencies - The repository dependencies
 * @returns An implementation of PlatformRepository
 */
export const PlatformRepositoryImpl = ({
  httpProtocol,
}: {
  httpProtocol: HttpProtocol;
}): PlatformRepository => {
  const baseUrl = '/api/admin/platform';

  return {
    // -------------------------------------------------------------------------
    // Platform Metrics
    // -------------------------------------------------------------------------

    /**
     * Get platform-wide metrics.
     *
     * @see PlatformRepository.getPlatformMetrics
     * @see Requirements 19.3 (System-wide metrics)
     */
    async getPlatformMetrics(
      input?: GetPlatformMetricsInput,
    ): Promise<DomainResult<PlatformMetrics>> {
      try {
        const params = new URLSearchParams();

        if (input?.includeAlertCounts) {
          params.set('includeAlertCounts', 'true');
        }
        if (input?.forceRefresh) {
          params.set('forceRefresh', 'true');
        }

        const url = params.toString()
          ? `${baseUrl}/metrics?${params.toString()}`
          : `${baseUrl}/metrics`;

        const response = await httpProtocol.get<PlatformMetricsApiResponse>(url);

        return ok(mapPlatformMetricsFromApi(response));
      } catch (error) {
        return mapApiError<PlatformMetrics>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Tenant Overview
    // -------------------------------------------------------------------------

    /**
     * Get paginated tenant overviews with filtering and sorting.
     *
     * @see PlatformRepository.getTenantsOverview
     * @see Requirements 19.4-19.6 (Tenant overview table)
     */
    async getTenantsOverview(
      input: GetTenantsOverviewInput,
    ): Promise<DomainResult<PaginatedTenantOverviews>> {
      try {
        const params = buildTenantOverviewParams(input);

        const response = await httpProtocol.get<PaginatedTenantOverviewsApiResponse>(
          `${baseUrl}/tenants?${params.toString()}`,
        );

        return ok(mapPaginatedTenantOverviewsFromApi(response));
      } catch (error) {
        return mapApiError<PaginatedTenantOverviews>(error);
      }
    },

    /**
     * Get a single tenant's detailed information.
     *
     * @see PlatformRepository.getTenantOverviewById
     * @see Requirements 19.8 (Navigate to tenant detail)
     */
    async getTenantOverviewById(
      tenantId: string,
    ): Promise<DomainResult<TenantOverview | null>> {
      try {
        const response = await httpProtocol.get<TenantOverviewApiResponse>(
          `${baseUrl}/tenants/${tenantId}`,
        );

        return ok(mapTenantOverviewFromApi(response));
      } catch (error) {
        // Handle 404 as null (not found)
        const errorResponse = error as { response?: { status?: number } };
        if (errorResponse?.response?.status === 404) {
          return ok(null);
        }
        return mapApiError<TenantOverview | null>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Security Events
    // -------------------------------------------------------------------------

    /**
     * Get paginated security events with filtering and sorting.
     *
     * @see PlatformRepository.getSecurityEvents
     * @see Requirements 21.1-21.4 (Security Events section)
     */
    async getSecurityEvents(
      input: GetSecurityEventsInput,
    ): Promise<DomainResult<PaginatedSecurityEvents>> {
      try {
        const params = buildSecurityEventParams(input);

        const response = await httpProtocol.get<PaginatedSecurityEventsApiResponse>(
          `${baseUrl}/security-events?${params.toString()}`,
        );

        return ok(mapPaginatedSecurityEventsFromApi(response));
      } catch (error) {
        return mapApiError<PaginatedSecurityEvents>(error);
      }
    },

    /**
     * Get a single security event by ID.
     *
     * @see PlatformRepository.getSecurityEventById
     */
    async getSecurityEventById(
      eventId: string,
    ): Promise<DomainResult<SecurityEvent | null>> {
      try {
        const response = await httpProtocol.get<SecurityEventApiResponse>(
          `${baseUrl}/security-events/${eventId}`,
        );

        return ok(mapSecurityEventFromApi(response));
      } catch (error) {
        // Handle 404 as null (not found)
        const errorResponse = error as { response?: { status?: number } };
        if (errorResponse?.response?.status === 404) {
          return ok(null);
        }
        return mapApiError<SecurityEvent | null>(error);
      }
    },

    /**
     * Acknowledge a security event.
     *
     * @see PlatformRepository.acknowledgeSecurityEvent
     * @see Requirements 21.6-21.7 (Acknowledging events)
     */
    async acknowledgeSecurityEvent(
      input: AcknowledgeSecurityEventInput,
    ): Promise<DomainResult<SecurityEvent>> {
      try {
        const { eventId, acknowledgedBy, acknowledgedByName } = input;

        const response = await httpProtocol.post<SecurityEventApiResponse>(
          `${baseUrl}/security-events/${eventId}/acknowledge`,
          { acknowledgedBy, acknowledgedByName },
        );

        return ok(mapSecurityEventFromApi(response));
      } catch (error) {
        return mapApiError<SecurityEvent>(error);
      }
    },

    /**
     * Get security event trend data for charting.
     *
     * @see PlatformRepository.getSecurityEventTrend
     * @see Requirements 21.8 (Trend chart)
     */
    async getSecurityEventTrend(
      input: GetSecurityEventTrendInput,
    ): Promise<DomainResult<SecurityEventTrend>> {
      try {
        const { period, filters } = input;
        const params = new URLSearchParams({ period });

        if (filters?.tenantId) {
          params.set('tenantId', filters.tenantId);
        }
        if (filters?.severities && filters.severities.length > 0) {
          params.set('severities', filters.severities.join(','));
        }

        const response = await httpProtocol.get<SecurityEventTrendApiResponse>(
          `${baseUrl}/security-events/trend?${params.toString()}`,
        );

        return ok(mapSecurityEventTrendFromApi(response));
      } catch (error) {
        return mapApiError<SecurityEventTrend>(error);
      }
    },

    /**
     * Get count of unacknowledged high-severity security events.
     *
     * @see PlatformRepository.getUnacknowledgedHighSeverityCount
     * @see Requirements 21.5 (Visual alert badge for Critical/High severity)
     */
    async getUnacknowledgedHighSeverityCount(): Promise<DomainResult<number>> {
      try {
        const response = await httpProtocol.get<{ count: number }>(
          `${baseUrl}/security-events/unacknowledged-count`,
        );

        return ok(response.count);
      } catch (error) {
        return mapApiError<number>(error);
      }
    },

    // -------------------------------------------------------------------------
    // Tenant Impersonation Operations
    // -------------------------------------------------------------------------

    /**
     * Start tenant impersonation for platform admin support.
     *
     * @see PlatformRepository.startTenantImpersonation
     * @see Requirements 20.3-20.5 (Impersonation flow)
     */
    async startTenantImpersonation(
      input: StartTenantImpersonationInput,
    ): Promise<DomainResult<ImpersonationResult>> {
      try {
        const response = await httpProtocol.post<ImpersonationApiResponse>(
          `${baseUrl}/impersonation/start`,
          {
            actorUserId: input.actorUserId,
            actorEmail: input.actorEmail,
            tenantId: input.tenantId,
            durationMinutes: input.durationMinutes ?? 30,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          },
        );

        return ok(mapImpersonationResultFromApi(response));
      } catch (error) {
        return mapApiError<ImpersonationResult>(error);
      }
    },

    /**
     * End active tenant impersonation session.
     *
     * @see PlatformRepository.endTenantImpersonation
     * @see Requirements 20.5 (Exit impersonation restores context)
     */
    async endTenantImpersonation(
      input: EndTenantImpersonationInput,
    ): Promise<DomainResult<EndImpersonationResult>> {
      try {
        const response = await httpProtocol.post<EndImpersonationApiResponse>(
          `${baseUrl}/impersonation/end`,
          {
            actorUserId: input.actorUserId,
            impersonationSessionId: input.impersonationSessionId,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          },
        );

        return ok(mapEndImpersonationResultFromApi(response));
      } catch (error) {
        return mapApiError<EndImpersonationResult>(error);
      }
    },
  };
};
