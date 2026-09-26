/**
 * POST /api/door-sensors/requests/[id]/resolve — Platform admin approves or
 * rejects a door-sensor installation request.
 *
 * Authorization: Super_Admin only (enforced inside the use case).
 * Permission: device:manage (admin-level device management)
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
import type { ResolveDoorInstallationRequestUseCase } from '@core/domains/doorMonitoring/usecases';

const bodySchema = z.object({
  decision: z.enum(['approved', 'rejected']),
});

/**
 * Handler for resolving door sensor installation requests.
 * Requires device:manage permission for admin operations.
 */
const handleResolveRequest: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext,
  context,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await context!.params!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    );
  }

  const validation = bodySchema.safeParse(body);
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

  const useCase = container.resolve<ResolveDoorInstallationRequestUseCase>(
    'resolveDoorInstallationRequestUseCase',
  );
  const result = await useCase.execute({
    authContext,
    input: { requestId: id, decision: validation.data.decision },
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const r = result.data;
  return NextResponse.json(
    {
      data: {
        id: r.id,
        status: r.status,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      },
    },
    { status: 200 },
  );
};

export const POST = withPermission(
  { permissions: ['device:manage'] },
  handleResolveRequest,
);
