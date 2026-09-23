/**
 * /api/door-sensors/requests — Door sensor installation requests.
 *
 *  - POST: an RT (Ketua_RT/Pengurus) requests installation for a household.
 *  - GET:  list installation requests for the tenant (optional ?status=).
 *
 * BFF pattern: validate input → resolve auth → execute use case → safe response.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { RequestDoorSensorInstallationUseCase } from '@core/domains/doorMonitoring/usecases';
import type { DoorMonitoringRepository } from '@core/domains/doorMonitoring/repositories';
import type { DoorInstallationStatus } from '@core/domains/doorMonitoring/entities';

const createSchema = z.object({
  householdId: z.string().uuid('householdId must be a valid UUID'),
  note: z.string().max(500).optional(),
});

const STATUSES = ['pending', 'approved', 'rejected'] as const;

function unauthorized(correlationId: string): NextResponse {
  return NextResponse.json(
    { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
    { status: 401 },
  );
}

// ---------------------------------------------------------------------------
// POST — create request
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) return unauthorized(correlationId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = createSchema.safeParse(body);
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

  const useCase = container.resolve<RequestDoorSensorInstallationUseCase>(
    'requestDoorSensorInstallationUseCase',
  );
  const result = await useCase.execute({
    authContext,
    input: {
      householdId: validation.data.householdId,
      note: validation.data.note,
    },
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const r = result.data;
  return NextResponse.json(
    {
      data: {
        id: r.id,
        householdId: r.householdId,
        status: r.status,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// GET — list requests
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) return unauthorized(correlationId);

  const statusParam = new URL(request.url).searchParams.get('status');
  const status =
    statusParam && (STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as DoorInstallationStatus)
      : undefined;

  const repo = container.resolve<DoorMonitoringRepository>(
    'doorMonitoringRepository',
  );
  const result = await repo.listInstallationRequests(
    authContext.tenantId,
    status,
  );

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: result.data.map(r => ({
        id: r.id,
        householdId: r.householdId,
        householdNumber: r.householdNumber,
        householdAddress: r.householdAddress,
        householdBlock: r.householdBlock,
        requestedBy: r.requestedBy,
        status: r.status,
        note: r.note,
        resolvedBy: r.resolvedBy,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    },
    { status: 200 },
  );
}
