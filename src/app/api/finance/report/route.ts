/**
 * GET /api/finance/report — Get a financial report for a date range.
 *
 * BFF pattern: validate input → resolve auth context → execute use case → return safe response.
 *
 * @see Requirements 7.7, 7.8
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { GetFinancialReportUseCase } from '@core/domains/finance/usecases';

// ---------------------------------------------------------------------------
// GET handler — Get financial report
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

  // 2. Parse and validate query params
  const searchParams = request.nextUrl.searchParams;
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');

  if (!startDateParam || !endDateParam) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'startDate and endDate query parameters are required',
        correlationId,
      },
      { status: 400 },
    );
  }

  const startDate = new Date(startDateParam);
  const endDate = new Date(endDateParam);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid date format for startDate or endDate',
        correlationId,
      },
      { status: 400 },
    );
  }

  // 3. Execute use case via DI
  const useCase = container.resolve<GetFinancialReportUseCase>(
    'getFinancialReportUseCase',
  );
  const result = await useCase.execute({
    authContext,
    dateRange: { start: startDate, end: endDate },
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const report = result.data;

  return NextResponse.json(
    {
      data: {
        openingBalance: report.openingBalance,
        closingBalance: report.closingBalance,
        categorizedTotals: report.categorizedTotals,
        dateRange: {
          start: report.dateRange.start.toISOString(),
          end: report.dateRange.end.toISOString(),
        },
        transactions: report.transactions.map((tx) => ({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          description: tx.description,
          category: tx.category,
          date: tx.date.toISOString(),
          createdBy: tx.createdBy,
          createdAt: tx.createdAt.toISOString(),
        })),
      },
    },
    { status: 200 },
  );
}
