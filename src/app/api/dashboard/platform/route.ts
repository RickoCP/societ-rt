/**
 * GET /api/dashboard/platform — Super_Admin platform dashboard metrics.
 *
 * BFF pattern: resolve auth → verify Super_Admin role → execute use case → return safe response.
 * Cached via Redis with 5 min TTL.
 *
 * @see Requirements 28.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetPlatformDashboardUseCase } from '@core/domains/dashboard/usecases';

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

  const useCase = container.resolve<GetPlatformDashboardUseCase>(
    'getPlatformDashboardUseCase',
  );
  const result = await useCase.execute();

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json({ data: result.data }, { status: 200 });
}
