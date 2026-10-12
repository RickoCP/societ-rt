/**
 * GET /api/iot/devices — List IoT devices for the authenticated user's household.
 *
 * BFF pattern: validate input → withPermission wrapper → validate device ownership → query → return safe response.
 *
 * @see Requirements 37.1, 37.4, 44.5
 * @see Requirements 2.1, 2.2, 2.3 — Route Handler Migration
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { uuidLike } from '@infrastructure/utils/uuidLike';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { IoTRepository } from '@core/domains/iot/repositories/IoTRepository';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  householdId: uuidLike('householdId must be a valid UUID'),
});

// ---------------------------------------------------------------------------
// GET handler — List devices for a household
// ---------------------------------------------------------------------------

const handleListDevices: AuthorizedRouteHandler<unknown> = async (
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
        message: 'householdId query parameter is required and must be a valid UUID',
        correlationId,
      },
      { status: 400 },
    );
  }

  const { householdId } = validation.data;

  // 2. Query repository
  const iotRepository = container.resolve<IoTRepository>('iotRepository');
  const result = await iotRepository.findByHousehold(
    authContext.tenantId,
    householdId,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  // 3. Return safe response
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
};

export const GET = withPermission(
  { permissions: ['iot:read'] },
  handleListDevices,
);
