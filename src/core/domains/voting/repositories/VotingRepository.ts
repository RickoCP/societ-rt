/**
 * VotingRepository — Core repository interface for voting operations
 * (votes, ballots, tallies).
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import type { DomainResult } from '@core/utils';
import type { CreateVoteInput, Vote, VoteTally } from '../entities';

export interface VotingRepository {
  /** Create a new vote with its options within a tenant. */
  createVote(
    tenantId: string,
    data: CreateVoteInput,
    createdBy: string,
  ): Promise<DomainResult<Vote>>;

  /** Cast a ballot for a specific option on a vote. */
  castVote(
    tenantId: string,
    voteId: string,
    userId: string,
    optionId: string,
  ): Promise<DomainResult<void>>;

  /** Get the aggregated tally for a vote. */
  getVoteTally(
    tenantId: string,
    voteId: string,
  ): Promise<DomainResult<VoteTally>>;

  /** Find all active (before deadline) votes within a tenant. */
  findActiveVotes(tenantId: string): Promise<DomainResult<Vote[]>>;

  /** Find all votes belonging to a tenant. */
  findByTenant(tenantId: string): Promise<DomainResult<Vote[]>>;

  /** Find a single vote by its ID within a tenant. */
  findById(
    tenantId: string,
    voteId: string,
  ): Promise<DomainResult<Vote | null>>;

  /** Check whether a user has already cast a ballot on a vote. */
  hasUserVoted(
    tenantId: string,
    voteId: string,
    userId: string,
  ): Promise<DomainResult<boolean>>;
}
