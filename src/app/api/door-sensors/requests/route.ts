/**
 * /api/door-sensors/requests — Door sensor installation requests.
 *
 *  - POST: an RT (Ketua_RT/Pengurus) requests installation for a household.
 *  - GET:  list installation requests for the tenant (optional ?status=).
 *
 * BFF pattern: validate input → resolve auth → execute use case → safe response.
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
import type { RequestDoorSensorInstallationUseCase } from '@core/domains/doorMonitoring/usecases';
import type { DoorMonitoringRepository } from '@core/domains/doorMonitoring/repositories';
import type { DoorInstallationStatus } from '@core/domains/doorMonitoring/entities';

const createSchema = z.object({
  householdId: z.string().uuid('householdId must be a valid UUID'),
  note: z.string().max(500).optional(),
});

const STATUSES = ['pending', 'approved', 'rejected'] as const;

// ---------------------------------------------------------------------------
// POST — create request
// ---------------------------------------------------------------------------

/**
 * Handler for creating door sensor installation requests.
 * Requires device:write permission for RT admins to request installations.
 */
const handleCreateRequest: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

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
};

// ---------------------------------------------------------------------------
// GET — list requests
// ---------------------------------------------------------------------------

/**
 * Handler for listing door sensor installation requests.
 * Requires device:read permission to view installation requests.
 */
const handleListRequests: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

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
};

export const POST = withPermission(
  { permissions: ['device:write'] },
  handleCreateRequest,
);

export const GET = withPermission(
  { permissions: ['device:read'] },
  handleListRequests,
);
