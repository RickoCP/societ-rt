/**
 * POST /api/door-sensors — Platform admin registers a physical door sensor for
 * a household and binds it (with a siren zone) to the door-monitoring config.
 *
 * Authorization: Super_Admin only (enforced inside the use case; additional
 * permission check via withPermission wrapper).
 * Permission: device:manage (admin-level device registration)
 *
 * @see Requirements 2.1, 2.2, 2.3 — Route Handler Migration
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { RegisterDoorSensorUseCase } from '@core/domains/doorMonitoring/usecases';

const registerSchema = z.object({
  householdId: z.string().uuid('householdId must be a valid UUID'),
  tuyaDeviceId: z.string().min(1, 'tuyaDeviceId is required').max(128),
  deviceName: z.string().min(1, 'deviceName is required').max(120),
  sirenZone: z.string().min(1, 'sirenZone is required').max(120),
});

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface RegisterSuccessResponse {
  data: {
    householdId: string;
    sirenZone: string | null;
    deviceConfigured: boolean;
    monitorStart: string | null;
    monitorEnd: string | null;
    enabled: boolean;
  };
}

interface ErrorResponse {
  code: string;
  message?: string;
  fields?: Record<string, string>;
  correlationId: string;
}

type RegisterResponse = RegisterSuccessResponse | ErrorResponse;

/**
 * Handler for registering a new door sensor.
 * Requires device:manage permission for admin-level device registration.
 */
const handleRegisterSensor: AuthorizedRouteHandler<RegisterResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<RegisterResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = registerSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    );
  }

  const useCase = container.resolve<RegisterDoorSensorUseCase>(
    'registerDoorSensorUseCase',
  );
  const result = await useCase.execute({
    authContext,
    input: validation.data,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const c = result.data;
  return NextResponse.json(
    {
      data: {
        householdId: c.householdId,
        sirenZone: c.sirenZone,
        deviceConfigured: c.iotDeviceId !== null,
        monitorStart: c.monitorStart,
        monitorEnd: c.monitorEnd,
        enabled: c.enabled,
      },
    },
    { status: 201 },
  );
};

export const POST = withPermission(
  { permissions: ['device:manage'] },
  handleRegisterSensor,
);
