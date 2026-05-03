/**
 * POST /api/auth/register — Registers a new user via an invitation token.
 *
 * BFF pattern: validate input → execute use case → return safe response.
 * This is a public endpoint (no auth required). Tenant context comes from the request body.
 *
 * @see Requirements 3.2, 3.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
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
