/**
 * GET /api/security/gates/analytics — Get gate analytics for a specific gate and time range.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 33.6, 33.8
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetGateAnalyticsUseCase } from '@core/domains/gate/usecases';

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const analyticsQuerySchema = z.object({
  gateId: z.string().uuid(),
  from: z.coerce.date(),
  to: z.coerce.date(),
});

// ---------------------------------------------------------------------------
// GET handler — Gate analytics
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

  // 2. Parse query parameters
  const { searchParams } = new URL(request.url);
  const queryValidation = analyticsQuerySchema.safeParse({
    gateId: searchParams.get('gateId') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  });

  if (!queryValidation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(queryValidation.error),
        correlationId,
      },
      { status: 400 },
    );
  }

  const { gateId, from, to } = queryValidation.data;

  // 3. Execute use case via DI
  const useCase = container.resolve<GetGateAnalyticsUseCase>(
    'getGateAnalyticsUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: { gateId, from, to },
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const analytics = result.data;

  return NextResponse.json(
    {
      data: {
        totalEvents: analytics.totalEvents,
        averageOpenDuration: analytics.averageOpenDuration,
        longestOpenDuration: analytics.longestOpenDuration,
        openCount: analytics.openCount,
        closedCount: analytics.closedCount,
        timeRange: {
          from: analytics.timeRange.from.toISOString(),
          to: analytics.timeRange.to.toISOString(),
        },
      },
    },
    { status: 200 },
  );
}
