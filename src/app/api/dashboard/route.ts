/**
 * GET /api/dashboard — Ketua_RT dashboard metrics.
 *
 * BFF pattern: resolve auth → execute use case → return safe response.
 * Cached via Redis with 5 min TTL.
 *
 * @see Requirements 28.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetKetuaDashboardUseCase } from '@core/domains/dashboard/usecases';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const useCase = container.resolve<GetKetuaDashboardUseCase>(
    'getKetuaDashboardUseCase',
  );
  const result = await useCase.execute({ tenantId: authContext.tenantId });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
}
