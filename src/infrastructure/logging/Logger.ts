/**
 * Structured JSON Logger — Factory function pattern for DI.
 *
 * Outputs structured JSON to stdout with the following standard fields:
 * - timestamp (ISO 8601 format, UTC)
 * - level (info | warn | error | debug)
 * - message (human-readable log message)
 * - correlation_id (request tracing identifier)
 * - tenant_id (multi-tenant context)
 * - user_id (user context)
 * - service_name (service identification)
 * - service_version (deployment version)
 * - environment (development | staging | production)
 * - event_type (categorization for filtering)
 *
 * **Log Aggregation Compatibility:**
 * This logger outputs single-line JSON compatible with:
 * - ELK Stack (Elasticsearch, Logstash, Kibana)
 * - AWS CloudWatch Logs
 * - Datadog
 * - Splunk
 * - Google Cloud Logging
 *
 * **Security:**
 * MUST NOT log sensitive data (passwords, tokens, OTP, CVV, PII without masking).
 *
 * Uses LogSanitizer for comprehensive sensitive data protection:
 * - Complete redaction for credentials, tokens, OTP, CVV
 * - Masking for PII (email, phone, ID numbers)
 * - Deep object sanitization
 * - Pattern detection for embedded secrets
 *
 * @see Requirements 15.5 — Ensure no sensitive data in logs
 * @see Requirements 15.6 — Structured JSON logging for log aggregation
 * @see Requirements 25.1, 25.2
 */

import { logSanitizer, type LogSanitizer } from './LogSanitizer';
import {
  getLoggingConfiguration,
  type LoggingConfiguration,
  type LogLevelConfig,
  LOG_LEVEL_VALUES,
} from './LoggingConfiguration';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Standard log context fields.
 * All fields use snake_case for log aggregation compatibility.
 */
export interface LogContext {
  /** Request correlation ID for distributed tracing */
  readonly correlation_id?: string;
  /** Tenant ID for multi-tenant context */
  readonly tenant_id?: string;
  /** User ID performing the action */
  readonly user_id?: string;
  /** Membership ID for the active membership */
  readonly membership_id?: string;
  /** Organization unit ID for scoped access */
  readonly org_unit_id?: string | null;
  /** HTTP route/endpoint */
  readonly route?: string;
  /** HTTP method */
  readonly method?: string;
  /** HTTP status code */
  readonly status_code?: number;
  /** Request duration in milliseconds */
  readonly duration_ms?: number;
  /** Event type for log aggregation filtering */
  readonly event_type?: string;
  /** Additional metadata */
  readonly [key: string]: unknown;
}

export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}

export interface LoggerConfig {
  /** Custom sanitizer instance (defaults to standard logSanitizer) */
  readonly sanitizer?: LogSanitizer;
  /** Whether to include sanitization metadata in debug logs */
  readonly includeSanitizationMetadata?: boolean;
  /** Logging configuration (defaults to environment-based config) */
  readonly loggingConfig?: LoggingConfiguration;
  /** Override service name */
  readonly serviceName?: string;
  /** Override service version */
  readonly serviceVersion?: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a structured JSON logger instance.
 *
 * Uses factory function pattern so it can be registered in the Awilix
 * DI container as a singleton.
 *
 * **Output Format (Log Aggregation Compatible):**
 * ```json
 * {
 *   "timestamp": "2024-01-15T10:30:00.000Z",
 *   "level": "info",
 *   "message": "Authorization decision: ALLOW",
 *   "correlation_id": "abc-123",
 *   "service_name": "societ-rt",
 *   "service_version": "1.0.0",
 *   "environment": "production",
 *   "user_id": "user-1",
 *   "tenant_id": "tenant-1",
 *   "event_type": "authorization_decision"
 * }
 * ```
 *
 * @param config - Optional configuration for the logger
 * @returns A Logger instance with automatic sensitive data sanitization
 *
 * @example
 * ```typescript
 * // Basic usage
 * const logger = createLogger();
 * logger.info('User logged in', { user_id: '123', email: 'test@example.com' });
 * // Output: { ..., user_id: '123', email: 'te***@example.com' }
 *
 * // Custom sanitizer
 * const customSanitizer = createLogSanitizer({ maxDepth: 5 });
 * const logger = createLogger({ sanitizer: customSanitizer });
 * ```
 */
export const createLogger = (config?: LoggerConfig): Logger => {
  const sanitizer = config?.sanitizer ?? logSanitizer;
  const loggingConfig = config?.loggingConfig ?? getLoggingConfiguration();
  const includeSanitizationMetadata =
    config?.includeSanitizationMetadata ?? loggingConfig.includeSanitizationMetadata;

  // Service identification from config or environment
  const serviceName = config?.serviceName ?? loggingConfig.service.name;
  const serviceVersion = config?.serviceVersion ?? loggingConfig.service.version;
  const environment = loggingConfig.service.environment;

  /**
   * Check if a log level should be output based on minimum level config.
   */
  const shouldLog = (level: LogLevel): boolean => {
    const levelValue = LOG_LEVEL_VALUES[level as LogLevelConfig] ?? 0;
    const minLevelValue = LOG_LEVEL_VALUES[loggingConfig.minLevel] ?? 0;
    return levelValue >= minLevelValue;
  };

  const write = (level: LogLevel, message: string, context?: LogContext): void => {
    // Filter logs below minimum level
    if (!shouldLog(level)) {
      return;
    }

    // Build structured log entry with standard fields
    const entry: Record<string, unknown> = {
      // Standard fields (REQUIRED for log aggregation)
      timestamp: new Date().toISOString(),
      level,
      message,

      // Service identification
      service_name: serviceName,
      service_version: serviceVersion,
      environment,
    };

    if (context) {
      // Use LogSanitizer for comprehensive sensitive data protection
      const sanitizationResult = sanitizer.sanitize(context as Record<string, unknown>);
      Object.assign(entry, sanitizationResult.sanitized);

      // Optionally include sanitization metadata in debug logs
      if (includeSanitizationMetadata && level === 'debug' && sanitizationResult.hadSensitiveData) {
        entry._sanitization = {
          redactedKeys: sanitizationResult.redactedKeys,
          maskedKeys: sanitizationResult.maskedKeys,
        };
      }
    }

    // Output as single-line JSON to stdout (log aggregation compatible)
    if (loggingConfig.prettyPrint) {
      process.stdout.write(JSON.stringify(entry, null, 2) + '\n');
    } else {
      process.stdout.write(JSON.stringify(entry) + '\n');
    }
  };

  return {
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
    debug: (message, context) => write('debug', message, context),
  };
};

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export { logSanitizer, createLogSanitizer, type LogSanitizer } from './LogSanitizer';
