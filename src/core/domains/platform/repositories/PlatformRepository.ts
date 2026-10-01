/**
 * PlatformRepository — Repository interface for Platform Admin operations.
 *
 * This interface defines the contract for platform-wide administrative operations,
 * including metrics retrieval, tenant overview queries, and security event management.
 * All operations require PLATFORM_ADMIN role and use privileged execution paths.
 *
 * All methods return DomainResult<T> for explicit success/error handling.
 *
 * SECURITY CONSIDERATIONS:
 * - All operations require PLATFORM_ADMIN role verification
 * - Cross-tenant data access via privileged execution path
 * - All actions logged to audit trail with full context
 * - Sensitive data is aggregated, not exposed individually
 *
 * @see Requirements 19.1-19.11 (Platform Admin Dashboard)
 * @see Requirements 20.1-20.9 (Platform Admin Tenant Operations)
 * @see Requirements 21.1-21.10 (Security Event Alerts)
 * @see Design Components > 11. Platform Admin Dashboard
 */

import type { DomainResult } from '@core/utils';
import type {
  PlatformMetrics,
} from '../entities/PlatformMetrics';
import type {
  TenantOverview,
  PaginatedTenantOverviews,
  TenantOverviewFilters,
  TenantOverviewSort,
} from '../entities/TenantOverview';
import type {
  SecurityEvent,
  PaginatedSecurityEvents,
  SecurityEventTrend,
  SecurityEventFilters,
  SecurityEventSort,
  SecurityEventSeverity,
} from '../entities/SecurityEvent';

// ---------------------------------------------------------------------------
// Simplified Input Types (for backward compatibility with use cases)
// ---------------------------------------------------------------------------

/**
 * Input for getting platform metrics.
 * Used by GetPlatformMetricsUseCase.
 */
export interface GetPlatformMetricsInput {
  /**
   * Whether to include alert counts in response.
   */
  readonly includeAlertCounts?: boolean;

  /**
   * Whether to force a fresh calculation (bypass cache).
   */
  readonly forceRefresh?: boolean;
}

/**
 * Input for getting tenant overviews.
 * Used by GetTenantsOverviewUseCase.
 */
export interface GetTenantsOverviewInput {
  /**
   * Filter criteria.
   */
  readonly filters?: TenantOverviewFilters;

  /**
   * Sort configuration.
   */
  readonly sort?: TenantOverviewSort;

  /**
   * Page number (1-indexed).
   */
  readonly page?: number;

  /**
   * Page size (default: 25).
   */
  readonly pageSize?: number;
}

/**
 * Input for getting security events.
 * Used by GetSecurityEventsUseCase.
 */
export interface GetSecurityEventsInput {
  /**
   * Filter criteria.
   */
  readonly filters?: SecurityEventFilters;

  /**
   * Sort configuration.
   */
  readonly sort?: SecurityEventSort;

  /**
   * Page number (1-indexed).
   */
  readonly page?: number;

  /**
   * Page size (default: 25).
   */
  readonly pageSize?: number;
}

/**
 * Input for acknowledging a security event.
 */
export interface AcknowledgeSecurityEventInput {
  /**
   * ID of the event to acknowledge.
   */
  readonly eventId: string;

  /**
   * Optional note from the acknowledging admin.
   */
  readonly note?: string;
}

/**
 * Input for getting security event trend data.
 */
export interface GetSecurityEventTrendInput {
  /**
   * Start of date range.
   */
  readonly dateFrom: Date;

  /**
   * End of date range.
   */
  readonly dateTo: Date;

  /**
   * Granularity of trend data.
   */
  readonly granularity: 'hourly' | 'daily';
}

// ---------------------------------------------------------------------------
// Impersonation Types
// ---------------------------------------------------------------------------

/**
 * Result of starting tenant impersonation.
 *
 * @see Requirements 20.3-20.5 (Impersonation)
 */
export interface ImpersonationResult {
  /**
   * New access token for the impersonated tenant context.
   */
  readonly accessToken: string;

  /**
   * Token expiry timestamp.
   */
  readonly expiresAt: Date;

  /**
   * Impersonated tenant details.
   */
  readonly tenant: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };

  /**
   * Impersonation session ID for audit trail.
   */
  readonly impersonationSessionId: string;
}

// ---------------------------------------------------------------------------
// Platform Admin Operation Inputs
// ---------------------------------------------------------------------------

/**
 * Input for force suspending a tenant.
 *
 * @see Requirements 20.6
 */
export interface ForceSuspendTenantInput {
  /**
   * Tenant ID to suspend.
   */
  readonly tenantId: string;

  /**
   * Reason for force suspension (required for audit).
   */
  readonly reason: string;

