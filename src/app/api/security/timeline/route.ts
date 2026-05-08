/**
 * GET /api/security/timeline — Get security incident timeline.
 *
 * Role-restricted to Ketua_RT, Pengurus, Security_Guard.
 * BFF pattern: resolve auth → validate query → execute use case → return safe response.
 *
 * @see Requirements 31.3, 31.9
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
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

  // 3. Execute use case via DI
  try {
    const useCase = container.resolve<GetIncidentTimelineUseCase>(
      'getIncidentTimelineUseCase',
    );
    const result = await useCase.execute({
      authContext,
      hours: validation.data.hours,
    });

    // 4. Map result to safe response
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
}
