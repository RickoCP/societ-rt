/**
 * GET /api/security/map — Get all security map layers with optional layer filter.
 *
 * BFF pattern: validate query → withPermission wrapper → execute use case → return safe response.
 *
 * Accepts optional `layers` query param (comma-separated):
 * incidents, cctv, panic_alerts, gates, patrol_routes, guard_positions
 *
 * @see Requirements 42.1, 42.4, 42.6, 42.7
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { GetSecurityMapDataUseCase } from '@core/domains/map/usecases';
import type { SecurityMapLayer } from '@core/domains/map/entities/SecurityMapTypes';

// ---------------------------------------------------------------------------
// Valid layer values
// ---------------------------------------------------------------------------

const VALID_LAYERS: readonly SecurityMapLayer[] = [
  'incidents',
  'cctv',
  'panic_alerts',
  'gates',
  'patrol_routes',
  'guard_positions',
];

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  layers: z
    .string()
    .optional()
    .refine(
      val => {
        if (!val) return true;
        const parts = val.split(',').map(s => s.trim());
        return parts.every(p => VALID_LAYERS.includes(p as SecurityMapLayer));
      },
      {
        message: `layers must be a comma-separated list of: ${VALID_LAYERS.join(', ')}`,
      },
    ),
});

// ---------------------------------------------------------------------------
// GET handler — All security map layers
// ---------------------------------------------------------------------------

const handleGetMapData: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Validate query params
  const { searchParams } = new URL(request.url);
  const validation = querySchema.safeParse({
    layers: searchParams.get('layers') ?? undefined,
  });

  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: validation.error.issues[0]?.message ?? 'Invalid query parameters',
        correlationId,
      },
      { status: 400 },
    );
  }

  // 2. Parse layers filter
  const layersParam = validation.data.layers;
  const layers: SecurityMapLayer[] | undefined = layersParam
    ? (layersParam.split(',').map(s => s.trim()) as SecurityMapLayer[])
    : undefined;

  // 3. Execute use case via DI
  try {
    const useCase = container.resolve<GetSecurityMapDataUseCase>(
      'getSecurityMapDataUseCase',
    );
    const result = await useCase.execute({
      authContext,
      layers,
    });

    // 4. Map result to safe response
    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    const data = result.data;

    return NextResponse.json(
      {
        data: {
          incidents: data.incidents.map(m => ({
            id: m.id,
            latitude: m.latitude,
            longitude: m.longitude,
            title: m.title,
            severity: m.severity,
            category: m.category,
            status: m.status,
            reportedAt: m.reportedAt.toISOString(),
          })),
          cctv: data.cctv.map(m => ({
            id: m.id,
            latitude: m.latitude,
            longitude: m.longitude,
            name: m.name,
            location: m.location,
            status: m.status,
          })),
          panicAlerts: data.panicAlerts.map(m => ({
            id: m.id,
            latitude: m.latitude,
            longitude: m.longitude,
            userId: m.userId,
            status: m.status,
            triggeredAt: m.triggeredAt.toISOString(),
          })),
          gates: data.gates.map(m => ({
            id: m.id,
            latitude: m.latitude,
            longitude: m.longitude,
            name: m.name,
            status: m.status,
            lastStateChange: m.lastStateChange.toISOString(),
          })),
          patrolRoutes: data.patrolRoutes.map(m => ({
            id: m.id,
            name: m.name,
            checkpoints: m.checkpoints.map(cp => ({
              latitude: cp.latitude,
              longitude: cp.longitude,
            })),
            estimatedDuration: m.estimatedDuration,
          })),
          guardPositions: data.guardPositions.map(m => ({
            sessionId: m.sessionId,
            guardId: m.guardId,
            routeId: m.routeId,
            routeName: m.routeName,
            status: m.status,
            startedAt: m.startedAt.toISOString(),
            checkpointsVisited: m.checkpointsVisited,
          })),
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_UNEXPECTED_ERROR',
        message: 'Internal server error',
        correlationId,
      },
      { status: 500 },
    );
  }
};

export const GET = withPermission(
  { permissions: ['security:read'] },
  handleGetMapData,
);
