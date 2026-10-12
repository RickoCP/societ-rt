/**
 * PATCH /api/map/coordinates — Update household GPS coordinates.
 *
 * BFF pattern: withPermission → validate input → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 11.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse, type ErrorResponseBody } from '@infrastructure/utils/errorMapping';
import { uuidLike } from '@infrastructure/utils/uuidLike';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { UpdateHouseholdCoordinatesUseCase } from '@core/domains/map/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const updateCoordinatesSchema = z.object({
  householdId: uuidLike(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface UpdateCoordinatesResponse {
  data: { success: boolean };
}

// ---------------------------------------------------------------------------
// PATCH handler — Update coordinates
// ---------------------------------------------------------------------------

/**
 * Handle PATCH /api/map/coordinates — Update household GPS coordinates.
 *
 * AuthorizationContext is guaranteed to have household:manage permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with success status or error
 */
const handleUpdateCoordinates: AuthorizedRouteHandler<UpdateCoordinatesResponse | ErrorResponseBody> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<UpdateCoordinatesResponse | ErrorResponseBody>> => {
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

  const validation = updateCoordinatesSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Validation failed',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    );
  }

  // 2. Execute use case via DI
  const useCase = container.resolve<UpdateHouseholdCoordinatesUseCase>(
    'updateHouseholdCoordinatesUseCase',
  );
  const result = await useCase.execute({
    authContext,
    householdId: validation.data.householdId,
    latitude: validation.data.latitude,
    longitude: validation.data.longitude,
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    { data: { success: true } },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Exported Route Handlers with Permission Checks
// ---------------------------------------------------------------------------

/**
 * PATCH /api/map/coordinates — Update household GPS coordinates.
 *
 * Permission: household:manage (write access to household location data)
 *
 * @see Permission Mapping: /api/map/coordinates PATCH → household:manage
 */
export const PATCH = withPermission(
  { permissions: ['household:manage'] },
  handleUpdateCoordinates,
);
