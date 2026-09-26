/**
 * AdminMembershipAuditEmitter — Infrastructure implementation for admin membership audit events.
 *
 * This module provides implementations of IAdminMembershipAuditEmitter that emit audit
 * events for admin membership operations. All admin actions MUST be logged for
 * security observability.
 *
 * **AUDIT REQUIREMENTS:**
 * - All admin actions are logged with: adminUserId, targetMembershipId(s), action, reason, timestamp
 * - Includes before/after state for modifications
 * - Never logs sensitive data (tokens, passwords, etc.)
 *
 * @see FASE 1.18 Task 54: Admin Membership Management (Req 50)
 * @see Requirements 50 (Admin Membership Management)
 * @see Error Handling Guideline (12-error-handling.md)
 */

import type {
  IAdminMembershipAuditEmitter,
  AdminMembershipAuditEvent,
  AdminActionType,
} from '@core/domains/membership/services/AdminMembershipService';

// ---------------------------------------------------------------------------
// Audit Handler Types
// ---------------------------------------------------------------------------

/**
 * Type for audit event handlers (can be used for custom integrations).
 */
export type AdminMembershipAuditHandler = (event: AdminMembershipAuditEvent) => Promise<void>;

// ---------------------------------------------------------------------------
// Logging Implementation
// ---------------------------------------------------------------------------

/**
 * Format action type for logging.
 */
function formatAction(action: AdminActionType): string {
  return action.replace(/_/g, ' ');
}

/**
 * Sanitize event data for logging (remove potentially large or sensitive data).
 */
function sanitizeForLogging(event: AdminMembershipAuditEvent): Record<string, unknown> {
  return {
    action: event.action,
    adminUserId: event.adminUserId,
    adminMembershipId: event.adminMembershipId,
    adminRole: event.adminRole,
    tenantId: event.tenantId,
    targetMembershipIds: event.targetMembershipIds,
    reason: event.reason,
    // Summarize state changes instead of full objects
    hasBeforeState: event.beforeState !== undefined,
    hasAfterState: event.afterState !== undefined,
    metadataKeys: event.metadata ? Object.keys(event.metadata) : undefined,
    timestamp: event.timestamp.toISOString(),
  };
}

/**
 * Logging-based implementation of IAdminMembershipAuditEmitter.
 *
 * This is the default implementation that logs events to console.
 * In production, this should be replaced with a proper audit sink.
 */
export const LoggingAdminMembershipAuditEmitter = (): IAdminMembershipAuditEmitter => {
  return {
    async emit(event: AdminMembershipAuditEvent): Promise<void> {
      const sanitized = sanitizeForLogging(event);

      console.log(
        `[AdminMembershipAudit] ${formatAction(event.action)}`,
        JSON.stringify(sanitized, null, 2),
      );

      // Log detailed state changes at debug level
      if (event.beforeState || event.afterState) {
        console.debug(
          `[AdminMembershipAudit] State change details:`,
          {
            before: event.beforeState,
            after: event.afterState,
          },
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
export const CompositeAdminMembershipAuditEmitter = ({
  handlers,
}: {
  handlers: AdminMembershipAuditHandler[];
}): IAdminMembershipAuditEmitter => {
  return {
    async emit(event: AdminMembershipAuditEvent): Promise<void> {
      const results = await Promise.allSettled(handlers.map((h) => h(event)));

      // Log any handler failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `[AdminMembershipAuditEmitter] Handler ${index} failed:`,
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
export const NoOpAdminMembershipAuditEmitter = (): IAdminMembershipAuditEmitter => {
  return {
    async emit(_event: AdminMembershipAuditEvent): Promise<void> {
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
 * This is intended to be used with the CompositeAdminMembershipAuditEmitter
 * alongside the logging emitter for both real-time visibility and persistence.
 *
 * @param auditRepository - The audit repository for persisting events
 */
export const createPersistentAuditHandler = (
  // We don't directly depend on AuditRepository to avoid circular deps
  // The caller provides a persist function
  persistFn: (tenantId: string, data: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata: Record<string, unknown>;
  }) => Promise<void>,
): AdminMembershipAuditHandler => {
  return async (event: AdminMembershipAuditEvent): Promise<void> => {
    try {
      await persistFn(event.tenantId, {
        actorUserId: event.adminUserId,
        action: event.action,
        entityType: 'MEMBERSHIP',
        entityId: event.targetMembershipIds?.join(',') ?? null,
        metadata: {
          adminMembershipId: event.adminMembershipId,
          adminRole: event.adminRole,
          reason: event.reason,
          targetCount: event.targetMembershipIds?.length ?? 0,
          hasStateChange: !!(event.beforeState || event.afterState),
          ...event.metadata,
        },
      });
    } catch (error) {
      // Log but don't throw - audit persistence failure shouldn't block operations
      console.error('[AdminMembershipAuditEmitter] Persistence failed:', error);
    }
  };
};
