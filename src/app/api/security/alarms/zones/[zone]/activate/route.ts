/**
 * POST /api/security/alarms/zones/:zone/activate — Activate all sirens in a zone.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 36.2, 36.4, 36.6
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { ActivateZoneSirenUseCase } from '@core/domains/alarm/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const activateZoneSchema = z.object({
  triggerSource: z.enum(['manual', 'automation', 'schedule']),
  triggerType: z.string().min(1).max(200),
  duration: z.number().int().min(1).max(300).optional(),
});

// ---------------------------------------------------------------------------
// POST handler — Activate zone sirens
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ zone: string }> },
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

  const { zone } = await params;

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

  const validation = activateZoneSchema.safeParse(body);
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

  const useCase = container.resolve<ActivateZoneSirenUseCase>(
    'activateZoneSirenUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: {
      zone: decodeURIComponent(zone),
      triggerSource: validation.data.triggerSource,
      triggerType: validation.data.triggerType,
      duration: validation.data.duration,
    },
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const events = result.data;

  return NextResponse.json(
    {
      data: events.map((event) => ({
        id: event.id,
        alarmDeviceId: event.alarmDeviceId,
        triggerSource: event.triggerSource,
        triggerType: event.triggerType,
        duration: event.duration,
        activatedAt: event.activatedAt.toISOString(),
        deactivatedAt: event.deactivatedAt?.toISOString() ?? null,
      })),
    },
    { status: 200 },
  );
}
