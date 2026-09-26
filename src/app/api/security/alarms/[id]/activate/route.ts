/**
 * POST /api/security/alarms/:id/activate — Activate a siren device.
 *
 * Role-restricted to users with security:manage permission.
 * BFF pattern: validate input → withPermission wrapper → execute use case → return safe response.
 *
 * @see Requirements 36.2, 36.4, 36.5
 * @see Requirements 2.1, 2.2, 2.3 (Multi-Tenant Integration Cutover)
 * @see Permission Mapping: POST /api/security/alarms/:id/activate → security:manage
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { ActivateSirenUseCase } from '@core/domains/alarm/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const activateSirenSchema = z.object({
  triggerSource: z.enum(['manual', 'automation', 'schedule']),
  triggerType: z.string().min(1).max(200),
  duration: z.number().int().min(1).max(300).optional(),
});

// ---------------------------------------------------------------------------
// POST handler — Activate siren
// ---------------------------------------------------------------------------

const handleActivateSiren: AuthorizedRouteHandler<unknown> = async (
  request,
  authContext,
  routeContext,
) => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract device ID from route params
  const { id: deviceId } = await routeContext!.params!;

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

  const validation = activateSirenSchema.safeParse(body);
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
    const useCase = container.resolve<ActivateSirenUseCase>(
      'activateSirenUseCase',
    );
    const result = await useCase.execute({
      authContext,
      data: {
        deviceId,
        triggerSource: validation.data.triggerSource,
        triggerType: validation.data.triggerType,
        duration: validation.data.duration,
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
 * POST /api/security/alarms/:id/activate — Activate a siren device
 * Permission: security:manage
 */
export const POST = withPermission(
  { permissions: ['security:manage'] },
  handleActivateSiren,
);
