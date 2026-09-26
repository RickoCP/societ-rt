/**
 * GET /api/tenants/siren/export — Export all RTs and their siren device ids as CSV.
 *
 * Platform admin only (requires platform:provision permission).
 * The CSV opens directly in Excel and also serves as the import template.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { ExportTenantSirenCsvUseCase } from '@core/domains/tenant/usecases';
import type { AuthorizationContext } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// GET — Export siren CSV (PLATFORM_ADMIN only)
// ---------------------------------------------------------------------------

const handleExportSirenCsv: AuthorizedRouteHandler<unknown> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const useCase = container.resolve<ExportTenantSirenCsvUseCase>(
    'exportTenantSirenCsvUseCase',
  );
  const result = await useCase.execute({ authContext });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const filename = `siren_devices_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(result.data, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};

export const GET = withPermission(
  { permissions: ['platform:provision'] },
  handleExportSirenCsv,
);
