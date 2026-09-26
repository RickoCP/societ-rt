/**
 * GET /api/security/gates/analytics — Get gate analytics for a specific gate and time range.
 *
 * BFF pattern: withPermission → validate query → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 33.6, 33.8
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
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
// Response types
// ---------------------------------------------------------------------------

interface GateAnalyticsResponse {
  data: {
    totalEvents: number;
    averageOpenDuration: number;
    longestOpenDuration: number;
    openCount: number;
    closedCount: number;
    timeRange: {
      from: string;
      to: string;
    };
  };
}

// ---------------------------------------------------------------------------
// GET handler — Gate analytics
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/security/gates/analytics — Get gate analytics for a specific gate and time range.
 *
 * AuthorizationContext is guaranteed to have security:read permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with gate analytics or error
 */
const handleGetGateAnalytics: AuthorizedRouteHandler<GateAnalyticsResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<GateAnalyticsResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Parse query parameters
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
      } as unknown as GateAnalyticsResponse,
      { status: 400 },
    );
  }

  const { gateId, from, to } = queryValidation.data;

  // 2. Execute use case via DI
  const useCase = container.resolve<GetGateAnalyticsUseCase>(
    'getGateAnalyticsUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: { gateId, from, to },
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<GateAnalyticsResponse>;
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
};

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * GET /api/security/gates/analytics — Get gate analytics for a specific gate and time range.
 *
 * Permission: security:read (view gate analytics)
 *
 * @see Permission Mapping: /api/security/gates/analytics GET → security:read
 */
export const GET = withPermission(
  { permissions: ['security:read'] },
  handleGetGateAnalytics,
);
