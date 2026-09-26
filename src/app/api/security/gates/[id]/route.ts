/**
 * GET /api/security/gates/[id] — Get gate detail with recent events.
 *
 * BFF pattern: withPermission → validate params → query repository → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 33.1, 33.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { GateRepository } from '@core/domains/gate/repositories/GateRepository';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface GateDetailResponse {
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
    recentEvents: Array<{
      id: string;
      state: string;
      duration: number;
      timestamp: string;
    }>;
  };
}

// ---------------------------------------------------------------------------
// GET handler — Gate detail
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/security/gates/[id] — Get gate detail with recent events.
 *
 * AuthorizationContext is guaranteed to have security:read permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @param context - Route context containing params promise
 * @returns NextResponse with gate detail or error
 */
const handleGetGateDetail: AuthorizedRouteHandler<GateDetailResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  context?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<GateDetailResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id: gateId } = await (context?.params ?? Promise.resolve({ id: '' }));

  // 1. Query repository for gate detail
  const gateRepository =
    container.resolve<GateRepository>('gateRepository');

  // Get all gates for tenant and find the specific one
  const gatesResult = await gateRepository.findByTenant(authContext.tenantId);

  if (!gatesResult.success) {
    return mapAppErrorToHttpResponse(gatesResult.error, correlationId) as NextResponse<GateDetailResponse>;
  }

  const gate = gatesResult.data.find(g => g.id === gateId);

  if (!gate) {
    return NextResponse.json(
      {
        code: 'GATE_NOT_FOUND',
        message: 'The requested resource was not found.',
        correlationId,
      } as unknown as GateDetailResponse,
      { status: 404 },
    );
  }

  // 2. Get recent events for this gate (last 10)
  const eventsResult = await gateRepository.findEventsByGate(
    authContext.tenantId,
    gateId,
    1,
    10,
  );

  const recentEvents = eventsResult.success
    ? eventsResult.data.data.map(event => ({
        id: event.id,
        state: event.state,
        duration: event.duration,
        timestamp: event.timestamp.toISOString(),
      }))
    : [];

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
        recentEvents,
      },
    },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * GET /api/security/gates/[id] — Get gate detail with recent events.
 *
 * Permission: security:read (view gate information)
 *
 * @see Permission Mapping: /api/security/gates/[id] GET → security:read
 */
export const GET = withPermission(
  { permissions: ['security:read'] },
  handleGetGateDetail,
);
