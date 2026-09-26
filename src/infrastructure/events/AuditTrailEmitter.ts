/**
 * AuditTrailEmitter — Infrastructure implementation for centralized audit trail events.
 *
 * This module provides implementations of IAuditTrailEmitter that emit audit
 * events for security-sensitive operations. All events MUST be logged for
 * security observability.
 *
 * **AUDIT REQUIREMENTS:**
 * - All events are logged with: userId, tenantId, eventType, timestamp
 * - Includes structured details for debugging and compliance
 * - Never logs sensitive data (tokens, passwords, PII, etc.)
 * - Supports multiple output handlers (logging, persistence, external sinks)
 *
 * @see Task 62: Audit Trail Implementation
 * @see Error Handling Guideline (12-error-handling.md)
 */

import type {
  IAuditTrailEmitter,
  CreateAuditEventInput,
  AuditEventType,
} from '@core/domains/audit/services';

// ---------------------------------------------------------------------------
// Audit Handler Types
// ---------------------------------------------------------------------------

/**
 * Type for audit event handlers (can be used for custom integrations).
 */
export type AuditTrailHandler = (event: CreateAuditEventInput) => Promise<void>;

// ---------------------------------------------------------------------------
// Logging Implementation
// ---------------------------------------------------------------------------

/**
 * Format event type for logging.
 */
function formatEventType(type: AuditEventType): string {
  return String(type).replace(/_/g, ' ');
}

/**
 * Sanitize event data for logging (remove potentially sensitive data).
 */
function sanitizeForLogging(event: CreateAuditEventInput): Record<string, unknown> {
  return {
    eventType: event.eventType,
    userId: event.userId || '<system>',
    tenantId: event.tenantId,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    success: event.success ?? true,
    errorCode: event.errorCode,
    correlationId: event.correlationId,
    orgUnitId: event.orgUnitId,
    impersonatorId: event.impersonatorId,
    // Limit details to non-sensitive keys for logging
    detailsKeys: event.details ? Object.keys(event.details) : undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Determine log level based on event type.
 */
function getLogLevel(event: CreateAuditEventInput): 'info' | 'warn' | 'error' {
  const eventTypeStr = String(event.eventType);
  
  // Security events and failures get higher log levels
  if (eventTypeStr.includes('DENIED') || 
      eventTypeStr.includes('FAILURE') || 
      eventTypeStr.includes('FAILED') ||
      eventTypeStr.includes('SUSPICIOUS') ||
      eventTypeStr.includes('CROSS_TENANT')) {
    return 'warn';
  }
  
  if (eventTypeStr.includes('SECURITY_ALERT') || 
      event.success === false) {
    return 'warn';
  }
  
  return 'info';
}

/**
 * Logging-based implementation of IAuditTrailEmitter.
 *
 * This is the default implementation that logs events to console.
 * In production, this should be combined with a persistence handler.
 */
export const LoggingAuditTrailEmitter = (): IAuditTrailEmitter => {
  return {
    async emit(event: CreateAuditEventInput): Promise<void> {
      const sanitized = sanitizeForLogging(event);
      const level = getLogLevel(event);

      const message = `[AuditTrail] ${formatEventType(event.eventType)}`;
      const payload = JSON.stringify(sanitized, null, 2);

      switch (level) {
        case 'warn':
          console.warn(message, payload);
          break;
        case 'error':
          console.error(message, payload);
          break;
        default:
          console.log(message, payload);
      }

      // Log detailed info at debug level for troubleshooting
      if (event.details && Object.keys(event.details).length > 0) {
        console.debug(
          `[AuditTrail] Event details:`,
          JSON.stringify(event.details, null, 2),
        );
      }
    },
  };
};

// ---------------------------------------------------------------------------
// Composite Implementation (for multiple handlers)
// ---------------------------------------------------------------------------

/**
 * Composite implementation that delegates to multiple handlers.
 *
 * Uses Promise.allSettled to ensure all handlers run even if some fail.
 * Errors are logged but don't block other handlers.
 */
export const CompositeAuditTrailEmitter = ({
  handlers,
}: {
  handlers: AuditTrailHandler[];
}): IAuditTrailEmitter => {
  return {
    async emit(event: CreateAuditEventInput): Promise<void> {
      const results = await Promise.allSettled(handlers.map((h) => h(event)));

      // Log any handler failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `[AuditTrailEmitter] Handler ${index} failed:`,
            result.reason,
          );
        }
      });
    },
  };
};

