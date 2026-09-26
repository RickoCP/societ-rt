/**
 * GetVoteTallyUseCase — Returns the aggregated tally for a vote,
 * with a short-lived Redis cache (5 seconds TTL).
 *
 * Logic:
 * 1. Check Redis cache for tally (key: `vote_tally:{voteId}`, TTL: 5s)
 * 2. If cached → return cached tally
 * 3. If not cached → get from votingRepository.getVoteTally, cache result, return
 *
 * @see Requirements 8.6, 8.7
 * @see Requirements 6.2, 6.5 (AuthorizationContext migration)
 */

import type { CacheProtocol } from '@core/protocols';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { VotingRepository } from '../repositories/VotingRepository';
import type { VoteTally } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetVoteTallyUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    voteId: string;
  }): Promise<DomainResult<VoteTally>>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TALLY_CACHE_TTL_SECONDS = 5;

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetVoteTallyUseCaseImpl = ({
  votingRepository,
  cacheProtocol,
}: {
  votingRepository: VotingRepository;
  cacheProtocol: CacheProtocol;
}): GetVoteTallyUseCase => ({
  execute: async ({ authContext, voteId }) => {
    const cacheKey = `vote_tally:${voteId}`;

    // 1. Check Redis cache
    const cached = await cacheProtocol.get<VoteTally>(cacheKey);

    // 2. If cached → return cached tally
    if (cached) {
      return ok(cached);
    }

    // 3. If not cached → get from repository
    const result = await votingRepository.getVoteTally(
      authContext.tenantId,
      voteId,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const tally = result.data;

    // Cache result (fire-and-forget)
    cacheProtocol
      .set(cacheKey, tally, TALLY_CACHE_TTL_SECONDS)
      .catch(() => {
        /* cache write must not block the response */
      });

    return ok(tally);
  },
});
