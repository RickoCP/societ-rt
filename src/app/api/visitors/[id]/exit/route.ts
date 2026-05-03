/**
 * PATCH /api/visitors/[id]/exit — Record visitor exit timestamp.
 *
 * BFF pattern: resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 15.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { RecordVisitorExitUseCase } from '@core/domains/visitor/usecases';

// ---------------------------------------------------------------------------
// PATCH handler — Record visitor exit
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const { id } = await params;

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const useCase = container.resolve<RecordVisitorExitUseCase>(
    'recordVisitorExitUseCase',
  );
  const result = await useCase.execute({
    authContext,
    visitorLogId: id,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const log = result.data;

  return NextResponse.json(
    {
      data: {
        id: log.id,
        visitorName: log.visitorName,
        purpose: log.purpose,
        destinationHouseholdId: log.destinationHouseholdId,
        entryTimestamp: log.entryTimestamp.toISOString(),
        exitTimestamp: log.exitTimestamp?.toISOString() ?? null,
        loggedBy: log.loggedBy,
        createdAt: log.createdAt.toISOString(),
        updatedAt: log.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
