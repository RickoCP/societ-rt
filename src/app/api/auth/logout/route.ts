/**
 * POST /api/auth/logout — Invalidates the user session and clears the auth cookie.
 *
 * BFF pattern: resolve auth context → execute use case → clear cookie → return safe response.
 * This is a protected endpoint — requires valid auth context from middleware.
 *
 * @see Requirements 3.6
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import { AUTH_TOKEN_COOKIE } from '@infrastructure/utils/cookieConfig';
import type { LogoutUseCase } from '@core/domains/auth/usecases';

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context from middleware-set headers
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

  // 2. Extract client IP for audit
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined;

  // 3. Execute use case via DI
  const logoutUseCase = container.resolve<LogoutUseCase>('logoutUseCase');
  const result = await logoutUseCase.execute({
    userId: authContext.userId,
    tenantId: authContext.tenantId,
    ipAddress,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  // 5. Clear auth cookie and return success
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
}
