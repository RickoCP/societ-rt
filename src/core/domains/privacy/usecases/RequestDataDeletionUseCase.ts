/**
 * RequestDataDeletionUseCase — Soft deletes user data and anonymizes audit entries.
 *
 * @see Requirements 27.6
 */

import type { DomainResult } from '@core/utils';
import type { AuditQueueProtocol } from '@core/protocols';
import type { PrivacyRepository } from '../repositories/PrivacyRepository';

export interface RequestDataDeletionUseCase {
  execute(params: {
    tenantId: string;
    userId: string;
    requestorUserId: string;
  }): Promise<DomainResult<void>>;
}

export const RequestDataDeletionUseCaseImpl = ({
  privacyRepository,
  auditQueueProtocol,
}: {
  privacyRepository: PrivacyRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): RequestDataDeletionUseCase => ({
  execute: async ({ tenantId, userId, requestorUserId }) => {
    const result = await privacyRepository.requestDeletion(tenantId, userId);

    if (result.success) {
      await auditQueueProtocol.enqueueAudit({
        tenantId,
        actorUserId: requestorUserId,
        actionType: 'personal_data_deletion_requested',
        resourceType: 'user',
        resourceId: userId,
        details: { targetUserId: userId },
      });
    }

    return result;
  },
});
