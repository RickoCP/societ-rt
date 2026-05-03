/**
 * POST /api/auth/invitation — Creates a time-limited invitation token.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 * This is a protected endpoint — requires Ketua_RT or Pengurus role.
 *
 * @see Requirements 3.3, 4.6
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { UserRole } from '@core/protocols';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { CreateInvitationUseCase } from '@core/domains/auth/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const invitationSchema = z.object({
  email: z.string().email('Invalid email format'),
  role: z.nativeEnum(UserRole, {
    error: 'Invalid role',
  }),
});

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

  // 2. Parse and validate input
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

  const validation = invitationSchema.safeParse(body);
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

  const { email, role } = validation.data;

  // 3. Execute use case via DI
  const createInvitationUseCase =
    container.resolve<CreateInvitationUseCase>('createInvitationUseCase');
  const result = await createInvitationUseCase.execute({
    authContext,
    email,
    role,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const invitation = result.data;

  return NextResponse.json(
    {
      data: {
        token: invitation.token,
        expiresAt: invitation.expiresAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
