/**
 * GET /api/tenants/[id] — Get tenant details.
 * PATCH /api/tenants/[id] — Update tenant branding.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 * GET: requires tenant management permission.
 * PATCH: requires tenant management permission.
 *
 * @see Requirements 2.3, 2.6
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { TenantRepository } from '@core/domains/tenant/repositories/TenantRepository';
import type { UpdateTenantBrandingUseCase } from '@core/domains/tenant/usecases';
import type { AuthorizationContext } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Input schema for PATCH (branding fields)
// ---------------------------------------------------------------------------

const updateBrandingSchema = z.object({
  logoUrl: z.string().url('Invalid logo URL').optional(),
  primaryColor: z.string().min(1, 'Primary color is required').optional(),
  secondaryColor: z.string().min(1, 'Secondary color is required').optional(),
});

// ---------------------------------------------------------------------------
// GET — Get tenant by ID
// ---------------------------------------------------------------------------

const handleGetTenant: AuthorizedRouteHandler<unknown> = async (
  request: NextRequest,
  _authContext: AuthorizationContext,
  routeContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract tenant ID from route params
  const { id } = await routeContext!.params!;

  // 2. Resolve repository and find tenant
  const tenantRepository =
    container.resolve<TenantRepository>('tenantRepository');
  const result = await tenantRepository.findById(id);

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  if (!result.data) {
    return NextResponse.json(
      {
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
        correlationId,
      },
      { status: 404 },
    );
  }

  const tenant = result.data;

  return NextResponse.json(
    {
      data: {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        rtRwNumber: tenant.rtRwNumber,
        region: tenant.region,
        address: tenant.address,
        contactPerson: tenant.contactPerson,
        logoUrl: tenant.logoUrl,
        primaryColor: tenant.primaryColor,
        secondaryColor: tenant.secondaryColor,
        sirenDeviceId: tenant.sirenDeviceId,
        status: tenant.status,
        subscriptionPlanId: tenant.subscriptionPlanId,
        createdAt: tenant.createdAt.toISOString(),
        updatedAt: tenant.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
};

export const GET = withPermission(
  { permissions: ['tenant:manage'] },
  handleGetTenant,
);

// ---------------------------------------------------------------------------
// PATCH — Update tenant branding
// ---------------------------------------------------------------------------

const handleUpdateBranding: AuthorizedRouteHandler<unknown> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract tenant ID from route params
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

  const validation = updateBrandingSchema.safeParse(body);
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

  // 3. Override tenantId from route param for the use case
  const useCaseAuthContext = { ...authContext, tenantId: id };

  // 4. Execute use case via DI
  const updateBrandingUseCase =
    container.resolve<UpdateTenantBrandingUseCase>(
      'updateTenantBrandingUseCase',
    );
  const result = await updateBrandingUseCase.execute({
    authContext: useCaseAuthContext,
    branding: validation.data,
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
        name: tenant.name,
        logoUrl: tenant.logoUrl,
        primaryColor: tenant.primaryColor,
        secondaryColor: tenant.secondaryColor,
        updatedAt: tenant.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
};

export const PATCH = withPermission(
  { permissions: ['tenant:manage'] },
  handleUpdateBranding,
);
