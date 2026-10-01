/**
 * POST /api/visitors/:id/checkout — Mark a visitor as checked out.
 *
 * BFF pattern: withPermission → validate → execute → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 15.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface VisitorCheckoutResponse {
  data: {
    id: string;
    exitTimestamp: string | null;
  };
}

// ---------------------------------------------------------------------------
// POST handler — Checkout visitor
// ---------------------------------------------------------------------------

/**
 * Handle POST /api/visitors/[id]/checkout — Mark a visitor as checked out.
 *
 * AuthorizationContext is guaranteed to have security:manage permission
 * after withPermission validation.
 *
 * Business rules:
 * - Visitor log must exist and belong to the current tenant
 * - Visitor cannot be checked out if already checked out (exitTimestamp already set)
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @param routeContext - Route context with params
 * @returns NextResponse with checkout result or error
 */
const handleCheckoutVisitor: AuthorizedRouteHandler<VisitorCheckoutResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<VisitorCheckoutResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const id = params?.id;

  if (!id) {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Visitor ID is required', correlationId } as unknown as VisitorCheckoutResponse,
      { status: 400 },
    );
  }

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    const visitor = await prisma.visitorLog.findFirst({
      where: { id, tenantId: authContext.tenantId },
    });

    if (!visitor) {
      return NextResponse.json(
        { code: 'COMMON_NOT_FOUND', message: 'Visitor log not found', correlationId } as unknown as VisitorCheckoutResponse,
        { status: 404 },
      );
    }

    if (visitor.exitTimestamp) {
      return NextResponse.json(
        { code: 'VISITOR_ALREADY_CHECKED_OUT', message: 'Visitor already checked out', correlationId } as unknown as VisitorCheckoutResponse,
        { status: 409 },
      );
    }

    const updated = await prisma.visitorLog.update({
      where: { id },
      data: { exitTimestamp: new Date() },
    });

    return NextResponse.json({
      data: {
        id: updated.id,
        exitTimestamp: updated.exitTimestamp?.toISOString() ?? null,
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId } as unknown as VisitorCheckoutResponse,
      { status: 500 },
    );
  }
};

// ---------------------------------------------------------------------------
// Exported Route Handler with Permission Check
// ---------------------------------------------------------------------------

/**
 * POST /api/visitors/[id]/checkout — Mark a visitor as checked out.
 *
 * Permission: security:manage (write access to visitor logs)
 *
 * @see Permission Mapping: /api/visitors/[id]/checkout POST → security:manage
 */
export const POST = withPermission(
  { permissions: ['security:manage'] },
  handleCheckoutVisitor,
);
