/**
 * POST /api/finance/iuran — Record an iuran (monthly dues) payment.
 * GET  /api/finance/iuran — Get iuran payment status for a household/month.
 *
 * BFF pattern: validate input → resolve auth context → execute use case / query → return safe response.
 *
 * @see Requirements 7.4, 7.5
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { RecordIuranPaymentUseCase } from '@core/domains/finance/usecases';
import type { FinanceRepository } from '@core/domains/finance/repositories/FinanceRepository';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const recordIuranPaymentSchema = z.object({
  householdId: z.string().uuid('Invalid household ID'),
  month: z.string().regex(MONTH_REGEX, 'Month must be in YYYY-MM format'),
  transactionId: z.string().uuid('Invalid transaction ID'),
});

// ---------------------------------------------------------------------------
// POST handler — Record iuran payment
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

  const validation = recordIuranPaymentSchema.safeParse(body);
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
  const useCase = container.resolve<RecordIuranPaymentUseCase>(
    'recordIuranPaymentUseCase',
  );
  const result = await useCase.execute({
    authContext,
    householdId: validation.data.householdId,
    month: validation.data.month,
    transactionId: validation.data.transactionId,
  });

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    { message: 'Iuran payment recorded successfully' },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// GET handler — Get iuran status
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
  const householdId = searchParams.get('householdId');
  const month = searchParams.get('month');

  if (!householdId || !month) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'householdId and month query parameters are required',
        correlationId,
      },
      { status: 400 },
    );
  }

  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        message: 'month must be in YYYY-MM format',
        correlationId,
      },
      { status: 400 },
    );
  }

  // 3. Query repository directly for read operations
  const financeRepository = container.resolve<FinanceRepository>(
    'financeRepository',
  );
  const result = await financeRepository.getIuranStatus(
    authContext.tenantId,
    householdId,
    month,
  );

  // 4. Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  const status = result.data;

  return NextResponse.json(
    {
      data: {
        id: status.id,
        householdId: status.householdId,
        month: status.month,
        status: status.status,
        paidAt: status.paidAt?.toISOString() ?? null,
        transactionId: status.transactionId,
        createdAt: status.createdAt.toISOString(),
        updatedAt: status.updatedAt.toISOString(),
      },
    },
    { status: 200 },
  );
}
