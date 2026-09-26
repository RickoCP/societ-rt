/**
 * Correlation ID Generator — Creates unique identifiers for request tracing.
 *
 * Each incoming HTTP request gets a unique correlation ID that is propagated
 * to all downstream operations (use cases, repositories, background jobs)
 * for end-to-end tracing and debugging.
 *
 * **Integration Guidelines:**
 * - All audit loggers use this module via `@infrastructure/utils/correlationId`
 * - AuthorizationAuditLogger, ContextSwitchAuditLogger, and TokenValidationLogger
 *   automatically generate fallback correlationIds if not provided
 * - Use `getOrGenerateCorrelationId()` when you have an optional correlationId
 * - Use `generateCorrelationId()` when you always need a new ID
 *
 * @see Requirements 15.8 — Integrate with correlationId system
 * @see Requirements 25.1, 25.2
 */

import { randomUUID } from 'crypto';

/**
 * Generate a unique correlation ID using crypto.randomUUID().
 *
 * Returns a v4 UUID string suitable for use as a request correlation ID.
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Get the provided correlation ID or generate a new one if not provided.
 *
 * This is a helper function for consistent correlation ID handling across
 * the application. Use this when you have an optional correlationId and
 * need to ensure one exists.
 *
 * @param correlationId - Optional existing correlation ID
 * @returns The provided correlationId or a newly generated one
 *
 * @example
 * ```typescript
 * const effectiveCorrelationId = getOrGenerateCorrelationId(request.headers['x-correlation-id']);
 * ```
 */
export function getOrGenerateCorrelationId(correlationId?: string | null): string {
  return correlationId || generateCorrelationId();
}

/**
 * Validates if a string is a valid correlation ID format.
 *
 * Correlation IDs are expected to be UUIDs, but this function also accepts
 * other reasonable string formats for flexibility with external systems.
 *
 * @param correlationId - The string to validate
 * @returns true if the string is a valid correlation ID format
 */
export function isValidCorrelationId(correlationId: string | null | undefined): correlationId is string {
  if (!correlationId || typeof correlationId !== 'string') {
    return false;
  }
  // Accept any non-empty string up to 128 characters
  // This allows UUIDs, custom IDs from external systems, etc.
  return correlationId.length > 0 && correlationId.length <= 128;
}
