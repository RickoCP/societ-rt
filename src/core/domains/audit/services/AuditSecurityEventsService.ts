/**
 * AuditSecurityEventsService — Comprehensive security event auditing.
 *
 * This service provides centralized security event auditing for:
 * 1. Authentication events (login, logout, failed attempts, token refresh)
 * 2. Authorization denial logging (permission denied, scope violations)
 * 3. Privilege escalation detection (role changes, permission grants)
 * 4. Anomaly detection events (unusual patterns, suspicious activities)
 *
 * **SECURITY AUDIT REQUIREMENTS:**
 * - All authentication events MUST be logged with IP and user agent
 * - Authorization denials MUST include full context for security review
 * - Privilege escalation MUST be flagged for elevated attention
 * - Anomaly patterns MUST be detected and logged immediately
 * - Never log sensitive data (tokens, passwords, PII, etc.)
 *
 * @see Task 65: Audit Security Events (Req 30)
 * @see Requirements 30, 55, 70 — Security Event Logging
 * @see Error Handling Guideline (12-error-handling.md)
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { businessError, technicalError, validationError } from '@core/utils';
import type { AuditEvent, AuditEventType, CreateAuditEventInput, IAuditTrailRepository } from './AuditTrailService';

// ---------------------------------------------------------------------------
// Security Event Types
// ---------------------------------------------------------------------------

/**
 * Categories of security events for classification and filtering.
 */
export enum SecurityEventCategory {
  /** Authentication-related events */
  AUTHENTICATION = 'AUTHENTICATION',
  /** Authorization denial events */
  AUTHORIZATION_DENIAL = 'AUTHORIZATION_DENIAL',
  /** Privilege escalation events */
  PRIVILEGE_ESCALATION = 'PRIVILEGE_ESCALATION',
  /** Anomaly detection events */
  ANOMALY_DETECTION = 'ANOMALY_DETECTION',
  /** General security events */
  SECURITY_GENERAL = 'SECURITY_GENERAL',
}

/**
 * Severity levels for security events.
 */
export enum SecurityEventSeverity {
  /** Informational events (successful logins, normal operations) */
  INFO = 'INFO',
  /** Warning events (failed login, denied access) */
  WARNING = 'WARNING',
  /** High priority events (multiple failures, privilege changes) */
  HIGH = 'HIGH',
  /** Critical events (suspected attacks, anomalies) */
  CRITICAL = 'CRITICAL',
}

/**
 * Authentication event subtypes for detailed logging.
 */
export enum AuthenticationEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_COMPLETE = 'PASSWORD_RESET_COMPLETE',
  MFA_ENABLED = 'MFA_ENABLED',
  MFA_DISABLED = 'MFA_DISABLED',
  MFA_CHALLENGE_SUCCESS = 'MFA_CHALLENGE_SUCCESS',
  MFA_CHALLENGE_FAILURE = 'MFA_CHALLENGE_FAILURE',
  SESSION_INVALIDATED = 'SESSION_INVALIDATED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
}

/**
 * Authorization denial reason codes for detailed tracking.
 */
export enum AuthorizationDenialReason {
  INSUFFICIENT_PERMISSION = 'INSUFFICIENT_PERMISSION',
  OUT_OF_SCOPE = 'OUT_OF_SCOPE',
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  MEMBERSHIP_INACTIVE = 'MEMBERSHIP_INACTIVE',
  NO_MEMBERSHIP = 'NO_MEMBERSHIP',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  ENTITLEMENT_NOT_AVAILABLE = 'ENTITLEMENT_NOT_AVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  IP_BLOCKED = 'IP_BLOCKED',
  USER_QUARANTINED = 'USER_QUARANTINED',
  CONTEXT_INVALID = 'CONTEXT_INVALID',
}

/**
 * Privilege escalation types for detection and logging.
 */
export enum PrivilegeEscalationType {
  ROLE_UPGRADED = 'ROLE_UPGRADED',
  ROLE_DOWNGRADED = 'ROLE_DOWNGRADED',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',
  ADMIN_ROLE_ASSIGNED = 'ADMIN_ROLE_ASSIGNED',
  DELEGATION_GRANTED = 'DELEGATION_GRANTED',
  SCOPE_EXPANDED = 'SCOPE_EXPANDED',
  SCOPE_REDUCED = 'SCOPE_REDUCED',
  IMPERSONATION_STARTED = 'IMPERSONATION_STARTED',
  IMPERSONATION_ENDED = 'IMPERSONATION_ENDED',
}

/**
 * Anomaly types for detection and alerting.
 */
export enum AnomalyType {
  /** Multiple failed login attempts */
  BRUTE_FORCE_ATTEMPT = 'BRUTE_FORCE_ATTEMPT',
  /** Login from unusual location */
  UNUSUAL_LOCATION = 'UNUSUAL_LOCATION',
  /** Login at unusual time */
  UNUSUAL_TIME = 'UNUSUAL_TIME',
  /** Rapid successive requests */
  RATE_ANOMALY = 'RATE_ANOMALY',
  /** Cross-tenant access attempt */
  CROSS_TENANT_ATTEMPT = 'CROSS_TENANT_ATTEMPT',
  /** Privilege abuse pattern */
  PRIVILEGE_ABUSE = 'PRIVILEGE_ABUSE',
  /** Session hijacking attempt */
  SESSION_HIJACK_ATTEMPT = 'SESSION_HIJACK_ATTEMPT',
  /** Token reuse detected */
  TOKEN_REUSE = 'TOKEN_REUSE',
  /** Suspicious user agent */
  SUSPICIOUS_USER_AGENT = 'SUSPICIOUS_USER_AGENT',
  /** Geographic impossibility (login from two distant locations) */
  IMPOSSIBLE_TRAVEL = 'IMPOSSIBLE_TRAVEL',
  /** Unusual resource access pattern */
  UNUSUAL_ACCESS_PATTERN = 'UNUSUAL_ACCESS_PATTERN',
  /** Data exfiltration attempt */
  DATA_EXFILTRATION_ATTEMPT = 'DATA_EXFILTRATION_ATTEMPT',
}

