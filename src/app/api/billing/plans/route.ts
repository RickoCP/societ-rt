/**
 * GET /api/billing/plans — List all available subscription plans.
 *
 * BFF pattern: resolve auth → query repository → return safe response.
 *
 * @see Requirements 16.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { BillingRepository } from '@core/domains/billing/repositories/BillingRepository';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const billingRepository = container.resolve<BillingRepository>('billingRepository');
  const result = await billingRepository.getAllPlans();

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: result.data.map((plan) => ({
        id: plan.id,
        name: plan.name,
        maxUsers: plan.maxUsers,
        features: plan.features,
        price: plan.price,
      })),
    },
    { status: 200 },
  );
}
