/**
 * SecurityEvent — Domain entity representing security-related events
 * for the Platform Admin Security Events section.
 *
 * This entity represents security events logged by SecurityEventLogger,
 * displayed in the Security Events section of the Platform Dashboard.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 21.1-21.10 (Security Event Alerts)
 * @see Design Components > 11. Platform Admin Dashboard > SecurityEvent interface
 */

// ---------------------------------------------------------------------------
// Security Event Types
// ---------------------------------------------------------------------------

/**
 * Types of security events logged by the platform.
 *
 * @see Requirements 21.2 (Security event types)
 */
export type SecurityEventType =
  | 'failed_login_attempt'
  | 'token_reuse_detected'
  | 'unauthorized_access'
  | 'rate_limit_violation'
  | 'cross_tenant_access_blocked'
  | 'token_version_reset'
  | 'suspicious_activity'
  | 'password_reset_abuse'
  | 'bulk_operation_anomaly'
  | 'api_abuse_detected';

/**
 * All valid security event types.
 */
export const ALL_SECURITY_EVENT_TYPES: readonly SecurityEventType[] = [
  'failed_login_attempt',
  'token_reuse_detected',
  'unauthorized_access',
  'rate_limit_violation',
  'cross_tenant_access_blocked',
  'token_version_reset',
  'suspicious_activity',
  'password_reset_abuse',
  'bulk_operation_anomaly',
  'api_abuse_detected',
] as const;

// ---------------------------------------------------------------------------
// Severity Levels
// ---------------------------------------------------------------------------

/**
 * Security event severity levels.
 *
 * @see Requirements 21.3 (Severity display)
 * @see Requirements 21.4 (Severity filtering)
 */
export type SecurityEventSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * All severity levels ordered from highest to lowest.
 */
export const SECURITY_SEVERITY_LEVELS: readonly SecurityEventSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
] as const;

/**
 * Numeric priority for severity levels (lower = more severe).
 */
export const SEVERITY_PRIORITY: Record<SecurityEventSeverity, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
} as const;

// ---------------------------------------------------------------------------
// Main Entity
// ---------------------------------------------------------------------------

/**
 * SecurityEvent entity — individual security event for Platform Dashboard.
 *
 * Each entry represents a security-related event that may require attention
 * from platform administrators.
 *
 * INVARIANTS:
 * - Event ID is unique across the platform
 * - Timestamp is in UTC
 * - Severity is one of the defined levels
 * - Acknowledgment data is consistent (if acknowledged, must have actor and timestamp)
 *
 * SECURITY CONSIDERATIONS:
 * - Access restricted to PLATFORM_ADMIN role only
 * - IP addresses are logged for security analysis
 * - Event details may contain sensitive information; handle with care
 * - Acknowledgment provides audit trail of admin response
 *
 * @see Requirements 21.1-21.10
 * @see Design > SecurityEvent interface
 */
export interface SecurityEvent {
  /**
   * Unique identifier for this security event.
   */
  readonly id: string;

  /**
   * Timestamp when the event occurred (UTC).
   *
   * @see Requirements 21.3 (timestamp display)
   */
  readonly timestamp: Date;

  /**
   * Type of security event.
   *
   * @see Requirements 21.2 (event types)
   */
  readonly type: SecurityEventType;

  /**
   * Severity level of the event.
   *
   * @see Requirements 21.3, 21.4 (severity display and filtering)
   */
  readonly severity: SecurityEventSeverity;

  /**
   * Tenant ID where the event occurred.
   * NULL for platform-wide events not tied to a specific tenant.
   *
   * @see Requirements 21.3 (tenant column)
   */
  readonly tenantId: string | null;

  /**
   * Tenant name for display purposes.
   */
  readonly tenantName: string | null;

  /**
   * User ID associated with the event.
   * NULL for events not tied to a specific user.
   *
   * @see Requirements 21.3 (user column)
   */
  readonly userId: string | null;

  /**
   * User name/email for display purposes.
   */
  readonly userName: string | null;

  /**
   * User email for display purposes.
   */
  readonly userEmail: string | null;

  /**
   * Human-readable description of the event.
   *
   * @see Requirements 21.3 (details column)
   */
  readonly details: string;

  /**
   * IP address from which the event originated.
   *
   * @see Requirements 21.3 (IP address display)
   */
  readonly ipAddress: string;

  /**
   * User agent string (browser/client info).
   */
  readonly userAgent: string | null;

  /**
   * Country code derived from IP address (if available).
   */
  readonly countryCode: string | null;

  /**
   * Additional structured metadata about the event.
   * Content varies by event type.
   */
  readonly metadata: Record<string, unknown>;

