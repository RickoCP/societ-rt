/**
 * POST /api/auth/register — Registers a new user via an invitation token.
 *
 * BFF pattern: validate input → execute use case → return safe response.
 * This is a public endpoint (no auth required). Tenant context comes from the request body.
 *
 * Uses `withPublicRoute` wrapper for:
 * - Rate limiting (5 requests/minute - restrictive for registration)
 * - Input validation enforcement
 * - Correlation ID tracking
 * - Secure error responses
 *
 * @see Requirements 3.2, 3.3
 * @see Requirements 17.1, 17.2, 17.3, 17.4 — Auth Route Exclusion Handling
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPublicRoute } from '@infrastructure/middleware/authorization/requirePermission';
import type { RegisterUseCase } from '@core/domains/auth/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  invitationToken: z.string().min(1, 'Invitation token is required'),
  consentVersion: z.string().min(1, 'Consent version is required'),
  tenantId: z.string().min(1, 'Tenant ID is required'),
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * Handles registration requests with validation, use case execution, and response mapping.
 *
 * The `withPublicRoute` wrapper provides rate limiting and input validation enforcement,
 * while this handler focuses on business logic orchestration.
 */
async function handleRegister(request: NextRequest): Promise<NextResponse> {
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

  const validation = registerSchema.safeParse(body);
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

  const { name, email, password, invitationToken, consentVersion, tenantId } =
    validation.data;

  // 2. Extract client IP for audit
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined;

  // 3. Execute use case via DI
  const registerUseCase =
    container.resolve<RegisterUseCase>('registerUseCase');
  const result = await registerUseCase.execute({
    tenantId,
    data: { name, email, password, invitationToken, consentVersion },
    ipAddress,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const user = result.data;

  return NextResponse.json(
    {
      data: {
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    },
    { status: 201 },
  );
}

/**
 * POST /api/auth/register
 *
 * Public endpoint with rate limiting (5 requests/minute).
 * No JWT required — users register via invitation token.
 * More restrictive rate limit to prevent abuse.
 */
export const POST = withPublicRoute(
  {
    rateLimit: {
      maxRequests: 5, // Very restrictive for registration to prevent abuse
      windowMs: 60_000, // 1 minute
    },
  },
  handleRegister,
);
