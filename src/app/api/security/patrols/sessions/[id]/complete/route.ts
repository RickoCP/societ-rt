/**
 * POST /api/security/patrols/sessions/[id]/complete — Complete a patrol session.
 *
 * BFF pattern: validate input → withPermission wrapper → execute use case → return safe response.
 *
 * @see Requirements 35.8
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
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

const handleCompleteSession: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
  routeContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract session ID from route params
  const { id: sessionId } = await routeContext?.params ?? { id: '' };

  if (!sessionId) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Session ID is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  // 2. Parse and validate input
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

  // 3. Execute use case via DI
  const useCase = container.resolve<CompletePatrolUseCase>('completePatrolUseCase');
  const result = await useCase.execute({
    authContext,
    sessionId,
    data: { distanceTraveled: validation.data.distanceTraveled },
  });

  // 4. Map result to safe response
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
};

export const POST = withPermission(
  { permissions: ['security:write'] },
  handleCompleteSession,
);
