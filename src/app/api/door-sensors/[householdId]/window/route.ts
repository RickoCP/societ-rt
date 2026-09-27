/**
 * /api/door-sensors/[householdId]/window — Resident monitoring window config.
 *
 *  - PUT: a resident (Home_Owner) sets the monitoring window for their household.
 *  - GET: fetch the current door-sensor config for a household.
 *
 * Ownership is enforced inside the use case (SetMonitoringWindowUseCase).
 *
 * @see Requirements 2.1, 2.2, 2.3 — Route Handler Migration
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { SetMonitoringWindowUseCase } from '@core/domains/doorMonitoring/usecases';
import type { DoorMonitoringRepository } from '@core/domains/doorMonitoring/repositories';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const windowSchema = z.object({
  monitorStart: z.string().regex(HHMM, 'monitorStart must be HH:mm'),
  monitorEnd: z.string().regex(HHMM, 'monitorEnd must be HH:mm'),
  enabled: z.boolean(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface WindowConfigSuccessResponse {
  data: {
    householdId: string;
    monitorStart: string | null;
    monitorEnd: string | null;
    enabled: boolean;
    currentState: string;
    deviceConfigured: boolean;
  } | null;
}

interface ErrorResponse {
  code: string;
  message?: string;
  fields?: Record<string, string>;
  correlationId: string;
}

type WindowConfigResponse = WindowConfigSuccessResponse | ErrorResponse;

// ---------------------------------------------------------------------------
// PUT — set window
// ---------------------------------------------------------------------------

/**
 * Handler for setting the monitoring window for a household's door sensor.
 * Requires device:write permission. Ownership is enforced in the use case.
 */
const handleSetWindow: AuthorizedRouteHandler<WindowConfigResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  context,
): Promise<NextResponse<WindowConfigResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await context?.params;
  const householdId = params?.householdId;
  
  if (!householdId) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Missing householdId', correlationId },
      { status: 400 },
    );
  }

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
};

// ---------------------------------------------------------------------------
// GET — current config for a household
// ---------------------------------------------------------------------------

/**
 * Handler for fetching the current door-sensor config for a household.
 * Requires device:read permission to view sensor configuration.
 */
const handleGetConfig: AuthorizedRouteHandler<WindowConfigResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  context,
): Promise<NextResponse<WindowConfigResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await context?.params;
  const householdId = params?.householdId;
  
  if (!householdId) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Missing householdId', correlationId },
      { status: 400 },
    );
  }

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
};

export const PUT = withPermission(
  { permissions: ['device:write'] },
  handleSetWindow,
);

export const GET = withPermission(
  { permissions: ['device:read'] },
  handleGetConfig,
);
