/**
 * GET /api/admin/tenants/[id]/health — Get tenant health metrics.
 *
 * Super_Admin only.
 *
 * @see Requirements 30.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetTenantHealthUseCase } from '@core/domains/operational/usecases';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
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

  if (authContext.role !== 'Super_Admin') {
    return NextResponse.json(
      {
        code: 'AUTH_INSUFFICIENT_ROLE',
        message: 'Forbidden',
        correlationId,
      },
      { status: 403 },
    );
  }

  const { id: tenantId } = await params;

  const useCase = container.resolve<GetTenantHealthUseCase>(
    'getTenantHealthUseCase',
  );
  const result = await useCase.execute({ tenantId });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: {
        ...result.data,
        lastActivity: result.data.lastActivity?.toISOString() ?? null,
      },
    },
    { status: 200 },
  );
}