// ---------------------------------------------------------------------------
// No-Op Implementation (for testing)
// ---------------------------------------------------------------------------

/**
 * No-op implementation for testing or when audit should be disabled.
 */
export const NoOpAuditTrailEmitter = (): IAuditTrailEmitter => {
  return {
    async emit(_event: CreateAuditEventInput): Promise<void> {
      // Do nothing
    },
  };
};

// ---------------------------------------------------------------------------
// Database Persistence Handler
// ---------------------------------------------------------------------------

/**
 * Creates an audit handler that persists events via the audit repository.
 *
 * This is intended to be used with the CompositeAuditTrailEmitter
 * alongside the logging emitter for both real-time visibility and persistence.
 *
 * @param persistFn - The function to persist audit events
 */
export const createPersistentAuditTrailHandler = (
  persistFn: (event: CreateAuditEventInput) => Promise<void>,
): AuditTrailHandler => {
  return async (event: CreateAuditEventInput): Promise<void> => {
    try {
      await persistFn(event);
    } catch (error) {
      // Log but don't throw - audit persistence failure shouldn't block operations
      console.error('[AuditTrailEmitter] Persistence failed:', error);
    }
  };
};

// ---------------------------------------------------------------------------
// External Sink Handler (for SIEM/monitoring integration)
// ---------------------------------------------------------------------------

/**
 * Creates an audit handler that sends events to an external sink.
 *
 * This can be used to integrate with SIEM systems, monitoring platforms,
 * or other external audit log collectors.
 *
 * @param sendFn - The function to send events to external system
 */
export const createExternalAuditTrailHandler = (
  sendFn: (event: CreateAuditEventInput) => Promise<void>,
): AuditTrailHandler => {
  return async (event: CreateAuditEventInput): Promise<void> => {
    try {
      await sendFn(event);
    } catch (error) {
      // Log but don't throw - external sink failures shouldn't block operations
      console.error('[AuditTrailEmitter] External sink failed:', error);
    }
  };
};

// ---------------------------------------------------------------------------
// Filtering Handler
// ---------------------------------------------------------------------------

/**
 * Creates a handler that filters events before passing to inner handler.
 *
 * Useful for routing certain event types to specific handlers.
 *
 * @param filter - Function to determine if event should be processed
 * @param handler - Inner handler to delegate to
 */
export const createFilteredAuditTrailHandler = (
  filter: (event: CreateAuditEventInput) => boolean,
  handler: AuditTrailHandler,
): AuditTrailHandler => {
  return async (event: CreateAuditEventInput): Promise<void> => {
    if (filter(event)) {
      await handler(event);
    }
  };
};

// ---------------------------------------------------------------------------
// Security Event Filter Helpers
// ---------------------------------------------------------------------------

/**
 * Filter for security-related events only.
 */
export const isSecurityEvent = (event: CreateAuditEventInput): boolean => {
  const eventTypeStr = String(event.eventType);
  return eventTypeStr.startsWith('AUTH_') ||
         eventTypeStr.startsWith('SECURITY_') ||
         eventTypeStr.includes('DENIED') ||
         eventTypeStr.includes('CROSS_TENANT');
};

/**
 * Filter for failed/denied events only.
 */
export const isFailedEvent = (event: CreateAuditEventInput): boolean => {
  const eventTypeStr = String(event.eventType);
  return event.success === false ||
         eventTypeStr.includes('DENIED') ||
         eventTypeStr.includes('FAILURE') ||
         eventTypeStr.includes('FAILED');
};

/**
 * Filter for admin action events only.
 */
export const isAdminEvent = (event: CreateAuditEventInput): boolean => {
  const eventTypeStr = String(event.eventType);
  return eventTypeStr.startsWith('ADMIN_');
};
