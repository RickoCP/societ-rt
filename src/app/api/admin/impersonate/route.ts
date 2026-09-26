/**
 * POST /api/admin/impersonate — Start an impersonation session.
 *
 * Requires PLATFORM_ADMIN role with platform:manage permission.
 * Creates a time-limited token (max 60 min).
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
import type { ImpersonateUseCase } from '@core/domains/operational/usecases';

/**
 * Response type for impersonation start endpoint.
 */
interface ImpersonateResponse {
  data: {
    sessionId: string;
    token: string;
    expiresAt: string;
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
 * Request body for starting impersonation.
 */
interface ImpersonateRequestBody {
  impersonatedUserId?: string;
  tenantId?: string;
  durationMinutes?: number;
}

/**
 * Handler for starting an impersonation session.
 *
 * AuthorizationContext is guaranteed to have platform:manage permission
 * after withPermission validation.
 */
const handleStartImpersonation: AuthorizedRouteHandler<
  ImpersonateResponse | ErrorResponse
> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<ImpersonateResponse | ErrorResponse>> => {
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

  const { impersonatedUserId, tenantId, durationMinutes } =
    body as ImpersonateRequestBody;

  if (!impersonatedUserId || typeof impersonatedUserId !== 'string') {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'impersonatedUserId is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  if (!tenantId || typeof tenantId !== 'string') {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'tenantId is required',
        correlationId,
      },
      { status: 400 },
    );
  }

  // Execute impersonation use case
  const useCase = container.resolve<ImpersonateUseCase>('impersonateUseCase');
  const result = await useCase.execute({
    impersonatorId: authContext.userId,
    impersonatedUserId,
    tenantId,
    durationMinutes,
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
        token: result.data.token,
        expiresAt: result.data.expiresAt.toISOString(),
      },
    },
    { status: 201 },
  );
};

/**
 * POST handler wrapped with platform:manage permission requirement.
 *
 * Only users with PLATFORM_ADMIN role (having platform:manage permission)
 * can start impersonation sessions.
 *
 * @see Permission Mapping: /api/admin/impersonate → platform:manage
 */
export const POST = withPermission(
  { permissions: ['platform:manage'] },
  handleStartImpersonation,
);
