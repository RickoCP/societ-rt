/**
 * POST /api/auth/logout — Invalidates the user session and clears the auth cookie.
 *
 * BFF pattern: auth context from wrapper → execute use case → clear cookie → return safe response.
 * This is an auth-only endpoint — requires valid JWT but no specific permission.
 *
 * @see Requirements 17.1, 17.3, 17.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withAuthOnlyRoute,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import { AUTH_TOKEN_COOKIE } from '@infrastructure/utils/cookieConfig';
import type { LogoutUseCase } from '@core/domains/auth/usecases';

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface LogoutSuccessData {
  data: { message: string };
}

interface ErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

type LogoutSuccessResponse = LogoutSuccessData | ErrorResponse;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Handler for POST /api/auth/logout
 *
 * Receives AuthorizationContext from withAuthOnlyRoute wrapper.
 * User is guaranteed to be authenticated (valid JWT).
 */
const handleLogout: AuthorizedRouteHandler<LogoutSuccessResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<LogoutSuccessResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract client IP for audit
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined;

  // 2. Execute use case via DI
  const logoutUseCase = container.resolve<LogoutUseCase>('logoutUseCase');
  const result = await logoutUseCase.execute({
    userId: authContext.userId,
    tenantId: authContext.tenantId,
    ipAddress,
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  // 4. Clear auth cookie and return success
  const response = NextResponse.json(
    {
      data: { message: 'Logged out' },
    },
    { status: 200 },
  );

  response.cookies.set(AUTH_TOKEN_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });

  return response;
};

// Export wrapped handler with auth-only (requires valid JWT, no specific permission)
export const POST = withAuthOnlyRoute(handleLogout);
