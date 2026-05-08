/**
 * POST /api/security/patrols/sessions/[id]/complete — Complete a patrol session.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 35.8
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { CompletePatrolUseCase } from '@core/domains/patrol/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const completeSessionSchema = z.object({
  distanceTraveled: z.number().min(0),
});

// ---------------------------------------------------------------------------
// POST handler — Complete patrol session
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

  const validation = completeSessionSchema.safeParse(body);
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
  const useCase = container.resolve<CompletePatrolUseCase>('completePatrolUseCase');
  const result = await useCase.execute({
    authContext,
    sessionId,
    data: { distanceTraveled: validation.data.distanceTraveled },
  });

  // 5. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const session = result.data;

  return NextResponse.json(
    {
      data: {
        id: session.id,
        tenantId: session.tenantId,
        routeId: session.routeId,
        guardId: session.guardId,
        status: session.status,
        startedAt: session.startedAt.toISOString(),
        completedAt: session.completedAt?.toISOString() ?? null,
        checkpointsVisited: session.checkpointsVisited,
        distanceTraveled: session.distanceTraveled,
        createdAt: session.createdAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
