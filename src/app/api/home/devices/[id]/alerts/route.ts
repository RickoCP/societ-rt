/**
 * PATCH /api/home/devices/[id]/alerts — Configure device alert preferences.
 *
 * BFF pattern: withPermission → validate input → execute use case → return safe response.
 *
 * @see Requirements 37.7
 * @see Requirements 2.1, 2.2, 2.3 — Route handler migration to withPermission
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
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

/**
 * Handles PATCH /api/home/devices/[id]/alerts request.
 *
 * Configures alert preferences for a specific device.
 * Requires `iot:read` permission (read permission since this is configuration, not device control).
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @param context - Route context containing params
 * @returns NextResponse with updated alert configuration or error
 */
const handleConfigureDeviceAlerts: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
  context,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract device ID from route params
  const params = context?.params ? await context.params : { id: '' };
  const deviceId = params.id;

  if (!deviceId) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Device ID is required',
        correlationId,
      },
      { status: 400 },
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

  // 3. Execute use case via DI
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

    // 4. Map result to safe response
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
};

/**
 * PATCH /api/home/devices/[id]/alerts
 *
 * Permission: iot:read (configuration requires read access to device)
 */
export const PATCH = withPermission(
  { permissions: ['iot:read'] },
  handleConfigureDeviceAlerts,
);
