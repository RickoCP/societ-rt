/**
 * GET /api/security/analytics — Get security analytics data.
 *
 * Role-restricted to Ketua_RT, Pengurus, Security_Guard.
 * BFF pattern: resolve auth → validate query → execute use case → return safe response.
 *
 * @see Requirements 31.6, 31.9
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetSecurityAnalyticsUseCase } from '@core/domains/securityCenter/usecases';

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  days: z.coerce.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// GET handler — Security analytics
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

  // 2. Validate query params
  const { searchParams } = new URL(request.url);
  const daysParam = searchParams.get('days');
  const validation = querySchema.safeParse({
    days: daysParam ?? undefined,
  });

  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid query parameters',
        correlationId,
      },
      { status: 400 },
    );
  }

  // 3. Execute use case via DI
  try {
    const useCase = container.resolve<GetSecurityAnalyticsUseCase>(
      'getSecurityAnalyticsUseCase',
    );
    const result = await useCase.execute({
      authContext,
      days: validation.data.days,
    });

    // 4. Map result to safe response
    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    const analytics = result.data;

    return NextResponse.json(
      {
        data: {
          incidentsBySeverity: analytics.incidentsBySeverity,
          averageResponseTime: analytics.averageResponseTime,
          incidentsByCategory: analytics.incidentsByCategory,
          patrolCoveragePercentage: analytics.patrolCoveragePercentage,
          deviceEventFrequency: analytics.deviceEventFrequency,
          timeRange: {
            start: analytics.timeRange.start.toISOString(),
            end: analytics.timeRange.end.toISOString(),
          },
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Internal server error',
        correlationId,
      },
      { status: 500 },
    );
  }
}
