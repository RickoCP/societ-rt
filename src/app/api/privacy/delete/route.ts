/**
 * POST /api/privacy/delete — Request data deletion for the authenticated user.
 *
 * @see Requirements 27.6
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { RequestDataDeletionUseCase } from '@core/domains/privacy/usecases';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const useCase = container.resolve<RequestDataDeletionUseCase>(
    'requestDataDeletionUseCase',
  );
  const result = await useCase.execute({
    tenantId: authContext.tenantId,
    userId: authContext.userId,
    requestorUserId: authContext.userId,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    { data: { message: 'Data deletion request submitted' } },
    { status: 200 },
  );
}
