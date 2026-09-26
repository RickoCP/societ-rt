/**
 * TokenSecurityAuditService — Infrastructure service for security audit logging.
 *
 * Implements comprehensive security audit logging for token operations:
 * - Log all token operations with security context
 * - Correlation ID tracking
 * - Severity levels for security events
 * - Structured logging format
 *
 * @see Task 40: Token Security Hardening
 * @see Requirement 24: Audit Trail for Authorization Events
 */

import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Severity levels for security events.
 */
export type SecurityEventSeverity =
  | 'debug'
  | 'info'
  | 'notice'
  | 'warning'
  | 'error'
  | 'critical'
  | 'alert';

/**
 * Categories of security events.
 */
export type SecurityEventCategory =
  | 'authentication'
  | 'authorization'
  | 'token_operation'
  | 'session_management'
  | 'password_change'
  | 'recovery'
  | 'mfa'
  | 'suspicious_activity'
  | 'configuration_change'
  | 'admin_action';

/**
 * Types of token security events.
 */
export type TokenSecurityEventType =
  // Token Creation
  | 'token_created'
  | 'access_token_issued'
  | 'refresh_token_issued'
  | 'recovery_token_issued'
  // Token Validation
  | 'token_validated'
  | 'token_validation_failed'
  | 'token_expired'
  | 'token_revoked'
  | 'token_version_mismatch'
  // Token Rotation
  | 'token_rotated'
  | 'token_rotation_failed'
  // Token Revocation
  | 'token_revoked_single'
  | 'token_revoked_family'
  | 'token_revoked_user'
  | 'token_revoked_tenant'
  // Security Incidents
  | 'token_reuse_detected'
  | 'token_leak_suspected'
  | 'suspicious_token_usage'
  | 'impossible_travel_detected'
  | 'concurrent_ip_anomaly'
  | 'brute_force_attempt'
  | 'rate_limit_exceeded'
  // Session Events
  | 'session_created'
  | 'session_terminated'
  | 'session_force_logout'
  | 'all_sessions_terminated'
  // Password Events
  | 'password_changed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'password_policy_violation'
  // Recovery Events
  | 'recovery_requested'
  | 'recovery_validated'
  | 'recovery_used'
  | 'recovery_expired'
  | 'recovery_rate_limited';

/**
 * A security audit event.
 */
export interface TokenSecurityAuditEvent {
  /** Unique event ID */
  readonly eventId: string;
  /** Correlation ID for request tracing */
  readonly correlationId: string;
  /** Event timestamp */
  readonly timestamp: Date;
  /** Event type */
  readonly eventType: TokenSecurityEventType;
  /** Event category */
  readonly category: SecurityEventCategory;
  /** Severity level */
  readonly severity: SecurityEventSeverity;
  /** User ID (if known) */
  readonly userId?: string;
  /** Tenant ID (if applicable) */
  readonly tenantId?: string;
  /** IP address (if known) */
  readonly ipAddress?: string;
  /** User agent (if known) */
  readonly userAgent?: string;
  /** Token ID (if applicable, never the actual token) */
  readonly tokenId?: string;
  /** Token family ID (for refresh tokens) */
  readonly tokenFamilyId?: string;
  /** Whether the operation succeeded */
  readonly success: boolean;
  /** Error code (if failed) */
  readonly errorCode?: string;
  /** Human-readable description */
  readonly description: string;
  /** Additional structured metadata */
  readonly metadata?: Record<string, unknown>;
  /** Geographic location (if available) */
  readonly geolocation?: {
    country?: string;
    region?: string;
    city?: string;
  };
}

/**
 * Input for creating an audit event.
 */
export interface CreateAuditEventInput {
  correlationId?: string;
  eventType: TokenSecurityEventType;
  category: SecurityEventCategory;
  severity: SecurityEventSeverity;
  userId?: string;
  tenantId?: string;
  ipAddress?: string;
  userAgent?: string;
  tokenId?: string;
  tokenFamilyId?: string;
  success: boolean;
  errorCode?: string;
  description: string;
  metadata?: Record<string, unknown>;
  geolocation?: TokenSecurityAuditEvent['geolocation'];
}

