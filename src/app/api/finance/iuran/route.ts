/**
 * POST /api/finance/iuran — Record an iuran (monthly dues) payment.
 * GET  /api/finance/iuran — Get iuran payment status for a household/month.
 *
 * BFF pattern: withPermission → validate input → execute use case / query → return safe response.
 *
 * @see Requirements 7.4, 7.5
 * @see Multi-Tenant Integration Cutover — Task 4.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { mapAppErrorToHttpResponse } from '@infrastructure/utils/errorMapping';
import { uuidLike } from '@infrastructure/utils/uuidLike';
import { withPermission, type AuthorizedRouteHandler } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { RecordIuranPaymentUseCase } from '@core/domains/finance/usecases';
import type { FinanceRepository } from '@core/domains/finance/repositories/FinanceRepository';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const recordIuranPaymentSchema = z.object({
  householdId: uuidLike('Invalid household ID'),
  month: z.string().regex(MONTH_REGEX, 'Month must be in YYYY-MM format'),
  transactionId: uuidLike('Invalid transaction ID'),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface IuranRecordResponse {
  message: string;
}

interface IuranStatusResponse {
  data: {
    id: string;
    householdId: string;
    month: string;
    status: string;
    paidAt: string | null;
    transactionId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  year?: number;
}

interface ErrorResponse {
  code: string;
  message?: string;
  fields?: Record<string, string>;
  correlationId: string;
}

type IuranRecordApiResponse = IuranRecordResponse | ErrorResponse;
type IuranStatusApiResponse = IuranStatusResponse | ErrorResponse;

// ---------------------------------------------------------------------------
// POST handler — Record iuran payment
// ---------------------------------------------------------------------------

const handleRecordIuranPayment: AuthorizedRouteHandler<IuranRecordApiResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<IuranRecordApiResponse>> => {
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

  // Execute use case via DI
  const useCase = container.resolve<RecordIuranPaymentUseCase>(
    'recordIuranPaymentUseCase',
  );
  const result = await useCase.execute({
    authContext,
    householdId: validation.data.householdId,
    month: validation.data.month,
    transactionId: validation.data.transactionId,
  });

  // Map result to safe response
  if (!result.success) {
    return mapAppErrorToHttpResponse(result.error, correlationId);
  }

  return NextResponse.json(
    { message: 'Iuran payment recorded successfully' },
    { status: 201 },
  );
};

// ---------------------------------------------------------------------------
// GET handler — Get iuran status
// ---------------------------------------------------------------------------

const handleGetIuranStatus: AuthorizedRouteHandler<IuranStatusApiResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<IuranStatusApiResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Parse and validate query params
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

  // Query repository directly for read operations
  const financeRepository = container.resolve<FinanceRepository>(
    'financeRepository',
  );
  const result = await financeRepository.getIuranStatus(
    authContext.tenantId,
    householdId,
    month,
  );

  // Map result to safe response
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
};

// ---------------------------------------------------------------------------
// Export wrapped handlers with permission enforcement
// ---------------------------------------------------------------------------

export const POST = withPermission(
  { permissions: ['finance:write'] },
  handleRecordIuranPayment,
);

export const GET = withPermission(
  { permissions: ['finance:read'] },
  handleGetIuranStatus,
);
