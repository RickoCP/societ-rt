/**
 * GET /api/voting/[id]/my-vote — Get the current user's vote on a specific poll.
 *
 * BFF pattern: resolve auth context → query → return safe response.
 *
 * Authorization:
 * - GET: vote:cast (check own vote status)
 *
 * @see Requirements 8.3
 * @see Requirements 2.1, 2.2, 2.3 — Route authorization migration
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// GET handler — Get user's vote
// ---------------------------------------------------------------------------

const handleGetMyVote: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const voteId = params?.id;

  if (!voteId) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Vote ID is required',
        correlationId,
      },
      { status: 400 },
    ) as NextResponse<void>;
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    // Verify vote exists and belongs to tenant
    const vote = await prisma.vote.findFirst({
      where: { id: voteId, tenantId: authContext.tenantId },
      select: { id: true, deadline: true },
    });

    if (!vote) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Vote not found', correlationId },
        { status: 404 },
      ) as NextResponse<void>;
    }

    // Get user's ballot if exists
    const ballot = await prisma.ballot.findUnique({
      where: {
        voteId_userId: {
          voteId,
          userId: authContext.userId,
        },
      },
      select: {
        optionId: true,
        createdAt: true,
      },
    });

    if (!ballot) {
      return NextResponse.json({
        data: {
          hasVoted: false,
          optionId: null,
          votedAt: null,
        },
      }) as NextResponse<void>;
    }

    return NextResponse.json({
      data: {
        hasVoted: true,
        optionId: ballot.optionId,
        votedAt: ballot.createdAt.toISOString(),
      },
    }) as NextResponse<void>;
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    ) as NextResponse<void>;
  }
};

// ---------------------------------------------------------------------------
// Export route handler with permission wrapper
// ---------------------------------------------------------------------------

/**
 * GET /api/voting/[id]/my-vote — Get current user's vote (requires vote:cast)
 */
export const GET = withPermission(
  { permissions: ['vote:cast'] },
  handleGetMyVote,
);
