/**
 * Structured JSON Logger — Factory function pattern for DI.
 *
 * Outputs structured JSON to stdout with the following fields:
 * - timestamp (ISO 8601)
 * - level (info | warn | error | debug)
 * - message
 * - correlation_id
 * - tenant_id
 * - user_id
 * - route
 * - duration_ms
 *
 * Security: MUST NOT log sensitive data (passwords, tokens, OTP, CVV,
 * PII without masking).
 *
 * @see Requirements 25.1, 25.2
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogContext {
  readonly correlation_id?: string;
  readonly tenant_id?: string;
  readonly user_id?: string;
  readonly route?: string;
  readonly duration_ms?: number;
  readonly [key: string]: unknown;
}

export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}

// ---------------------------------------------------------------------------
// Sensitive data patterns — values matching these are redacted
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'access_token',
  'refresh_token',
  'otp',
  'cvv',
  'secret',
  'authorization',
  'cookie',
  'creditcard',
  'credit_card',
]);

/**
 * Recursively redact values whose keys match known sensitive patterns.
 * Returns a new object — the original is never mutated.
 */
function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a structured JSON logger instance.
 *
 * Uses factory function pattern so it can be registered in the Awilix
 * DI container as a singleton.
 */
export const createLogger = (): Logger => {
  const write = (level: LogLevel, message: string, context?: LogContext): void => {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (context) {
      const safeContext = redactSensitive(context as Record<string, unknown>);
      Object.assign(entry, safeContext);
    }

    // Output as single-line JSON to stdout
    process.stdout.write(JSON.stringify(entry) + '\n');
  };

  return {
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
    debug: (message, context) => write('debug', message, context),
  };
};
