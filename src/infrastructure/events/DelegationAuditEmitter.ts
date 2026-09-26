/**
 * DelegationAuditEmitter — Infrastructure implementation for delegation audit events.
 *
 * This module provides implementations of IDelegationAuditEmitter that emit audit
 * events for every delegation attempt (allowed or denied). All delegation attempts
 * MUST be logged for security observability.
 *
 * **Security note:** Audit payloads intentionally avoid sensitive data (tokens,
 * secrets, PII). Only identifiers, roles, decision, and reason are recorded.
 *
 * @see FASE 1.18 Task 51: Delegation Matrix Implementation
 * @see Requirements 25 (AC 6): Log all delegation attempts
 */

import type {
  IDelegationAuditEmitter,
  DelegationAuditEvent,
} from '@core/domains/membership/services';

/**
 * Delegation audit handler function type.
 */
export type DelegationAuditHandler = (event: DelegationAuditEvent) => Promise<void>;

/**
 * Logging-only delegation audit emitter for development/debugging.
 *
 * Emits structured audit records to the console. Use for development or when
 * a dedicated audit sink is not yet configured.
 */
export const LoggingDelegationAuditEmitter = (): IDelegationAuditEmitter => {
  return {
    async emit(event: DelegationAuditEvent): Promise<void> {
      console.log('[DelegationAudit]', JSON.stringify({
        type: event.type,
        delegatorUserId: event.delegatorUserId,
        delegatorRole: event.delegatorRole,
        targetUserId: event.targetUserId,
        requestedRole: event.requestedRole,
        targetOrgUnitId: event.targetOrgUnitId,
        tenantId: event.tenantId,
        decision: event.decision,
        reason: event.reason,
        timestamp: event.timestamp.toISOString(),
      }, null, 2));
    },
  };
};

/**
 * Composite delegation audit emitter that forwards events to multiple handlers.
 *
 * Allows registering multiple sinks (logging, outbox, SIEM, etc.) and ensures
 * all handlers run for each event. A failing handler does not block the others.
 */
export const CompositeDelegationAuditEmitter = ({
  handlers,
}: {
  handlers: DelegationAuditHandler[];
}): IDelegationAuditEmitter => {
  return {
    async emit(event: DelegationAuditEvent): Promise<void> {
      const results = await Promise.allSettled(
        handlers.map(handler => handler(event)),
      );

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `[DelegationAuditEmitter] Handler ${index} failed:`,
            result.reason,
          );
        }
      });
    },
  };
};

/**
 * No-op delegation audit emitter for testing or when audit should be disabled.
 */
export const NoOpDelegationAuditEmitter = (): IDelegationAuditEmitter => {
  return {
    async emit(_event: DelegationAuditEvent): Promise<void> {
      // Do nothing
    },
  };
};
