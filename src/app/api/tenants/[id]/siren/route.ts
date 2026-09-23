/**
 * PATCH /api/tenants/[id]/siren — Set the physical siren device id for a tenant (RT).
 *
 * Admin-only: requires Super_Admin or Ketua_RT. Super_Admin can set it for any
 * RT (device management is a platform-admin task); Ketua_RT for their own RT.
 *
 * BFF pattern: validate input → resolve auth context → role gate → override
 * tenantId from the route param → execute use case → return safe response.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { UserRole } from '@core/protocols';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { UpdateTenantSirenDeviceUseCase } from '@core/domains/tenant/usecases';

// ---------------------------------------------------------------------------
// Input schema — accept a device id string or null/empty to clear it.
// ---------------------------------------------------------------------------

const updateSirenSchema = z.object({
  sirenDeviceId: z
    .string()
    .trim()
    .max(128, 'Device id is too long')
    .nullable()
    // Allow an empty string as an explicit "clear" instruction.
    .or(z.literal('')),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  // 2. Role gate — Super_Admin or Ketua_RT only
  if (
    authContext.role !== UserRole.Super_Admin &&
    authContext.role !== UserRole.Ketua_RT
  ) {
    return NextResponse.json(
      {
        code: 'AUTH_INSUFFICIENT_ROLE',
        message: 'You do not have permission to perform this action.',
        correlationId,
      },
      { status: 403 },
    );
  }

  // 3. Route param — target tenant
  const { id } = await params;

  // 4. Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid JSON body',
        correlationId,
      },
      { status: 400 },
    );
  }

  const validation = updateSirenSchema.safeParse(body);
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

  // 5. Override tenantId from route param so the use case acts on that RT.
  const useCaseAuthContext = { ...authContext, tenantId: id };

  // 6. Execute use case via DI
  const useCase = container.resolve<UpdateTenantSirenDeviceUseCase>(
    'updateTenantSirenDeviceUseCase',
  );
  const result = await useCase.execute({
    authContext: useCaseAuthContext,
    input: { sirenDeviceId: validation.data.sirenDeviceId || null },
  });

  // 7. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const tenant = result.data;

  return NextResponse.json(
    {
      data: {
        id: tenant.id,
        sirenDeviceId: tenant.sirenDeviceId,
        updatedAt: tenant.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
