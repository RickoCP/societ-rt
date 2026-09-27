/**
 * GET /api/residents/export — Export all residents as CSV.
 *
 * Permission: household:read
 * BFF pattern: withPermission wrapper → execute use case → return CSV file.
 * Returns text/csv with Content-Disposition header for download.
 *
 * @see Requirements 5.7, 6.1, 6.2
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission, type AuthorizedRouteHandler } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { ExportResidentCsvUseCase } from '@core/domains/resident/usecases';

// ---------------------------------------------------------------------------
// GET handler — Export residents CSV
// ---------------------------------------------------------------------------

const handleExportResidents: AuthorizedRouteHandler = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Execute use case via DI
  const useCase = container.resolve<ExportResidentCsvUseCase>(
    'exportResidentCsvUseCase',
  );
  const result = await useCase.execute({ authContext });

  // 2. Map result to response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  // 3. Return CSV as downloadable file
  const csvContent = result.data;
  const filename = `residents_export_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};

export const GET = withPermission(
  { permissions: ['household:read'] },
  handleExportResidents,
);