  /**
   * IP address of the admin request (for audit).
   */
  readonly ipAddress?: string;
}

/**
 * Input for force closing a tenant.
 *
 * @see Requirements 20.7
 */
export interface ForceCloseTenantInput {
  /**
   * Tenant ID to close.
   */
  readonly tenantId: string;

  /**
   * Confirmation text (must match "CLOSE {tenant-name}").
   */
  readonly confirmationText: string;

  /**
   * Reason for force closure (optional, for audit).
   */
  readonly reason?: string;

  /**
   * IP address of the admin request (for audit).
   */
  readonly ipAddress?: string;
}

/**
 * Input for resetting a tenant's token version.
 *
 * @see Requirements 20.8
 */
export interface ResetTokenVersionInput {
  /**
   * Tenant ID to reset tokens for.
   */
  readonly tenantId: string;

  /**
   * Reason for reset (optional, for audit).
   */
  readonly reason?: string;

  /**
   * IP address of the admin request (for audit).
   */
  readonly ipAddress?: string;
}

// ---------------------------------------------------------------------------
// Impersonation Input Types
// ---------------------------------------------------------------------------

/**
 * Input for starting tenant impersonation.
 *
 * @see Requirements 20.3-20.5
 */
export interface StartTenantImpersonationInput {
  /**
   * Platform Admin user ID performing the impersonation.
   */
  readonly actorUserId: string;

  /**
   * Platform Admin email (for audit display).
   */
  readonly actorEmail?: string;

  /**
   * Target tenant ID to impersonate.
   */
  readonly tenantId: string;

  /**
   * Duration of impersonation in minutes (default: 30, max: 60).
   */
  readonly durationMinutes?: number;

  /**
   * IP address of the admin request (for audit).
   */
  readonly ipAddress?: string;

  /**
   * User agent of the admin request (for audit).
   */
  readonly userAgent?: string;
}

/**
 * Input for ending tenant impersonation.
 *
 * @see Requirements 20.5
 */
export interface EndTenantImpersonationInput {
  /**
   * Platform Admin user ID ending the impersonation.
   */
  readonly actorUserId: string;

  /**
   * Impersonation session ID to end.
   */
  readonly impersonationSessionId: string;

  /**
   * IP address of the admin request (for audit).
   */
  readonly ipAddress?: string;

  /**
   * User agent of the admin request (for audit).
   */
  readonly userAgent?: string;
}

/**
 * Result of ending impersonation.
 */
export interface EndImpersonationResult {
  /**
   * Whether the session was successfully ended.
   */
  readonly success: boolean;

  /**
   * ID of the ended session.
   */
  readonly sessionId: string;

  /**
   * Timestamp when the session ended.
   */
  readonly endedAt: Date;

  /**
   * ID of the tenant that was impersonated.
   */
  readonly impersonatedTenantId: string;

  /**
   * Name of the tenant that was impersonated.
   */
  readonly impersonatedTenantName: string;
}

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

/**
 * Repository interface for Platform Admin operations.
 *
 * All operations are restricted to PLATFORM_ADMIN role.
 * Authorization is handled at the API layer; the repository trusts
 * that the caller has been authorized.
 *
 * Note: Methods use simplified signatures without actorId since
 * authorization is handled by the API layer via privileged execution path.
 */
export interface PlatformRepository {
  // ---------------------------------------------------------------------------
  // Platform Metrics Operations
  // ---------------------------------------------------------------------------

  /**
   * Get platform-wide metrics for the dashboard.
   *
   * Returns aggregated statistics across all tenants including
   * tenant counts by status, member counts, session counts, and system health.
   *
   * @param input - Query options (includeAlertCounts, forceRefresh)
   * @returns Platform metrics or error
   *
   * @see Requirements 19.3
   */
  getPlatformMetrics(
    input?: GetPlatformMetricsInput,
  ): Promise<DomainResult<PlatformMetrics>>;

  // ---------------------------------------------------------------------------
  // Tenant Overview Operations
  // ---------------------------------------------------------------------------

  /**
   * Get paginated list of tenant overviews.
   *
   * Returns tenant summaries for the dashboard table with support for
   * filtering, sorting, and pagination.
   *
   * @param input - Query options (filters, sort, pagination)
   * @returns Paginated tenant overviews or error
   *
   * @see Requirements 19.4-19.6
   */
  getTenantsOverview(
    input: GetTenantsOverviewInput,
  ): Promise<DomainResult<PaginatedTenantOverviews>>;

  /**
   * Get a single tenant's overview by ID.
   *
   * @param tenantId - ID of the tenant to retrieve
   * @returns Tenant overview or null if not found
   *
   * @see Requirements 19.8
   */
  getTenantOverviewById(
    tenantId: string,
  ): Promise<DomainResult<TenantOverview | null>>;

