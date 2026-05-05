/**
 * POST /api/packages/:id/collect — Mark a package as collected.
 *
 * @see Requirements 15.4
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

    const pkg = await prisma.packageLog.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!pkg) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Package not found', correlationId },
        { status: 404 },
      );
    }

    // Use raw SQL to update collected_at (field may not be in generated Prisma client)
    await prisma.$executeRawUnsafe(
      `UPDATE package_logs SET collected_at = NOW() WHERE id = $1`,
      id,
    );

    return NextResponse.json({
      data: {
        id,
        collectedAt: new Date().toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}
