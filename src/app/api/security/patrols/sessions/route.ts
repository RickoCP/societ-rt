/**
 * GET  /api/security/patrols/sessions — List active patrol sessions.
 * POST /api/security/patrols/sessions — Start a new patrol session.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 35.3, 35.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { StartPatrolUseCase } from '@core/domains/patrol/usecases';
import type { PatrolRepository } from '@core/domains/patrol/repositories/PatrolRepository';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const startSessionSchema = z.object({
  routeId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// POST handler — Start patrol session
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const validation = startSessionSchema.safeParse(body);
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
  const useCase = container.resolve<StartPatrolUseCase>('startPatrolUseCase');
  const result = await useCase.execute({
    authContext,
    data: { routeId: validation.data.routeId },
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
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// GET handler — List active sessions
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

  // 2. Query repository for active sessions
  const patrolRepository = container.resolve<PatrolRepository>('patrolRepository');
  const result = await patrolRepository.findActiveSessions(authContext.tenantId);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const sessions = result.data;

  return NextResponse.json(
    {
      data: sessions.map(session => ({
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
      })),
    },
    { status: 200 },
  );
}
