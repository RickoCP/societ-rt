/**
 * EndImpersonationUseCase — Revokes impersonation token and logs session end.
 *
 * @see Requirements 30.3, 30.4
 */

import type { DomainResult } from '@core/utils';
import { ok } from '@core/utils';
import type { AuditQueueProtocol } from '@core/protocols';
import type { ImpersonationSession } from '../entities';
import type { OperationalRepository } from '../repositories/OperationalRepository';

export interface EndImpersonationUseCase {
  execute(params: {
    sessionId: string;
    impersonatorId: string;
  }): Promise<DomainResult<ImpersonationSession>>;
}

export const EndImpersonationUseCaseImpl = ({
  operationalRepository,
  auditQueueProtocol,
}: {
  operationalRepository: OperationalRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): EndImpersonationUseCase => ({
  execute: async ({ sessionId, impersonatorId }) => {
    const result = await operationalRepository.endImpersonationSession(sessionId);

    if (result.success) {
      const session = result.data;
      await auditQueueProtocol.enqueueAudit({
        tenantId: session.tenantId,
        actorUserId: impersonatorId,
        actionType: 'impersonation_ended',
        resourceType: 'user',
        resourceId: session.impersonatedUserId,
        impersonatorId,
        details: {
          sessionId: session.id,
          impersonatedUserId: session.impersonatedUserId,
        },
      });
      return ok(session);
    }

    return result;
  },
});
