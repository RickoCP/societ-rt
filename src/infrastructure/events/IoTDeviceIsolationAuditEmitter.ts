/**
 * IoTDeviceIsolationAuditEmitter — Infrastructure implementation for IoT device isolation audit events.
 *
 * This module provides implementations of IIoTDeviceIsolationAuditEmitter that emit audit
 * events for IoT device isolation operations. All access attempts MUST be logged for
 * security observability.
 *
 * **AUDIT REQUIREMENTS:**
 * - All access attempts are logged with: userId, deviceId, tenantId, result, timestamp
 * - Includes the reason for access denial or grant
 * - Never logs sensitive data (tokens, passwords, PII, etc.)
 *
 * @see Task 60: IoT Device Isolation Enforcement (INV-IOT-001)
 * @see Error Handling Guideline (12-error-handling.md)
 */

import type {
  IIoTDeviceIsolationAuditEmitter,
  IoTDeviceIsolationAuditEvent,
  IoTDeviceIsolationAuditEventType,
} from '@core/domains/iot/services';

// ---------------------------------------------------------------------------
// Audit Handler Types
// ---------------------------------------------------------------------------

/**
 * Type for audit event handlers (can be used for custom integrations).
 */
export type IoTDeviceIsolationAuditHandler = (event: IoTDeviceIsolationAuditEvent) => Promise<void>;

// ---------------------------------------------------------------------------
// Logging Implementation
// ---------------------------------------------------------------------------

/**
 * Format event type for logging.
 */
function formatEventType(type: IoTDeviceIsolationAuditEventType): string {
  return type.replace(/_/g, ' ');
}

/**
 * Sanitize event data for logging (remove potentially sensitive data).
 */
function sanitizeForLogging(event: IoTDeviceIsolationAuditEvent): Record<string, unknown> {
  return {
    type: event.type,
    userId: event.userId || '<system>',
    deviceId: event.deviceId,
    tenantId: event.tenantId,
    userRole: event.userRole,
    // Limit context to non-sensitive keys
    contextKeys: event.context ? Object.keys(event.context) : undefined,
    timestamp: event.timestamp.toISOString(),
  };
}

/**
 * Determine log level based on event type.
 */
function getLogLevel(type: IoTDeviceIsolationAuditEventType): 'info' | 'warn' | 'error' {
  const eventTypeStr = String(type);
  if (eventTypeStr.includes('DENIED') || eventTypeStr.includes('VIOLATION') || eventTypeStr.includes('FAILED')) {
    return 'warn';
  }
  return 'info';
}

/**
 * Logging-based implementation of IIoTDeviceIsolationAuditEmitter.
 *
 * This is the default implementation that logs events to console.
 * In production, this should be replaced with a proper audit sink.
 */
export const LoggingIoTDeviceIsolationAuditEmitter = (): IIoTDeviceIsolationAuditEmitter => {
  return {
    async emit(event: IoTDeviceIsolationAuditEvent): Promise<void> {
      const sanitized = sanitizeForLogging(event);
      const level = getLogLevel(event.type);

      const message = `[IoTDeviceIsolationAudit] ${formatEventType(event.type)}`;
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

      // Log detailed context at debug level
      if (event.context) {
        console.debug(
          `[IoTDeviceIsolationAudit] Context details:`,
          event.context,
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
export const CompositeIoTDeviceIsolationAuditEmitter = ({
  handlers,
}: {
  handlers: IoTDeviceIsolationAuditHandler[];
}): IIoTDeviceIsolationAuditEmitter => {
  return {
    async emit(event: IoTDeviceIsolationAuditEvent): Promise<void> {
      const results = await Promise.allSettled(handlers.map((h) => h(event)));

      // Log any handler failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `[IoTDeviceIsolationAuditEmitter] Handler ${index} failed:`,
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
export const NoOpIoTDeviceIsolationAuditEmitter = (): IIoTDeviceIsolationAuditEmitter => {
  return {
    async emit(_event: IoTDeviceIsolationAuditEvent): Promise<void> {
      // Do nothing
    },
  };
};

// ---------------------------------------------------------------------------
// Database Persistence Implementation
// ---------------------------------------------------------------------------

/**
 * Creates an audit handler that persists events to the audit log table.
 *
 * This is intended to be used with the CompositeIoTDeviceIsolationAuditEmitter
 * alongside the logging emitter for both real-time visibility and persistence.
 *
 * @param persistFn - The function to persist audit events
 */
export const createPersistentIoTDeviceAuditHandler = (
  persistFn: (tenantId: string, data: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata: Record<string, unknown>;
  }) => Promise<void>,
): IoTDeviceIsolationAuditHandler => {
  return async (event: IoTDeviceIsolationAuditEvent): Promise<void> => {
    try {
      await persistFn(event.tenantId, {
        actorUserId: event.userId || 'SYSTEM',
        action: event.type,
        entityType: 'IOT_DEVICE',
        entityId: event.deviceId || null,
        metadata: {
          userRole: event.userRole,
          ...(event.context ?? {}),
        },
      });
    } catch (error) {
      // Log but don't throw - audit persistence failure shouldn't block operations
      console.error('[IoTDeviceIsolationAuditEmitter] Persistence failed:', error);
    }
  };
};
