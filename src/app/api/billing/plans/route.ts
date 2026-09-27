/**
 * GET /api/billing/plans — List all available subscription plans.
 *
 * BFF pattern: withPermission → query repository → return safe response.
 *
 * @see Requirements 16.1
 * @see Multi-Tenant Integration Cutover — Task 4.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission, type AuthorizedRouteHandler } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { BillingRepository } from '@core/domains/billing/repositories/BillingRepository';

interface PlansSuccessResponse {
  data: Array<{
    id: string;
    name: string;
    maxUsers: number | null;
    features: string[];
    price: number;
  }>;
}

interface ErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

type PlansResponse = PlansSuccessResponse | ErrorResponse;

const handleGetPlans: AuthorizedRouteHandler<PlansResponse> = async (
  request: NextRequest,
  _authContext: AuthorizationContext,
): Promise<NextResponse<PlansResponse>> => {
  const correlationId = request.headers.get('x-correlation-id') ?? generateCorrelationId();

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
};

export const GET = withPermission(
  { permissions: ['finance:read'] },
  handleGetPlans,
);
