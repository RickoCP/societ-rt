/**
 * POST /api/packages/:id/collect — Mark a package as collected.
 *
 * BFF pattern: withPermission → validate params → execute operation → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 15.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface CollectPackageResponse {
  data: {
    id: string;
    collectedAt: string;
  };
}

// ---------------------------------------------------------------------------
// POST handler — Mark package as collected
// ---------------------------------------------------------------------------

/**
 * Handle POST /api/packages/:id/collect — Mark a package as collected.
 *
 * AuthorizationContext is guaranteed to have security:manage permission
 * after withPermission validation.
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @param routeContext - The route context containing the package ID
 * @returns NextResponse with collected package data or error
 */
const handleCollectPackage: AuthorizedRouteHandler<CollectPackageResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<CollectPackageResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = routeContext?.params ? await routeContext.params : {};
  const { id } = params;

  if (!id) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Package ID is required', correlationId } as unknown as CollectPackageResponse,
      { status: 400 },
    );
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const pkg = await prisma.packageLog.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!pkg) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Package not found', correlationId } as unknown as CollectPackageResponse,
        { status: 404 },
      );
    }

    // Use raw SQL to update collected_at (field may not be in generated Prisma client)
    await prisma.$executeRawUnsafe(
      `UPDATE package_logs SET collected_at = NOW() WHERE id = $1`,
      id,
    );

    return NextResponse.json({
      data: {
        id,
        collectedAt: new Date().toISOString(),
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId } as unknown as CollectPackageResponse,
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// Exported Route Handler with Permission Check
// ---------------------------------------------------------------------------

/**
 * POST /api/packages/:id/collect — Mark a package as collected.
 *
 * Permission: security:manage (write access to package logs)
 *
 * @see Permission Mapping: /api/packages/[id]/collect POST → security:manage
 */
export const POST = withPermission(
  { permissions: ['security:manage'] },
  handleCollectPackage,
);