/**
 * Query options for retrieving audit events.
 */
export interface AuditEventQuery {
  /** Filter by user ID */
  userId?: string;
  /** Filter by tenant ID */
  tenantId?: string;
  /** Filter by event types */
  eventTypes?: TokenSecurityEventType[];
  /** Filter by categories */
  categories?: SecurityEventCategory[];
  /** Filter by minimum severity */
  minSeverity?: SecurityEventSeverity;
  /** Filter by correlation ID */
  correlationId?: string;
  /** Start time (inclusive) */
  startTime?: Date;
  /** End time (exclusive) */
  endTime?: Date;
  /** Filter by IP address */
  ipAddress?: string;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Alert configuration for critical events.
 */
export interface SecurityAlertConfig {
  /** Event types that should trigger alerts */
  alertEventTypes: TokenSecurityEventType[];
  /** Minimum severity for alerts */
  minAlertSeverity: SecurityEventSeverity;
  /** Alert handler function */
  alertHandler: (event: TokenSecurityAuditEvent) => void | Promise<void>;
}

/**
 * Configuration for TokenSecurityAuditService.
 */
export interface TokenSecurityAuditServiceConfig {
  /** Enable console logging (default: true in development) */
  consoleLogging: boolean;
  /** Minimum severity for console logging */
  consoleMinSeverity: SecurityEventSeverity;
  /** Alert configuration */
  alertConfig?: SecurityAlertConfig;
  /** Event persistence handler (for database storage) */
  persistenceHandler?: (event: TokenSecurityAuditEvent) => Promise<void>;
  /** Maximum events to keep in memory (default: 10000) */
  maxInMemoryEvents: number;
  /** Event TTL in memory in milliseconds (default: 1 hour) */
  eventTtlMs: number;
}

const DEFAULT_CONFIG: TokenSecurityAuditServiceConfig = {
  consoleLogging: process.env.NODE_ENV !== 'production',
  consoleMinSeverity: 'info',
  maxInMemoryEvents: 10000,
  eventTtlMs: 60 * 60 * 1000, // 1 hour
};

// ---------------------------------------------------------------------------
// Severity Ordering
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<SecurityEventSeverity, number> = {
  debug: 0,
  info: 1,
  notice: 2,
  warning: 3,
  error: 4,
  critical: 5,
  alert: 6,
};

function isSeverityAtLeast(
  severity: SecurityEventSeverity,
  minSeverity: SecurityEventSeverity,
): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[minSeverity];
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface TokenSecurityAuditService {
  /**
   * Log a security audit event.
   */
  log(input: CreateAuditEventInput): Promise<TokenSecurityAuditEvent>;

  /**
   * Log a token creation event.
   */
  logTokenCreated(
    tokenType: 'access' | 'refresh' | 'recovery',
    options: {
      correlationId?: string;
      userId: string;
      tenantId?: string;
      tokenId?: string;
      tokenFamilyId?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<TokenSecurityAuditEvent>;

  /**
   * Log a token validation failure.
   */
  logTokenValidationFailed(
    reason: 'expired' | 'invalid' | 'revoked' | 'version_mismatch' | 'reuse_detected',
    options: {
      correlationId?: string;
      userId?: string;
      tenantId?: string;
      tokenId?: string;
      tokenFamilyId?: string;
      ipAddress?: string;
      userAgent?: string;
      errorCode?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TokenSecurityAuditEvent>;

  /**
   * Log a security incident (high severity).
   */
  logSecurityIncident(
    incidentType:
      | 'token_reuse_detected'
      | 'token_leak_suspected'
      | 'impossible_travel_detected'
      | 'concurrent_ip_anomaly'
      | 'brute_force_attempt',
    options: {
      correlationId?: string;
      userId?: string;
      tenantId?: string;
      tokenId?: string;
      ipAddress?: string;
      userAgent?: string;
      description: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TokenSecurityAuditEvent>;

  /**
   * Log a password change event.
   */
  logPasswordChange(
    changeType: 'changed' | 'reset_requested' | 'reset_completed' | 'policy_violation',
    options: {
      correlationId?: string;
      userId: string;
      tenantId?: string;
      ipAddress?: string;
      userAgent?: string;
      success: boolean;
      errorCode?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TokenSecurityAuditEvent>;

  /**
   * Log a session event.
   */
  logSessionEvent(
    sessionEvent: 'created' | 'terminated' | 'force_logout' | 'all_terminated',
    options: {
      correlationId?: string;
      userId: string;
      tenantId?: string;
      ipAddress?: string;
      userAgent?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TokenSecurityAuditEvent>;

  /**
   * Query audit events.
   */
  query(options: AuditEventQuery): Promise<TokenSecurityAuditEvent[]>;

  /**
   * Get recent events for a user.
   */
  getRecentUserEvents(
    userId: string,
    limit?: number,
  ): Promise<TokenSecurityAuditEvent[]>;

  /**
   * Get events by correlation ID.
   */
  getByCorrelationId(correlationId: string): Promise<TokenSecurityAuditEvent[]>;

  /**
   * Generate a new correlation ID.
   */
  generateCorrelationId(): string;

  /**
   * Get event count by type within a time window.
   */
  getEventCount(
    eventTypes: TokenSecurityEventType[],
    windowMs: number,
    filters?: { userId?: string; tenantId?: string; ipAddress?: string },
  ): Promise<number>;
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for TokenSecurityAuditService.
 * Follows DI pattern.
 *
 * NOTE: This uses in-memory storage for events. In production,
 * use persistenceHandler to store events in a database.
 */
export function TokenSecurityAuditServiceImpl(
  config: Partial<TokenSecurityAuditServiceConfig> = {},
): TokenSecurityAuditService {
  const finalConfig: TokenSecurityAuditServiceConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // In-memory event storage (use persistence handler in production)
  const events: TokenSecurityAuditEvent[] = [];

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------

  /**
   * Clean up old events from memory.
   */
  function cleanupOldEvents(): void {
    const cutoff = Date.now() - finalConfig.eventTtlMs;
    let removeCount = 0;

    while (
      events.length > 0 &&
      events[0]!.timestamp.getTime() < cutoff
    ) {
      events.shift();
      removeCount++;
    }

    // Also enforce max events limit
    while (events.length > finalConfig.maxInMemoryEvents) {
      events.shift();
      removeCount++;
    }
  }

  /**
   * Format event for console logging.
   */
  function formatForConsole(event: TokenSecurityAuditEvent): string {
    const parts = [
      `[${event.severity.toUpperCase()}]`,
      `[${event.category}]`,
      `[${event.eventType}]`,
      event.success ? '✓' : '✗',
      event.description,
    ];

    if (event.userId) {
      parts.push(`user=${event.userId}`);
    }
    if (event.correlationId) {
      parts.push(`cid=${event.correlationId.slice(0, 8)}`);
    }
    if (event.errorCode) {
      parts.push(`error=${event.errorCode}`);
    }

    return parts.join(' ');
  }

  /**
   * Check if event should trigger an alert.
   */
  function shouldAlert(event: TokenSecurityAuditEvent): boolean {
    if (!finalConfig.alertConfig) return false;

    const { alertEventTypes, minAlertSeverity } = finalConfig.alertConfig;

    return (
      alertEventTypes.includes(event.eventType) ||
      isSeverityAtLeast(event.severity, minAlertSeverity)
    );
  }

  // ---------------------------------------------------------------------------
  // Service Methods
  // ---------------------------------------------------------------------------

  async function log(input: CreateAuditEventInput): Promise<TokenSecurityAuditEvent> {
    const event: TokenSecurityAuditEvent = {
      eventId: uuidv4(),
      correlationId: input.correlationId || uuidv4(),
      timestamp: new Date(),
      eventType: input.eventType,
      category: input.category,
      severity: input.severity,
      userId: input.userId,
      tenantId: input.tenantId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      tokenId: input.tokenId,
      tokenFamilyId: input.tokenFamilyId,
      success: input.success,
      errorCode: input.errorCode,
      description: input.description,
      metadata: input.metadata,
      geolocation: input.geolocation,
    };

    // Store in memory
    events.push(event);
    cleanupOldEvents();

    // Console logging
    if (
      finalConfig.consoleLogging &&
      isSeverityAtLeast(event.severity, finalConfig.consoleMinSeverity)
    ) {
      const formatted = formatForConsole(event);
      switch (event.severity) {
        case 'error':
        case 'critical':
        case 'alert':
          console.error(`[SECURITY] ${formatted}`);
          break;
        case 'warning':
          console.warn(`[SECURITY] ${formatted}`);
          break;
        default:
          console.log(`[SECURITY] ${formatted}`);
      }
    }

    // Persistence
    if (finalConfig.persistenceHandler) {
      try {
        await finalConfig.persistenceHandler(event);
      } catch (error) {
        console.error('Failed to persist security audit event:', error);
      }
    }

    // Alert handling
    if (shouldAlert(event) && finalConfig.alertConfig?.alertHandler) {
      try {
        await finalConfig.alertConfig.alertHandler(event);
      } catch (error) {
        console.error('Failed to send security alert:', error);
      }
    }

    return event;
  }

  async function logTokenCreated(
    tokenType: 'access' | 'refresh' | 'recovery',
    options: {
      correlationId?: string;
      userId: string;
      tenantId?: string;
      tokenId?: string;
      tokenFamilyId?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<TokenSecurityAuditEvent> {
    const eventTypeMap: Record<string, TokenSecurityEventType> = {
      access: 'access_token_issued',
      refresh: 'refresh_token_issued',
      recovery: 'recovery_token_issued',
    };

    return log({
      ...options,
      eventType: eventTypeMap[tokenType] as TokenSecurityEventType,
      category: 'token_operation',
      severity: 'info',
      success: true,
      description: `${tokenType} token issued for user`,
    });
  }

  async function logTokenValidationFailed(
    reason: 'expired' | 'invalid' | 'revoked' | 'version_mismatch' | 'reuse_detected',
    options: {
      correlationId?: string;
      userId?: string;
      tenantId?: string;
      tokenId?: string;
      tokenFamilyId?: string;
      ipAddress?: string;
      userAgent?: string;
      errorCode?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TokenSecurityAuditEvent> {
    const eventTypeMap: Record<string, TokenSecurityEventType> = {
      expired: 'token_expired',
      invalid: 'token_validation_failed',
      revoked: 'token_revoked',
      version_mismatch: 'token_version_mismatch',
      reuse_detected: 'token_reuse_detected',
    };

    const severityMap: Record<string, SecurityEventSeverity> = {
      expired: 'info',
      invalid: 'warning',
      revoked: 'info',
      version_mismatch: 'warning',
      reuse_detected: 'critical',
    };

    return log({
      ...options,
      eventType: eventTypeMap[reason] as TokenSecurityEventType,
      category: reason === 'reuse_detected' ? 'suspicious_activity' : 'authentication',
      severity: severityMap[reason] as SecurityEventSeverity,
      success: false,
      description: `Token validation failed: ${reason}`,
    });
  }

  async function logSecurityIncident(
    incidentType:
      | 'token_reuse_detected'
      | 'token_leak_suspected'
      | 'impossible_travel_detected'
      | 'concurrent_ip_anomaly'
      | 'brute_force_attempt',
    options: {
      correlationId?: string;
      userId?: string;
      tenantId?: string;
      tokenId?: string;
      ipAddress?: string;
      userAgent?: string;
      description: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TokenSecurityAuditEvent> {
    return log({
      ...options,
      eventType: incidentType,
      category: 'suspicious_activity',
      severity: incidentType === 'token_reuse_detected' ? 'critical' : 'error',
      success: false,
    });
  }

  async function logPasswordChange(
    changeType: 'changed' | 'reset_requested' | 'reset_completed' | 'policy_violation',
    options: {
      correlationId?: string;
      userId: string;
      tenantId?: string;
      ipAddress?: string;
      userAgent?: string;
      success: boolean;
      errorCode?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TokenSecurityAuditEvent> {
    const eventTypeMap: Record<string, TokenSecurityEventType> = {
      changed: 'password_changed',
      reset_requested: 'password_reset_requested',
      reset_completed: 'password_reset_completed',
      policy_violation: 'password_policy_violation',
    };

    return log({
      ...options,
      eventType: eventTypeMap[changeType] as TokenSecurityEventType,
      category: 'password_change',
      severity: changeType === 'policy_violation' ? 'warning' : 'info',
      description: `Password ${changeType.replace('_', ' ')}`,
    });
  }

  async function logSessionEvent(
    sessionEvent: 'created' | 'terminated' | 'force_logout' | 'all_terminated',
    options: {
      correlationId?: string;
      userId: string;
      tenantId?: string;
      ipAddress?: string;
      userAgent?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TokenSecurityAuditEvent> {
    const eventTypeMap: Record<string, TokenSecurityEventType> = {
      created: 'session_created',
      terminated: 'session_terminated',
      force_logout: 'session_force_logout',
      all_terminated: 'all_sessions_terminated',
    };

    return log({
      ...options,
      eventType: eventTypeMap[sessionEvent] as TokenSecurityEventType,
      category: 'session_management',
      severity: sessionEvent === 'force_logout' ? 'notice' : 'info',
      success: true,
      description: `Session ${sessionEvent.replace('_', ' ')}`,
    });
  }

  async function query(options: AuditEventQuery): Promise<TokenSecurityAuditEvent[]> {
    let filtered = events.slice(); // Copy array

    if (options.userId) {
      filtered = filtered.filter(e => e.userId === options.userId);
    }
    if (options.tenantId) {
      filtered = filtered.filter(e => e.tenantId === options.tenantId);
    }
    if (options.eventTypes && options.eventTypes.length > 0) {
      filtered = filtered.filter(e => options.eventTypes!.includes(e.eventType));
    }
    if (options.categories && options.categories.length > 0) {
      filtered = filtered.filter(e => options.categories!.includes(e.category));
    }
    if (options.minSeverity) {
      filtered = filtered.filter(e =>
        isSeverityAtLeast(e.severity, options.minSeverity!),
      );
    }
    if (options.correlationId) {
      filtered = filtered.filter(e => e.correlationId === options.correlationId);
    }
    if (options.startTime) {
      filtered = filtered.filter(e => e.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      filtered = filtered.filter(e => e.timestamp < options.endTime!);
    }
    if (options.ipAddress) {
      filtered = filtered.filter(e => e.ipAddress === options.ipAddress);
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    if (options.offset) {
      filtered = filtered.slice(options.offset);
    }
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  async function getRecentUserEvents(
    userId: string,
    limit: number = 50,
  ): Promise<TokenSecurityAuditEvent[]> {
    return query({ userId, limit });
  }

  async function getByCorrelationId(
    correlationId: string,
  ): Promise<TokenSecurityAuditEvent[]> {
    return query({ correlationId });
  }

  function generateCorrelationId(): string {
    return uuidv4();
  }

  async function getEventCount(
    eventTypes: TokenSecurityEventType[],
    windowMs: number,
    filters?: { userId?: string; tenantId?: string; ipAddress?: string },
  ): Promise<number> {
    const startTime = new Date(Date.now() - windowMs);
    const result = await query({
      eventTypes,
      startTime,
      ...filters,
    });
    return result.length;
  }

  return {
    log,
    logTokenCreated,
    logTokenValidationFailed,
    logSecurityIncident,
    logPasswordChange,
    logSessionEvent,
    query,
    getRecentUserEvents,
    getByCorrelationId,
    generateCorrelationId,
    getEventCount,
  };
}
