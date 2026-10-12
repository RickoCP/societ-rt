/**
 * DELETE /api/visitors/:id — Delete a visitor log entry.
 *
 * BFF pattern: withPermission → validate → execute use case → return safe response.
 *
 * Authorization:
 * - User can delete if they are the original creator (loggedBy === userId)
 * - OR user has admin/security role (RT_ADMIN, ORG_ADMIN, TENANT_OWNER, SECURITY, PLATFORM_ADMIN)
 *
 * @see Requirements 15.1, 15.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse, type ErrorResponseBody } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { DeleteVisitorUseCase } from '@core/domains/visitor/usecases';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface DeleteVisitorResponse {
  data: {
    success: boolean;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// DELETE handler — Delete visitor log
// ---------------------------------------------------------------------------

/**
 * Handle DELETE /api/visitors/[id] — Delete a visitor log entry.
 *
 * AuthorizationContext is guaranteed to have security:manage permission
 * after withPermission validation. Additional authorization check is done
 * in the use case (creator or admin role).
 *
 * @param request - The incoming NextRequest
 * @param authContext - The resolved AuthorizationContext (provided by withPermission)
 * @param routeContext - Route context with params
 * @returns NextResponse with delete result or error
 */
const handleDeleteVisitor: AuthorizedRouteHandler<DeleteVisitorResponse | ErrorResponseBody> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
  routeContext?: { params?: Promise<Record<string, string>> },
): Promise<NextResponse<DeleteVisitorResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const params = await routeContext?.params;
  const id = params?.id;

  if (!id) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Visitor ID is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  // Execute use case via DI
  const deleteVisitorUseCase = container.resolve<DeleteVisitorUseCase>('deleteVisitorUseCase');
  const result = await deleteVisitorUseCase.execute({
    authContext,
    visitorLogId: id,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: {
        success: true,
        message: 'Visitor log deleted successfully',
      },
    },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Exported Route Handler with Permission Check
// ---------------------------------------------------------------------------

/**
 * DELETE /api/visitors/[id] — Delete a visitor log entry.
 *
 * Permission: security:manage (write access to visitor logs)
 * Additional authorization: creator or admin/security role (checked in use case)
 *
 * @see Permission Mapping: /api/visitors/[id] DELETE → security:manage
 */
export const DELETE = withPermission(
  { permissions: ['security:manage'] },
  handleDeleteVisitor,
);
