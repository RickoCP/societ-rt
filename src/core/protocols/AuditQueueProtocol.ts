/**
 * AuditQueueProtocol — Core abstraction for enqueuing audit log entries.
 *
 * Infrastructure layer provides the concrete implementation.
 * This protocol has NO external dependencies (core layer).
 *
 * @see Requirements 18.3
 */

export interface AuditEntryInput {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly actionType: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly details: Record<string, unknown>;
  readonly ipAddress?: string;
  readonly impersonatorId?: string;
}

export interface AuditQueueProtocol {
  enqueueAudit(entry: AuditEntryInput): Promise<void>;
}
