/**
 * POST /api/admin/orgunit/move — Move/reparent an OrgUnit.
 *
 * Moves an OrgUnit to a new parent in the hierarchy.
 * Validates move against cycle prevention, type compatibility,
 * cross-tenant prevention, and root immovability.
 *
 * @see Requirements 10.1-10.11 (OrgUnit Reparenting)
 * @see Design Components > 6.5 (Drag and Drop Validation)
 */

import { NextRequest, NextResponse } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  resolveTargetTenantFromContainer,
} from '@infrastructure/middleware/authorization';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { OrgUnitRepository } from '@core/domains/orgunit/repositories/OrgUnitRepository';

interface MoveRequestBody {
  orgUnitId: string;
  newParentId: string;
}

// ---------------------------------------------------------------------------
// POST — Move/reparent an OrgUnit
// ---------------------------------------------------------------------------

const handleMoveOrgUnit: AuthorizedRouteHandler<unknown> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  try {
    // Resolve the tenant to scope to (cross-tenant for PLATFORM_ADMIN).
    const targetTenant = await resolveTargetTenantFromContainer(
      request,
      authContext,
      'admin/orgunit:move',
      container,
    );
    if (!targetTenant.ok) {
      return NextResponse.json(
        { code: targetTenant.code, message: targetTenant.message, correlationId },
        { status: targetTenant.status },
      );
    }

    // Parse request body
    const body = (await request.json()) as MoveRequestBody;
    const { orgUnitId, newParentId } = body;

    if (!orgUnitId || !newParentId) {
      return NextResponse.json(
        {
          code: 'VALIDATION_ERROR',
          message: 'orgUnitId and newParentId are required',
          correlationId,
        },
        { status: 400 },
      );
    }

    const tenantId = targetTenant.tenantId;

    // Get repository from DI
    const orgUnitRepository =
      container.resolve<OrgUnitRepository>('orgUnitAdminRepository');

    // Validate the move first
    const validation = await orgUnitRepository.validateMove(
      orgUnitId,
      newParentId,
      tenantId,
    );

    if (!validation.valid) {
      return NextResponse.json(
        {
          code: validation.errorKey ?? 'ORGUNIT_MOVE_INVALID',
          message: validation.errorDetails ?? 'Move validation failed',
          correlationId,
        },
        { status: 400 },
      );
    }

    // Execute the move
    const result = await orgUnitRepository.move(
      { orgUnitId, newParentId },
      tenantId,
    );

    if (!result.success) {
      return mapAppErrorToHttpResponse(result.error, correlationId);
    }

    return NextResponse.json({
      data: {
        orgUnit: result.data,
        affectedDescendantCount: validation.affectedDescendantCount ?? 0,
      },
    });
  } catch (error) {
    console.error('Error moving OrgUnit:', error);
    return NextResponse.json(
      {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        correlationId,
      },
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// Export wrapped handler with permission check
// ---------------------------------------------------------------------------

export const POST = withPermission(
  { permissions: ['orgunit:manage'] },
  handleMoveOrgUnit,
);
