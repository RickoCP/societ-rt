/**
 * GET /api/privacy/export — Export personal data for the authenticated user.
 *
 * BFF pattern: resolve auth → execute use case → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 27.5
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
import type { ExportPersonalDataUseCase } from '@core/domains/privacy/usecases';

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface ExportDataResponse {
  data: {
    exportedAt: string;
    [key: string]: unknown;
  };
}

// ---------------------------------------------------------------------------
// GET handler — Export personal data
// ---------------------------------------------------------------------------

const handleExportPersonalData: AuthorizedRouteHandler<ExportDataResponse | ErrorResponseBody> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<ExportDataResponse | ErrorResponseBody>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const useCase = container.resolve<ExportPersonalDataUseCase>(
    'exportPersonalDataUseCase',
  );
  const result = await useCase.execute({
    tenantId: authContext.tenantId,
    userId: authContext.userId,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: {
        ...result.data,
        exportedAt: result.data.exportedAt.toISOString(),
      },
    },
    { status: 200 },
  );
};

// Export wrapped handler with privacy:read permission
export const GET = withPermission(
  { permissions: ['privacy:read'] },
  handleExportPersonalData,
);
