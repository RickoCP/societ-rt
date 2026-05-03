/**
 * VotingRepositoryImpl — Infrastructure implementation of VotingRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on Vote model
 * and Prisma transactions for atomic createVote / castVote operations.
 *
 * @see Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type { VotingRepository } from '@core/domains/voting/repositories/VotingRepository';
import type {
  CreateVoteInput,
  Vote,
  VoteTally,
  VoteTallyOption,
} from '@core/domains/voting/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaVote {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  mode: string;
  deadline: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaVoteToDomain(p: PrismaVote): Vote {
  return {
    id: p.id,
    tenantId: p.tenantId,
    title: p.title,
    description: p.description,
    mode: p.mode as Vote['mode'],
    deadline: p.deadline,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

interface PrismaVoteOption {
  id: string;
  voteId: string;
  label: string;
  voteCount: number;
}

interface PrismaVoteWithOptions extends PrismaVote {
  options: PrismaVoteOption[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const VotingRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): VotingRepository => {
  const voteRepo: TenantScopedRepository<PrismaVote> =
    createTenantScopedRepository(
      prismaClient.vote as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // createVote
    // -----------------------------------------------------------------------
    async createVote(
      tenantId: string,
      data: CreateVoteInput,
      createdBy: string,
    ): Promise<DomainResult<Vote>> {
      try {
        const vote = await prismaClient.$transaction(async (tx) => {
          // 1. Create Vote record
          const created = await tx.vote.create({
            data: {
              tenantId,
              title: data.title,
              description: data.description,
              mode: data.mode,
              deadline: data.deadline,
              createdBy,
            },
          });

          // 2. Create VoteOption records for each label
          await Promise.all(
            data.options.map((label) =>
              tx.voteOption.create({
                data: {
                  voteId: created.id,
                  label,
                },
              }),
            ),
          );

          return created;
        });

        return ok(mapPrismaVoteToDomain(vote as unknown as PrismaVote));
      } catch (error) {
        return fail(
          technicalError(
            'VOTING_CREATE_FAILED',
            'Failed to create vote',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // castVote
    // -----------------------------------------------------------------------
    async castVote(
      _tenantId: string,
      voteId: string,
      userId: string,
      optionId: string,
    ): Promise<DomainResult<void>> {
      try {
        await prismaClient.$transaction(async (tx) => {
          // 1. Create Ballot record (unique constraint on voteId+userId prevents duplicates)
          await tx.ballot.create({
            data: {
              voteId,
              userId,
              optionId,
            },
          });

          // 2. Increment VoteOption.voteCount atomically
          await tx.voteOption.update({
            where: { id: optionId },
            data: { voteCount: { increment: 1 } },
          });
        });

        return ok(undefined);
      } catch (error) {
        return fail(
          technicalError(
            'VOTING_CAST_FAILED',
            'Failed to cast vote',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getVoteTally
    // -----------------------------------------------------------------------
    async getVoteTally(
      tenantId: string,
      voteId: string,
    ): Promise<DomainResult<VoteTally>> {
      try {
        const vote = (await voteRepo.findFirst(tenantId, {
          where: { id: voteId },
          include: { options: true },
        })) as unknown as PrismaVoteWithOptions | null;

        if (!vote) {
          return fail(
            notFoundError(
              'VOTING_NOT_FOUND',
              `Vote with ID ${voteId} not found`,
            ),
          );
        }

        const options: VoteTallyOption[] = vote.options.map((opt) => ({
          optionId: opt.id,
          label: opt.label,
          voteCount: opt.voteCount,
        }));

        const totalVotes = options.reduce(
          (sum, opt) => sum + opt.voteCount,
          0,
        );

        const tally: VoteTally = {
          voteId: vote.id,
          options,
          totalVotes,
        };

        return ok(tally);
      } catch (error) {
        return fail(
          technicalError(
            'VOTING_TALLY_FAILED',
            'Failed to get vote tally',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findActiveVotes
    // -----------------------------------------------------------------------
    async findActiveVotes(
      tenantId: string,
    ): Promise<DomainResult<Vote[]>> {
      try {
        const votes = await voteRepo.findMany(tenantId, {
          where: { deadline: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        });

        return ok(votes.map(mapPrismaVoteToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'VOTING_FIND_ACTIVE_FAILED',
            'Failed to find active votes',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByTenant
    // -----------------------------------------------------------------------
    async findByTenant(
      tenantId: string,
    ): Promise<DomainResult<Vote[]>> {
      try {
        const votes = await voteRepo.findMany(tenantId, {
          orderBy: { createdAt: 'desc' },
        });

        return ok(votes.map(mapPrismaVoteToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'VOTING_FIND_BY_TENANT_FAILED',
            'Failed to find votes for tenant',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findById
    // -----------------------------------------------------------------------
    async findById(
      tenantId: string,
      voteId: string,
    ): Promise<DomainResult<Vote | null>> {
      try {
        const vote = await voteRepo.findFirst(tenantId, {
          where: { id: voteId },
        });

        return ok(vote ? mapPrismaVoteToDomain(vote) : null);
      } catch (error) {
        return fail(
          technicalError(
            'VOTING_FIND_BY_ID_FAILED',
            'Failed to find vote by ID',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // hasUserVoted
    // -----------------------------------------------------------------------
    async hasUserVoted(
      _tenantId: string,
      voteId: string,
      userId: string,
    ): Promise<DomainResult<boolean>> {
      try {
        const ballot = await prismaClient.ballot.findUnique({
          where: {
            voteId_userId: {
              voteId,
              userId,
            },
          },
        });

        return ok(ballot !== null);
      } catch (error) {
        return fail(
          technicalError(
            'VOTING_HAS_USER_VOTED_FAILED',
            'Failed to check if user has voted',
            { cause: error },
          ),
        );
      }
    },
  };
};
