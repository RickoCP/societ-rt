/**
 * POST /api/voting — Create a new vote.
 * GET  /api/voting — List all votes for the tenant.
 *
 * BFF pattern: validate input → resolve auth context → execute use case / query → return safe response.
 *
 * Authorization:
 * - POST: vote:manage (create vote polls)
 * - GET: vote:cast (view available votes to cast)
 *
 * @see Requirements 8.1, 8.6
 * @see Requirements 2.1, 2.2, 2.3 — Route authorization migration
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { CreateVoteUseCase } from '@core/domains/voting/usecases';
import type { VotingRepository } from '@core/domains/voting/repositories/VotingRepository';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const createVoteSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  options: z
    .array(z.string().min(1, 'Option label must not be empty'))
    .min(2, 'At least 2 options are required'),
  mode: z.enum(['anonymous', 'verified']),
  deadline: z.string().refine(
    (val) => !isNaN(new Date(val).getTime()),
    'Invalid date format',
  ),
});

// ---------------------------------------------------------------------------
// POST handler — Create vote
// ---------------------------------------------------------------------------

const handleCreateVote: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid JSON body',
        correlationId,
      },
      { status: 400 },
    ) as NextResponse<void>;
  }

  const validation = createVoteSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    ) as NextResponse<void>;
  }

  // 2. Execute use case via DI
  const useCase = container.resolve<CreateVoteUseCase>('createVoteUseCase');
  const result = await useCase.execute({
    authContext,
    data: {
      ...validation.data,
      deadline: new Date(validation.data.deadline),
    },
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<void>;
  }

  const vote = result.data;

  return NextResponse.json(
    {
      data: {
        id: vote.id,
        title: vote.title,
        description: vote.description,
        mode: vote.mode,
        deadline: vote.deadline.toISOString(),
        createdBy: vote.createdBy,
        createdAt: vote.createdAt.toISOString(),
      },
    },
    { status: 201 },
  ) as NextResponse<void>;
};

// ---------------------------------------------------------------------------
// GET handler — List votes
// ---------------------------------------------------------------------------

const handleListVotes: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Query repository for all tenant votes
  const votingRepository =
    container.resolve<VotingRepository>('votingRepository');
  const result = await votingRepository.findByTenant(authContext.tenantId);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<void>;
  }

  // 2. Resolve author names from user IDs
  const prisma = container.resolve<PrismaClient>('prismaClient');
  const creatorIds = [...new Set(result.data.map((v) => v.createdBy))];
  const users = await prisma.user.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, name: true },
  });
  const userNameMap = new Map(users.map((u) => [u.id, u.name]));

  return NextResponse.json(
    {
      data: result.data.map((vote) => ({
        id: vote.id,
        title: vote.title,
        description: vote.description,
        mode: vote.mode,
        deadline: vote.deadline.toISOString(),
        createdBy: vote.createdBy,
        authorName: userNameMap.get(vote.createdBy) ?? 'Unknown',
        createdAt: vote.createdAt.toISOString(),
      })),
    },
    { status: 200 },
  ) as NextResponse<void>;
};

// ---------------------------------------------------------------------------
// Export route handlers with permission wrappers
// ---------------------------------------------------------------------------

/**
 * POST /api/voting — Create a new vote (requires vote:manage)
 */
export const POST = withPermission(
  { permissions: ['vote:manage'] },
  handleCreateVote,
);

/**
 * GET /api/voting — List all votes for the tenant (requires vote:cast to see available votes)
 */
export const GET = withPermission(
  { permissions: ['vote:cast'] },
  handleListVotes,
);
