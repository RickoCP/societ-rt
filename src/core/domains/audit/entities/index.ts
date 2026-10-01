/**
 * Audit Domain Entities barrel export.
 *
 * @see Task 62: Audit Trail Implementation (base AuditLog)
 * @see Task 24.1: Admin UI Audit Log Viewer entities (Requirements 17.1-17.13)
 */

// Base Audit Log entity (backend audit trail)
export type { AuditLog, CreateAuditLogInput } from './AuditLog';

// ---------------------------------------------------------------------------
// Admin UI Audit Log Viewer Entities (Task 24.1)
// ---------------------------------------------------------------------------

// Event Types
export type {
  AuditEventCategory,
  AuditEventType,
  AuthAuditEventType,
  MembershipAuditEventType,
  OrgUnitAuditEventType,
  TenantAuditEventType,
  SubscriptionAuditEventType,
  EmergencyAuditEventType,
  IoTAuditEventType,
  AuditExportEventType,
} from './AuditEventType';

export {
  ALL_AUDIT_EVENT_CATEGORIES,
  AUTH_EVENT_TYPES,
  MEMBERSHIP_EVENT_TYPES,
  ORGUNIT_EVENT_TYPES,
  TENANT_EVENT_TYPES,
  SUBSCRIPTION_EVENT_TYPES,
  EMERGENCY_EVENT_TYPES,
  IOT_EVENT_TYPES,
  getEventCategory,
  getEventTypeI18nKey,
  getCategoryI18nKey,
  getEventTypesForCategory,
} from './AuditEventType';

// Audit Log Entry (Admin UI display entity)
export type {
  AuditLogEntry,
  AuditActor,
  AuditResource,
  AuditResourceType,
  PaginatedAuditLogEntries,
  PaginatedAuditLogs, // Backward compatibility alias
  AuditExportFormat,
  AuditExportRequest,
  AuditExportResult,
} from './AuditLogEntry';

export {
  ALL_AUDIT_RESOURCE_TYPES,
  DEFAULT_AUDIT_PAGE_SIZE,
  MAX_AUDIT_EXPORT_ROWS,
  generateAuditExportFilename,
  getResourceTypeI18nKey,
  formatAuditTimestamp,
  hasExpandableDetails,
} from './AuditLogEntry';

// Audit Filters (Admin UI filter panel)
export type {
  AuditFilters,
  AuditQueryOptions,
  AuditSortField,
  AuditFilterDefinition,
  FilterOption,
} from './AuditFilters';

export {
  DEFAULT_AUDIT_FILTERS,
  DEFAULT_AUDIT_QUERY_OPTIONS,
  AUDIT_FILTER_DEFINITIONS,
  hasActiveFilters,
  countActiveFilters,
  mergeFilters,
  validateDateRange,
  getFilterSummary,
  buildEventTypeFilterOptions,
  buildResourceTypeFilterOptions,
} from './AuditFilters';

