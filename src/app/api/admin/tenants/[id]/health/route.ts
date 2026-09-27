/**
 * GET /api/admin/tenants/[id]/health — Get tenant health metrics.
 *
 * Requires PLATFORM_ADMIN role with platform:read permission.
 *
 * @see Requirements 30.5
 * @see Requirements 2.1, 2.2, 2.3 (Route Handler withPermission Migration)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { GetTenantHealthUseCase } from '@core/domains/operational/usecases';

/**
 * Response type for tenant health endpoint (success).
 * Matches TenantHealthMetrics from operational domain.
 */
interface TenantHealthSuccessResponse {
  data: {
    activeUsers30d: number;
    storageUsageBytes: number;
    apiRequests30d: number;
    lastActivity: string | null;
  };
}

interface ErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

type TenantHealthResponse = TenantHealthSuccessResponse | ErrorResponse;

/**
 * Handler for getting tenant health metrics.
 *
 * AuthorizationContext is guaranteed to have platform:read permission
 * after withPermission validation.
 */
const handleGetTenantHealth: AuthorizedRouteHandler<TenantHealthResponse> = async (
  request: NextRequest,
  _authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<TenantHealthResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? crypto.randomUUID();

  const params = await routeContext?.params;
  const tenantId = params?.id;
  if (!tenantId) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Missing id parameter',
        correlationId,
      },
      { status: 400 },
    );
  }

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
        activeUsers30d: result.data.activeUsers30d,
        storageUsageBytes: result.data.storageUsageBytes,
        apiRequests30d: result.data.apiRequests30d,
        lastActivity: result.data.lastActivity?.toISOString() ?? null,
      },
    },
    { status: 200 },
  );
};

/**
 * GET handler wrapped with platform:read permission requirement.
 *
 * Only users with PLATFORM_ADMIN role (having platform:read permission)
 * can access tenant health metrics.
 *
 * @see Permission Mapping: /api/admin/tenants/[id]/health → platform:read
 */
export const GET = withPermission(
  { permissions: ['platform:read'] },
  handleGetTenantHealth,
);
