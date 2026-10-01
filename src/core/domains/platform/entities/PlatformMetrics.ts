/**
 * PlatformMetrics — Domain entity representing system-wide platform metrics
 * for the Platform Admin Dashboard.
 *
 * Contains aggregated counts, session data, and system health indicators
 * that provide PLATFORM_ADMIN users with an overview of platform status.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 19.3 (Platform Dashboard system-wide metrics)
 * @see Design Components > 11. Platform Admin Dashboard > PlatformDashboardViewModel
 */

import type { LifecycleStatusValue } from '@core/domains/tenant/entities/TenantLifecycleStatus';

// ---------------------------------------------------------------------------
// System Health Metrics
// ---------------------------------------------------------------------------

/**
 * System health indicators for platform monitoring.
 *
 * @see Requirements 19.3 (API response time, database latency, error rate)
 */
export interface SystemHealth {
  /**
   * Average API response time in milliseconds.
   * Lower is better; alerts may trigger above thresholds.
   */
  readonly apiResponseTimeMs: number;

  /**
   * Average database query latency in milliseconds.
   * Lower is better; indicates database performance.
   */
  readonly databaseLatencyMs: number;

  /**
   * Error rate as a percentage (0-100).
   * Percentage of requests that resulted in 5xx errors.
   */
  readonly errorRatePercent: number;

  /**
   * Overall health status derived from metrics.
   */
  readonly status: SystemHealthStatus;

  /**
   * Timestamp when these metrics were collected.
   */
  readonly collectedAt: Date;
}

/**
 * System health status levels.
 */
export type SystemHealthStatus = 'healthy' | 'degraded' | 'critical';

// ---------------------------------------------------------------------------
// Tenant Statistics
// ---------------------------------------------------------------------------

/**
 * Tenant counts by lifecycle status.
 *
 * @see Requirements 19.3 (Total tenant count by status)
 */
export interface TenantCountsByStatus {
  /**
   * Number of tenants currently in ACTIVE status.
   */
  readonly active: number;

  /**
   * Number of tenants currently in SUSPENDED status.
   */
  readonly suspended: number;

  /**
   * Number of tenants in CLOSING, CLOSED, or PURGED status.
   * Grouped as "closed" for dashboard display.
   */
  readonly closed: number;

  /**
   * Number of tenants currently in PROVISIONING status.
   */
  readonly provisioning: number;

  /**
   * Total number of tenants across all statuses.
   */
  readonly total: number;
}

// ---------------------------------------------------------------------------
// Main Entity
// ---------------------------------------------------------------------------

/**
 * PlatformMetrics entity — aggregated platform-wide statistics for admin dashboard.
 *
 * This entity provides a snapshot of the entire platform's health and usage,
 * displayed on the Platform Admin Dashboard.
 *
 * INVARIANTS:
 * - All counts are non-negative integers
 * - Health metrics are within valid ranges
 * - Refresh timestamp indicates data freshness
 *
 * SECURITY CONSIDERATIONS:
 * - Access restricted to PLATFORM_ADMIN role only
 * - All data fetched via privileged execution path
 * - Counts are aggregated; no individual tenant data exposed directly
 *
 * @see Requirements 19.3
 * @see Design > PlatformDashboardViewModel > PlatformMetrics interface
 */
export interface PlatformMetrics {
  /**
   * Tenant counts grouped by lifecycle status.
   */
  readonly tenantsByStatus: TenantCountsByStatus;

  /**
   * Total member count across all tenants.
   */
  readonly totalMembers: number;

  /**
   * Total active sessions count across all tenants.
   * Includes currently logged-in users.
   */
  readonly activeSessions: number;

  /**
   * System health indicators.
   */
  readonly systemHealth: SystemHealth;

  /**
   * Timestamp when these metrics were last refreshed.
   * Used for staleness detection and refresh indicator.
   */
  readonly lastRefreshedAt: Date;

  /**
   * Interval in seconds for auto-refresh.
   * Default is 60 seconds per Requirements 19.10.
   */
  readonly refreshIntervalSeconds: number;
}

// ---------------------------------------------------------------------------
// Alert/Warning Types
// ---------------------------------------------------------------------------

/**
 * System alert types for Platform Dashboard.
 *
 * @see Requirements 19.7 (Recent system-wide alerts)
 */
export type SystemAlertType =
  | 'failed_payment'
  | 'security_event'
  | 'rate_limit_violation'
  | 'subscription_expiring'
  | 'high_error_rate'
  | 'slow_response_time'
  | 'database_latency';

/**
 * Alert severity levels.
 */
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * A system alert displayed on the Platform Dashboard.
 */
export interface SystemAlert {
  /**
   * Unique identifier for this alert.
   */
  readonly id: string;

