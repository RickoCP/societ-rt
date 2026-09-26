/**
 * GET  /api/security/gates — List all gates for the tenant.
 * POST /api/security/gates — Register a new gate.
 *
 * BFF pattern: withPermission → validate input → execute use case / query → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 33.1, 33.7
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
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
// Response types
// ---------------------------------------------------------------------------

interface GateResponse {
  data: {
    id: string;
    name: string;
    location: string;
    latitude: number;
    longitude: number;
    deviceId: string;
    status: string;
    lastStateChange: string;
    createdAt: string;
  };
}

interface GateListResponse {
  data: Array<{
    id: string;
    name: string;
    location: string;
    latitude: number;
    longitude: number;
    deviceId: string;
    status: string;
    lastStateChange: string;
    createdAt: string;
  }>;
}

// ---------------------------------------------------------------------------
// GET handler — List gates
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/security/gates — List all gates for the tenant.
 *
 * AuthorizationContext is guaranteed to have security:read permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with gates list or error
 */
const handleListGates: AuthorizedRouteHandler<GateListResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<GateListResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Query repository for gates
  const gateRepository =
    container.resolve<GateRepository>('gateRepository');
  const result = await gateRepository.findByTenant(authContext.tenantId);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<GateListResponse>;
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
};

// ---------------------------------------------------------------------------
// POST handler — Register gate
// ---------------------------------------------------------------------------

/**
 * Handle POST /api/security/gates — Register a new gate.
 *
 * AuthorizationContext is guaranteed to have security:manage permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with created gate or error
 */
const handleRegisterGate: AuthorizedRouteHandler<GateResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<GateResponse>> => {
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
      } as unknown as GateResponse,
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
      } as unknown as GateResponse,
      { status: 400 },
    );
  }

  // 2. Execute use case via DI
  const useCase = container.resolve<RegisterGateUseCase>('registerGateUseCase');
  const result = await useCase.execute({
    authContext,
    data: validation.data,
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<GateResponse>;
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
};

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * GET /api/security/gates — List all gates for the tenant.
 *
 * Permission: security:read (view gate information)
 *
 * @see Permission Mapping: /api/security/gates GET → security:read
 */
export const GET = withPermission(
  { permissions: ['security:read'] },
  handleListGates,
);

/**
 * POST /api/security/gates — Register a new gate.
 *
 * Permission: security:manage (create gate)
 *
 * @see Permission Mapping: /api/security/gates POST → security:manage
 */
export const POST = withPermission(
  { permissions: ['security:manage'] },
  handleRegisterGate,
);
