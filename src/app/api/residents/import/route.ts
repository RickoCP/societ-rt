/**
 * POST /api/residents/import — Import residents from a CSV file.
 *
 * BFF pattern: resolve auth context → read CSV content → execute use case → return summary.
 * Accepts text/csv body or multipart/form-data with a file field.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 5.8, 5.9, 6.1, 6.2, 6.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission, type AuthorizedRouteHandler } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { ImportResidentCsvUseCase } from '@core/domains/resident/usecases';

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

interface ImportResponse {
  data: {
    createdCount: number;
    skippedRows: Array<{ row: number; reason: string }>;
  };
}

// ---------------------------------------------------------------------------
// POST handler — Import residents from CSV
// ---------------------------------------------------------------------------

const handleImportResidents: AuthorizedRouteHandler<ImportResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<ImportResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Read CSV content from request body
  let csvContent: string;
  const contentType = request.headers.get('content-type') ?? '';

  try {
    if (contentType.includes('multipart/form-data')) {
      // Handle multipart file upload
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          {
            code: 'COMMON_VALIDATION_FAILED',
            message: 'A CSV file is required in the "file" field',
            correlationId,
          } as unknown as ImportResponse,
          { status: 400 },
        );
      }

      csvContent = await file.text();
    } else {
      // Handle text/csv or plain text body
      csvContent = await request.text();
    }
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Failed to read request body',
        correlationId,
      } as unknown as ImportResponse,
      { status: 400 },
    );
  }

  if (!csvContent.trim()) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'CSV content is empty',
        correlationId,
      } as unknown as ImportResponse,
      { status: 400 },
    );
  }

  // Execute use case via DI
  const useCase = container.resolve<ImportResidentCsvUseCase>(
    'importResidentCsvUseCase',
  );
  const result = await useCase.execute({
    authContext,
    csvContent,
  });

  // Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<ImportResponse>;
  }

  const importResult = result.data;

  return NextResponse.json(
    {
      data: {
        createdCount: importResult.createdCount,
        skippedRows: importResult.skippedRows,
      },
    },
    { status: 200 },
  );
};

// Export wrapped handler with resident:write permission
export const POST = withPermission(
  { permissions: ['resident:write'] },
  handleImportResidents,
);
