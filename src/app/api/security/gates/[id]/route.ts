/**
 * GET /api/security/gates/[id] — Get gate detail with recent events.
 *
 * BFF pattern: validate input → resolve auth context → query repository → return safe response.
 *
 * @see Requirements 33.1, 33.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GateRepository } from '@core/domains/gate/repositories/GateRepository';

// ---------------------------------------------------------------------------
// GET handler — Gate detail
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  const { id: gateId } = await params;

  // 2. Query repository for gate detail
  const gateRepository =
    container.resolve<GateRepository>('gateRepository');

  // Get all gates for tenant and find the specific one
  const gatesResult = await gateRepository.findByTenant(authContext.tenantId);

  if (!gatesResult.success) {
    return mapAppErrorToHttpResponse(gatesResult.error, correlationId);
  }

  const gate = gatesResult.data.find(g => g.id === gateId);

  if (!gate) {
    return NextResponse.json(
      {
        code: 'GATE_NOT_FOUND',
        message: 'The requested resource was not found.',
        correlationId,
      },
      { status: 404 },
    );
  }

  // 3. Get recent events for this gate (last 10)
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
}
