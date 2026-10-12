/**
 * GET  /api/security/patrols/sessions — List active patrol sessions.
 * POST /api/security/patrols/sessions — Start a new patrol session.
 *
 * BFF pattern: validate input → withPermission wrapper → execute use case → return safe response.
 *
 * @see Requirements 35.3, 35.4
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { uuidLike } from '@infrastructure/utils/uuidLike';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { StartPatrolUseCase } from '@core/domains/patrol/usecases';
import type { PatrolRepository } from '@core/domains/patrol/repositories/PatrolRepository';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const startSessionSchema = z.object({
  routeId: uuidLike(),
});

// ---------------------------------------------------------------------------
// POST handler — Start patrol session
// ---------------------------------------------------------------------------

const handleStartSession: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Parse and validate input
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

  // 2. Execute use case via DI
  const useCase = container.resolve<StartPatrolUseCase>('startPatrolUseCase');
  const result = await useCase.execute({
    authContext,
    data: { routeId: validation.data.routeId },
  });

  // 3. Map result to safe response
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
};

export const POST = withPermission(
  { permissions: ['security:write'] },
  handleStartSession,
);

// ---------------------------------------------------------------------------
// GET handler — List active sessions
// ---------------------------------------------------------------------------

const handleListSessions: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Query repository for active sessions
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
};

export const GET = withPermission(
  { permissions: ['security:read'] },
  handleListSessions,
);
