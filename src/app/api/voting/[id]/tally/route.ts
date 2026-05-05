/**
 * GET /api/voting/[id]/tally — Get the aggregated tally for a vote.
 *
 * For verified mode + admin role: includes voter details per option.
 *
 * BFF pattern: resolve auth context → query → return safe response.
 *
 * @see Requirements 8.6, 8.7
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import { UserRole } from '@core/protocols';
import type { PrismaClient } from '@prisma/client';

const ADMIN_ROLES = [UserRole.Super_Admin, UserRole.Ketua_RT, UserRole.Pengurus];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id: voteId } = await params;

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
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
      );
    }

    // Get options with vote counts
    const options = await prisma.voteOption.findMany({
      where: { voteId },
      select: { id: true, label: true, voteCount: true },
      orderBy: { id: 'asc' },
    });

    const totalVotes = options.reduce((sum, o) => sum + o.voteCount, 0);

    // For verified mode + admin role: include voter details
    const isAdmin = ADMIN_ROLES.includes(authContext.role as UserRole);
    const isVerified = vote.mode === 'verified';
    let voters: Array<{ optionId: string; userName: string; votedAt: string }> | undefined;

    if (isVerified && isAdmin) {
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
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}
