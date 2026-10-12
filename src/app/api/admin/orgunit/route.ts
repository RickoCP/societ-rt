/**
 * OrgUnit collection API route.
 *
 * POST /api/admin/orgunit — Create a new OrgUnit under a parent.
 *
 * BFF pattern: validate input (Zod) → resolve target tenant (PLATFORM_ADMIN may
 * target another tenant via ?tenantId=) → execute use case → safe response.
 *
 * Authorization: orgunit:manage (held by PLATFORM_ADMIN and TENANT_OWNER).
 *
 * @see Requirements 8.4 (Create OrgUnit)
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
import type { CreateOrgUnitUseCase } from '@core/domains/orgunit/usecases';

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const createOrgUnitSchema = z.object({
  parentId: z.string().min(1, 'parentId is required'),
  name: z.string().min(1, 'name is required').max(120),
  type: z.enum(['ORGANIZATION', 'CLUSTER', 'RW', 'RT']),
});

// ---------------------------------------------------------------------------
// POST handler — Create an OrgUnit
// ---------------------------------------------------------------------------

const handleCreateOrgUnit: AuthorizedRouteHandler<void> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<void>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve the tenant to scope to (cross-tenant for PLATFORM_ADMIN).
  const targetTenant = await resolveTargetTenantFromContainer(
    request,
    authContext,
    'admin/orgunit:create',
    container,
  );
  if (!targetTenant.ok) {
    return NextResponse.json(
      { code: targetTenant.code, message: targetTenant.message, correlationId },
      { status: targetTenant.status },
    ) as NextResponse<void>;
  }

  // 2. Validate the body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    ) as NextResponse<void>;
  }

  const validation = createOrgUnitSchema.safeParse(body);
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

  // 3. Execute use case. The use case gates on hasWritePermission; we map the
  // existing orgunit:manage permission to it (Option X — no new perm codes).
  const useCase = container.resolve<CreateOrgUnitUseCase>('createOrgUnitUseCase');
  const result = await useCase.execute({
    tenantId: targetTenant.tenantId,
    parentId: validation.data.parentId,
    name: validation.data.name,
    type: validation.data.type,
    hasWritePermission: authContext.permissions.has('orgunit:manage'),
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<void>;
  }

  return NextResponse.json({ data: result.data }, { status: 201 }) as NextResponse<void>;
};

export const POST = withPermission(
  { permissions: ['orgunit:manage'] },
  handleCreateOrgUnit,
);
