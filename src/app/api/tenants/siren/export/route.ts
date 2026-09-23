/**
 * GET /api/tenants/siren/export — Export all RTs and their siren device ids as CSV.
 *
 * Admin-only (Super_Admin, enforced in the use case). The CSV opens directly in
 * Excel and also serves as the import template.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { ExportTenantSirenCsvUseCase } from '@core/domains/tenant/usecases';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

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
}
