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
 * Response type for tenant health endpoint.
 */
interface TenantHealthResponse {
  data: {
    tenantId: string;
    status: string;
    activeUsers: number;
    totalResidents: number;
    lastActivity: string | null;
    healthScore: number;
  };
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Handler for getting tenant health metrics.
 *
 * AuthorizationContext is guaranteed to have platform:read permission
 * after withPermission validation.
 */
const handleGetTenantHealth: AuthorizedRouteHandler<TenantHealthResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: RouteParams,
): Promise<NextResponse<TenantHealthResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? crypto.randomUUID();

  const { id: tenantId } = await routeContext!.params;

  const useCase = container.resolve<GetTenantHealthUseCase>(
    'getTenantHealthUseCase',
  );
  const result = await useCase.execute({ tenantId });

  if (!result.success) {
    return mapAppErrorToHttpResponse(
      result.error,
      correlationId,
    ) as NextResponse<TenantHealthResponse>;
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
