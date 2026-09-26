/**
 * GET /api/security/analytics — Get security analytics data.
 *
 * BFF pattern: withPermission → validate query → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 31.6, 31.9
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { GetSecurityAnalyticsUseCase } from '@core/domains/securityCenter/usecases';

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  days: z.coerce.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface SecurityAnalyticsResponse {
  data: {
    incidentsBySeverity: Record<string, number>;
    averageResponseTime: number;
    incidentsByCategory: Record<string, number>;
    patrolCoveragePercentage: number;
    deviceEventFrequency: Record<string, number>;
    timeRange: {
      start: string;
      end: string;
    };
  };
}

// ---------------------------------------------------------------------------
// GET handler — Security analytics
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/security/analytics — Get security analytics data.
 *
 * AuthorizationContext is guaranteed to have security:read permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with analytics data or error
 */
const handleGetAnalytics: AuthorizedRouteHandler<SecurityAnalyticsResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<SecurityAnalyticsResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Validate query params
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
      } as unknown as SecurityAnalyticsResponse,
      { status: 400 },
    );
  }

  // 2. Execute use case via DI
  try {
    const useCase = container.resolve<GetSecurityAnalyticsUseCase>(
      'getSecurityAnalyticsUseCase',
    );
    const result = await useCase.execute({
      authContext,
      days: validation.data.days,
    });

    // 3. Map result to safe response
    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<SecurityAnalyticsResponse>;
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
      } as unknown as SecurityAnalyticsResponse,
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * GET /api/security/analytics — Get security analytics data.
 *
 * Permission: security:read (view security analytics)
 *
 * @see Permission Mapping: /api/security/analytics GET → security:read
 */
export const GET = withPermission(
  { permissions: ['security:read'] },
  handleGetAnalytics,
);
