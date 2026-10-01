/**
 * Platform Admin Feature Module
 *
 * This module provides the Platform Admin UI components,
 * screens, and ViewModels for cross-tenant administration.
 *
 * @see Requirements 19.1-19.11 (Platform Admin Dashboard)
 * @see Requirements 20.1-20.9 (Platform Admin Tenant Operations)
 * @see Requirements 21.1-21.12 (Security Event Alerts)
 */

// Screens
export { PlatformDashboardScreen } from './screens/PlatformDashboardScreen';
export { TenantDetailScreen } from './screens/TenantDetailScreen';
export { SecurityEventsScreen } from './screens/SecurityEventsScreen';

// ViewModels
export {
  usePlatformDashboardViewModel,
  type PlatformDashboardViewModel,
  type TenantListFilters,
  type SortDirection,
  PLATFORM_METRICS_QUERY_KEY,
  TENANT_OVERVIEW_QUERY_KEY,
  SYSTEM_ALERTS_QUERY_KEY,
  AUTO_REFRESH_INTERVAL_MS,
  DEFAULT_TENANT_PAGE_SIZE,
  VALID_PAGE_SIZES,
} from './viewModel/usePlatformDashboardViewModel';

export {
  useTenantDetailViewModel,
  TENANT_DETAIL_QUERY_KEY,
  TENANT_DETAIL_TABS,
  TAB_CONFIG,
  LIFECYCLE_STATUS_CONFIG,
  SUBSCRIPTION_STATUS_CONFIG,
  type TenantDetailTab,
  type TenantDetailViewModel,
  type AuditLogEntry,
} from './viewModel/useTenantDetailViewModel';

export {
  useSecurityEventsViewModel,
  type SecurityEventsViewModel,
  type SecurityEventListFilters,
  type AcknowledgedFilter,
  SECURITY_EVENTS_QUERY_KEY,
  UNACKNOWLEDGED_COUNTS_QUERY_KEY,
  AUTO_REFRESH_INTERVAL_MS as SECURITY_AUTO_REFRESH_INTERVAL_MS,
  DEFAULT_PAGE_SIZE as SECURITY_DEFAULT_PAGE_SIZE,
  VALID_PAGE_SIZES as SECURITY_VALID_PAGE_SIZES,
  SECURITY_EVENT_TYPES,
  SEVERITY_LEVELS,
  SEVERITY_CONFIG,
  EVENT_TYPE_CONFIG,
} from './viewModel/useSecurityEventsViewModel';

// Hooks
export {
  useThresholdAlertNotifications,
  DEFAULT_THRESHOLDS,
  VIOLATION_CONFIG,
  calculateUsagePercent,
  exceedsThreshold,
  type UseThresholdAlertNotificationsProps,
  type UseThresholdAlertNotificationsReturn,
  type UsageThresholds,
  type ThresholdViolationType,
  type ThresholdViolation,
} from './hooks';

// Components (to be added in future tasks)
// export * from './components';
