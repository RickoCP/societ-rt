/**
 * GET /api/iot/devices/health — IoT device health dashboard.
 *
 * Returns aggregated health information for all devices in a household.
 * Requires authentication and device:read permission.
 *
 * @see Requirements 44.1, 44.4, 44.5
 * @see Requirements 2.1, 2.2, 2.3 — Route Handler Migration
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { GetDeviceHealthDashboardUseCase } from '@core/domains/iot/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  householdId: z.string().uuid('householdId must be a valid UUID').optional(),
});

// ---------------------------------------------------------------------------
// GET handler — Device health dashboard
// ---------------------------------------------------------------------------

const handleGetDeviceHealth: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Validate query params
  const { searchParams } = new URL(request.url);
  const validation = querySchema.safeParse({
    householdId: searchParams.get('householdId') ?? undefined,
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

  // 2. Execute use case
  const useCase = container.resolve<GetDeviceHealthDashboardUseCase>(
    'getDeviceHealthDashboardUseCase',
  );

  const result = await useCase.execute({
    authContext,
    householdId: validation.data.householdId,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const dashboard = result.data;

  // 3. Return safe response
  return NextResponse.json(
    {
      data: {
        tenantId: dashboard.tenantId,
        totalDevices: dashboard.totalDevices,
        onlineCount: dashboard.onlineCount,
        offlineCount: dashboard.offlineCount,
        onlineRatio: dashboard.onlineRatio,
        lowBatteryDevices: dashboard.lowBatteryDevices,
        highErrorRateDevices: dashboard.highErrorRateDevices,
        lastSyncTimestamp: dashboard.lastSyncTimestamp?.toISOString() ?? null,
      },
      correlationId,
    },
    { status: 200 },
  );
};

export const GET = withPermission(
  { permissions: ['iot:read'] },
  handleGetDeviceHealth,
);
