/**
 * POST /api/tenants/[id]/suspend — Suspends a tenant.
 *
 * BFF pattern: resolve auth context → execute use case → return safe response.
 * This is a protected endpoint — requires Super_Admin role.
 *
 * @see Requirements 30.1
 */

import { NextResponse, type NextRequest } from 'next/server';
import { UserRole } from '@core/protocols';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { SuspendTenantUseCase } from '@core/domains/tenant/usecases';

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Unauthorized',
        correlationId,
      },
      { status: 401 },
    );
  }

  // 2. Check Super_Admin role
  if (authContext.role !== UserRole.Super_Admin) {
    return NextResponse.json(
      {
        code: 'AUTH_INSUFFICIENT_ROLE',
        message: 'You do not have permission to perform this action.',
        correlationId,
      },
      { status: 403 },
    );
  }

  // 3. Extract tenant ID from route params
  const { id } = await params;

  // 4. Extract client IP for audit
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    undefined;

  // 5. Execute use case via DI
  const suspendTenantUseCase =
    container.resolve<SuspendTenantUseCase>('suspendTenantUseCase');
  const result = await suspendTenantUseCase.execute({
    tenantId: id,
    actorUserId: authContext.userId,
    ipAddress,
  });

  // 6. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    { data: { message: 'Tenant suspended successfully' } },
    { status: 200 },
  );
}
