/**
 * GET /api/privacy/export — Export personal data for the authenticated user.
 *
 * @see Requirements 27.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { ExportPersonalDataUseCase } from '@core/domains/privacy/usecases';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  const useCase = container.resolve<ExportPersonalDataUseCase>(
    'exportPersonalDataUseCase',
  );
  const result = await useCase.execute({
    tenantId: authContext.tenantId,
    userId: authContext.userId,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: {
        ...result.data,
        exportedAt: result.data.exportedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
