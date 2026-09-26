/**
 * RecordVisitorExitUseCase — Records the exit timestamp for a visitor.
 *
 * Logic:
 * 1. Record exit via visitorRepository.recordVisitorExit
 * 2. Enqueue audit (action: 'visitor_exit_recorded', fire-and-forget)
 * 3. Return ok(visitorLog)
 *
 * @see Requirements 15.2
 * @see Requirements 6.2, 6.5 (AuthorizationContext migration)
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { VisitorRepository } from '../repositories/VisitorRepository';
import type { VisitorLog } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RecordVisitorExitUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    visitorLogId: string;
  }): Promise<DomainResult<VisitorLog>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RecordVisitorExitUseCaseImpl = ({
  visitorRepository,
  auditQueueProtocol,
}: {
  visitorRepository: VisitorRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RecordVisitorExitUseCase => ({
  execute: async ({ authContext, visitorLogId }) => {
    // 1. Record exit via repository
    const result = await visitorRepository.recordVisitorExit(
      authContext.tenantId,
      visitorLogId,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const visitorLog = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'visitor_exit_recorded',
        resourceType: 'visitor_log',
        resourceId: visitorLog.id,
        details: { visitorLogId },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(visitorLog);
  },
});
