/**
 * GET /api/auth/me — Returns the current authenticated user's basic info.
 *
 * Reads user context from middleware-set headers (x-user-id, x-user-role, x-tenant-id).
 * This is a lightweight endpoint for the client to know who is logged in.
 *
 * @see Requirements 1.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { container } from '@infrastructure/di/container';
import type { PrismaClient } from '@/generated/prisma/client';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

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

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');
    const user = await prisma.user.findUnique({
      where: { id: authContext.userId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      return NextResponse.json(
        {
          code: 'COMMON_NOT_FOUND',
          message: 'User not found',
          correlationId,
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        data: {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: authContext.tenantId,
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Internal server error',
        correlationId,
      },
      { status: 500 },
    );
  }
}
