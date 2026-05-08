/**
 * GET /api/home/devices — Get device dashboard for the authenticated Home_Owner.
 *
 * BFF pattern: resolve auth → validate query → execute use case → return safe response.
 *
 * @see Requirements 37.2, 37.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetDeviceDashboardUseCase } from '@core/domains/societHome/usecases';

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  householdId: z.string().uuid('householdId must be a valid UUID'),
});

// ---------------------------------------------------------------------------
// GET handler — Device dashboard
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

  // 2. Validate query params
  const { searchParams } = new URL(request.url);
  const validation = querySchema.safeParse({
    householdId: searchParams.get('householdId'),
  });

  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid query parameters',
        correlationId,
      },
      { status: 400 },
    );
  }

  // 3. Execute use case via DI
  try {
    const useCase = container.resolve<GetDeviceDashboardUseCase>(
      'getDeviceDashboardUseCase',
    );
    const result = await useCase.execute({
      authContext,
      householdId: validation.data.householdId,
    });

    // 4. Map result to safe response
    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    return NextResponse.json(
      {
        data: result.data.map(device => ({
          deviceId: device.deviceId,
          name: device.name,
          deviceType: device.deviceType,
          onlineStatus: device.onlineStatus,
          batteryLevel: device.batteryLevel,
          lastSeen: device.lastSeen.toISOString(),
          lastActivity: device.lastActivity?.toISOString() ?? null,
        })),
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
