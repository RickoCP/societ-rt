/**
 * GET /api/security/map/geofences — Get geofence polygons (alarm zones and patrol areas).
 *
 * BFF pattern: withPermission wrapper → execute use case → return safe response.
 *
 * No additional query params required.
 *
 * @see Requirements 42.6
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { GetGeofenceVisualizationUseCase } from '@core/domains/map/usecases';

// ---------------------------------------------------------------------------
// GET handler — Geofence polygons
// ---------------------------------------------------------------------------

const handleGetGeofences: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Execute use case via DI
  try {
    const useCase = container.resolve<GetGeofenceVisualizationUseCase>(
      'getGeofenceVisualizationUseCase',
    );
    const result = await useCase.execute({
      authContext,
    });

    // Map result to safe response
    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    const data = result.data;

    return NextResponse.json(
      {
        data: {
          zones: data.zones.map(zone => ({
            id: zone.id,
            name: zone.name,
            type: zone.type,
            polygon: zone.polygon.map(coord => ({
              latitude: coord.latitude,
              longitude: coord.longitude,
            })),
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
  handleGetGeofences,
);
