/**
 * GET /api/map — Get household map markers with optional filters.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * Query params: block, status, categories (comma-separated)
 *
 * @see Requirements 11.1, 11.2, 11.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetMapMarkersUseCase } from '@core/domains/map/usecases';

// ---------------------------------------------------------------------------
// GET handler — Get map markers
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

  // 2. Extract query params
  const { searchParams } = new URL(request.url);
  const block = searchParams.get('block') ?? undefined;
  const status = searchParams.get('status') ?? undefined;
  const categoriesParam = searchParams.get('categories');
  const categories = categoriesParam
    ? categoriesParam.split(',').filter(Boolean)
    : undefined;

  // 3. Execute use case via DI
  const useCase =
    container.resolve<GetMapMarkersUseCase>('getMapMarkersUseCase');
  const result = await useCase.execute({
    authContext,
    filters: { block, status, categories },
  });

  // 4. Map result to safe response
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
}