  // ---------------------------------------------------------------------------
  // Security Event Operations
  // ---------------------------------------------------------------------------

  /**
   * Get paginated security events.
   *
   * Returns security events for the Security Events section.
   *
   * @param input - Query options (filters, sort, pagination)
   * @returns Paginated security events or error
   *
   * @see Requirements 21.2-21.4
   */
  getSecurityEvents(
    input: GetSecurityEventsInput,
  ): Promise<DomainResult<PaginatedSecurityEvents>>;

  /**
   * Get a single security event by ID.
   *
   * @param eventId - ID of the event to retrieve
   * @returns Security event or null if not found
   */
  getSecurityEventById(
    eventId: string,
  ): Promise<DomainResult<SecurityEvent | null>>;

  /**
   * Acknowledge a security event.
   *
   * Marks the event as acknowledged and logs the action to audit trail.
   *
   * @param input - Acknowledgment details (eventId, note)
   * @returns Success or error
   *
   * @see Requirements 21.6, 21.7
   */
  acknowledgeSecurityEvent(
    input: AcknowledgeSecurityEventInput,
  ): Promise<DomainResult<void>>;

  /**
   * Get security event trend data for chart display.
   *
   * Returns time-series data of event counts for visualization.
   *
   * @param input - Trend query parameters (dateFrom, dateTo, granularity)
   * @returns Trend data or error
   *
   * @see Requirements 21.8
   */
  getSecurityEventTrend(
    input: GetSecurityEventTrendInput,
  ): Promise<DomainResult<SecurityEventTrend>>;

  /**
   * Get unacknowledged event counts by severity.
   *
   * Used for badge display on dashboard tab.
   *
   * @returns Counts by severity or error
   *
   * @see Requirements 21.5
   */
  getUnacknowledgedEventCounts(): Promise<
    DomainResult<Record<SecurityEventSeverity, number>>
  >;

  // ---------------------------------------------------------------------------
  // Tenant Impersonation Operations
  // ---------------------------------------------------------------------------

  /**
   * Start tenant impersonation for platform admin support.
   *
   * Creates an impersonation session and issues a new access token
   * scoped to the impersonated tenant. All actions during impersonation
   * are tagged with the impersonation flag.
   *
   * @param input - Impersonation details (actorUserId, tenantId, durationMinutes)
   * @returns Impersonation result with token and session details, or error
   *
   * @see Requirements 20.3-20.5 (Impersonation flow)
   * @see Requirements 20.9 (All operations logged to audit trail)
   */
  startTenantImpersonation(
    input: StartTenantImpersonationInput,
  ): Promise<DomainResult<ImpersonationResult>>;

  /**
   * End active tenant impersonation session.
   *
   * Ends the impersonation session and logs the action to audit trail.
   * The UI should restore the original PLATFORM_ADMIN context.
   *
   * @param input - End impersonation details (actorUserId, sessionId)
   * @returns End impersonation result or error
   *
   * @see Requirements 20.5 (Exit impersonation restores context)
   * @see Requirements 20.9 (All operations logged to audit trail)
   */
  endTenantImpersonation(
    input: EndTenantImpersonationInput,
  ): Promise<DomainResult<EndImpersonationResult>>;
}

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

/**
 * Error codes specific to platform operations.
 */
export const PLATFORM_ERROR_CODES = {
  // Authorization
  NOT_PLATFORM_ADMIN: 'PLATFORM_NOT_PLATFORM_ADMIN',
  IMPERSONATION_ACTIVE: 'PLATFORM_IMPERSONATION_ACTIVE',
  IMPERSONATION_NOT_FOUND: 'PLATFORM_IMPERSONATION_NOT_FOUND',

  // Tenant operations
  TENANT_NOT_FOUND: 'PLATFORM_TENANT_NOT_FOUND',
  TENANT_ALREADY_SUSPENDED: 'PLATFORM_TENANT_ALREADY_SUSPENDED',
  TENANT_ALREADY_CLOSED: 'PLATFORM_TENANT_ALREADY_CLOSED',
  INVALID_CONFIRMATION: 'PLATFORM_INVALID_CONFIRMATION',

  // Security events
  EVENT_NOT_FOUND: 'PLATFORM_EVENT_NOT_FOUND',
  EVENT_ALREADY_ACKNOWLEDGED: 'PLATFORM_EVENT_ALREADY_ACKNOWLEDGED',
  THRESHOLD_NOT_FOUND: 'PLATFORM_THRESHOLD_NOT_FOUND',

  // General
  METRICS_UNAVAILABLE: 'PLATFORM_METRICS_UNAVAILABLE',
  PROVISIONING_FAILED: 'PLATFORM_PROVISIONING_FAILED',
} as const;
