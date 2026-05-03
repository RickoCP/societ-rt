/**
 * GET /api/tenants/[id] — Get tenant details.
 * PATCH /api/tenants/[id] — Update tenant branding.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 * GET: requires auth (any role).
 * PATCH: requires auth (Ketua_RT or Super_Admin).
 *
 * @see Requirements 2.3, 2.6
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { UserRole } from '@core/protocols';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { TenantRepository } from '@core/domains/tenant/repositories/TenantRepository';
import type { UpdateTenantBrandingUseCase } from '@core/domains/tenant/usecases';

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

export async function GET(
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

  // 2. Extract tenant ID from route params
  const { id } = await params;

  // 3. Resolve repository and find tenant
  const tenantRepository =
    container.resolve<TenantRepository>('tenantRepository');
  const result = await tenantRepository.findById(id);

  // 4. Map result to safe response
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
        status: tenant.status,
        subscriptionPlanId: tenant.subscriptionPlanId,
        createdAt: tenant.createdAt.toISOString(),
        updatedAt: tenant.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// PATCH — Update tenant branding
// ---------------------------------------------------------------------------

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
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Unauthorized',
        correlationId,
      },
      { status: 401 },
    );
  }

  // 2. Check Ketua_RT or Super_Admin role
  if (
    authContext.role !== UserRole.Ketua_RT &&
    authContext.role !== UserRole.Super_Admin
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

  // 3. Extract tenant ID from route params
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

  // 5. Override tenantId from route param for the use case
  const useCaseAuthContext = { ...authContext, tenantId: id };

  // 6. Execute use case via DI
  const updateBrandingUseCase =
    container.resolve<UpdateTenantBrandingUseCase>(
      'updateTenantBrandingUseCase',
    );
  const result = await updateBrandingUseCase.execute({
    authContext: useCaseAuthContext,
    branding: validation.data,
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
        name: tenant.name,
        logoUrl: tenant.logoUrl,
        primaryColor: tenant.primaryColor,
        secondaryColor: tenant.secondaryColor,
        updatedAt: tenant.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
