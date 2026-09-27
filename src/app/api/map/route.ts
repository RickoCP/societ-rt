/**
 * GET /api/map — Get household map markers with optional filters.
 *
 * BFF pattern: withPermission → validate input → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * Query params: block, status, categories (comma-separated)
 *
 * @see Requirements 11.1, 11.2, 11.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse, type ErrorResponseBody } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { GetMapMarkersUseCase } from '@core/domains/map/usecases';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface MapMarkerResponse {
  householdId: string;
  householdNumber: string;
  address: string;
  block: string | null;
  latitude: number | null;
  longitude: number | null;
  residentCount: number;
  headOfHousehold: string | null;
}

interface MapMarkersListResponse {
  data: MapMarkerResponse[];
}

// ---------------------------------------------------------------------------
// GET handler — Get map markers
// ---------------------------------------------------------------------------

/**
 * Handle GET /api/map — Get household map markers for the tenant.
 *
 * AuthorizationContext is guaranteed to have household:read permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with map markers list or error
 */
const handleGetMapMarkers: AuthorizedRouteHandler<MapMarkersListResponse | ErrorResponseBody> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<MapMarkersListResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract query params
  const { searchParams } = new URL(request.url);
  const block = searchParams.get('block') ?? undefined;
  const status = searchParams.get('status') ?? undefined;
  const categoriesParam = searchParams.get('categories');
  const categories = categoriesParam
    ? categoriesParam.split(',').filter(Boolean)
    : undefined;

  // 2. Execute use case via DI
  const useCase =
    container.resolve<GetMapMarkersUseCase>('getMapMarkersUseCase');
  const result = await useCase.execute({
    authContext,
    filters: { block, status, categories },
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: result.data.map((marker) => ({
        householdId: marker.householdId,
        householdNumber: marker.householdNumber,
        address: marker.address,
        block: marker.block,
        latitude: marker.latitude,
        longitude: marker.longitude,
        residentCount: marker.residentCount,
        headOfHousehold: marker.headOfHousehold,
      })),
    },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * GET /api/map — Get household map markers for the tenant.
 *
 * Permission: household:read (read access to household location data)
 *
 * @see Permission Mapping: /api/map GET → household:read
 */
export const GET = withPermission(
  { permissions: ['household:read'] },
  handleGetMapMarkers,
);
