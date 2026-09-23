/**
 * GET /api/finance/summary?year=2025 — Monthly financial summary for a year.
 *
 * Returns: current balance, total income, total expense, and per-month breakdown.
 *
 * @see Requirements 7.7, 7.8
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { resolveAuthContext } from '@infrastructure/utils/resolveAuthContext';
import type { PrismaClient } from '@/generated/prisma/client';

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
    const monthlyData: Array<{
      month: number;
      year: number;
      monthLabel: string;
      income: number;
      expense: number;
      balance: number;
    }> = [];

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
}
