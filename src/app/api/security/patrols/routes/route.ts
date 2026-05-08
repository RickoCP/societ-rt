/**
 * GET  /api/security/patrols/routes — List patrol routes for the tenant.
 * POST /api/security/patrols/routes — Create a new patrol route.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 35.1, 35.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { CreatePatrolRouteUseCase } from '@core/domains/patrol/usecases';
import type { PatrolRepository } from '@core/domains/patrol/repositories/PatrolRepository';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const checkpointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  label: z.string().min(1).max(200),
});

const createRouteSchema = z.object({
  name: z.string().min(1).max(200),
  checkpoints: z.array(checkpointSchema).min(2).max(50),
  estimatedDuration: z.number().int().min(1).max(480),
});

// ---------------------------------------------------------------------------
// POST handler — Create patrol route
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

  const validation = createRouteSchema.safeParse(body);
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
  const useCase = container.resolve<CreatePatrolRouteUseCase>('createPatrolRouteUseCase');
  const result = await useCase.execute({
    authContext,
    data: validation.data,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const route = result.data;

  return NextResponse.json(
    {
      data: {
        id: route.id,
        tenantId: route.tenantId,
        name: route.name,
        checkpoints: route.checkpoints,
        estimatedDuration: route.estimatedDuration,
        createdBy: route.createdBy,
        createdAt: route.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// GET handler — List patrol routes
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

  // 2. Query repository for routes
  const patrolRepository = container.resolve<PatrolRepository>('patrolRepository');
  const result = await patrolRepository.findRoutesByTenant(authContext.tenantId);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const routes = result.data;

  return NextResponse.json(
    {
      data: routes.map(route => ({
        id: route.id,
        tenantId: route.tenantId,
        name: route.name,
        checkpoints: route.checkpoints,
        estimatedDuration: route.estimatedDuration,
        createdBy: route.createdBy,
        createdAt: route.createdAt.toISOString(),
      })),
    },
    { status: 200 },
  );
}
