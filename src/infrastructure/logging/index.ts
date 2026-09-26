/**
 * Logging Infrastructure — Public API exports.
 *
 * This module provides structured logging and observability services.
 *
 * **Log Aggregation Compatibility:**
 * All loggers output structured JSON format compatible with:
 * - ELK Stack (Elasticsearch, Logstash, Kibana)
 * - AWS CloudWatch Logs
 * - Datadog
 * - Splunk
 * - Google Cloud Logging
 *
 * **Standard Log Format:**
 * - timestamp: ISO 8601 format (UTC)
 * - level: info, warn, error, debug
 * - message: Human-readable log message
 * - correlation_id: Request tracing identifier
 * - service_name: Service identification
 * - environment: deployment environment
 * - Additional context fields
 *
 * **Correlation ID Integration:**
 * All audit loggers integrate with the correlationId system from
 * `@infrastructure/utils/correlationId`. If a correlationId is not provided,
 * a fallback value is automatically generated.
 *
 * @see Requirements 25.1, 25.2 — Logging and Observability
 * @see Requirement 15.1 — Authorization Decision Audit Logging
 * @see Requirement 15.2 — Context Switch Audit Logging
 * @see Requirement 15.3 — Token Validation Audit Logging
 * @see Requirement 15.6 — Structured JSON Logging for Log Aggregation
 * @see Requirement 15.8 — Integrate with correlationId system
 */

// CorrelationId System Integration (Requirements 15.8)
export { 
  generateCorrelationId,
  getOrGenerateCorrelationId,
  isValidCorrelationId,
} from '@infrastructure/utils/correlationId';

// Logging Configuration (Central configuration for structured JSON logging)
export {
  LOG_LEVELS,
  LOG_LEVEL_VALUES,
  type LogLevelConfig,
  type StandardLogFields,
  type ServiceIdentificationFields,
  type ContextFields,
  type RequestContextFields,
  type LogEventType,
  type StructuredLogEntry,
  type LoggingConfiguration,
  type StructuredLogger,
  DEFAULT_PRODUCTION_CONFIG,
  DEFAULT_DEVELOPMENT_CONFIG,
  DEFAULT_STAGING_CONFIG,
  REQUIRED_LOG_FIELDS,
  ELK_FIELD_MAPPING,
  CLOUDWATCH_FIELD_MAPPING,
  getLoggingConfiguration,
  createLoggingConfiguration,
  buildStructuredLogEntry,
  flattenObject,
  normalizeKeysToSnakeCase,
  validateLogEntry,
  isValidTimestamp,
  isValidLogLevel,
  snakeToCamel,
  camelToSnake,
} from './LoggingConfiguration';

// Logger
export { createLogger, type Logger, type LogLevel, type LogContext, type LoggerConfig } from './Logger';

// Observability
export {
  type RequestMetrics,
  type LatencyPercentiles,
  type QueueDepthSnapshot,
  getLatencyPercentiles,
  getQueueDepthSnapshot,
  logRequestMetrics,
  startTimer,
} from './observability';

// Context Switch Audit Logger (FASE 2.13 — Task 23.2, Requirement 15.2)
export {
  ContextSwitchType,
  ContextSwitchTrigger,
  ContextSwitchResult,
  type ContextSwitchLogInput,
  type ContextSwitchAuditEntry,
  type IContextSwitchAuditLogger,
  type ContextSwitchAuditLogger,
  ContextSwitchAuditLoggerImpl,
  mapErrorCodeToResult,
  determineSwitchType,
} from './ContextSwitchAuditLogger';

// Token Validation Audit Logger (Requirement 15.3)
export {
  type TokenValidationResult,
  type TokenValidationFailureReason,
  type TokenVersionInfo,
  type TokenValidationContext,
  type TokenValidationLogEntry,
  type LogTokenValidationInput,
  type ITokenValidationLogger,
  type TokenValidationLogger,
  TokenValidationLoggerImpl,
} from './TokenValidationLogger';

// Authorization Audit Logger (FASE 2.13 — Task 23.1, Requirement 15.1)
export {
  type AuthorizationDecision,
  type AuthorizationDenialReason,
  type AuthorizationDecisionLogInput,
  type AuthorizationAuditLogger,
  type AuthorizationAuditLoggerDeps,
  type DenialDebuggingContext,
  createAuthorizationAuditLogger,
  createInsufficientPermissionDenial,
  createMembershipSuspendedDenial,
  createMembershipRevokedDenial,
  createTokenInvalidDenial,
  createAuthorizationAllow,
  // Denial debugging context helpers (Requirements 15.7)
  createInsufficientPermissionDebuggingContext,
  createTokenVersionMismatchDebuggingContext,
  createMembershipStatusDebuggingContext,
  createCrossTenantDebuggingContext,
  createScopeMismatchDebuggingContext,
  createContextResolutionFailureDebuggingContext,
  createDenialWithDebuggingContext,
} from './AuthorizationAuditLogger';

// Log Sanitizer (Sensitive Data Protection)
export {
  type SanitizationConfig,
  type SanitizationResult,
  type LogSanitizer,
  createLogSanitizer,
  logSanitizer,
  SENSITIVE_FIELDS_DOCUMENTATION,
  type SensitiveFieldsDocumentation,
} from './LogSanitizer';
