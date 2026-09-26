/**
 * GET /api/dashboard/platform — Super_Admin platform dashboard metrics.
 *
 * BFF pattern: withPermission → execute use case → return safe response.
 * Cached via Redis with 5 min TTL.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 28.2
 * @see Requirements 2.1 — withPermission pattern
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { GetPlatformDashboardUseCase } from '@core/domains/dashboard/usecases';

/**
 * Response type for the platform dashboard endpoint.
 * This is a passthrough of the use case response.
 */
interface PlatformDashboardResponse {
  data: unknown;
}

/**
 * Error response type for the platform dashboard endpoint.
 */
interface PlatformDashboardErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

/**
 * Handler for getting platform dashboard metrics.
 *
 * AuthorizationContext is guaranteed to have platform:read permission
 * after withPermission validation. Only PLATFORM_ADMIN role has this permission.
 *
 * This endpoint returns platform-wide metrics:
 * - Total tenants and their status breakdown
 * - Total users across all tenants
 * - Platform health metrics
 * - Revenue/subscription statistics
 */
const handleGetPlatformDashboard: AuthorizedRouteHandler<
  PlatformDashboardResponse | PlatformDashboardErrorResponse
> = async (
  request: NextRequest,
  _authContext: AuthorizationContext,
): Promise<NextResponse<PlatformDashboardResponse | PlatformDashboardErrorResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  try {
    const useCase = container.resolve<GetPlatformDashboardUseCase>(
      'getPlatformDashboardUseCase',
    );
    const result = await useCase.execute();

    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<PlatformDashboardErrorResponse>;
    }

    return NextResponse.json({ data: result.data }, { status: 200 });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
};

/**
 * GET handler wrapped with platform:read permission requirement.
 *
 * Only users with PLATFORM_ADMIN role (having platform:read permission)
 * can access platform dashboard metrics.
 *
 * @see Permission Mapping: /api/dashboard/platform → platform:read
 */
export const GET = withPermission(
  { permissions: ['platform:read'] },
  handleGetPlatformDashboard,
);
