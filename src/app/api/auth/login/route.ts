/**
 * POST /api/auth/login — Authenticates a user and issues a session cookie.
 *
 * BFF pattern: validate input → execute use case → set cookie → return safe response.
 * This is a public endpoint (no auth required). Tenant context comes from the request body.
 *
 * @see Requirements 3.1, 3.4, 3.5, 3.8
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  getAuthCookieConfig,
  AUTH_TOKEN_COOKIE,
} from '@infrastructure/utils/cookieConfig';
import type { LoginUseCase } from '@core/domains/auth/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  tenantId: z.string().uuid('Invalid tenant ID'),
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid JSON body',
        correlationId,
      },
      { status: 400 },
    );
  }

  const validation = loginSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    );
  }

  const { email, password, tenantId } = validation.data;

  // 2. Extract client IP for audit
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined;

  // 3. Execute use case via DI
  const loginUseCase = container.resolve<LoginUseCase>('loginUseCase');
  const result = await loginUseCase.execute({
    tenantId,
    email,
    password,
    ipAddress,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const { userId, name, role, token, expiresAt } = result.data;

  // 5. Set auth cookie and return safe user data
  const cookieConfig = getAuthCookieConfig(token, expiresAt);
  const response = NextResponse.json(
    {
      data: { userId, name, email, role },
    },
    { status: 200 },
  );

  response.cookies.set(AUTH_TOKEN_COOKIE, cookieConfig.value, {
    httpOnly: cookieConfig.httpOnly,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite,
    path: cookieConfig.path,
    expires: cookieConfig.expires,
  });

  return response;
}
