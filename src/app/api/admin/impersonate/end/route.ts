/**
 * POST /api/admin/impersonate/end — End an impersonation session.
 *
 * Requires PLATFORM_ADMIN role with platform:manage permission.
 * Revokes token and logs session end.
 *
 * @see Requirements 30.3, 30.4
 * @see Requirements 2.1, 2.2, 2.3 (Route Handler withPermission Migration)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import {
  withPermission,
  type AuthorizedRouteHandler,
} from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { EndImpersonationUseCase } from '@core/domains/operational/usecases';

/**
 * Response type for ending impersonation.
 */
interface EndImpersonationResponse {
  data: {
    sessionId: string;
    endedAt: string | null;
  };
}

/**
 * Error response type.
 */
interface ErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

/**
 * Request body for ending impersonation.
 */
interface EndImpersonationRequestBody {
  sessionId?: string;
}

/**
 * Handler for ending an impersonation session.
 *
 * AuthorizationContext is guaranteed to have platform:manage permission
 * after withPermission validation.
 */
const handleEndImpersonation: AuthorizedRouteHandler<
  EndImpersonationResponse | ErrorResponse
> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<EndImpersonationResponse | ErrorResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? crypto.randomUUID();

  // Parse and validate request body
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

  const { sessionId } = body as EndImpersonationRequestBody;

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'sessionId is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  // Execute end impersonation use case
  const useCase = container.resolve<EndImpersonationUseCase>(
    'endImpersonationUseCase',
  );
  const result = await useCase.execute({
    sessionId,
    impersonatorId: authContext.userId,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(
      result.error,
      correlationId,
    ) as NextResponse<ErrorResponse>;
  }

  return NextResponse.json(
    {
      data: {
        sessionId: result.data.id,
        endedAt: result.data.endedAt?.toISOString() ?? null,
      },
    },
    { status: 200 },
  );
};

/**
 * POST handler wrapped with platform:manage permission requirement.
 *
 * Only users with PLATFORM_ADMIN role (having platform:manage permission)
 * can end impersonation sessions.
 *
 * @see Permission Mapping: /api/admin/impersonate/end → platform:manage
 */
export const POST = withPermission(
  { permissions: ['platform:manage'] },
  handleEndImpersonation,
);
