/**
 * CastVoteUseCase — Casts a ballot for a specific option on a vote.
 *
 * Logic:
 * 1. Find vote by ID → if not found, fail with notFoundError
 * 2. Check deadline → if passed, fail with votingDeadlinePassed()
 * 3. Check if user already voted → if yes, fail with votingAlreadyVoted()
 * 4. Cast vote via votingRepository.castVote
 * 5. Enqueue audit (action: 'vote_cast', fire-and-forget)
 * 6. Return ok(undefined)
 *
 * @see Requirements 8.3, 8.4, 8.5
 */

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, notFoundError } from '@core/utils';
import type { VotingRepository } from '../repositories/VotingRepository';
import {
  votingDeadlinePassed,
  votingAlreadyVoted,
} from '../errors/votingErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CastVoteUseCase {
  execute(params: {
    authContext: AuthContext;
    voteId: string;
    optionId: string;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CastVoteUseCaseImpl = ({
  votingRepository,
  auditQueueProtocol,
}: {
  votingRepository: VotingRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): CastVoteUseCase => ({
  execute: async ({ authContext, voteId, optionId }) => {
    // 1. Find vote by ID
    const findResult = await votingRepository.findById(
      authContext.tenantId,
      voteId,
    );

    if (!findResult.success) {
      return fail(findResult.error);
    }

    const vote = findResult.data;

    if (!vote) {
      return fail(
        notFoundError('VOTING_NOT_FOUND', `Vote with ID ${voteId} not found`),
      );
    }

    // 2. Check deadline
    if (vote.deadline < new Date()) {
      return fail(votingDeadlinePassed());
    }

    // 3. Check if user already voted
    const hasVotedResult = await votingRepository.hasUserVoted(
      authContext.tenantId,
      voteId,
      authContext.userId,
    );

    if (!hasVotedResult.success) {
      return fail(hasVotedResult.error);
    }

    if (hasVotedResult.data) {
      return fail(votingAlreadyVoted());
    }

    // 4. Cast vote via repository
    const castResult = await votingRepository.castVote(
      authContext.tenantId,
      voteId,
      authContext.userId,
      optionId,
    );

    if (!castResult.success) {
      return fail(castResult.error);
    }

    // 5. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        actionType: 'vote_cast',
        resourceType: 'vote',
        resourceId: voteId,
        details: { optionId },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 6. Return success
    return ok(undefined);
  },
});
