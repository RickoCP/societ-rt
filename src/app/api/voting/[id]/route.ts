/**
 * GET /api/voting/:id — Get vote detail with options.
 *
 * @see Requirements 8.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { PrismaClient } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const { id: voteId } = await params;

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const vote = await prisma.vote.findFirst({
      where: { id: voteId, tenantId: authContext.tenantId },
      include: {
        options: {
          select: { id: true, label: true, voteCount: true },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!vote) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Vote not found', correlationId },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: {
        id: vote.id,
        title: vote.title,
        description: vote.description,
        mode: vote.mode,
        deadline: vote.deadline.toISOString(),
        createdBy: vote.createdBy,
        createdAt: vote.createdAt.toISOString(),
        options: vote.options.map(o => ({
          id: o.id,
          label: o.label,
          voteCount: o.voteCount,
        })),
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}
