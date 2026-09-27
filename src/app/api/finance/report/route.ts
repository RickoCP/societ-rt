/**
 * GET /api/finance/report — Get a financial report for a date range.
 *
 * BFF pattern: withPermission → validate input → execute use case → return safe response.
 *
 * @see Requirements 7.7, 7.8
 * @see Multi-Tenant Integration Cutover — Task 4.4 (Cleanup)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission } from '@infrastructure/middleware/authorization';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { GetFinancialReportUseCase } from '@core/domains/finance/usecases';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface FinancialReportResponse {
  data: {
    openingBalance: number;
    closingBalance: number;
    categorizedTotals: Record<string, number>;
    dateRange: {
      start: string;
      end: string;
    };
    transactions: Array<{
      id: string;
      type: string;
      amount: number;
      description: string;
      category: string;
      date: string;
      createdBy: string;
      createdAt: string;
    }>;
  };
}

interface ErrorResponse {
  code: string;
  message?: string;
  correlationId: string;
}

type FinancialReportApiResponse = FinancialReportResponse | ErrorResponse;

// ---------------------------------------------------------------------------
// GET handler — Get financial report
// ---------------------------------------------------------------------------

const handleGetFinancialReport: AuthorizedRouteHandler<FinancialReportApiResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<FinancialReportApiResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Parse and validate query params
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

  // Execute use case via DI
  const useCase = container.resolve<GetFinancialReportUseCase>(
    'getFinancialReportUseCase',
  );
  const result = await useCase.execute({
    authContext,
    dateRange: { start: startDate, end: endDate },
  });

  // Map result to safe response
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
};

// ---------------------------------------------------------------------------
// Export wrapped handler with permission enforcement
// ---------------------------------------------------------------------------

export const GET = withPermission(
  { permissions: ['finance:read'] },
  handleGetFinancialReport,
);
