/**
 * Logging Configuration — Central configuration for structured JSON logging.
 *
 * This module provides centralized logging configuration to ensure all audit logs
 * output structured JSON format compatible with log aggregation systems:
 * - ELK Stack (Elasticsearch, Logstash, Kibana)
 * - AWS CloudWatch Logs
 * - Datadog
 * - Splunk
 * - Google Cloud Logging
 *
 * **Standard Log Format:**
 * All logs MUST include the following fields:
 * - timestamp: ISO 8601 format (e.g., "2024-01-15T10:30:00.000Z")
 * - level: Log level (info, warn, error, debug)
 * - correlationId: Request tracing identifier
 * - message: Human-readable log message
 * - metadata: Additional structured data
 *
 * **Log Aggregation Compatibility:**
 * - Field names use snake_case for universal compatibility
 * - All timestamps are ISO 8601 in UTC
 * - No nested objects beyond 2 levels (flattened for better indexing)
 * - Consistent field types (no mixed string/number fields)
 *
 * @see Requirements 15.6 — Structured JSON logging format for log aggregation
 * @see Error Handling Guideline (12-error-handling.md)
 * @see Security Guideline (05-security-guideline.md) — Logging Aman
 */

// ---------------------------------------------------------------------------
// Log Level Configuration
// ---------------------------------------------------------------------------

/**
 * Supported log levels in order of severity.
 * Compatible with common log aggregation systems.
 */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevelConfig = (typeof LOG_LEVELS)[number];

/**
 * Log level numeric values for filtering.
 * Higher values = more severe.
 */
export const LOG_LEVEL_VALUES: Record<LogLevelConfig, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const;

// ---------------------------------------------------------------------------
// Standard Log Fields Configuration
// ---------------------------------------------------------------------------

/**
 * Standard fields that MUST be present in every log entry.
 * These fields are required for log aggregation compatibility.
 */
export interface StandardLogFields {
  /**
   * ISO 8601 timestamp in UTC.
   * Example: "2024-01-15T10:30:00.000Z"
   */
  readonly timestamp: string;

  /**
   * Log level indicating severity.
   * One of: debug, info, warn, error
   */
  readonly level: LogLevelConfig;

  /**
   * Human-readable log message.
   * Should be descriptive but concise.
   */
  readonly message: string;

  /**
   * Request correlation ID for distributed tracing.
   * Used to correlate logs across services.
   */
  readonly correlation_id?: string;
}

/**
 * Extended fields for service identification.
 * Useful for multi-service deployments.
 */
export interface ServiceIdentificationFields {
  /**
   * Service name for filtering in log aggregation.
   */
  readonly service_name?: string;

  /**
   * Service version for debugging.
   */
  readonly service_version?: string;

  /**
   * Environment (development, staging, production).
   */
  readonly environment?: string;

  /**
   * Host/instance identifier.
   */
  readonly host?: string;
}

/**
 * User and tenant context fields.
 * Common across all audit logs.
 */
export interface ContextFields {
  /**
   * User ID performing the action.
   */
  readonly user_id?: string;

  /**
   * Tenant ID for multi-tenant isolation.
   */
  readonly tenant_id?: string;

  /**
   * Membership ID for the active membership.
   */
  readonly membership_id?: string;

  /**
   * Organization unit ID for scoped access.
   */
  readonly org_unit_id?: string | null;
}

/**
 * Request context fields.
 * Useful for API request logging.
 */
export interface RequestContextFields {
  /**
   * HTTP route/endpoint.
   */
  readonly route?: string;

  /**
   * HTTP method (GET, POST, PUT, DELETE, etc.).
   */
  readonly method?: string;

  /**
   * HTTP status code.
   */
  readonly status_code?: number;

  /**
   * Request duration in milliseconds.
   */
  readonly duration_ms?: number;

  /**
   * Client IP address (masked/hashed for privacy).
   */
  readonly client_ip_hash?: string;
}

/**
 * Event type categorization for log aggregation filtering.
 */
export type LogEventType =
  | 'authorization_decision'
  | 'context_switch'
  | 'token_validation'
  | 'rls_context'
  | 'api_request'
  | 'security_event'
  | 'business_event'
  | 'system_event';

/**
 * Complete structured log entry type.
 * Combines all field types for full compatibility.
 */
