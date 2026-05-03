/**
 * ApproveLetterRequestUseCase — Approves a letter request and attaches
 * the generated document URL.
 *
 * Logic:
 * 1. Approve request via administrationRepository.approve
 * 2. Enqueue notification to the requesting user (fire-and-forget)
 * 3. Enqueue audit (action: 'letter_request_approved', fire-and-forget)
 * 4. Return ok(letterRequest)
 *
 * @see Requirements 13.2, 13.4
 */

import type {
  AuthContext,
  AuditQueueProtocol,
  NotificationQueueProtocol,
} from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { AdministrationRepository } from '../repositories/AdministrationRepository';
import type { LetterRequest, ApproveLetterRequestInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ApproveLetterRequestUseCase {
  execute(params: {
    authContext: AuthContext;
    requestId: string;
    data: ApproveLetterRequestInput;
  }): Promise<DomainResult<LetterRequest>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const ApproveLetterRequestUseCaseImpl = ({
  administrationRepository,
  notificationQueueProtocol,
  auditQueueProtocol,
}: {
  administrationRepository: AdministrationRepository;
  notificationQueueProtocol: NotificationQueueProtocol;
  auditQueueProtocol: AuditQueueProtocol;
}): ApproveLetterRequestUseCase => ({
  execute: async ({ authContext, requestId, data }) => {
    // 1. Approve request via repository
    const result = await administrationRepository.approve(
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
        type: 'letter_request_approved',
        title: 'Letter Request Approved',
        body: `Your ${letterRequest.letterType} request has been approved.`,
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
        actionType: 'letter_request_approved',
        resourceType: 'letter_request',
        resourceId: requestId,
        details: {
          letterType: letterRequest.letterType,
          documentUrl: data.documentUrl,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(letterRequest);
  },
});
