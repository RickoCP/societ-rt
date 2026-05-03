/**
 * GET /api/residents/export — Export all residents as CSV.
 *
 * BFF pattern: resolve auth context → execute use case → return CSV file.
 * Returns text/csv with Content-Disposition header for download.
 *
 * @see Requirements 5.7, 6.1, 6.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { ExportResidentCsvUseCase } from '@core/domains/resident/usecases';

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
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

  // 2. Execute use case via DI
  const useCase = container.resolve<ExportResidentCsvUseCase>(
    'exportResidentCsvUseCase',
  );
  const result = await useCase.execute({ authContext });

  // 3. Map result to response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  // 4. Return CSV as downloadable file
  const csvContent = result.data;
  const filename = `residents_export_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
