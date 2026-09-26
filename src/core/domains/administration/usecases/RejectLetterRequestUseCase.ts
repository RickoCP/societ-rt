/**
 * RejectLetterRequestUseCase — Rejects a letter request with a reason.
 *
 * Logic:
 * 1. Reject request via administrationRepository.reject
 * 2. Enqueue notification to the requesting user (fire-and-forget)
 * 3. Enqueue audit (action: 'letter_request_rejected', fire-and-forget)
 * 4. Return ok(letterRequest)
 *
 * @see Requirements 13.3, 13.5
 * @see Requirements 6.2, 6.5 (AuthorizationContext migration)
 */

import type {
  AuditQueueProtocol,
  NotificationQueueProtocol,
} from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { AdministrationRepository } from '../repositories/AdministrationRepository';
import type { LetterRequest, RejectLetterRequestInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface RejectLetterRequestUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    requestId: string;
    data: RejectLetterRequestInput;
  }): Promise<DomainResult<LetterRequest>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const RejectLetterRequestUseCaseImpl = ({
  administrationRepository,
  notificationQueueProtocol,
  auditQueueProtocol,
}: {
  administrationRepository: AdministrationRepository;
  notificationQueueProtocol: NotificationQueueProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): RejectLetterRequestUseCase => ({
  execute: async ({ authContext, requestId, data }) => {
    // 1. Reject request via repository
    const result = await administrationRepository.reject(
      authContext.tenantId,
      requestId,
      authContext.userId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const letterRequest = result.data;

    // 2. Enqueue notification to the requesting user (fire-and-forget)
    notificationQueueProtocol
      .enqueueNotification({
        tenantId: authContext.tenantId,
        userId: letterRequest.userId,
        type: 'letter_request_rejected',
        title: 'Letter Request Rejected',
        body: `Your ${letterRequest.letterType} request has been rejected. Reason: ${data.rejectionReason}`,
        channels: ['push', 'inbox'],
      })
      .catch(() => {
        /* notification must not block the response */
      });

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'letter_request_rejected',
        resourceType: 'letter_request',
        resourceId: requestId,
        details: {
          letterType: letterRequest.letterType,
          rejectionReason: data.rejectionReason,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(letterRequest);
  },
});