// ---------------------------------------------------------------------------
// Security Event Input Types
// ---------------------------------------------------------------------------

/**
 * Common metadata for all security events.
 */
export interface SecurityEventMetadata {
  /** IP address of the actor */
  readonly ipAddress?: string;
  /** User agent string */
  readonly userAgent?: string;
  /** Correlation ID for request tracing */
  readonly correlationId?: string;
  /** Geographic location (if available) */
  readonly geoLocation?: {
    readonly country?: string;
    readonly region?: string;
    readonly city?: string;
  };
  /** Device fingerprint (if available) */
  readonly deviceFingerprint?: string;
  /** Request path/endpoint */
  readonly requestPath?: string;
  /** HTTP method */
  readonly httpMethod?: string;
}

/**
 * Input for logging authentication events.
 */
export interface LogAuthenticationEventInput {
  /** The authentication event type */
  readonly eventType: AuthenticationEventType;
  /** User ID (null for failed attempts with unknown user) */
  readonly userId: string | null;
  /** Tenant ID context */
  readonly tenantId: string;
  /** Whether the authentication was successful */
  readonly success: boolean;
  /** Failure reason (if failed) */
  readonly failureReason?: string;
  /** Error code (if failed) */
  readonly errorCode?: string;
  /** Additional details */
  readonly details?: Record<string, unknown>;
  /** Event metadata */
  readonly metadata?: SecurityEventMetadata;
}

/**
 * Input for logging authorization denial events.
 */
export interface LogAuthorizationDenialInput {
  /** User ID who was denied */
  readonly userId: string;
  /** Tenant ID context */
  readonly tenantId: string;
  /** Denial reason code */
  readonly reason: AuthorizationDenialReason;
  /** Required permissions that were missing */
  readonly requiredPermissions?: string[];
  /** User's actual permissions */
  readonly userPermissions?: string[];
  /** Resource type being accessed */
  readonly resourceType?: string;
  /** Resource ID being accessed */
  readonly resourceId?: string;
  /** OrgUnit context */
  readonly orgUnitId?: string;
  /** Additional context */
  readonly details?: Record<string, unknown>;
  /** Event metadata */
  readonly metadata?: SecurityEventMetadata;
}

/**
 * Input for logging privilege escalation events.
 */
export interface LogPrivilegeEscalationInput {
  /** Type of privilege escalation */
  readonly escalationType: PrivilegeEscalationType;
  /** User ID performing the action */
  readonly actorUserId: string;
  /** User ID being affected */
  readonly targetUserId: string;
  /** Tenant ID context */
  readonly tenantId: string;
  /** Previous role/permission state */
  readonly previousState?: {
    readonly role?: string;
    readonly permissions?: string[];
    readonly orgUnitId?: string | null;
  };
  /** New role/permission state */
  readonly newState?: {
    readonly role?: string;
    readonly permissions?: string[];
    readonly orgUnitId?: string | null;
  };
  /** Membership ID affected */
  readonly membershipId?: string;
  /** Additional details */
  readonly details?: Record<string, unknown>;
  /** Event metadata */
  readonly metadata?: SecurityEventMetadata;
}

/**
 * Input for logging anomaly detection events.
 */
export interface LogAnomalyEventInput {
  /** Type of anomaly detected */
  readonly anomalyType: AnomalyType;
  /** User ID involved (if known) */
  readonly userId: string | null;
  /** Tenant ID context */
  readonly tenantId: string;
  /** Severity of the anomaly */
  readonly severity: SecurityEventSeverity;
  /** Description of the anomaly */
  readonly description: string;
  /** Evidence/indicators that triggered detection */
  readonly indicators: Record<string, unknown>;
  /** Recommended action */
  readonly recommendedAction?: string;
  /** Whether automatic action was taken */
  readonly automaticActionTaken?: boolean;
  /** Details of automatic action */
  readonly automaticAction?: string;
  /** Event metadata */
  readonly metadata?: SecurityEventMetadata;
}

/**
 * Security event summary for a specific time period.
 */
export interface SecurityEventSummary {
  /** Start of the period */
  readonly periodStart: Date;
  /** End of the period */
  readonly periodEnd: Date;
  /** Tenant ID */
  readonly tenantId: string;
  /** Total events in period */
  readonly totalEvents: number;
  /** Breakdown by category */
  readonly byCategory: Record<SecurityEventCategory, number>;
  /** Breakdown by severity */
  readonly bySeverity: Record<SecurityEventSeverity, number>;
  /** Failed authentication count */
  readonly failedAuthCount: number;
  /** Authorization denials count */
  readonly authorizationDenialCount: number;
  /** Privilege escalation count */
  readonly privilegeEscalationCount: number;
  /** Anomaly count */
  readonly anomalyCount: number;
  /** Critical events requiring attention */
  readonly criticalEvents: number;
}

/**
 * Failed login tracking entry for brute force detection.
 */
interface FailedLoginTracker {
  readonly userId: string | null;
  readonly ipAddress: string;
  readonly count: number;
  readonly firstAttempt: Date;
  readonly lastAttempt: Date;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * IAuditSecurityEventsService interface.
 *
 * Provides comprehensive security event auditing capabilities including
 * authentication logging, authorization denial tracking, privilege
 * escalation detection, and anomaly detection.
 */
export interface IAuditSecurityEventsService {
  // ---------------------------------------------------------------------------
  // Authentication Event Logging
  // ---------------------------------------------------------------------------

