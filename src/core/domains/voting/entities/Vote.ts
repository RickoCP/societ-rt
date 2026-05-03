/**
 * Vote — Domain entities for the voting bounded context.
 *
 * Includes the Vote aggregate root, VoteOption value object, Ballot entity,
 * and supporting input/output types.
 *
 * Plain TypeScript interfaces — no classes, no decorators, no external deps.
 *
 * @see Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type VoteMode = 'anonymous' | 'verified';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** A vote (poll) created within a tenant. */
export interface Vote {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly description: string;
  readonly mode: VoteMode;
  readonly deadline: Date;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A selectable option belonging to a vote. */
export interface VoteOption {
  readonly id: string;
  readonly voteId: string;
  readonly label: string;
  readonly voteCount: number;
}

/** A ballot cast by a user for a specific option on a vote. */
export interface Ballot {
  readonly id: string;
  readonly voteId: string;
  readonly userId: string;
  readonly optionId: string;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a new vote. */
export interface CreateVoteInput {
  readonly title: string;
  readonly description: string;
  /** Labels for the vote options — at least 2 required. */
  readonly options: readonly string[];
  readonly mode: VoteMode;
  readonly deadline: Date;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** Aggregated tally for a vote's options. */
export interface VoteTally {
  readonly voteId: string;
  readonly options: readonly VoteTallyOption[];
  readonly totalVotes: number;
}

/** Individual option within a vote tally. */
export interface VoteTallyOption {
  readonly optionId: string;
  readonly label: string;
  readonly voteCount: number;
}
