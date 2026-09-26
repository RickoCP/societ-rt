/**
 * Audit Services barrel export.
 *
 * @see Task 62: Audit Trail Implementation
 * @see Task 65: Audit Security Events (Req 30)
 * @see Task 68: Tenant Data Isolation Audit (Req 38)
 */

export type {
  IAuditTrailService,
  IAuditTrailRepository,
  IAuditTrailEmitter,
  AuditEvent,
  CreateAuditEventInput,
  AuditEventFilters,
  AuditPaginationOptions,
  AuditEventPage,
} from './AuditTrailService';

export {
  AuditTrailServiceImpl,
  AuditEventType,
} from './AuditTrailService';

export type {
  IAuditSecurityEventsService,
  LogAuthenticationEventInput,
  LogAuthorizationDenialInput,
  LogPrivilegeEscalationInput,
  LogAnomalyEventInput,
  SecurityEventMetadata,
  SecurityEventSummary,
} from './AuditSecurityEventsService';

export {
  AuditSecurityEventsServiceImpl,
  SecurityEventCategory,
  SecurityEventSeverity,
  AuthenticationEventType,
  AuthorizationDenialReason,
  PrivilegeEscalationType,
  AnomalyType,
} from './AuditSecurityEventsService';

// Task 68: Tenant Data Isolation Audit (Req 38)
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
} from './TenantDataIsolationAuditService';

export {
  TenantDataIsolationAuditServiceImpl,
  IsolationViolationType,
  IsolationEventSeverity,
  VerificationStatus,
  IsolatedResourceType,
  DEFAULT_ISOLATION_ALERT_CONFIG,
  ConsoleIsolationAlertEmitter,
} from './TenantDataIsolationAuditService';
