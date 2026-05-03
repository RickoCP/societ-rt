/**
 * Correlation ID Generator — Creates unique identifiers for request tracing.
 *
 * Each incoming HTTP request gets a unique correlation ID that is propagated
 * to all downstream operations (use cases, repositories, background jobs)
 * for end-to-end tracing and debugging.
 *
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
