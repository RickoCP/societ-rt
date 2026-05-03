/**
 * POST /api/finance/transactions — Record a new financial transaction.
 * GET  /api/finance/transactions — List transactions with optional date range.
 *
 * BFF pattern: validate input → resolve auth context → execute use case / query → return safe response.
 *
 * @see Requirements 7.1, 7.2, 7.3
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
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
// POST handler — Record transaction
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

  // 2. Parse and validate input
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
    );
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
    );
  }

  // 3. Execute use case via DI
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

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
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
}

// ---------------------------------------------------------------------------
// GET handler — List transactions
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

  // 2. Parse query params
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
    );
  }

  // 3. Query repository directly for read operations
  const financeRepository = container.resolve<FinanceRepository>(
    'financeRepository',
  );

  const result = await financeRepository.getReport(authContext.tenantId, {
    start: startDate,
    end: endDate,
  });

  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const allTransactions = result.data.transactions;
  const total = allTransactions.length;
  const skip = (page - 1) * pageSize;
  const paginatedTransactions = allTransactions.slice(skip, skip + pageSize);

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
      total,
      page,
      pageSize,
    },
    { status: 200 },
  );
}
