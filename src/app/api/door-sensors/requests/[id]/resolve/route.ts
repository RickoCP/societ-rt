/**
 * POST /api/door-sensors/requests/[id]/resolve — Platform admin approves or
 * rejects a door-sensor installation request.
 *
 * Authorization: Super_Admin only (enforced inside the use case).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { ResolveDoorInstallationRequestUseCase } from '@core/domains/doorMonitoring/usecases';

const bodySchema = z.object({
  decision: z.enum(['approved', 'rejected']),
});

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

  const { id } = await params;

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
}
