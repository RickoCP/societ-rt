/**
 * POST /api/voting — Create a new vote.
 * GET  /api/voting — List all votes for the tenant.
 *
 * BFF pattern: validate input → resolve auth context → execute use case / query → return safe response.
 *
 * @see Requirements 8.1, 8.6
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { CreateVoteUseCase } from '@core/domains/voting/usecases';
import type { VotingRepository } from '@core/domains/voting/repositories/VotingRepository';
import type { PrismaClient } from '@/generated/prisma/client';

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Unauthorized',
        correlationId,
      },
      { status: 401 },
    );
  }

  // 2. Parse and validate input
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
    );
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
    );
  }

  // 3. Execute use case via DI
  const useCase = container.resolve<CreateVoteUseCase>('createVoteUseCase');
  const result = await useCase.execute({
    authContext,
    data: {
      ...validation.data,
      deadline: new Date(validation.data.deadline),
    },
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
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
  );
}

// ---------------------------------------------------------------------------
// GET handler — List votes
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Unauthorized',
        correlationId,
      },
      { status: 401 },
    );
  }

  // 2. Query repository for all tenant votes
  const votingRepository =
    container.resolve<VotingRepository>('votingRepository');
  const result = await votingRepository.findByTenant(authContext.tenantId);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  // Resolve author names from user IDs
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
  );
}
