/**
 * GET /api/finance/balance — Get the current running balance for the tenant.
 *
 * BFF pattern: withPermission → execute use case → return safe response.
 *
 * @see Requirements 7.2, 7.3
 * @see Multi-Tenant Integration Cutover — Task 4.4 (Cleanup)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { GetBalanceUseCase } from '@core/domains/finance/usecases';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface BalanceResponse {
  balance: number;
}

// ---------------------------------------------------------------------------
// GET handler — Get balance
// ---------------------------------------------------------------------------

const handleGetBalance: AuthorizedRouteHandler<BalanceResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<BalanceResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Execute use case via DI
  const useCase = container.resolve<GetBalanceUseCase>('getBalanceUseCase');
  const result = await useCase.execute({ authContext });

  // Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<BalanceResponse>;
  }

  return NextResponse.json(
    { balance: result.data },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Export wrapped handler with permission enforcement
// ---------------------------------------------------------------------------

export const GET = withPermission(
  { permissions: ['finance:read'] },
  handleGetBalance,
);