  /**
   * Log an authentication event.
   *
   * Records login, logout, token refresh, and other auth events
   * with full context for security review.
   *
   * @param input - Authentication event input
   * @returns DomainResult with created audit event
   */
  logAuthenticationEvent(
    input: LogAuthenticationEventInput,
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Log a successful login event.
   *
   * @param userId - User who logged in
   * @param tenantId - Tenant context
   * @param metadata - Event metadata
   */
  logLoginSuccess(
    userId: string,
    tenantId: string,
    metadata?: SecurityEventMetadata,
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Log a failed login attempt.
   *
   * @param userId - User ID (null if unknown)
   * @param tenantId - Tenant context
   * @param failureReason - Reason for failure
   * @param metadata - Event metadata
   */
  logLoginFailure(
    userId: string | null,
    tenantId: string,
    failureReason: string,
    metadata?: SecurityEventMetadata,
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Log a logout event.
   *
   * @param userId - User who logged out
   * @param tenantId - Tenant context
   * @param metadata - Event metadata
   */
  logLogout(
    userId: string,
    tenantId: string,
    metadata?: SecurityEventMetadata,
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Log a token refresh event.
   *
   * @param userId - User whose token was refreshed
   * @param tenantId - Tenant context
   * @param success - Whether refresh was successful
   * @param metadata - Event metadata
   */
  logTokenRefresh(
    userId: string,
    tenantId: string,
    success: boolean,
    metadata?: SecurityEventMetadata,
  ): Promise<DomainResult<AuditEvent>>;

  // ---------------------------------------------------------------------------
  // Authorization Denial Logging
  // ---------------------------------------------------------------------------

  /**
   * Log an authorization denial event.
   *
   * Records all permission denials with full context for
   * security analysis and debugging.
   *
   * @param input - Authorization denial input
   * @returns DomainResult with created audit event
   */
  logAuthorizationDenial(
    input: LogAuthorizationDenialInput,
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Log a permission-based denial.
   *
   * @param userId - User who was denied
   * @param tenantId - Tenant context
   * @param requiredPermissions - Permissions that were required
   * @param metadata - Event metadata
   */
  logPermissionDenied(
    userId: string,
    tenantId: string,
    requiredPermissions: string[],
    metadata?: SecurityEventMetadata,
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Log a scope violation denial.
   *
   * @param userId - User who was denied
   * @param tenantId - Tenant context
   * @param resourceOrgUnitId - OrgUnit of the resource
   * @param userOrgUnitId - User's OrgUnit scope
   * @param metadata - Event metadata
   */
  logScopeViolation(
    userId: string,
    tenantId: string,
    resourceOrgUnitId: string,
    userOrgUnitId: string | null,
    metadata?: SecurityEventMetadata,
  ): Promise<DomainResult<AuditEvent>>;

  // ---------------------------------------------------------------------------
  // Privilege Escalation Detection
  // ---------------------------------------------------------------------------

  /**
   * Log a privilege escalation event.
   *
   * Records role changes, permission grants, and other
   * privilege modifications for security oversight.
   *
   * @param input - Privilege escalation input
   * @returns DomainResult with created audit event
   */
  logPrivilegeEscalation(
    input: LogPrivilegeEscalationInput,
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Log a role change event.
   *
   * @param actorUserId - User performing the change
   * @param targetUserId - User whose role is changing
   * @param tenantId - Tenant context
   * @param previousRole - Previous role
   * @param newRole - New role
   * @param membershipId - Membership ID affected
   * @param metadata - Event metadata
   */
  logRoleChange(
    actorUserId: string,
    targetUserId: string,
    tenantId: string,
    previousRole: string,
    newRole: string,
    membershipId: string,
    metadata?: SecurityEventMetadata,
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Log a permission grant event.
   *
   * @param actorUserId - User granting permission
   * @param targetUserId - User receiving permission
   * @param tenantId - Tenant context
   * @param permissions - Permissions being granted
   * @param metadata - Event metadata
   */
  logPermissionGrant(
    actorUserId: string,
    targetUserId: string,
    tenantId: string,
    permissions: string[],
    metadata?: SecurityEventMetadata,
  ): Promise<DomainResult<AuditEvent>>;

  // ---------------------------------------------------------------------------
  // Anomaly Detection
  // ---------------------------------------------------------------------------

  /**
   * Log an anomaly detection event.
   *
   * Records suspicious activities, unusual patterns, and
   * potential security threats.
   *
   * @param input - Anomaly event input
   * @returns DomainResult with created audit event
   */
  logAnomalyEvent(
    input: LogAnomalyEventInput,
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Detect and log brute force attempt.
   *
   * @param userId - User ID (null if unknown)
   * @param tenantId - Tenant context
   * @param attemptCount - Number of failed attempts
   * @param timeWindowMinutes - Time window for attempts
   * @param metadata - Event metadata
   */
  logBruteForceAttempt(
    userId: string | null,
    tenantId: string,
    attemptCount: number,
    timeWindowMinutes: number,
    metadata?: SecurityEventMetadata,
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Log a cross-tenant access attempt.
   *
   * @param userId - User who attempted
   * @param sourceTenantId - User's tenant
   * @param targetTenantId - Attempted target tenant
   * @param metadata - Event metadata
   */
  logCrossTenantAttempt(
    userId: string,
    sourceTenantId: string,
    targetTenantId: string,
    metadata?: SecurityEventMetadata,
  ): Promise<DomainResult<AuditEvent>>;

  /**
   * Log a suspicious activity event.
   *
   * @param userId - User ID (null if unknown)
   * @param tenantId - Tenant context
   * @param description - Description of suspicious activity
   * @param severity - Severity level
   * @param metadata - Event metadata
   */
  logSuspiciousActivity(
    userId: string | null,
    tenantId: string,
    description: string,
    severity: SecurityEventSeverity,
    metadata?: SecurityEventMetadata,
  ): Promise<DomainResult<AuditEvent>>;

  // ---------------------------------------------------------------------------
  // Analysis & Reporting
  // ---------------------------------------------------------------------------

  /**
   * Check for brute force pattern.
   *
   * Analyzes recent failed logins to detect brute force attempts.
   *
   * @param userId - User ID (null to check by IP only)
   * @param ipAddress - IP address to check
   * @param windowMinutes - Time window to analyze
   * @param threshold - Number of failures to trigger detection
   * @returns Whether brute force is detected
   */
  detectBruteForce(
    userId: string | null,
    ipAddress: string,
    windowMinutes: number,
    threshold: number,
  ): Promise<DomainResult<boolean>>;

  /**
   * Get security event summary for a tenant.
   *
   * @param tenantId - Tenant ID
   * @param periodStart - Start of period
   * @param periodEnd - End of period
   * @returns Security event summary
   */
  getSecuritySummary(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<DomainResult<SecurityEventSummary>>;

  /**
   * Get recent critical security events.
   *
   * @param tenantId - Tenant ID
   * @param limit - Maximum number of events
   * @returns List of critical events
   */
  getRecentCriticalEvents(
    tenantId: string,
    limit: number,
  ): Promise<DomainResult<AuditEvent[]>>;
}

// ---------------------------------------------------------------------------
// Audit Event Type Mapping
// ---------------------------------------------------------------------------

/**
 * Map authentication event types to audit event types.
 */
const AUTH_EVENT_TYPE_MAP: Record<AuthenticationEventType, string> = {
  [AuthenticationEventType.LOGIN_SUCCESS]: 'AUTH_LOGIN_SUCCESS',
  [AuthenticationEventType.LOGIN_FAILURE]: 'AUTH_LOGIN_FAILURE',
  [AuthenticationEventType.LOGOUT]: 'AUTH_LOGOUT',
  [AuthenticationEventType.TOKEN_REFRESH]: 'AUTH_TOKEN_REFRESH',
  [AuthenticationEventType.TOKEN_REVOKED]: 'AUTH_TOKEN_REVOKED',
  [AuthenticationEventType.PASSWORD_CHANGE]: 'AUTH_PASSWORD_CHANGED',
  [AuthenticationEventType.PASSWORD_RESET_REQUEST]: 'AUTH_PASSWORD_RESET_REQUESTED',
  [AuthenticationEventType.PASSWORD_RESET_COMPLETE]: 'AUTH_PASSWORD_RESET_COMPLETED',
  [AuthenticationEventType.MFA_ENABLED]: 'AUTH_MFA_ENABLED',
  [AuthenticationEventType.MFA_DISABLED]: 'AUTH_MFA_DISABLED',
  [AuthenticationEventType.MFA_CHALLENGE_SUCCESS]: 'AUTH_LOGIN_SUCCESS',
  [AuthenticationEventType.MFA_CHALLENGE_FAILURE]: 'AUTH_LOGIN_FAILURE',
  [AuthenticationEventType.SESSION_INVALIDATED]: 'AUTH_SESSION_INVALIDATED',
  [AuthenticationEventType.SESSION_EXPIRED]: 'AUTH_SESSION_INVALIDATED',
  [AuthenticationEventType.ACCOUNT_LOCKED]: 'SECURITY_ALERT_TRIGGERED',
  [AuthenticationEventType.ACCOUNT_UNLOCKED]: 'ADMIN_ACTION',
};

/**
 * Map denial reasons to severity levels.
 */
const DENIAL_SEVERITY_MAP: Record<AuthorizationDenialReason, SecurityEventSeverity> = {
  [AuthorizationDenialReason.INSUFFICIENT_PERMISSION]: SecurityEventSeverity.WARNING,
  [AuthorizationDenialReason.OUT_OF_SCOPE]: SecurityEventSeverity.WARNING,
  [AuthorizationDenialReason.TENANT_MISMATCH]: SecurityEventSeverity.CRITICAL,
  [AuthorizationDenialReason.MEMBERSHIP_INACTIVE]: SecurityEventSeverity.WARNING,
  [AuthorizationDenialReason.NO_MEMBERSHIP]: SecurityEventSeverity.WARNING,
  [AuthorizationDenialReason.TOKEN_REVOKED]: SecurityEventSeverity.HIGH,
  [AuthorizationDenialReason.TOKEN_EXPIRED]: SecurityEventSeverity.INFO,
  [AuthorizationDenialReason.ENTITLEMENT_NOT_AVAILABLE]: SecurityEventSeverity.INFO,
  [AuthorizationDenialReason.RATE_LIMIT_EXCEEDED]: SecurityEventSeverity.HIGH,
  [AuthorizationDenialReason.IP_BLOCKED]: SecurityEventSeverity.CRITICAL,
  [AuthorizationDenialReason.USER_QUARANTINED]: SecurityEventSeverity.CRITICAL,
  [AuthorizationDenialReason.CONTEXT_INVALID]: SecurityEventSeverity.WARNING,
};

/**
 * Map anomaly types to severity levels.
 */
const ANOMALY_SEVERITY_MAP: Record<AnomalyType, SecurityEventSeverity> = {
  [AnomalyType.BRUTE_FORCE_ATTEMPT]: SecurityEventSeverity.CRITICAL,
  [AnomalyType.UNUSUAL_LOCATION]: SecurityEventSeverity.HIGH,
  [AnomalyType.UNUSUAL_TIME]: SecurityEventSeverity.WARNING,
  [AnomalyType.RATE_ANOMALY]: SecurityEventSeverity.HIGH,
  [AnomalyType.CROSS_TENANT_ATTEMPT]: SecurityEventSeverity.CRITICAL,
  [AnomalyType.PRIVILEGE_ABUSE]: SecurityEventSeverity.CRITICAL,
  [AnomalyType.SESSION_HIJACK_ATTEMPT]: SecurityEventSeverity.CRITICAL,
  [AnomalyType.TOKEN_REUSE]: SecurityEventSeverity.CRITICAL,
  [AnomalyType.SUSPICIOUS_USER_AGENT]: SecurityEventSeverity.WARNING,
  [AnomalyType.IMPOSSIBLE_TRAVEL]: SecurityEventSeverity.CRITICAL,
  [AnomalyType.UNUSUAL_ACCESS_PATTERN]: SecurityEventSeverity.WARNING,
  [AnomalyType.DATA_EXFILTRATION_ATTEMPT]: SecurityEventSeverity.CRITICAL,
};

// ---------------------------------------------------------------------------
// Sensitive Data Sanitization
// ---------------------------------------------------------------------------

/**
 * Keys that should be redacted from security event details.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'privatekey',
  'otp',
  'pin',
  'cvv',
  'ssn',
  'creditcard',
  'cardnumber',
  'authorization',
  'bearer',
]);

/**
 * Substrings that indicate sensitive data.
 */
const SENSITIVE_SUBSTRINGS = [
  'password',
  'token',
  'secret',
  'key',
  'credential',
];

/**
 * Sanitize details object by redacting sensitive fields.
 */
function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();

    const isSensitive = SENSITIVE_KEYS.has(lowerKey) ||
      SENSITIVE_SUBSTRINGS.some(sub => lowerKey.includes(sub));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeDetails(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an AuditSecurityEventsService instance.
 *
 * @param dependencies - Service dependencies
 * @returns An implementation of IAuditSecurityEventsService
 *
 * @example
 * ```typescript
 * // DI Registration
 * container.register({
 *   auditSecurityEventsService: asFunction(AuditSecurityEventsServiceImpl).singleton(),
 * });
 *
 * // Usage
 * const securityAudit = DI.resolve('auditSecurityEventsService');
 * await securityAudit.logLoginFailure(userId, tenantId, 'Invalid password', {
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...',
 * });
 * ```
 */
export const AuditSecurityEventsServiceImpl = ({
  auditTrailRepository,
}: {
  auditTrailRepository: IAuditTrailRepository;
}): IAuditSecurityEventsService => {
  // ---------------------------------------------------------------------------
  // In-Memory Failed Login Tracker (for brute force detection)
  // ---------------------------------------------------------------------------

  const failedLoginTracker = new Map<string, FailedLoginTracker>();
  const TRACKER_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  // Cleanup old entries periodically
  setInterval(() => {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 hour
    for (const [key, entry] of failedLoginTracker.entries()) {
      if (entry.lastAttempt < cutoff) {
        failedLoginTracker.delete(key);
      }
    }
  }, TRACKER_CLEANUP_INTERVAL_MS);

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Validate tenant ID is provided.
   */
  const validateTenantId = (tenantId: string): DomainResult<void> => {
    if (!tenantId || tenantId.trim() === '') {
      return fail(validationError(
        'SECURITY_AUDIT_TENANT_REQUIRED',
        'Tenant ID is required for security audit operations',
      ));
    }
    return ok(undefined);
  };

  /**
   * Create audit event input from security event data.
   */
  const createAuditInput = (
    eventType: string,
    userId: string | null,
    tenantId: string,
    category: SecurityEventCategory,
    severity: SecurityEventSeverity,
    details: Record<string, unknown>,
    metadata?: SecurityEventMetadata,
    success = true,
    errorCode?: string,
  ): CreateAuditEventInput => ({
    userId,
    tenantId,
    eventType: eventType as AuditEventType,
    resourceType: 'SECURITY_EVENT',
    details: sanitizeDetails({
      category,
      severity,
      ...details,
      ...(metadata?.geoLocation && { geoLocation: metadata.geoLocation }),
      ...(metadata?.deviceFingerprint && { deviceFingerprint: metadata.deviceFingerprint }),
      ...(metadata?.requestPath && { requestPath: metadata.requestPath }),
      ...(metadata?.httpMethod && { httpMethod: metadata.httpMethod }),
    }),
    ipAddress: metadata?.ipAddress ?? null,
    userAgent: metadata?.userAgent ?? null,
    correlationId: metadata?.correlationId ?? null,
    success,
    errorCode: errorCode ?? null,
  });

  /**
   * Track failed login for brute force detection.
   */
  const trackFailedLogin = (userId: string | null, ipAddress: string): void => {
    const key = `${userId ?? 'unknown'}:${ipAddress}`;
    const existing = failedLoginTracker.get(key);
    const now = new Date();

    if (existing) {
      failedLoginTracker.set(key, {
        ...existing,
        count: existing.count + 1,
        lastAttempt: now,
      });
    } else {
      failedLoginTracker.set(key, {
        userId,
        ipAddress,
        count: 1,
        firstAttempt: now,
        lastAttempt: now,
      });
    }
  };

  /**
   * Check for brute force pattern in tracker.
   */
  const checkBruteForcePattern = (
    userId: string | null,
    ipAddress: string,
    windowMinutes: number,
    threshold: number,
  ): boolean => {
    const key = `${userId ?? 'unknown'}:${ipAddress}`;
    const entry = failedLoginTracker.get(key);

    if (!entry) return false;

    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    if (entry.firstAttempt < windowStart) {
      // Reset if first attempt is outside window
      failedLoginTracker.delete(key);
      return false;
    }

    return entry.count >= threshold;
  };

  // ---------------------------------------------------------------------------
  // Service Implementation
  // ---------------------------------------------------------------------------

  return {
    // -------------------------------------------------------------------------
    // Authentication Event Logging
    // -------------------------------------------------------------------------

    async logAuthenticationEvent(
      input: LogAuthenticationEventInput,
    ): Promise<DomainResult<AuditEvent>> {
      const validation = validateTenantId(input.tenantId);
      if (!validation.success) {
        return validation as DomainResult<AuditEvent>;
      }

      const eventType = AUTH_EVENT_TYPE_MAP[input.eventType] ?? 'AUTH_LOGIN_SUCCESS';
      const severity = input.success
        ? SecurityEventSeverity.INFO
        : SecurityEventSeverity.WARNING;

      const auditInput = createAuditInput(
        eventType,
        input.userId,
        input.tenantId,
        SecurityEventCategory.AUTHENTICATION,
        severity,
        {
          authEventType: input.eventType,
          ...(input.failureReason && { failureReason: input.failureReason }),
          ...(input.details ?? {}),
        },
        input.metadata,
        input.success,
        input.errorCode,
      );

      // Track failed logins for brute force detection
      if (!input.success && input.metadata?.ipAddress) {
        trackFailedLogin(input.userId, input.metadata.ipAddress);
      }

      return auditTrailRepository.create(auditInput);
    },

    async logLoginSuccess(
      userId: string,
      tenantId: string,
      metadata?: SecurityEventMetadata,
    ): Promise<DomainResult<AuditEvent>> {
      return this.logAuthenticationEvent({
        eventType: AuthenticationEventType.LOGIN_SUCCESS,
        userId,
        tenantId,
        success: true,
        metadata,
      });
    },

    async logLoginFailure(
      userId: string | null,
      tenantId: string,
      failureReason: string,
      metadata?: SecurityEventMetadata,
    ): Promise<DomainResult<AuditEvent>> {
      return this.logAuthenticationEvent({
        eventType: AuthenticationEventType.LOGIN_FAILURE,
        userId,
        tenantId,
        success: false,
        failureReason,
        errorCode: 'AUTH_LOGIN_FAILURE',
        metadata,
      });
    },

    async logLogout(
      userId: string,
      tenantId: string,
      metadata?: SecurityEventMetadata,
    ): Promise<DomainResult<AuditEvent>> {
      return this.logAuthenticationEvent({
        eventType: AuthenticationEventType.LOGOUT,
        userId,
        tenantId,
        success: true,
        metadata,
      });
    },

    async logTokenRefresh(
      userId: string,
      tenantId: string,
      success: boolean,
      metadata?: SecurityEventMetadata,
    ): Promise<DomainResult<AuditEvent>> {
      return this.logAuthenticationEvent({
        eventType: AuthenticationEventType.TOKEN_REFRESH,
        userId,
        tenantId,
        success,
        failureReason: success ? undefined : 'Token refresh failed',
        errorCode: success ? undefined : 'AUTH_TOKEN_REFRESH_FAILED',
        metadata,
      });
    },

    // -------------------------------------------------------------------------
    // Authorization Denial Logging
    // -------------------------------------------------------------------------

    async logAuthorizationDenial(
      input: LogAuthorizationDenialInput,
    ): Promise<DomainResult<AuditEvent>> {
      const validation = validateTenantId(input.tenantId);
      if (!validation.success) {
        return validation as DomainResult<AuditEvent>;
      }

      const severity = DENIAL_SEVERITY_MAP[input.reason] ?? SecurityEventSeverity.WARNING;

      const auditInput = createAuditInput(
        'AUTHORIZATION_CHECK_FAILED',
        input.userId,
        input.tenantId,
        SecurityEventCategory.AUTHORIZATION_DENIAL,
        severity,
        {
          denialReason: input.reason,
          ...(input.requiredPermissions && { requiredPermissions: input.requiredPermissions }),
          ...(input.userPermissions && { userPermissions: input.userPermissions }),
          ...(input.resourceType && { resourceType: input.resourceType }),
          ...(input.resourceId && { resourceId: input.resourceId }),
          ...(input.orgUnitId && { orgUnitId: input.orgUnitId }),
          ...(input.details ?? {}),
        },
        input.metadata,
        false,
        `AUTH_${input.reason}`,
      );

      return auditTrailRepository.create(auditInput);
    },

    async logPermissionDenied(
      userId: string,
      tenantId: string,
      requiredPermissions: string[],
      metadata?: SecurityEventMetadata,
    ): Promise<DomainResult<AuditEvent>> {
      return this.logAuthorizationDenial({
        userId,
        tenantId,
        reason: AuthorizationDenialReason.INSUFFICIENT_PERMISSION,
        requiredPermissions,
        metadata,
      });
    },

    async logScopeViolation(
      userId: string,
      tenantId: string,
      resourceOrgUnitId: string,
      userOrgUnitId: string | null,
      metadata?: SecurityEventMetadata,
    ): Promise<DomainResult<AuditEvent>> {
      return this.logAuthorizationDenial({
        userId,
        tenantId,
        reason: AuthorizationDenialReason.OUT_OF_SCOPE,
        details: {
          resourceOrgUnitId,
          userOrgUnitId,
        },
        metadata,
      });
    },

    // -------------------------------------------------------------------------
    // Privilege Escalation Detection
    // -------------------------------------------------------------------------

    async logPrivilegeEscalation(
      input: LogPrivilegeEscalationInput,
    ): Promise<DomainResult<AuditEvent>> {
      const validation = validateTenantId(input.tenantId);
      if (!validation.success) {
        return validation as DomainResult<AuditEvent>;
      }

      // Determine severity based on escalation type
      const isAdminEscalation =
        input.escalationType === PrivilegeEscalationType.ADMIN_ROLE_ASSIGNED ||
        input.escalationType === PrivilegeEscalationType.IMPERSONATION_STARTED;

      const severity = isAdminEscalation
        ? SecurityEventSeverity.HIGH
        : SecurityEventSeverity.WARNING;

      const auditInput = createAuditInput(
        'MEMBERSHIP_ROLE_CHANGED',
        input.actorUserId,
        input.tenantId,
        SecurityEventCategory.PRIVILEGE_ESCALATION,
        severity,
        {
          escalationType: input.escalationType,
          targetUserId: input.targetUserId,
          ...(input.previousState && { previousState: input.previousState }),
          ...(input.newState && { newState: input.newState }),
          ...(input.membershipId && { membershipId: input.membershipId }),
          ...(input.details ?? {}),
        },
        input.metadata,
        true,
      );

      return auditTrailRepository.create(auditInput);
    },

    async logRoleChange(
      actorUserId: string,
      targetUserId: string,
      tenantId: string,
      previousRole: string,
      newRole: string,
      membershipId: string,
      metadata?: SecurityEventMetadata,
    ): Promise<DomainResult<AuditEvent>> {
      // Determine if this is an upgrade or downgrade
      const roleHierarchy = ['RESIDENT', 'SECURITY', 'RT_ADMIN', 'ORG_ADMIN', 'TENANT_OWNER', 'PLATFORM_ADMIN'];
      const previousIndex = roleHierarchy.indexOf(previousRole);
      const newIndex = roleHierarchy.indexOf(newRole);

      const escalationType = newIndex > previousIndex
        ? PrivilegeEscalationType.ROLE_UPGRADED
        : PrivilegeEscalationType.ROLE_DOWNGRADED;

      return this.logPrivilegeEscalation({
        escalationType,
        actorUserId,
        targetUserId,
        tenantId,
        previousState: { role: previousRole },
        newState: { role: newRole },
        membershipId,
        metadata,
      });
    },

    async logPermissionGrant(
      actorUserId: string,
      targetUserId: string,
      tenantId: string,
      permissions: string[],
      metadata?: SecurityEventMetadata,
    ): Promise<DomainResult<AuditEvent>> {
      return this.logPrivilegeEscalation({
        escalationType: PrivilegeEscalationType.PERMISSION_GRANTED,
        actorUserId,
        targetUserId,
        tenantId,
        newState: { permissions },
        metadata,
      });
    },

    // -------------------------------------------------------------------------
    // Anomaly Detection
    // -------------------------------------------------------------------------

    async logAnomalyEvent(
      input: LogAnomalyEventInput,
    ): Promise<DomainResult<AuditEvent>> {
      const validation = validateTenantId(input.tenantId);
      if (!validation.success) {
        return validation as DomainResult<AuditEvent>;
      }

      const defaultSeverity = ANOMALY_SEVERITY_MAP[input.anomalyType] ?? SecurityEventSeverity.WARNING;
      const severity = input.severity ?? defaultSeverity;

      const auditInput = createAuditInput(
        'SECURITY_SUSPICIOUS_ACTIVITY',
        input.userId,
        input.tenantId,
        SecurityEventCategory.ANOMALY_DETECTION,
        severity,
        {
          anomalyType: input.anomalyType,
          description: input.description,
          indicators: sanitizeDetails(input.indicators),
          ...(input.recommendedAction && { recommendedAction: input.recommendedAction }),
          ...(input.automaticActionTaken !== undefined && { automaticActionTaken: input.automaticActionTaken }),
          ...(input.automaticAction && { automaticAction: input.automaticAction }),
        },
        input.metadata,
        false,
        `ANOMALY_${input.anomalyType}`,
      );

      return auditTrailRepository.create(auditInput);
    },

    async logBruteForceAttempt(
      userId: string | null,
      tenantId: string,
      attemptCount: number,
      timeWindowMinutes: number,
      metadata?: SecurityEventMetadata,
    ): Promise<DomainResult<AuditEvent>> {
      return this.logAnomalyEvent({
        anomalyType: AnomalyType.BRUTE_FORCE_ATTEMPT,
        userId,
        tenantId,
        severity: SecurityEventSeverity.CRITICAL,
        description: `Brute force attempt detected: ${attemptCount} failed logins in ${timeWindowMinutes} minutes`,
        indicators: {
          attemptCount,
          timeWindowMinutes,
          ipAddress: metadata?.ipAddress,
        },
        recommendedAction: 'Consider blocking IP or enabling additional security measures',
        metadata,
      });
    },

    async logCrossTenantAttempt(
      userId: string,
      sourceTenantId: string,
      targetTenantId: string,
      metadata?: SecurityEventMetadata,
    ): Promise<DomainResult<AuditEvent>> {
      return this.logAnomalyEvent({
        anomalyType: AnomalyType.CROSS_TENANT_ATTEMPT,
        userId,
        tenantId: sourceTenantId,
        severity: SecurityEventSeverity.CRITICAL,
        description: `Cross-tenant access attempt from tenant ${sourceTenantId} to tenant ${targetTenantId}`,
        indicators: {
          sourceTenantId,
          targetTenantId,
          attemptedResource: metadata?.requestPath,
        },
        recommendedAction: 'Investigate user activity for potential compromise',
        metadata,
      });
    },

    async logSuspiciousActivity(
      userId: string | null,
      tenantId: string,
      description: string,
      severity: SecurityEventSeverity,
      metadata?: SecurityEventMetadata,
    ): Promise<DomainResult<AuditEvent>> {
      return this.logAnomalyEvent({
        anomalyType: AnomalyType.UNUSUAL_ACCESS_PATTERN,
        userId,
        tenantId,
        severity,
        description,
        indicators: {
          detectedAt: new Date().toISOString(),
          ...(metadata?.requestPath && { requestPath: metadata.requestPath }),
          ...(metadata?.ipAddress && { ipAddress: metadata.ipAddress }),
        },
        metadata,
      });
    },

    // -------------------------------------------------------------------------
    // Analysis & Reporting
    // -------------------------------------------------------------------------

    async detectBruteForce(
      userId: string | null,
      ipAddress: string,
      windowMinutes: number,
      threshold: number,
    ): Promise<DomainResult<boolean>> {
      if (!ipAddress || ipAddress.trim() === '') {
        return fail(validationError(
          'SECURITY_AUDIT_IP_REQUIRED',
          'IP address is required for brute force detection',
        ));
      }

      const detected = checkBruteForcePattern(userId, ipAddress, windowMinutes, threshold);
      return ok(detected);
    },

    async getSecuritySummary(
      tenantId: string,
      periodStart: Date,
      periodEnd: Date,
    ): Promise<DomainResult<SecurityEventSummary>> {
      const validation = validateTenantId(tenantId);
      if (!validation.success) {
        return validation as DomainResult<SecurityEventSummary>;
      }

      // Query audit events for the period
      const eventsResult = await auditTrailRepository.findByTenant(
        tenantId,
        {
          startDate: periodStart,
          endDate: periodEnd,
        },
        { page: 1, pageSize: 10000 }, // Get all events for summary
      );

      if (!eventsResult.success) {
        return eventsResult as DomainResult<SecurityEventSummary>;
      }

      const events = eventsResult.data.events;

      // Initialize counters
      const byCategory: Record<SecurityEventCategory, number> = {
        [SecurityEventCategory.AUTHENTICATION]: 0,
        [SecurityEventCategory.AUTHORIZATION_DENIAL]: 0,
        [SecurityEventCategory.PRIVILEGE_ESCALATION]: 0,
        [SecurityEventCategory.ANOMALY_DETECTION]: 0,
        [SecurityEventCategory.SECURITY_GENERAL]: 0,
      };

      const bySeverity: Record<SecurityEventSeverity, number> = {
        [SecurityEventSeverity.INFO]: 0,
        [SecurityEventSeverity.WARNING]: 0,
        [SecurityEventSeverity.HIGH]: 0,
        [SecurityEventSeverity.CRITICAL]: 0,
      };

      let failedAuthCount = 0;
      let authorizationDenialCount = 0;
      let privilegeEscalationCount = 0;
      let anomalyCount = 0;
      let criticalEvents = 0;

      // Analyze events
      for (const event of events) {
        const details = event.details as Record<string, unknown>;
        const category = details.category as SecurityEventCategory | undefined;
        const severity = details.severity as SecurityEventSeverity | undefined;

        if (category && byCategory[category] !== undefined) {
          byCategory[category]++;
        }

        if (severity && bySeverity[severity] !== undefined) {
          bySeverity[severity]++;
          if (severity === SecurityEventSeverity.CRITICAL) {
            criticalEvents++;
          }
        }

        // Count specific event types
        const eventTypeStr = String(event.eventType);
        if (eventTypeStr.includes('LOGIN_FAILURE')) {
          failedAuthCount++;
        }
        if (eventTypeStr.includes('AUTHORIZATION_CHECK_FAILED') || category === SecurityEventCategory.AUTHORIZATION_DENIAL) {
          authorizationDenialCount++;
        }
        if (category === SecurityEventCategory.PRIVILEGE_ESCALATION) {
          privilegeEscalationCount++;
        }
        if (category === SecurityEventCategory.ANOMALY_DETECTION) {
          anomalyCount++;
        }
      }

      return ok({
        periodStart,
        periodEnd,
        tenantId,
        totalEvents: events.length,
        byCategory,
        bySeverity,
        failedAuthCount,
        authorizationDenialCount,
        privilegeEscalationCount,
        anomalyCount,
        criticalEvents,
      });
    },

    async getRecentCriticalEvents(
      tenantId: string,
      limit: number,
    ): Promise<DomainResult<AuditEvent[]>> {
      const validation = validateTenantId(tenantId);
      if (!validation.success) {
        return validation as DomainResult<AuditEvent[]>;
      }

      // Query recent events and filter for critical
      const eventsResult = await auditTrailRepository.findByTenant(
        tenantId,
        undefined,
        { page: 1, pageSize: limit * 5 }, // Get more than needed to filter
      );

      if (!eventsResult.success) {
        return eventsResult as DomainResult<AuditEvent[]>;
      }

      // Filter for critical severity events
      const criticalEvents = eventsResult.data.events.filter(event => {
        const details = event.details as Record<string, unknown>;
        return details.severity === SecurityEventSeverity.CRITICAL ||
          details.severity === SecurityEventSeverity.HIGH;
      }).slice(0, limit);

      return ok(criticalEvents);
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type AuditSecurityEventsService = IAuditSecurityEventsService;