  /**
   * Whether the event has been acknowledged by an admin.
   *
   * @see Requirements 21.6 (acknowledgment support)
   */
  readonly acknowledged: boolean;

  /**
   * User ID of the admin who acknowledged the event.
   */
  readonly acknowledgedBy: string | null;

  /**
   * Name of the admin who acknowledged the event.
   */
  readonly acknowledgedByName: string | null;

  /**
   * Timestamp when the event was acknowledged.
   *
   * @see Requirements 21.7 (acknowledgment logging)
   */
  readonly acknowledgedAt: Date | null;

  /**
   * Correlation ID for linking related events.
   */
  readonly correlationId: string | null;

  /**
   * Request ID for tracing to logs.
   */
  readonly requestId: string | null;
}

// ---------------------------------------------------------------------------
// Paginated Result
// ---------------------------------------------------------------------------

/**
 * Paginated result for security event queries.
 */
export interface PaginatedSecurityEvents {
  /**
   * List of security events for the current page.
   */
  readonly events: readonly SecurityEvent[];

  /**
   * Total count of events matching the query.
   */
  readonly totalCount: number;

  /**
   * Current page number (1-indexed).
   */
  readonly page: number;

  /**
   * Number of items per page.
   */
  readonly pageSize: number;

  /**
   * Total number of pages.
   */
  readonly totalPages: number;

  /**
   * Whether there are more pages after current.
   */
  readonly hasNextPage: boolean;

  /**
   * Whether there are pages before current.
   */
  readonly hasPreviousPage: boolean;

  /**
   * Count of unacknowledged events (for badge display).
   */
  readonly unacknowledgedCount: number;

  /**
   * Count of critical/high severity unacknowledged events.
   */
  readonly criticalUnacknowledgedCount: number;
}

// ---------------------------------------------------------------------------
// Query and Filter Types
// ---------------------------------------------------------------------------

/**
 * Filter options for security event queries.
 *
 * @see Requirements 21.4 (severity filtering)
 */
export interface SecurityEventFilters {
  /**
   * Filter by severity levels.
   * If empty/undefined, returns all severities.
   */
  readonly severities?: readonly SecurityEventSeverity[];

  /**
   * Filter by event types.
   * If empty/undefined, returns all types.
   */
  readonly types?: readonly SecurityEventType[];

  /**
   * Filter by tenant ID.
   */
  readonly tenantId?: string | null;

  /**
   * Filter by user ID.
   */
  readonly userId?: string | null;

  /**
   * Filter by date range - start.
   */
  readonly dateFrom?: Date | null;

  /**
   * Filter by date range - end.
   */
  readonly dateTo?: Date | null;

  /**
   * Filter by acknowledgment status.
   * true = only acknowledged, false = only unacknowledged, undefined = all
   */
  readonly acknowledged?: boolean;

  /**
   * Filter by IP address.
   */
  readonly ipAddress?: string | null;

  /**
   * Text search in details/metadata.
   */
  readonly search?: string | null;
}

/**
 * Sort options for security event queries.
 */
export interface SecurityEventSort {
  /**
   * Column to sort by.
   */
  readonly column: SecurityEventSortColumn;

  /**
   * Sort direction.
   */
  readonly direction: 'asc' | 'desc';
}

/**
 * Columns available for sorting.
 */
export type SecurityEventSortColumn =
  | 'timestamp'
  | 'severity'
  | 'type'
  | 'tenantName'
  | 'userName';

/**
 * Query options for security events.
 */
export interface SecurityEventQueryOptions {
  /**
   * Filter criteria.
   */
  readonly filters?: SecurityEventFilters;

  /**
   * Sort configuration.
   * Default: timestamp desc
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

// ---------------------------------------------------------------------------
// Acknowledgment Input
// ---------------------------------------------------------------------------

/**
 * Input for acknowledging a security event.
 *
 * @see Requirements 21.6, 21.7
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
 * Input for bulk acknowledging security events.
 */
export interface BulkAcknowledgeSecurityEventsInput {
  /**
   * IDs of events to acknowledge.
   */
  readonly eventIds: readonly string[];

  /**
   * Optional note applied to all acknowledged events.
   */
  readonly note?: string;
}

// ---------------------------------------------------------------------------
// Trend Data
// ---------------------------------------------------------------------------

/**
 * Security event trend data point for chart display.
 *
 * @see Requirements 21.8 (trend chart)
 */
export interface SecurityEventTrendPoint {
  /**
   * Time bucket (e.g., start of hour/day).
   */
  readonly timestamp: Date;

  /**
   * Total event count in this bucket.
   */
  readonly count: number;

  /**
   * Counts by severity.
   */
  readonly bySeverity: Record<SecurityEventSeverity, number>;