  /**
   * Type of alert.
   */
  readonly type: SystemAlertType;

  /**
   * Severity level of the alert.
   */
  readonly severity: AlertSeverity;

  /**
   * Human-readable alert title.
   */
  readonly title: string;

  /**
   * Detailed alert message.
   */
  readonly message: string;

  /**
   * Tenant ID if alert is tenant-specific.
   */
  readonly tenantId: string | null;

  /**
   * Tenant name for display purposes.
   */
  readonly tenantName: string | null;

  /**
   * Timestamp when the alert was created.
   */
  readonly createdAt: Date;

  /**
   * Whether the alert has been acknowledged by an admin.
   */
  readonly acknowledged: boolean;

  /**
   * User ID who acknowledged the alert.
   */
  readonly acknowledgedBy: string | null;

  /**
   * Timestamp when the alert was acknowledged.
   */
  readonly acknowledgedAt: Date | null;

  /**
   * Additional metadata for the alert.
   */
  readonly metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

/**
 * Options for querying platform metrics.
 */
export interface GetPlatformMetricsOptions {
  /**
   * Whether to include system health metrics.
   * Default: true
   */
  readonly includeHealthMetrics?: boolean;

  /**
   * Whether to force a fresh calculation (bypass cache).
   * Default: false
   */
  readonly forceRefresh?: boolean;
}

/**
 * Options for querying system alerts.
 */
export interface GetSystemAlertsOptions {
  /**
   * Filter by severity levels.
   */
  readonly severities?: readonly AlertSeverity[];

  /**
   * Filter by alert types.
   */
  readonly types?: readonly SystemAlertType[];

  /**
   * Whether to include acknowledged alerts.
   * Default: false (show only unacknowledged)
   */
  readonly includeAcknowledged?: boolean;

  /**
   * Maximum number of alerts to return.
   * Default: 20
   */
  readonly limit?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default refresh interval for platform metrics in seconds.
 *
 * @see Requirements 19.10
 */
export const DEFAULT_METRICS_REFRESH_INTERVAL = 60;

/**
 * Health threshold constants.
 */
export const HEALTH_THRESHOLDS = {
  /** API response time threshold for "degraded" status (ms) */
  API_RESPONSE_DEGRADED: 500,
  /** API response time threshold for "critical" status (ms) */
  API_RESPONSE_CRITICAL: 2000,
  /** Database latency threshold for "degraded" status (ms) */
  DB_LATENCY_DEGRADED: 100,
  /** Database latency threshold for "critical" status (ms) */
  DB_LATENCY_CRITICAL: 500,
  /** Error rate threshold for "degraded" status (%) */
  ERROR_RATE_DEGRADED: 1,
  /** Error rate threshold for "critical" status (%) */
  ERROR_RATE_CRITICAL: 5,
} as const;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Determine system health status based on metrics.
 *
 * @param health - System health metrics
 * @returns Calculated health status
 */
export function calculateHealthStatus(
  health: Omit<SystemHealth, 'status' | 'collectedAt'>,
): SystemHealthStatus {
  // Check for critical conditions first
  if (
    health.apiResponseTimeMs >= HEALTH_THRESHOLDS.API_RESPONSE_CRITICAL ||
    health.databaseLatencyMs >= HEALTH_THRESHOLDS.DB_LATENCY_CRITICAL ||
    health.errorRatePercent >= HEALTH_THRESHOLDS.ERROR_RATE_CRITICAL
  ) {
    return 'critical';
  }

  // Check for degraded conditions
  if (
    health.apiResponseTimeMs >= HEALTH_THRESHOLDS.API_RESPONSE_DEGRADED ||
    health.databaseLatencyMs >= HEALTH_THRESHOLDS.DB_LATENCY_DEGRADED ||
    health.errorRatePercent >= HEALTH_THRESHOLDS.ERROR_RATE_DEGRADED
  ) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Get i18n key for system health status.
 */
export function getHealthStatusI18nKey(status: SystemHealthStatus): string {
  return `platform.health_status.${status}`;
}

/**
 * Get i18n key for alert type.
 */
export function getAlertTypeI18nKey(type: SystemAlertType): string {
  return `platform.alert_type.${type}`;
}

/**
 * Get i18n key for alert severity.
 */
export function getAlertSeverityI18nKey(severity: AlertSeverity): string {
  return `platform.alert_severity.${severity}`;
}

/**
 * Check if an alert should trigger a visual badge.
 *
 * @see Requirements 21.5 (Critical/High severity badge)
 */
export function shouldShowAlertBadge(severity: AlertSeverity): boolean {
  return severity === 'critical' || severity === 'high';
}
