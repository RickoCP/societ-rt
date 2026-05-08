/**
 * POST /api/security/patrols/sessions/[id]/checkpoint — Record a checkpoint visit.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 35.4, 35.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { RecordCheckpointVisitUseCase } from '@core/domains/patrol/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const recordCheckpointSchema = z.object({
  checkpointIndex: z.number().int().min(0),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  checkpointLatitude: z.number().min(-90).max(90),
  checkpointLongitude: z.number().min(-180).max(180),
});

// ---------------------------------------------------------------------------
// POST handler — Record checkpoint visit
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  // 2. Extract session ID from route params
  const { id: sessionId } = await params;

  // 3. Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid JSON body',
        correlationId,
      },
      { status: 400 },
    );
  }

  const validation = recordCheckpointSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    );
  }

  // 4. Execute use case via DI
  const useCase = container.resolve<RecordCheckpointVisitUseCase>(
    'recordCheckpointVisitUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: {
      sessionId,
      checkpointIndex: validation.data.checkpointIndex,
      latitude: validation.data.latitude,
      longitude: validation.data.longitude,
      checkpointLatitude: validation.data.checkpointLatitude,
      checkpointLongitude: validation.data.checkpointLongitude,
    },
  });

  // 5. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const visit = result.data;

  return NextResponse.json(
    {
      data: {
        id: visit.id,
        sessionId: visit.sessionId,
        checkpointIndex: visit.checkpointIndex,
        latitude: visit.latitude,
        longitude: visit.longitude,
        visitedAt: visit.visitedAt.toISOString(),
        distanceFromCheckpoint: visit.distanceFromCheckpoint,
      },
    },
    { status: 201 },
  );
}
