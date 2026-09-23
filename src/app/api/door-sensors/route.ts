/**
 * POST /api/door-sensors — Platform admin registers a physical door sensor for
 * a household and binds it (with a siren zone) to the door-monitoring config.
 *
 * Authorization: Super_Admin only (enforced inside the use case; a coarse role
 * guard here returns 403 early). The target tenant is taken from the auth
 * context headers (x-tenant-id), which an admin tool sets per RT.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { RegisterDoorSensorUseCase } from '@core/domains/doorMonitoring/usecases';

const registerSchema = z.object({
  householdId: z.string().uuid('householdId must be a valid UUID'),
  tuyaDeviceId: z.string().min(1, 'tuyaDeviceId is required').max(128),
  deviceName: z.string().min(1, 'deviceName is required').max(120),
  sirenZone: z.string().min(1, 'sirenZone is required').max(120),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

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
}
