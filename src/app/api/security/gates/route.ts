/**
 * GET  /api/security/gates — List all gates for the tenant.
 * POST /api/security/gates — Register a new gate.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 33.1, 33.7
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { RegisterGateUseCase } from '@core/domains/gate/usecases';
import type { GateRepository } from '@core/domains/gate/repositories/GateRepository';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const registerGateSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.string().min(1).max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  deviceId: z.string().min(1).max(200),
});

// ---------------------------------------------------------------------------
// GET handler — List gates
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

  // 2. Query repository for gates
  const gateRepository =
    container.resolve<GateRepository>('gateRepository');
  const result = await gateRepository.findByTenant(authContext.tenantId);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: result.data.map(gate => ({
        id: gate.id,
        name: gate.name,
        location: gate.location,
        latitude: gate.latitude,
        longitude: gate.longitude,
        deviceId: gate.deviceId,
        status: gate.status,
        lastStateChange: gate.lastStateChange.toISOString(),
        createdAt: gate.createdAt.toISOString(),
      })),
    },
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// POST handler — Register gate
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const validation = registerGateSchema.safeParse(body);
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
  const useCase = container.resolve<RegisterGateUseCase>('registerGateUseCase');
  const result = await useCase.execute({
    authContext,
    data: validation.data,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const gate = result.data;

  return NextResponse.json(
    {
      data: {
        id: gate.id,
        name: gate.name,
        location: gate.location,
        latitude: gate.latitude,
        longitude: gate.longitude,
        deviceId: gate.deviceId,
        status: gate.status,
        lastStateChange: gate.lastStateChange.toISOString(),
        createdAt: gate.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
