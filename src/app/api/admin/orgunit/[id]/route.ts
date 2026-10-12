/**
 * OrgUnit item API route.
 *
 * PATCH  /api/admin/orgunit/[id] — Update an OrgUnit (name only; type immutable).
 * DELETE /api/admin/orgunit/[id] — Delete an OrgUnit.
 *
 * BFF pattern: validate input → resolve target tenant (PLATFORM_ADMIN may target
 * another tenant via ?tenantId=) → execute use case → safe response.
 *
 * Authorization: orgunit:manage (held by PLATFORM_ADMIN and TENANT_OWNER).
 *
 * @see Requirements 8.7, 8.8 (Edit OrgUnit — name only), 8.9, 8.10 (Delete)
 * @see 11-bff-pattern.md Steering
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  resolveTargetTenantFromContainer,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type {
  DeleteOrgUnitUseCase,
  UpdateOrgUnitUseCase,
} from '@core/domains/orgunit/usecases';

const updateOrgUnitSchema = z.object({
  name: z.string().min(1, 'name is required').max(120),
});

// ---------------------------------------------------------------------------
// PATCH handler — Update an OrgUnit (name only)
// ---------------------------------------------------------------------------

const handleUpdateOrgUnit: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const orgUnitId = params?.id;
  if (!orgUnitId) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'OrgUnit ID is required', correlationId },
      { status: 400 },
    ) as NextResponse<void>;
  }

  const targetTenant = await resolveTargetTenantFromContainer(
    request,
    authContext,
    'admin/orgunit:update',
    container,
  );
  if (!targetTenant.ok) {
    return NextResponse.json(
      { code: targetTenant.code, message: targetTenant.message, correlationId },
      { status: targetTenant.status },
    ) as NextResponse<void>;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    ) as NextResponse<void>;
  }

  const validation = updateOrgUnitSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    ) as NextResponse<void>;
  }

  const useCase = container.resolve<UpdateOrgUnitUseCase>('updateOrgUnitUseCase');
  const result = await useCase.execute({
    tenantId: targetTenant.tenantId,
    orgUnitId,
    name: validation.data.name,
    hasWritePermission: authContext.permissions.has('orgunit:manage'),
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<void>;
  }

  return NextResponse.json({ data: result.data }, { status: 200 }) as NextResponse<void>;
};

// ---------------------------------------------------------------------------
// DELETE handler — Delete an OrgUnit
// ---------------------------------------------------------------------------

const handleDeleteOrgUnit: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const orgUnitId = params?.id;
  if (!orgUnitId) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'OrgUnit ID is required', correlationId },
      { status: 400 },
    ) as NextResponse<void>;
  }

  const targetTenant = await resolveTargetTenantFromContainer(
    request,
    authContext,
    'admin/orgunit:delete',
    container,
  );
  if (!targetTenant.ok) {
    return NextResponse.json(
      { code: targetTenant.code, message: targetTenant.message, correlationId },
      { status: targetTenant.status },
    ) as NextResponse<void>;
  }

  const useCase = container.resolve<DeleteOrgUnitUseCase>('deleteOrgUnitUseCase');
  const result = await useCase.execute({
    tenantId: targetTenant.tenantId,
    orgUnitId,
    hasWritePermission: authContext.permissions.has('orgunit:manage'),
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<void>;
  }

  return NextResponse.json(
    { data: { deleted: true, id: orgUnitId } },
    { status: 200 },
  ) as NextResponse<void>;
};

export const PATCH = withPermission(
  { permissions: ['orgunit:manage'] },
  handleUpdateOrgUnit,
);

export const DELETE = withPermission(
  { permissions: ['orgunit:manage'] },
  handleDeleteOrgUnit,
);
