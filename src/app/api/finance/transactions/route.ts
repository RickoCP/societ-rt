/**
 * POST /api/finance/transactions — Record a new financial transaction.
 * GET  /api/finance/transactions — List transactions with optional date range.
 *
 * BFF pattern: withPermission → validate input → execute use case / query → return safe response.
 *
 * @see Requirements 7.1, 7.2, 7.3
 * @see Multi-Tenant Integration Cutover — Task 4.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { withPermission, type AuthorizedRouteHandler } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { RecordTransactionUseCase } from '@core/domains/finance/usecases';
import type { FinanceRepository } from '@core/domains/finance/repositories/FinanceRepository';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const recordTransactionSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.number().positive('Amount must be a positive number'),
  description: z.string().min(1, 'Description is required'),
  category: z.string().min(1, 'Category is required'),
  date: z.string().refine(
    (val) => !isNaN(new Date(val).getTime()),
    'Invalid date format',
  ),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface TransactionCreateResponse {
  data: {
    id: string;
    type: string;
    amount: number;
    description: string;
    category: string;
    date: string;
    createdBy: string;
    createdAt: string;
  };
}

interface TransactionListResponse {
  data: Array<{
    id: string;
    type: string;
    amount: number;
    description: string;
    category: string;
    date: string;
    createdBy: string;
    createdAt: string;
  }>;
  balance: number;
  totalIncome: number;
  totalExpense: number;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// POST handler — Record transaction
// ---------------------------------------------------------------------------

const handleRecordTransaction: AuthorizedRouteHandler<TransactionCreateResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<TransactionCreateResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid JSON body',
        correlationId,
      },
      { status: 400 },
    ) as NextResponse<TransactionCreateResponse>;
  }

  const validation = recordTransactionSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    ) as NextResponse<TransactionCreateResponse>;
  }

  // Execute use case via DI
  const useCase = container.resolve<RecordTransactionUseCase>(
    'recordTransactionUseCase',
  );
  const result = await useCase.execute({
    authContext,
    data: {
      ...validation.data,
      date: new Date(validation.data.date),
    },
  });

  // Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<TransactionCreateResponse>;
  }

  const tx = result.data;

  return NextResponse.json(
    {
      data: {
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        category: tx.category,
        date: tx.date.toISOString(),
        createdBy: tx.createdBy,
        createdAt: tx.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
};

// ---------------------------------------------------------------------------
// GET handler — List transactions
// ---------------------------------------------------------------------------

const handleListTransactions: AuthorizedRouteHandler<TransactionListResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<TransactionListResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Parse query params
  const searchParams = request.nextUrl.searchParams;
  const startDateParam = searchParams.get('startDate');
  const endDateParam = searchParams.get('endDate');
  const pageParam = searchParams.get('page');
  const pageSizeParam = searchParams.get('pageSize');

  const page = pageParam ? parseInt(pageParam, 10) : 1;
  const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : 20;

  // Build date range filter
  const startDate = startDateParam ? new Date(startDateParam) : new Date('1970-01-01');
  const endDate = endDateParam ? new Date(endDateParam) : new Date('2099-12-31');

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'Invalid date format for startDate or endDate',
        correlationId,
      },
      { status: 400 },
    ) as NextResponse<TransactionListResponse>;
  }

  // Query repository directly for read operations
  const financeRepository = container.resolve<FinanceRepository>(
    'financeRepository',
  );

  const result = await financeRepository.getReport(authContext.tenantId, {
    start: startDate,
    end: endDate,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId) as NextResponse<TransactionListResponse>;
  }

  const allTransactions = result.data.transactions;
  const total = allTransactions.length;
  const skip = (page - 1) * pageSize;
  const paginatedTransactions = allTransactions.slice(skip, skip + pageSize);

  // Agregat keseluruhan (bukan per-halaman) untuk kartu ringkasan di UI.
  let totalIncome = 0;
  let totalExpense = 0;
  for (const tx of allTransactions) {
    if (tx.type === 'income') totalIncome += tx.amount;
    else totalExpense += tx.amount;
  }
  const balance = totalIncome - totalExpense;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json(
    {
      data: paginatedTransactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        category: tx.category,
        date: tx.date.toISOString(),
        createdBy: tx.createdBy,
        createdAt: tx.createdAt.toISOString(),
      })),
      balance,
      totalIncome,
      totalExpense,
      total,
      page,
      pageSize,
      totalPages,
    },
    { status: 200 },
  );
};

// ---------------------------------------------------------------------------
// Export wrapped handlers with permission enforcement
// ---------------------------------------------------------------------------

export const POST = withPermission(
  { permissions: ['finance:write'] },
  handleRecordTransaction,
);

export const GET = withPermission(
  { permissions: ['finance:read'] },
  handleListTransactions,
);