  /**
   * Counts by type.
   */
  readonly byType: Record<SecurityEventType, number>;
}

/**
 * Security event trend data for chart.
 */
export interface SecurityEventTrend {
  /**
   * Time-series data points.
   */
  readonly points: readonly SecurityEventTrendPoint[];

  /**
   * Granularity of the data (hourly, daily).
   */
  readonly granularity: 'hourly' | 'daily';

  /**
   * Date range covered.
   */
  readonly dateFrom: Date;
  readonly dateTo: Date;
}

// ---------------------------------------------------------------------------
// Alert Threshold Configuration
// ---------------------------------------------------------------------------

/**
 * Alert threshold configuration for automatic notifications.
 *
 * @see Requirements 21.9 (configurable alert thresholds)
 * @see Requirements 21.10 (edge-triggered notifications)
 */
export interface AlertThresholdConfig {
  /**
   * Unique identifier for this threshold config.
   */
  readonly id: string;

  /**
   * Event type(s) this threshold applies to.
   * Empty = all types.
   */
  readonly eventTypes: readonly SecurityEventType[];

  /**
   * Minimum severity to include in count.
   */
  readonly minimumSeverity: SecurityEventSeverity;

  /**
   * Time window in minutes for counting events.
   */
  readonly windowMinutes: number;

  /**
   * Event count threshold that triggers notification.
   */
  readonly threshold: number;

  /**
   * Whether this threshold is currently enabled.
   */
  readonly enabled: boolean;

  /**
   * Notification channels (e.g., email, slack).
   */
  readonly notificationChannels: readonly string[];

  /**
   * Last time this threshold was crossed.
   */
  readonly lastTriggeredAt: Date | null;

  /**
   * Whether currently in triggered state.
   * Used for edge-triggered logic.
   */
  readonly isTriggered: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default page size for security event queries.
 */
export const DEFAULT_SECURITY_EVENT_PAGE_SIZE = 25;

/**
 * Maximum page size for security event queries.
 */
export const MAX_SECURITY_EVENT_PAGE_SIZE = 100;

/**
 * Default time window for trend charts (in hours).
 */
export const DEFAULT_TREND_WINDOW_HOURS = 24;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get i18n key for security event type.
 */
export function getSecurityEventTypeI18nKey(type: SecurityEventType): string {
  return `security.event_type.${type}`;
}

/**
 * Get i18n key for security event severity.
 */
export function getSecuritySeverityI18nKey(
  severity: SecurityEventSeverity,
): string {
  return `security.severity.${severity}`;
}

/**
 * Check if an event should show alert badge.
 *
 * @see Requirements 21.5 (Critical/High severity badge)
 */
export function shouldShowSecurityBadge(
  severity: SecurityEventSeverity,
): boolean {
  return severity === 'critical' || severity === 'high';
}

/**
 * Compare events by severity (for sorting).
 * Returns negative if a is more severe than b.
 */
export function compareSecurityEventsBySeverity(
  a: SecurityEvent,
  b: SecurityEvent,
): number {
  return SEVERITY_PRIORITY[a.severity] - SEVERITY_PRIORITY[b.severity];
}

/**
 * Get CSS class for severity badge.
 */
export function getSeverityBadgeClass(severity: SecurityEventSeverity): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-600 text-white';
    case 'high':
      return 'bg-orange-500 text-white';
    case 'medium':
      return 'bg-yellow-500 text-black';
    case 'low':
      return 'bg-blue-400 text-white';
  }
}

/**
 * Check if an event requires immediate attention.
 */
export function requiresImmediateAttention(event: SecurityEvent): boolean {
  return (
    !event.acknowledged &&
    (event.severity === 'critical' || event.severity === 'high')
  );
}

/**
 * Format event timestamp for display.
 */
export function formatSecurityEventTimestamp(
  timestamp: Date,
  locale: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(timestamp);
}

/**
 * Calculate time since event occurred.
 */
export function timeSinceEvent(timestamp: Date): {
  value: number;
  unit: 'minutes' | 'hours' | 'days';
} {
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 60) {
    return { value: diffMinutes, unit: 'minutes' };
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return { value: diffHours, unit: 'hours' };
  }

  const diffDays = Math.floor(diffHours / 24);
  return { value: diffDays, unit: 'days' };
}

/**
 * Group events by tenant for dashboard display.
 */
export function groupEventsByTenant(
  events: readonly SecurityEvent[],
): Map<string | null, SecurityEvent[]> {
  const grouped = new Map<string | null, SecurityEvent[]>();

  for (const event of events) {
    const tenantId = event.tenantId;
    const existing = grouped.get(tenantId) ?? [];
    existing.push(event);
    grouped.set(tenantId, existing);
  }

  return grouped;
}
