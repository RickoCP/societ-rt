/**
 * OrgUnit CRUD API Route Handler
 *
 * DELETE /api/admin/orgunit/[id] - Delete an OrgUnit
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * Authorization:
 * - DELETE: orgunit:write (manage OrgUnit hierarchy)
 *
 * @see Requirements 8.9, 8.10 (Delete OrgUnit)
 * @see 11-bff-pattern.md Steering
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { DeleteOrgUnitUseCase } from '@core/domains/orgunit/usecases';

// ---------------------------------------------------------------------------
// DELETE handler — Delete an OrgUnit
// ---------------------------------------------------------------------------

const handleDeleteOrgUnit: AuthorizedRouteHandler<void> = async (
  _request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<void>> => {
  const correlationId =
    _request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Extract orgUnitId from route params
  const params = await routeContext?.params;
  const orgUnitId = params?.id;

  if (!orgUnitId) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'OrgUnit ID is required',
        correlationId,
      },
      { status: 400 },
    ) as NextResponse<void>;
  }

  // 2. Execute use case via DI
  const useCase = container.resolve<DeleteOrgUnitUseCase>('deleteOrgUnitUseCase');
  const result = await useCase.execute({
    tenantId: authContext.tenantId,
    orgUnitId,
    hasWritePermission: authContext.permissions.has('orgunit:write'),
  });

  // 3. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<void>;
  }

  // 4. Return success response
  return NextResponse.json(
    {
      data: {
        deleted: true,
        id: orgUnitId,
      },
    },
    { status: 200 },
  ) as NextResponse<void>;
};

// ---------------------------------------------------------------------------
// Export route handler with permission wrapper
// ---------------------------------------------------------------------------

/**
 * DELETE /api/admin/orgunit/[id] — Delete an OrgUnit (requires orgunit:write)
 */
export const DELETE = withPermission(
  { permissions: ['orgunit:write'] },
  handleDeleteOrgUnit,
);
