/**
 * TransferAuditEmitter — Infrastructure implementation for ownership transfer audit events.
 *
 * This module provides implementations of ITransferAuditEmitter that emit audit
 * events for every transfer lifecycle event (initiated, accepted, completed,
 * cancelled, expired, failed). All transfer events MUST be logged for security
 * observability and compliance.
 *
 * **Security note:** Audit payloads intentionally avoid sensitive data (tokens,
 * secrets, PII). Only identifiers, state snapshots, and reasons are recorded.
 *
 * @see FASE 1.18 Task 52: Tenant Transfer Flow
 * @see Requirements 54 (AC 7): Log complete before/after state for all transfers
 */

import type {
  ITransferAuditEmitter,
  TransferAuditEvent,
} from '@core/domains/transfer/services';

/**
 * Transfer audit handler function type.
 */
export type TransferAuditHandler = (event: TransferAuditEvent) => Promise<void>;

/**
 * Logging-only transfer audit emitter for development/debugging.
 *
 * Emits structured audit records to the console. Use for development or when
 * a dedicated audit sink is not yet configured.
 */
export const LoggingTransferAuditEmitter = (): ITransferAuditEmitter => {
  return {
    async emit(event: TransferAuditEvent): Promise<void> {
      console.log('[TransferAudit]', JSON.stringify({
        type: event.type,
        transferId: event.transferId,
        tenantId: event.tenantId,
        initiatorUserId: event.initiatorUserId,
        targetUserId: event.targetUserId,
        beforeState: event.beforeState,
        afterState: event.afterState,
        reason: event.reason,
        timestamp: event.timestamp.toISOString(),
      }, null, 2));
    },
  };
};

/**
 * Composite transfer audit emitter that forwards events to multiple handlers.
 *
 * Allows registering multiple sinks (logging, outbox, SIEM, etc.) and ensures
 * all handlers run for each event. A failing handler does not block the others.
 */
export const CompositeTransferAuditEmitter = ({
  handlers,
}: {
  handlers: TransferAuditHandler[];
}): ITransferAuditEmitter => {
  return {
    async emit(event: TransferAuditEvent): Promise<void> {
      const results = await Promise.allSettled(
        handlers.map(handler => handler(event)),
      );

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `[TransferAuditEmitter] Handler ${index} failed:`,
            result.reason,
          );
        }
      });
    },
  };
};

/**
 * No-op transfer audit emitter for testing or when audit should be disabled.
 */
export const NoOpTransferAuditEmitter = (): ITransferAuditEmitter => {
  return {
    async emit(_event: TransferAuditEvent): Promise<void> {
      // Do nothing
    },
  };
};
