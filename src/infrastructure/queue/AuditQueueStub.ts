/**
 * AuditQueueStub — Infrastructure implementation of AuditQueueProtocol.
 *
 * Delegates to QueueProtocol.enqueue() with job type 'audit_log'.
 * Factory function pattern for Awilix DI compatibility.
 * Jobs are processed by the auditWorker (BullMQ Worker).
 *
 * @see Requirements 18.3
 */

import type { AuditQueueProtocol, AuditEntryInput } from '@core/protocols';
import type { QueueProtocol } from '@core/protocols';

export const AuditQueueStub = ({
  queueProtocol,
}: {
  queueProtocol: QueueProtocol;
}): AuditQueueProtocol => ({
  enqueueAudit: async (entry: AuditEntryInput): Promise<void> => {
    await queueProtocol.enqueue('audit_log', entry);
  },
});
