/**
 * GET  /api/security/alarms — List alarm devices for the tenant.
 * POST /api/security/alarms — Register a new alarm device.
 *
 * Role-restricted to users with security:read/security:manage permission.
 * BFF pattern: validate input → withPermission wrapper → execute use case → return safe response.
 *
 * @see Requirements 36.1, 36.2, 36.6
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 * @see Permission Mapping: GET /api/security/alarms → security:read
 * @see Permission Mapping: POST /api/security/alarms → security:manage
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
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

const handleListAlarms: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  try {
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

// ---------------------------------------------------------------------------
// POST handler — Register alarm device
// ---------------------------------------------------------------------------

const handleRegisterAlarm: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Parse and validate input
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

  // 2. Execute use case via DI
  try {
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

    // 3. Map result to safe response
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
 * GET /api/security/alarms — List alarm devices for the tenant
 * Permission: security:read
 */
export const GET = withPermission(
  { permissions: ['security:read'] },
  handleListAlarms,
);

/**
 * POST /api/security/alarms — Register a new alarm device
 * Permission: security:manage
 */
export const POST = withPermission(
  { permissions: ['security:manage'] },
  handleRegisterAlarm,
);
