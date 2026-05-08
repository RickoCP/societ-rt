/**
 * PATCH /api/home/devices/[id]/alerts — Configure device alert preferences.
 *
 * BFF pattern: resolve auth → validate input → execute use case → return safe response.
 *
 * @see Requirements 37.7
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { ConfigureDeviceAlertsUseCase } from '@core/domains/societHome/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const configureAlertsSchema = z.object({
  eventFilters: z.array(z.string()).default([]),
  quietHoursStart: z.string().nullable().default(null),
  quietHoursEnd: z.string().nullable().default(null),
  enabled: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// PATCH handler — Configure device alert preferences
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Unauthorized',
        correlationId,
      },
      { status: 401 },
    );
  }

  // 2. Extract device ID from route params
  const { id: deviceId } = await params;

  // 3. Parse and validate input
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

  const validation = configureAlertsSchema.safeParse(body);
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

  // 4. Execute use case via DI
  try {
    const useCase = container.resolve<ConfigureDeviceAlertsUseCase>(
      'configureDeviceAlertsUseCase',
    );
    const result = await useCase.execute({
      authContext,
      input: {
        deviceId,
        eventFilters: validation.data.eventFilters,
        quietHoursStart: validation.data.quietHoursStart,
        quietHoursEnd: validation.data.quietHoursEnd,
        enabled: validation.data.enabled,
      },
    });

    // 5. Map result to safe response
    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    return NextResponse.json(
      {
        data: {
          deviceId: result.data.deviceId,
          eventFilters: result.data.eventFilters,
          quietHoursStart: result.data.quietHoursStart,
          quietHoursEnd: result.data.quietHoursEnd,
          enabled: result.data.enabled,
        },
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
}
