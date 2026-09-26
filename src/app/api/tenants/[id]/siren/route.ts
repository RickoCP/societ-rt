/**
 * PATCH /api/tenants/[id]/siren — Set the physical siren device id for a tenant (RT).
 *
 * Requires tenant management permission. The use case handles scope validation
 * (TENANT_OWNER can manage any tenant's siren, RT_ADMIN only their own).
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { UpdateTenantSirenDeviceUseCase } from '@core/domains/tenant/usecases';
import type { AuthorizationContext } from '@core/domains/authorization/types';

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

// ---------------------------------------------------------------------------
// PATCH — Update siren device ID
// ---------------------------------------------------------------------------

const handleUpdateSiren: AuthorizedRouteHandler<unknown> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Route param — target tenant
  const { id } = await routeContext!.params!;

  // 2. Parse and validate input
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

  // 3. Override tenantId from route param so the use case acts on that RT.
  const useCaseAuthContext = { ...authContext, tenantId: id };

  // 4. Execute use case via DI
  const useCase = container.resolve<UpdateTenantSirenDeviceUseCase>(
    'updateTenantSirenDeviceUseCase',
  );
  const result = await useCase.execute({
    authContext: useCaseAuthContext,
    input: { sirenDeviceId: validation.data.sirenDeviceId || null },
  });

  // 5. Map result to safe response
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
};

export const PATCH = withPermission(
  { permissions: ['tenant:manage'] },
  handleUpdateSiren,
);
