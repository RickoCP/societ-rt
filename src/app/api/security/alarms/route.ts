/**
 * GET  /api/security/alarms — List alarm devices for the tenant.
 * POST /api/security/alarms — Register a new alarm device.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 36.1, 36.2, 36.6
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { RegisterAlarmDeviceUseCase } from '@core/domains/alarm/usecases';
import type { AlarmRepository } from '@core/domains/alarm/repositories/AlarmRepository';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const registerAlarmSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.string().min(1).max(500),
  deviceId: z.string().min(1),
  zones: z.array(z.string().min(1)).min(1),
  scheduleArm: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  scheduleDisarm: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
});

// ---------------------------------------------------------------------------
// GET handler — List alarm devices
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const alarmRepository =
    container.resolve<AlarmRepository>('alarmRepository');
  const result = await alarmRepository.findByTenant(authContext.tenantId);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: result.data.map((device) => ({
        id: device.id,
        name: device.name,
        location: device.location,
        deviceId: device.deviceId,
        zones: device.zones,
        scheduleArm: device.scheduleArm,
        scheduleDisarm: device.scheduleDisarm,
        status: device.status,
        createdAt: device.createdAt.toISOString(),
      })),
    },
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// POST handler — Register alarm device
// ---------------------------------------------------------------------------

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
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid JSON body',
        correlationId,
      },
      { status: 400 },
    );
  }

  const validation = registerAlarmSchema.safeParse(body);
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

  const useCase = container.resolve<RegisterAlarmDeviceUseCase>(
    'registerAlarmDeviceUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: {
      name: validation.data.name,
      location: validation.data.location,
      deviceId: validation.data.deviceId,
      zones: validation.data.zones,
      scheduleArm: validation.data.scheduleArm ?? null,
      scheduleDisarm: validation.data.scheduleDisarm ?? null,
    },
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const device = result.data;

  return NextResponse.json(
    {
      data: {
        id: device.id,
        name: device.name,
        location: device.location,
        deviceId: device.deviceId,
        zones: device.zones,
        scheduleArm: device.scheduleArm,
        scheduleDisarm: device.scheduleDisarm,
        status: device.status,
        createdAt: device.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
