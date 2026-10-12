/**
 * GET /api/home/devices — Get device dashboard for the authenticated Home_Owner.
 *
 * BFF pattern: withPermission → validate query → execute use case → return safe response.
 *
 * @see Requirements 37.2, 37.5
 * @see Requirements 2.1, 2.2, 2.3 — Route handler migration to withPermission
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { uuidLike } from '@infrastructure/utils/uuidLike';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { GetDeviceDashboardUseCase } from '@core/domains/societHome/usecases';

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  householdId: uuidLike('householdId must be a valid UUID'),
});

// ---------------------------------------------------------------------------
// GET handler — Device dashboard
// ---------------------------------------------------------------------------

/**
 * Handles GET /api/home/devices request.
 *
 * Returns a list of devices for the specified household.
 * Requires `iot:read` permission.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @returns NextResponse with device dashboard data or error
 */
const handleGetDeviceDashboard: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Validate query params
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

  // 2. Execute use case via DI
  try {
    const useCase = container.resolve<GetDeviceDashboardUseCase>(
      'getDeviceDashboardUseCase',
    );
    const result = await useCase.execute({
      authContext,
      householdId: validation.data.householdId,
    });

    // 3. Map result to safe response
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
};

/**
 * GET /api/home/devices
 *
 * Permission: iot:read
 */
export const GET = withPermission(
  { permissions: ['iot:read'] },
  handleGetDeviceDashboard,
);
