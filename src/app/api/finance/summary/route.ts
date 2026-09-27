/**
 * GET /api/finance/summary?year=2025 — Monthly financial summary for a year.
 *
 * Returns: current balance, total income, total expense, and per-month breakdown.
 *
 * @see Requirements 7.7, 7.8
 * @see Multi-Tenant Integration Cutover — Task 4.4
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { withPermission, type AuthorizedRouteHandler } from '@infrastructure/middleware/authorization';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@/generated/prisma/client';

interface MonthlyData {
  month: number;
  year: number;
  monthLabel: string;
  income: number;
  expense: number;
  balance: number;
}

interface SummaryData {
  data: {
    currentBalance: number;
    totalIncome: number;
    totalExpense: number;
    year: number;
    monthly: MonthlyData[];
  };
}

interface ErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

type SummaryResponse = SummaryData | ErrorResponse;

const handleGetSummary: AuthorizedRouteHandler<SummaryResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<SummaryResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

  const year = request.nextUrl.searchParams.get('year') ?? new Date().getFullYear().toString();
  const tenantId = authContext.tenantId;

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');

    // Get all transactions for this tenant
    const allTransactions = await prisma.financialTransaction.findMany({
      where: { tenantId },
      select: { type: true, amount: true, date: true },
      orderBy: { date: 'asc' },
    });

    // Calculate overall totals
    let totalIncome = 0;
    let totalExpense = 0;
    for (const tx of allTransactions) {
      if (tx.type === 'income') totalIncome += Number(tx.amount);
      else totalExpense += Number(tx.amount);
    }
    const currentBalance = totalIncome - totalExpense;

    // Build monthly breakdown for the requested year
    const monthlyData: MonthlyData[] = [];

    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    // Calculate running balance up to start of requested year
    let runningBalance = 0;
    const yearNum = parseInt(year, 10);
    for (const tx of allTransactions) {
      const txDate = new Date(tx.date);
      if (txDate.getFullYear() < yearNum) {
        if (tx.type === 'income') runningBalance += Number(tx.amount);
        else runningBalance -= Number(tx.amount);
      }
    }

    // Build per-month data
    for (let m = 0; m < 12; m++) {
      let monthIncome = 0;
      let monthExpense = 0;

      for (const tx of allTransactions) {
        const txDate = new Date(tx.date);
        if (txDate.getFullYear() === yearNum && txDate.getMonth() === m) {
          if (tx.type === 'income') monthIncome += Number(tx.amount);
          else monthExpense += Number(tx.amount);
        }
      }

      runningBalance += monthIncome - monthExpense;

      monthlyData.push({
        month: m + 1,
        year: yearNum,
        monthLabel: monthNames[m] ?? '',
        income: monthIncome,
        expense: monthExpense,
        balance: runningBalance,
      });
    }

    return NextResponse.json({
      data: {
        currentBalance,
        totalIncome,
        totalExpense,
        year: yearNum,
        monthly: monthlyData,
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
};

export const GET = withPermission(
  { permissions: ['finance:read'] },
  handleGetSummary,
);
