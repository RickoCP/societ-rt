/**
 * POST /api/iot/devices/pair — Pair a new IoT device with a household.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 37.1, 37.4, 38.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { PairDeviceUseCase } from '@core/domains/iot/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const pairDeviceSchema = z.object({
  householdId: z.string().uuid('householdId must be a valid UUID'),
  deviceType: z.enum([
    'panic_button',
    'smart_siren',
    'smart_lock',
    'cctv',
    'motion_sensor',
    'smoke_detector',
    'door_sensor',
    'gate_sensor',
    'smart_switch',
    'smart_lighting',
  ]),
  name: z.string().min(1, 'Device name is required').max(100),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// POST handler — Pair device
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  // 2. Parse and validate input
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

  const validation = pairDeviceSchema.safeParse(body);
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

  // 3. Execute use case via DI
  const useCase = container.resolve<PairDeviceUseCase>('pairDeviceUseCase');
  const result = await useCase.execute({
    authContext,
    data: validation.data,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const device = result.data;

  return NextResponse.json(
    {
      data: {
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
      },
    },
    { status: 201 },
  );
}
