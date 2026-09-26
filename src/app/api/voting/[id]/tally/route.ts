/**
 * GET /api/voting/[id]/tally — Get the aggregated tally for a vote.
 *
 * For verified mode + vote:manage permission: includes voter details per option.
 *
 * BFF pattern: resolve auth context → query → return safe response.
 *
 * Authorization:
 * - GET: vote:cast (view tally results)
 *
 * Note: Extended details (voter names in verified mode) are available
 * only to users with vote:manage permission.
 *
 * @see Requirements 8.6, 8.7
 * @see Requirements 2.1, 2.2, 2.3 — Route authorization migration
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// GET handler — Get vote tally
// ---------------------------------------------------------------------------

const handleGetTally: AuthorizedRouteHandler<void> = async (
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

    const vote = await prisma.vote.findFirst({
      where: { id: voteId, tenantId: authContext.tenantId },
      select: { id: true, mode: true },
    });

    if (!vote) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Vote not found', correlationId },
        { status: 404 },
      ) as NextResponse<void>;
    }

    // Get options with vote counts
    const options = await prisma.voteOption.findMany({
      where: { voteId },
      select: { id: true, label: true, voteCount: true },
      orderBy: { id: 'asc' },
    });

    const totalVotes = options.reduce((sum, o) => sum + o.voteCount, 0);

    // For verified mode + vote:manage permission: include voter details
    const hasVoteManage = authContext.permissions.has('vote:manage');
    const isVerified = vote.mode === 'verified';
    let voters: Array<{ optionId: string; userName: string; votedAt: string }> | undefined;

    if (isVerified && hasVoteManage) {
      const ballots = await prisma.ballot.findMany({
        where: { voteId },
        select: {
          optionId: true,
          createdAt: true,
          userId: true,
        },
      });

      // Get user names
      const userIds = [...new Set(ballots.map(b => b.userId))];
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      });
      const userMap = new Map(users.map(u => [u.id, u.name]));

      voters = ballots.map(b => ({
        optionId: b.optionId,
        userName: userMap.get(b.userId) ?? 'Unknown',
        votedAt: b.createdAt.toISOString(),
      }));
    }

    return NextResponse.json({
      data: {
        voteId,
        totalVotes,
        mode: vote.mode,
        options: options.map(o => ({
          optionId: o.id,
          label: o.label,
          voteCount: o.voteCount,
        })),
        ...(voters ? { voters } : {}),
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
 * GET /api/voting/[id]/tally — Get vote tally (requires vote:cast)
 *
 * Extended voter details in verified mode available only with vote:manage permission.
 */
export const GET = withPermission(
  { permissions: ['vote:cast'] },
  handleGetTally,
);
