/**
 * PUT /api/finance/opening-balance — Set (replace) the carry-over opening
 * balance for a given year.
 *
 * Semantics: REPLACE, not append. There is at most one "saldo_awal"
 * transaction per tenant per year. Submitting again for the same year
 * overwrites the previous value.
 *
 * BFF pattern: withPermission → validate input → mutate → return safe response.
 *
 * @see Multi-Tenant Integration Cutover — Task 4.4 (Cleanup)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { formatZodErrors } from '@infrastructure/utils/formatZodErrors';
import { withPermission } from '@infrastructure/middleware/authorization';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@/generated/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENING_BALANCE_CATEGORY = 'saldo_awal';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const openingBalanceSchema = z.object({
  year: z.number().int().min(1970).max(9999),
  amount: z.number().nonnegative('Amount must be zero or positive'),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface OpeningBalanceResponse {
  data: {
    year: number;
    amount: number;
    transactionId: string | null;
  };
}

// ---------------------------------------------------------------------------
// PUT handler — Set opening balance
// ---------------------------------------------------------------------------

const handleSetOpeningBalance: AuthorizedRouteHandler<OpeningBalanceResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<OpeningBalanceResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  // Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'COMMON_VALIDATION_FAILED', message: 'Invalid JSON body', correlationId },
      { status: 400 },
    ) as NextResponse<OpeningBalanceResponse>;
  }

  const validation = openingBalanceSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        code: 'COMMON_VALIDATION_FAILED',
        fields: formatZodErrors(validation.error),
        correlationId,
      },
      { status: 400 },
    ) as NextResponse<OpeningBalanceResponse>;
  }

  const { year, amount } = validation.data;
  const tenantId = authContext.tenantId;

  // Rentang tanggal untuk tahun tersebut (dipakai untuk mencari saldo awal lama).
  const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
  const openingDate = new Date(Date.UTC(year, 11, 31, 0, 0, 0));

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    // Replace: hapus saldo awal lama untuk tahun ini, lalu buat yang baru.
    // Dibungkus dalam satu transaksi agar atomik.
    const result = await prisma.$transaction(async tx => {
      await tx.financialTransaction.deleteMany({
        where: {
          tenantId,
          category: OPENING_BALANCE_CATEGORY,
          date: { gte: yearStart, lt: yearEnd },
        },
      });

      // amount 0 = hapus saldo awal untuk tahun tersebut tanpa membuat baru.
      if (amount === 0) {
        return null;
      }

      return tx.financialTransaction.create({
        data: {
          tenantId,
          type: 'income',
          amount,
          description: `Saldo awal kas dari tahun ${year}`,
          category: OPENING_BALANCE_CATEGORY,
          date: openingDate,
          createdBy: authContext.userId,
        },
      });
    });

    return NextResponse.json(
      {
        data: {
          year,
          amount,
          transactionId: result?.id ?? null,
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    ) as NextResponse<OpeningBalanceResponse>;
  }
};

// ---------------------------------------------------------------------------
// Export wrapped handler with permission enforcement
// ---------------------------------------------------------------------------

export const PUT = withPermission(
  { permissions: ['finance:write'] },
  handleSetOpeningBalance,
);
