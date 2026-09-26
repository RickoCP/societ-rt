/**
 * CreateVoteUseCase — Creates a new vote (poll) within a tenant.
 *
 * Logic:
 * 1. Validate min 2 options → fail with votingInsufficientOptions()
 * 2. Create vote via votingRepository.createVote
 * 3. Enqueue audit (action: 'vote_created', fire-and-forget)
 * 4. Return ok(vote)
 *
 * @see Requirements 8.1, 8.2
 * @see Requirements 6.2, 6.5 (AuthorizationContext migration)
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { VotingRepository } from '../repositories/VotingRepository';
import type { CreateVoteInput, Vote } from '../entities';
import { votingInsufficientOptions } from '../errors/votingErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CreateVoteUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: CreateVoteInput;
  }): Promise<DomainResult<Vote>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CreateVoteUseCaseImpl = ({
  votingRepository,
  auditQueueProtocol,
}: {
  votingRepository: VotingRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): CreateVoteUseCase => ({
  execute: async ({ authContext, data }) => {
    // 1. Validate min 2 options
    if (data.options.length < 2) {
      return fail(votingInsufficientOptions());
    }

    // 2. Create vote via repository
    const result = await votingRepository.createVote(
      authContext.tenantId,
      data,
      authContext.userId,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const vote = result.data;

    // 3. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'vote_created',
        resourceType: 'vote',
        resourceId: vote.id,
        details: { title: data.title },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 4. Return success
    return ok(vote);
  },
});
