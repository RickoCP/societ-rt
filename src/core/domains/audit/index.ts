/**
 * Audit Domain barrel export.
 *
 * @see Task 62: Audit Trail Implementation
 * @see Task 65: Audit Security Events (Req 30)
 * @see Task 68: Tenant Data Isolation Audit (Req 38)
 */

// Entities
export type { AuditLog, CreateAuditLogInput } from './entities';

// Repositories
export type { AuditRepository, AuditLogFilters } from './repositories/AuditRepository';

// Services - Audit Trail
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

// Services - Security Events Audit
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

// Services - Tenant Data Isolation Audit (Task 68)
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
