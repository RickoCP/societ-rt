/**
 * POST /api/privacy/delete — Request data deletion for the authenticated user.
 *
 * BFF pattern: resolve auth → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 27.6
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission, type AuthorizedRouteHandler } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { RequestDataDeletionUseCase } from '@core/domains/privacy/usecases';

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface DeletionRequestResponse {
  data: {
    message: string;
  };
}

// ---------------------------------------------------------------------------
// POST handler — Request data deletion
// ---------------------------------------------------------------------------

const handleRequestDataDeletion: AuthorizedRouteHandler<DeletionRequestResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<DeletionRequestResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const useCase = container.resolve<RequestDataDeletionUseCase>(
    'requestDataDeletionUseCase',
  );
  const result = await useCase.execute({
    tenantId: authContext.tenantId,
    userId: authContext.userId,
    requestorUserId: authContext.userId,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<DeletionRequestResponse>;
  }

  return NextResponse.json(
    { data: { message: 'Data deletion request submitted' } },
    { status: 200 },
  );
};

// Export wrapped handler with privacy:manage permission
export const POST = withPermission(
  { permissions: ['privacy:manage'] },
  handleRequestDataDeletion,
);
