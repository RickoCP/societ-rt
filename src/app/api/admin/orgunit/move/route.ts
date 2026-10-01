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
import { getServerSession } from 'next-auth';
import { authOptions } from '@app/api/auth/[...nextauth]/route';
import { getContainer } from '@infrastructure/di';
import type { OrgUnitRepository } from '@core/domains/orgunit/repositories/OrgUnitRepository';

interface MoveRequestBody {
  orgUnitId: string;
  newParentId: string;
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        {
          code: 'AUTH_UNAUTHORIZED',
          message: 'Unauthorized',
        },
        { status: 401 },
      );
    }

    const { tenantId, permissions } = session.user as {
      tenantId?: string;
      permissions?: string[];
    };

    if (!tenantId) {
      return NextResponse.json(
        {
          code: 'AUTH_NO_TENANT',
          message: 'No tenant context available',
        },
        { status: 403 },
      );
    }

    // Check permission
    const hasWritePermission = permissions?.includes('orgunit:write') ?? false;
    if (!hasWritePermission) {
      return NextResponse.json(
        {
          code: 'AUTH_FORBIDDEN',
          message: 'You do not have permission to move OrgUnits',
        },
        { status: 403 },
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
        },
        { status: 400 },
      );
    }

    // Get repository from DI
    const container = getContainer();
    const orgUnitRepository = container.resolve<OrgUnitRepository>('orgUnitAdminRepository');

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
      return NextResponse.json(
        {
          code: result.error?.code ?? 'ORGUNIT_MOVE_FAILED',
          message: result.error?.message ?? 'Failed to move OrgUnit',
        },
        { status: 500 },
      );
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
      },
      { status: 500 },
    );
  }
}
