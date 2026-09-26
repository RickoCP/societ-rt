/**
 * GET /api/auth/me — Returns the current authenticated user's basic info.
 *
 * Reads user context from AuthorizationContext provided by withAuthOnlyRoute wrapper.
 * This is an auth-only endpoint — requires valid JWT but no specific permission.
 *
 * @see Requirements 1.3, 17.1, 17.3, 17.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { container } from '@infrastructure/di/container';
import {
  withAuthOnlyRoute,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface MeSuccessResponse {
  data: {
    userId: string;
    name: string | null;
    email: string;
    role: string;
    tenantId: string;
    membershipId: string;
    orgUnitId: string | null;
  };
}

interface MeErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

type MeResponse = MeSuccessResponse | MeErrorResponse;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Handler for GET /api/auth/me
 *
 * Receives AuthorizationContext from withAuthOnlyRoute wrapper.
 * User is guaranteed to be authenticated (valid JWT).
 */
const handleGetMe: AuthorizedRouteHandler<MeResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<MeResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

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
          role: authContext.role, // Use role from AuthorizationContext (server-resolved)
          tenantId: authContext.tenantId,
          membershipId: authContext.membershipId,
          orgUnitId: authContext.orgUnitId,
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
};

// Export wrapped handler with auth-only (requires valid JWT, no specific permission)
export const GET = withAuthOnlyRoute(handleGetMe);
