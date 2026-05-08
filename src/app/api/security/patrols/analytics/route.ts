/**
 * GET /api/security/patrols/analytics — Get patrol analytics for a time range.
 *
 * BFF pattern: validate query → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 35.7
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetPatrolAnalyticsUseCase } from '@core/domains/patrol/usecases';

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const analyticsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// GET handler — Get patrol analytics
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  // 2. Parse query parameters
  const { searchParams } = new URL(request.url);
  const queryValidation = analyticsQuerySchema.safeParse({
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

  // Default time range: last 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = queryValidation.data.from
    ? new Date(queryValidation.data.from)
    : thirtyDaysAgo;
  const to = queryValidation.data.to ? new Date(queryValidation.data.to) : now;

  // 3. Execute use case via DI
  const useCase = container.resolve<GetPatrolAnalyticsUseCase>(
    'getPatrolAnalyticsUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: { from, to },
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const analytics = result.data;

  return NextResponse.json(
    {
      data: {
        totalSessions: analytics.totalSessions,
        completedSessions: analytics.completedSessions,
        abandonedSessions: analytics.abandonedSessions,
        averageDuration: analytics.averageDuration,
        averageCheckpointsVisited: analytics.averageCheckpointsVisited,
        totalDistanceTraveled: analytics.totalDistanceTraveled,
        timeRange: {
          from: analytics.timeRange.from.toISOString(),
          to: analytics.timeRange.to.toISOString(),
        },
      },
    },
    { status: 200 },
  );
}
