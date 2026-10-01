/**
 * Platform domain entities index.
 *
 * Re-exports all platform-related entities for convenient imports.
 *
 * @see Requirements 19-21 (Platform Admin)
 */

// ---------------------------------------------------------------------------
// Platform Metrics
// ---------------------------------------------------------------------------

export type {
  PlatformMetrics,
  SystemHealth,
  SystemHealthStatus,
  TenantCountsByStatus,
  SystemAlert,
  SystemAlertType,
  AlertSeverity,
  GetPlatformMetricsOptions,
  GetSystemAlertsOptions,
} from './PlatformMetrics';

export {
  DEFAULT_METRICS_REFRESH_INTERVAL,
  HEALTH_THRESHOLDS,
  calculateHealthStatus,
  getHealthStatusI18nKey,
  getAlertTypeI18nKey,
  getAlertSeverityI18nKey,
  shouldShowAlertBadge,
} from './PlatformMetrics';

// ---------------------------------------------------------------------------
// Tenant Overview
// ---------------------------------------------------------------------------

export type {
  TenantOverview,
  TenantDetail,
  TenantProfileSummary,
  SubscriptionSummary,
  SubscriptionStatusValue,
  SubscriptionDetailSummary,
  LifecycleEventSummary,
  PaginatedTenantOverviews,
  TenantOverviewFilters,
  TenantOverviewSort,
  TenantOverviewSortColumn,
  TenantOverviewQueryOptions,
} from './TenantOverview';

export {
  DEFAULT_TENANT_OVERVIEW_PAGE_SIZE,
  MAX_TENANT_OVERVIEW_PAGE_SIZE,
  ALL_SUBSCRIPTION_STATUSES,
  getSubscriptionStatusI18nKey,
  getTenantSortColumnI18nKey,
  hasConcerningStatus,
  formatLastActivity,
  daysSinceLastActivity,
} from './TenantOverview';

// ---------------------------------------------------------------------------
// Security Events
// ---------------------------------------------------------------------------

export type {
  SecurityEvent,
  SecurityEventType,
  SecurityEventSeverity,
  PaginatedSecurityEvents,
  SecurityEventFilters,
  SecurityEventSort,
  SecurityEventSortColumn,
  SecurityEventQueryOptions,
  AcknowledgeSecurityEventInput,
  BulkAcknowledgeSecurityEventsInput,
  SecurityEventTrendPoint,
  SecurityEventTrend,
  AlertThresholdConfig,
} from './SecurityEvent';

export {
  ALL_SECURITY_EVENT_TYPES,
  SECURITY_SEVERITY_LEVELS,
  SEVERITY_PRIORITY,
  DEFAULT_SECURITY_EVENT_PAGE_SIZE,
  MAX_SECURITY_EVENT_PAGE_SIZE,
  DEFAULT_TREND_WINDOW_HOURS,
  getSecurityEventTypeI18nKey,
  getSecuritySeverityI18nKey,
  shouldShowSecurityBadge,
  compareSecurityEventsBySeverity,
  getSeverityBadgeClass,
  requiresImmediateAttention,
  formatSecurityEventTimestamp,
  timeSinceEvent,
  groupEventsByTenant,
} from './SecurityEvent';
