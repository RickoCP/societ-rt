/**
 * GET /api/security/map/geofences — Get geofence polygons (alarm zones and patrol areas).
 *
 * BFF pattern: resolve auth → execute use case → return safe response.
 *
 * No additional query params required.
 *
 * @see Requirements 42.6
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetGeofenceVisualizationUseCase } from '@core/domains/map/usecases';

// ---------------------------------------------------------------------------
// GET handler — Geofence polygons
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

  // 2. Execute use case via DI
  try {
    const useCase = container.resolve<GetGeofenceVisualizationUseCase>(
      'getGeofenceVisualizationUseCase',
    );
    const result = await useCase.execute({
      authContext,
    });

    // 3. Map result to safe response
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
}
