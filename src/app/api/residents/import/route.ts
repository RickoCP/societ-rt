/**
 * POST /api/residents/import — Import residents from a CSV file.
 *
 * BFF pattern: resolve auth context → read CSV content → execute use case → return summary.
 * Accepts text/csv body or multipart/form-data with a file field.
 *
 * @see Requirements 5.8, 5.9, 6.1, 6.2, 6.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { ImportResidentCsvUseCase } from '@core/domains/resident/usecases';

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Resolve auth context
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Unauthorized',
        correlationId,
      },
      { status: 401 },
    );
  }

  // 2. Read CSV content from request body
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
          },
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
      },
      { status: 400 },
    );
  }

  if (!csvContent.trim()) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'CSV content is empty',
        correlationId,
      },
      { status: 400 },
    );
  }

  // 3. Execute use case via DI
  const useCase = container.resolve<ImportResidentCsvUseCase>(
    'importResidentCsvUseCase',
  );
  const result = await useCase.execute({
    authContext,
    csvContent,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
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
}
