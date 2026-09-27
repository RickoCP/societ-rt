/**
 * POST /api/security/alarms/:id/deactivate — Deactivate a siren device.
 *
 * Role-restricted to users with security:manage permission.
 * BFF pattern: validate input → withPermission wrapper → execute use case → return safe response.
 *
 * @see Requirements 36.3, 36.5
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 * @see Permission Mapping: POST /api/security/alarms/:id/deactivate → security:manage
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { DeactivateSirenUseCase } from '@core/domains/alarm/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const deactivateSirenSchema = z.object({
  triggerSource: z.enum(['manual', 'automation', 'schedule']),
  triggerType: z.string().min(1).max(200),
});

// ---------------------------------------------------------------------------
// POST handler — Deactivate siren
// ---------------------------------------------------------------------------

const handleDeactivateSiren: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
  routeContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract device ID from route params
  const params = await routeContext!.params!;
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

  const validation = deactivateSirenSchema.safeParse(body);
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
    const useCase = container.resolve<DeactivateSirenUseCase>(
      'deactivateSirenUseCase',
    );
    const result = await useCase.execute({
      authContext,
      data: {
        deviceId,
        triggerSource: validation.data.triggerSource,
        triggerType: validation.data.triggerType,
      },
    });

    // 4. Map result to safe response
    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    const event = result.data;

    return NextResponse.json(
      {
        data: {
          id: event.id,
          alarmDeviceId: event.alarmDeviceId,
          triggerSource: event.triggerSource,
          triggerType: event.triggerType,
          duration: event.duration,
          activatedAt: event.activatedAt.toISOString(),
          deactivatedAt: event.deactivatedAt?.toISOString() ?? null,
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
 * POST /api/security/alarms/:id/deactivate — Deactivate a siren device
 * Permission: security:manage
 */
export const POST = withPermission(
  { permissions: ['security:manage'] },
  handleDeactivateSiren,
);
