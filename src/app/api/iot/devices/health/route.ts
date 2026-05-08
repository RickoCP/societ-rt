/**
 * GET /api/iot/devices/health — IoT device health dashboard.
 *
 * Returns aggregated health information for all devices in a household.
 * Requires authentication.
 *
 * @see Requirements 44.1, 44.4, 44.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  // 2. Validate query params
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

  // 3. Execute use case
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

  // 4. Return safe response
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
}
