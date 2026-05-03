/**
 * POST /api/admin/impersonate — Start an impersonation session.
 *
 * Super_Admin only. Creates a time-limited token (max 60 min).
 *
 * @see Requirements 30.3, 30.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { ImpersonateUseCase } from '@core/domains/operational/usecases';

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

  const { impersonatedUserId, tenantId, durationMinutes } = body as {
    impersonatedUserId?: string;
    tenantId?: string;
    durationMinutes?: number;
  };

  if (!impersonatedUserId || typeof impersonatedUserId !== 'string') {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'impersonatedUserId is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  if (!tenantId || typeof tenantId !== 'string') {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'tenantId is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  const useCase = container.resolve<ImpersonateUseCase>('impersonateUseCase');
  const result = await useCase.execute({
    impersonatorId: authContext.userId,
    impersonatedUserId,
    tenantId,
    durationMinutes,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: {
        sessionId: result.data.id,
        token: result.data.token,
        expiresAt: result.data.expiresAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
