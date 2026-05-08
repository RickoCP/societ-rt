/**
 * POST /api/security/alarms/:id/deactivate — Deactivate a siren device.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 36.3, 36.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const { id: deviceId } = await params;

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
}
