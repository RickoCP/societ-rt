/**
 * POST /api/tenants/siren/import — Bulk-set per-RT siren device ids from a CSV.
 *
 * Admin-only (Super_Admin, enforced in the use case). Accepts multipart
 * form-data with a `file` field, or a raw text/csv body. Returns a summary of
 * updated / cleared / skipped rows.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { ImportTenantSirenCsvUseCase } from '@core/domains/tenant/usecases';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // 1. Auth
  const authContext = resolveAuthContext(request);
  if (!authContext) {
    return NextResponse.json(
      { code: 'AUTH_TOKEN_INVALID', message: 'Unauthorized', correlationId },
      { status: 401 },
    );
  }

  // 2. Read CSV content (multipart file or raw body)
  let csvContent: string;
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('multipart/form-data')) {
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
  const useCase = container.resolve<ImportTenantSirenCsvUseCase>(
    'importTenantSirenCsvUseCase',
  );
  const result = await useCase.execute({ authContext, csvContent });

  // 4. Map result
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    {
      data: {
        updatedCount: result.data.updatedCount,
        clearedCount: result.data.clearedCount,
        skippedRows: result.data.skippedRows,
      },
    },
    { status: 200 },
  );
}
