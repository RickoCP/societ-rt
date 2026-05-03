/**
 * GET /api/finance/balance — Get the current running balance for the tenant.
 *
 * BFF pattern: resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 7.2, 7.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetBalanceUseCase } from '@core/domains/finance/usecases';

// ---------------------------------------------------------------------------
// GET handler — Get balance
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
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

  // 2. Execute use case via DI
  const useCase = container.resolve<GetBalanceUseCase>('getBalanceUseCase');
  const result = await useCase.execute({ authContext });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    { balance: result.data },
    { status: 200 },
  );
}
