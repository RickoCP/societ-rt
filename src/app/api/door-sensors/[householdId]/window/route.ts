/**
 * /api/door-sensors/[householdId]/window — Resident monitoring window config.
 *
 *  - PUT: a resident (Home_Owner) sets the monitoring window for their household.
 *  - GET: fetch the current door-sensor config for a household.
 *
 * Ownership is enforced inside the use case (SetMonitoringWindowUseCase).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { SetMonitoringWindowUseCase } from '@core/domains/doorMonitoring/usecases';
import type { DoorMonitoringRepository } from '@core/domains/doorMonitoring/repositories';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const windowSchema = z.object({
  monitorStart: z.string().regex(HHMM, 'monitorStart must be HH:mm'),
  monitorEnd: z.string().regex(HHMM, 'monitorEnd must be HH:mm'),
  enabled: z.boolean(),
});

function unauthorized(correlationId: string): NextResponse {
  return NextResponse.json(
    { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
    { status: 401 },
  );
}

// ---------------------------------------------------------------------------
// PUT — set window
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ householdId: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) return unauthorized(correlationId);

  const { householdId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = windowSchema.safeParse(body);
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

  const useCase = container.resolve<SetMonitoringWindowUseCase>(
    'setMonitoringWindowUseCase',
  );
  const result = await useCase.execute({
    authContext,
    input: {
      householdId,
      monitorStart: validation.data.monitorStart,
      monitorEnd: validation.data.monitorEnd,
      enabled: validation.data.enabled,
    },
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const c = result.data;
  return NextResponse.json(
    {
      data: {
        householdId: c.householdId,
        monitorStart: c.monitorStart,
        monitorEnd: c.monitorEnd,
        enabled: c.enabled,
        currentState: c.currentState,
        deviceConfigured: c.iotDeviceId !== null,
      },
    },
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// GET — current config for a household
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ householdId: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) return unauthorized(correlationId);

  const { householdId } = await params;

  const repo = container.resolve<DoorMonitoringRepository>(
    'doorMonitoringRepository',
  );
  const result = await repo.findByHousehold(authContext.tenantId, householdId);

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const c = result.data;
  return NextResponse.json(
    {
      data: c
        ? {
            householdId: c.householdId,
            monitorStart: c.monitorStart,
            monitorEnd: c.monitorEnd,
            enabled: c.enabled,
            currentState: c.currentState,
            deviceConfigured: c.iotDeviceId !== null,
          }
        : null,
    },
    { status: 200 },
  );
}
