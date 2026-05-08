/**
 * GET /api/iot/devices — List IoT devices for the authenticated user's household.
 *
 * BFF pattern: validate input → resolve auth context → validate device ownership → query → return safe response.
 *
 * @see Requirements 37.1, 37.4, 44.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { IoTRepository } from '@core/domains/iot/repositories/IoTRepository';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  householdId: z.string().uuid('householdId must be a valid UUID'),
});

// ---------------------------------------------------------------------------
// GET handler — List devices for a household
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
    householdId: searchParams.get('householdId'),
  });

  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'householdId query parameter is required and must be a valid UUID',
        correlationId,
      },
      { status: 400 },
    );
  }

  const { householdId } = validation.data;

  // 3. Query repository
  const iotRepository = container.resolve<IoTRepository>('iotRepository');
  const result = await iotRepository.findByHousehold(
    authContext.tenantId,
    householdId,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  // 4. Return safe response
  return NextResponse.json(
    {
      data: result.data.map(device => ({
        id: device.id,
        householdId: device.householdId,
        tuyaDeviceId: device.tuyaDeviceId,
        deviceType: device.deviceType,
        name: device.name,
        onlineStatus: device.onlineStatus,
        batteryLevel: device.batteryLevel,
        lastSeen: device.lastSeen.toISOString(),
        createdAt: device.createdAt.toISOString(),
        updatedAt: device.updatedAt.toISOString(),
      })),
    },
    { status: 200 },
  );
}
