/**
 * Audit Domain barrel export.
 *
 * @see Task 62: Audit Trail Implementation
 * @see Task 65: Audit Security Events (Req 30)
 * @see Task 68: Tenant Data Isolation Audit (Req 38)
 * @see Task 24.1: Admin UI Audit Log Viewer entities (Requirements 17.3, 17.9)
 */

// ---------------------------------------------------------------------------
// Base Entities (Backend Audit Trail)
// ---------------------------------------------------------------------------
export type { AuditLog, CreateAuditLogInput } from './entities';

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
} from './entities';

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
} from './entities';

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
} from './entities';

export {
  ALL_AUDIT_RESOURCE_TYPES,
  DEFAULT_AUDIT_PAGE_SIZE,
  MAX_AUDIT_EXPORT_ROWS,
  generateAuditExportFilename,
  getResourceTypeI18nKey,
  formatAuditTimestamp,
  hasExpandableDetails,
} from './entities';

// Audit Filters (Admin UI filter panel)
export type {
  AuditFilters,
  AuditQueryOptions,
  AuditSortField,
  AuditFilterDefinition,
  FilterOption,
} from './entities';

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
} from './entities';

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

// Base Repository (Backend Audit Trail)
export type { AuditRepository, AuditLogFilters } from './repositories/AuditRepository';

// Admin UI Repository (Audit Log Viewer) - Task 24.2
export type {
  AuditAdminRepository,
  AuditLogQueryInput,
  AuditExportInput,
  AuditCountInput,
} from './repositories/AuditAdminRepository';

// ---------------------------------------------------------------------------
// Use Cases (Admin UI) - Task 24.2
// ---------------------------------------------------------------------------
export type {
  QueryAuditLogsUseCase,
  QueryAuditLogsInput,
  QueryAuditLogsUseCaseType,
} from './usecases';

export { QueryAuditLogsUseCaseImpl } from './usecases';

// ---------------------------------------------------------------------------
// Services - Audit Trail
// ---------------------------------------------------------------------------
export type {
  IAuditTrailService,
  IAuditTrailRepository,
  IAuditTrailEmitter,
  AuditEvent,
  CreateAuditEventInput,
  AuditEventFilters,
  AuditPaginationOptions,
  AuditEventPage,
} from './services';

export {
  AuditTrailServiceImpl,
  AuditEventType,
} from './services';

// ---------------------------------------------------------------------------
// Services - Security Events Audit
// ---------------------------------------------------------------------------
export type {
  IAuditSecurityEventsService,
  LogAuthenticationEventInput,
  LogAuthorizationDenialInput,
  LogPrivilegeEscalationInput,
  LogAnomalyEventInput,
  SecurityEventMetadata,
  SecurityEventSummary,
} from './services';

export {
  AuditSecurityEventsServiceImpl,
  SecurityEventCategory,
  SecurityEventSeverity,
  AuthenticationEventType,
  AuthorizationDenialReason,
  PrivilegeEscalationType,
  AnomalyType,
} from './services';

// ---------------------------------------------------------------------------
// Services - Tenant Data Isolation Audit (Task 68)
// ---------------------------------------------------------------------------
export type {
  ITenantDataIsolationAuditService,
  IIsolationAlertEmitter,
  LogCrossTenantAttemptInput,
  LogIsolationViolationInput,
  IsolationAuditMetadata,
  VerificationCheckResult,
  IsolationVerificationResult,
  GenerateReportParams,
  IsolationAuditReport,
  IsolationViolationSummary,
  OffenderSummary,
  IsolationAlertConfig,
} from './services';

export {
  TenantDataIsolationAuditServiceImpl,
  IsolationViolationType,
  IsolationEventSeverity,
  VerificationStatus,
  IsolatedResourceType,
  DEFAULT_ISOLATION_ALERT_CONFIG,
  ConsoleIsolationAlertEmitter,
} from './services';

