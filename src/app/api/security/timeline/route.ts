/**
 * GET /api/security/timeline — Get security incident timeline.
 *
 * Role-restricted to users with security:read permission.
 * BFF pattern: validate query → withPermission wrapper → execute use case → return safe response.
 *
 * @see Requirements 31.3, 31.9
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { GetIncidentTimelineUseCase } from '@core/domains/securityCenter/usecases';

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  hours: z.coerce.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// GET handler — Incident timeline
// ---------------------------------------------------------------------------

const handleGetTimeline: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Validate query params
  const { searchParams } = new URL(request.url);
  const hoursParam = searchParams.get('hours');
  const validation = querySchema.safeParse({
    hours: hoursParam ?? undefined,
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

  // 2. Execute use case via DI
  try {
    const useCase = container.resolve<GetIncidentTimelineUseCase>(
      'getIncidentTimelineUseCase',
    );
    const result = await useCase.execute({
      authContext,
      hours: validation.data.hours,
    });

    // 3. Map result to safe response
    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    return NextResponse.json(
      {
        data: result.data.map(event => ({
          id: event.id,
          type: event.type,
          title: event.title,
          description: event.description,
          severity: event.severity,
          category: event.category,
          location: event.location,
          actorId: event.actorId,
          timestamp: event.timestamp.toISOString(),
        })),
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
  handleGetTimeline,
);
