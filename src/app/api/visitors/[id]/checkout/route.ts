/**
 * POST /api/visitors/:id/checkout — Mark a visitor as checked out.
 *
 * @see Requirements 15.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { PrismaClient } from '@prisma/client';

export async function POST(
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

  const { id } = await params;

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const visitor = await prisma.visitorLog.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!visitor) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Visitor log not found', correlationId },
        { status: 404 },
      );
    }

    if (visitor.exitTimestamp) {
      return NextResponse.json(
        { code: 'VISITOR_ALREADY_CHECKED_OUT', message: 'Visitor already checked out', correlationId },
        { status: 409 },
      );
    }

    const updated = await prisma.visitorLog.update({
      where: { id },
      data: { exitTimestamp: new Date() },
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        exitTimestamp: updated.exitTimestamp?.toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}
