/**
 * GET /api/security/map/heatmap — Get incident heatmap data.
 *
 * BFF pattern: validate query → withPermission wrapper → execute use case → return safe response.
 *
 * Accepts `days` query param: 7, 30, or 90 (defaults to 30).
 *
 * @see Requirements 42.7
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { GetIncidentHeatmapUseCase } from '@core/domains/map/usecases';
import type { HeatmapTimePeriod } from '@core/domains/map/entities/SecurityMapTypes';

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  days: z
    .enum(['7', '30', '90'])
    .optional()
    .default('30'),
});

// ---------------------------------------------------------------------------
// GET handler — Incident heatmap
// ---------------------------------------------------------------------------

const handleGetHeatmap: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Validate query params
  const { searchParams } = new URL(request.url);
  const validation = querySchema.safeParse({
    days: searchParams.get('days') ?? undefined,
  });

  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'days must be one of: 7, 30, 90',
        correlationId,
      },
      { status: 400 },
    );
  }

  const timePeriodDays = Number(validation.data.days) as HeatmapTimePeriod;

  // 2. Execute use case via DI
  try {
    const useCase = container.resolve<GetIncidentHeatmapUseCase>(
      'getIncidentHeatmapUseCase',
    );
    const result = await useCase.execute({
      authContext,
      timePeriodDays,
    });

    // 3. Map result to safe response
    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    const data = result.data;

    return NextResponse.json(
      {
        data: {
          points: data.points.map(p => ({
            latitude: p.latitude,
            longitude: p.longitude,
            weight: p.weight,
          })),
          timePeriodDays: data.timePeriodDays,
          totalIncidents: data.totalIncidents,
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
};

export const GET = withPermission(
  { permissions: ['security:read'] },
  handleGetHeatmap,
);