export interface StructuredLogEntry
  extends StandardLogFields,
    ServiceIdentificationFields,
    ContextFields,
    RequestContextFields {
  /**
   * Event type for categorization.
   */
  readonly event_type?: LogEventType;

  /**
   * Additional metadata (flattened to avoid deep nesting).
   */
  readonly [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Logging Configuration
// ---------------------------------------------------------------------------

/**
 * Environment-specific logging configuration.
 */
export interface LoggingConfiguration {
  /**
   * Minimum log level to output.
   * Logs below this level are filtered out.
   */
  readonly minLevel: LogLevelConfig;

  /**
   * Whether to include debug information.
   * Should be false in production.
   */
  readonly includeDebugInfo: boolean;

  /**
   * Whether to pretty-print JSON output.
   * Should be false in production for single-line JSON.
   */
  readonly prettyPrint: boolean;

  /**
   * Whether to include stack traces in error logs.
   * May expose internal details; use with caution.
   */
  readonly includeStackTrace: boolean;

  /**
   * Whether to include sanitization metadata.
   * Useful for debugging but increases log size.
   */
  readonly includeSanitizationMetadata: boolean;

  /**
   * Service identification for multi-service deployments.
   */
  readonly service: {
    readonly name: string;
    readonly version: string;
    readonly environment: string;
  };

  /**
   * Maximum depth for nested object flattening.
   * Prevents deep nesting that breaks log aggregation.
   */
  readonly maxNestedDepth: number;
}

/**
 * Default logging configuration for production.
 */
export const DEFAULT_PRODUCTION_CONFIG: LoggingConfiguration = {
  minLevel: 'info',
  includeDebugInfo: false,
  prettyPrint: false,
  includeStackTrace: false,
  includeSanitizationMetadata: false,
  service: {
    name: 'societ-rt',
    version: process.env.APP_VERSION ?? '1.0.0',
    environment: 'production',
  },
  maxNestedDepth: 2,
};

/**
 * Default logging configuration for development.
 */
export const DEFAULT_DEVELOPMENT_CONFIG: LoggingConfiguration = {
  minLevel: 'debug',
  includeDebugInfo: true,
  prettyPrint: true,
  includeStackTrace: true,
  includeSanitizationMetadata: true,
  service: {
    name: 'societ-rt',
    version: process.env.APP_VERSION ?? '1.0.0-dev',
    environment: 'development',
  },
  maxNestedDepth: 3,
};

/**
 * Default logging configuration for staging.
 */
export const DEFAULT_STAGING_CONFIG: LoggingConfiguration = {
  minLevel: 'debug',
  includeDebugInfo: true,
  prettyPrint: false, // Single-line JSON for log aggregation
  includeStackTrace: true,
  includeSanitizationMetadata: false,
  service: {
    name: 'societ-rt',
    version: process.env.APP_VERSION ?? '1.0.0-staging',
    environment: 'staging',
  },
  maxNestedDepth: 2,
};

// ---------------------------------------------------------------------------
// Configuration Factory
// ---------------------------------------------------------------------------

/**
 * Get the appropriate logging configuration based on environment.
 *
 * @param env - Environment name (defaults to NODE_ENV)
 * @returns Logging configuration for the environment
 */
export function getLoggingConfiguration(
  env: string = process.env.NODE_ENV ?? 'development',
): LoggingConfiguration {
  switch (env.toLowerCase()) {
    case 'production':
      return DEFAULT_PRODUCTION_CONFIG;
    case 'staging':
    case 'test':
      return DEFAULT_STAGING_CONFIG;
    case 'development':
    default:
      return DEFAULT_DEVELOPMENT_CONFIG;
  }
}

/**
 * Create a custom logging configuration with overrides.
 *
 * @param overrides - Partial configuration overrides
 * @param baseConfig - Base configuration to extend (defaults to env config)
 * @returns Merged logging configuration
 */
export function createLoggingConfiguration(
  overrides: Partial<LoggingConfiguration>,
  baseConfig?: LoggingConfiguration,
): LoggingConfiguration {
  const base = baseConfig ?? getLoggingConfiguration();
  return {
    ...base,
    ...overrides,
    service: {
      ...base.service,
      ...overrides.service,
    },
  };
}

// ---------------------------------------------------------------------------
// Log Entry Builders
// ---------------------------------------------------------------------------

/**
 * Build a structured log entry with standard fields.
 *
 * @param level - Log level
 * @param message - Log message
 * @param context - Additional context fields
 * @param config - Logging configuration
 * @returns Structured log entry
 */
export function buildStructuredLogEntry(
  level: LogLevelConfig,
  message: string,
  context?: Partial<Omit<StructuredLogEntry, 'timestamp' | 'level' | 'message'>>,
  config?: LoggingConfiguration,
): StructuredLogEntry {
  const cfg = config ?? getLoggingConfiguration();

  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service_name: cfg.service.name,
    service_version: cfg.service.version,
    environment: cfg.service.environment,
    ...context,
  };

  return entry;
}

/**
 * Flatten nested objects for log aggregation compatibility.
 * Prevents deep nesting that can cause indexing issues.
 *
 * @param obj - Object to flatten
 * @param prefix - Key prefix for flattened keys
 * @param maxDepth - Maximum nesting depth
 * @returns Flattened object
 *
 * @example
 * ```typescript
 * const nested = { user: { profile: { name: 'John' } } };
 * const flat = flattenObject(nested);
 * // Result: { 'user.profile.name': 'John' }
 * ```
 */
export function flattenObject(
  obj: Record<string, unknown>,
  prefix: string = '',
  maxDepth: number = 2,
  currentDepth: number = 0,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      currentDepth < maxDepth
    ) {
      Object.assign(
        result,
        flattenObject(value as Record<string, unknown>, newKey, maxDepth, currentDepth + 1),
      );
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

/**
 * Convert snake_case fields to camelCase for internal use.
 *
 * @param key - Snake case key
 * @returns Camel case key
 */
export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Convert camelCase fields to snake_case for log aggregation.
 *
 * @param key - Camel case key
 * @returns Snake case key
 */
export function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Normalize object keys to snake_case for log aggregation compatibility.
 *
 * @param obj - Object with any case keys
 * @returns Object with snake_case keys
 */
export function normalizeKeysToSnakeCase(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnake(key);

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[snakeKey] = normalizeKeysToSnakeCase(value as Record<string, unknown>);
    } else {
      result[snakeKey] = value;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Log Format Validation
// ---------------------------------------------------------------------------

/**
 * Required fields for valid structured log entry.
 */
export const REQUIRED_LOG_FIELDS = ['timestamp', 'level', 'message'] as const;

/**
 * Validate that a log entry has all required fields.
 *
 * @param entry - Log entry to validate
 * @returns Validation result
 */
export function validateLogEntry(entry: unknown): {
  valid: boolean;
  missingFields: string[];
} {
  if (typeof entry !== 'object' || entry === null) {
    return { valid: false, missingFields: [...REQUIRED_LOG_FIELDS] };
  }

  const obj = entry as Record<string, unknown>;
  const missingFields = REQUIRED_LOG_FIELDS.filter(
    field => !(field in obj) || obj[field] === undefined || obj[field] === null,
  );

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Validate timestamp format (ISO 8601).
 *
 * @param timestamp - Timestamp string to validate
 * @returns True if valid ISO 8601 format
 */
export function isValidTimestamp(timestamp: string): boolean {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
  return iso8601Regex.test(timestamp);
}

/**
 * Validate log level.
 *
 * @param level - Log level to validate
 * @returns True if valid log level
 */
export function isValidLogLevel(level: string): level is LogLevelConfig {
  return LOG_LEVELS.includes(level as LogLevelConfig);
}

// ---------------------------------------------------------------------------
// Log Aggregation Format Constants
// ---------------------------------------------------------------------------

/**
 * ELK Stack field mapping recommendations.
 * Maps our standard fields to ELK conventions.
 */
export const ELK_FIELD_MAPPING = {
  timestamp: '@timestamp',
  level: 'log.level',
  message: 'message',
  correlation_id: 'trace.id',
  service_name: 'service.name',
  service_version: 'service.version',
  environment: 'service.environment',
  user_id: 'user.id',
  tenant_id: 'organization.id',
  route: 'url.path',
  method: 'http.request.method',
  status_code: 'http.response.status_code',
  duration_ms: 'event.duration',
} as const;

/**
 * CloudWatch Logs field mapping recommendations.
 * Maps our standard fields to CloudWatch conventions.
 */
export const CLOUDWATCH_FIELD_MAPPING = {
  timestamp: 'timestamp',
  level: 'level',
  message: 'message',
  correlation_id: 'requestId',
  service_name: 'service',
  user_id: 'userId',
  tenant_id: 'tenantId',
} as const;

// ---------------------------------------------------------------------------
// Export Types
// ---------------------------------------------------------------------------

export type StructuredLogger = {
  log(level: LogLevelConfig, message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
};
