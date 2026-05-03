/**
 * POST /api/admin/impersonate/end — End an impersonation session.
 *
 * Super_Admin only. Revokes token and logs session end.
 *
 * @see Requirements 30.3, 30.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { EndImpersonationUseCase } from '@core/domains/operational/usecases';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  if (authContext.role !== 'Super_Admin') {
    return NextResponse.json(
      {
        code: 'AUTH_INSUFFICIENT_ROLE',
        message: 'Forbidden',
        correlationId,
      },
      { status: 403 },
    );
  }

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

  const { sessionId } = body as { sessionId?: string };
  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'sessionId is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  const useCase = container.resolve<EndImpersonationUseCase>(
    'endImpersonationUseCase',
  );
  const result = await useCase.execute({
    sessionId,
    impersonatorId: authContext.userId,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: {
        sessionId: result.data.id,
        endedAt: result.data.endedAt?.toISOString() ?? null,
      },
    },
    { status: 200 },
  );
}
