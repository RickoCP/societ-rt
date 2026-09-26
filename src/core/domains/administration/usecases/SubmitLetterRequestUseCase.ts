/**
 * SubmitLetterRequestUseCase — Submits a new administrative letter request.
 *
 * Logic:
 * 1. Create request via administrationRepository.createRequest
 * 2. Enqueue audit (action: 'letter_request_submitted', fire-and-forget)
 * 3. Return ok(letterRequest)
 *
 * @see Requirements 13.1
 * @see Requirements 6.2, 6.5 (AuthorizationContext migration)
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type { AdministrationRepository } from '../repositories/AdministrationRepository';
import type { LetterRequest, SubmitLetterRequestInput } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface SubmitLetterRequestUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: SubmitLetterRequestInput;
  }): Promise<DomainResult<LetterRequest>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const SubmitLetterRequestUseCaseImpl = ({
  administrationRepository,
  auditQueueProtocol,
}: {
  administrationRepository: AdministrationRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): SubmitLetterRequestUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Create request via repository
    const result = await administrationRepository.createRequest(
      authContext.tenantId,
      authContext.userId,
      data,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const letterRequest = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'letter_request_submitted',
        resourceType: 'letter_request',
        resourceId: letterRequest.id,
        details: {
          letterType: data.letterType,
          purpose: data.purpose,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(letterRequest);
  },
});
