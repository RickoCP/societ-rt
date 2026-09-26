/**
 * Logging Container — Registers logger and analytics implementations.
 *
 * Registers the structured JSON logger as a singleton so all layers
 * share a single logger instance resolved via DI.
 *
 * **Log Aggregation Configuration:**
 * The logging configuration is environment-aware and provides:
 * - Structured JSON output compatible with ELK, CloudWatch, etc.
 * - Standard fields: timestamp, level, message, correlation_id
 * - Service identification: service_name, service_version, environment
 * - Sensitive data sanitization via LogSanitizer
 *
 * @see Requirements 25.1, 25.2
 * @see Requirements 15.1 — Authorization Audit Logging (FASE 2.13)
 * @see Requirements 15.2 — Context Switch Audit Logging (FASE 2.13)
 * @see Requirements 15.5 — Ensure no sensitive data in logs (FASE 2.13)
 * @see Requirements 15.6 — Structured JSON logging for log aggregation
 */

import { asFunction, asValue, type AwilixContainer } from 'awilix';
import { createLogger } from '@infrastructure/logging/Logger';
import { createLogSanitizer } from '@infrastructure/logging/LogSanitizer';
import { getLoggingConfiguration } from '@infrastructure/logging/LoggingConfiguration';
import { TokenValidationLoggerImpl } from '@infrastructure/logging/TokenValidationLogger';
import { createAuthorizationAuditLogger } from '@infrastructure/logging/AuthorizationAuditLogger';
import { ContextSwitchAuditLoggerImpl } from '@infrastructure/logging/ContextSwitchAuditLogger';

export function registerLogging(container: AwilixContainer): void {
  // Get environment-specific logging configuration
  const loggingConfig = getLoggingConfiguration();

  container.register({
    // Logging configuration (environment-aware)
    loggingConfig: asValue(loggingConfig),
    
    // LogSanitizer ensures sensitive data (passwords, tokens, OTP, CVV, PII) is sanitized before logging
    logSanitizer: asFunction(createLogSanitizer).singleton(),
    
    // Logger now uses LogSanitizer internally and outputs structured JSON
    // Compatible with ELK, CloudWatch, Datadog, Splunk
    logger: asFunction(createLogger).singleton(),
    
    // Specialized audit loggers for different event types
    tokenValidationLogger: asFunction(TokenValidationLoggerImpl).singleton(),
    authorizationAuditLogger: asFunction(createAuthorizationAuditLogger).singleton(),
    contextSwitchAuditLogger: asFunction(ContextSwitchAuditLoggerImpl).singleton(),
  });
}
