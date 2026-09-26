/**
 * POST /api/tenants/[id]/reactivate — Reactivates a suspended tenant.
 *
 * BFF pattern: resolve auth context → execute use case → return safe response.
 * This is a protected endpoint — requires platform:suspend permission (PLATFORM_ADMIN).
 *
 * @see Requirements 30.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { ReactivateTenantUseCase } from '@core/domains/tenant/usecases';
import type { AuthorizationContext } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// POST — Reactivate tenant (PLATFORM_ADMIN only)
// ---------------------------------------------------------------------------

const handleReactivateTenant: AuthorizedRouteHandler<unknown> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract tenant ID from route params
  const { id } = await routeContext!.params!;

  // 2. Extract client IP for audit
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined;

  // 3. Execute use case via DI
  const reactivateTenantUseCase =
    container.resolve<ReactivateTenantUseCase>('reactivateTenantUseCase');
  const result = await reactivateTenantUseCase.execute({
    tenantId: id,
    actorUserId: authContext.userId,
    ipAddress,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    { data: { message: 'Tenant reactivated successfully' } },
    { status: 200 },
  );
};

export const POST = withPermission(
  { permissions: ['platform:suspend'] },
  handleReactivateTenant,
);
