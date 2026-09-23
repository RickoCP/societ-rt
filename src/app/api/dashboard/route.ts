/**
 * GET /api/dashboard — Dashboard metrics for the current tenant.
 *
 * BFF pattern: resolve auth → query DB → return safe response.
 *
 * @see Requirements 28.1
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

  try {
    const prisma = container.resolve<PrismaClient>('prismaClient');
    const tenantId = authContext.tenantId;

    const [
      totalResidents,
      totalHouseholds,
      pendingLetters,
      activeEmergencies,
      upcomingEvents,
      unpaidIuran,
    ] = await Promise.all([
      prisma.resident.count({ where: { tenantId, deletedAt: null } }),
      prisma.household.count({ where: { tenantId } }),
      prisma.letterRequest.count({ where: { tenantId, status: 'pending' } }).catch(() => 0),
      prisma.emergencyAlert.count({ where: { tenantId, status: 'active' } }).catch(() => 0),
      prisma.communityEvent.count({
        where: { tenantId, date: { gte: new Date() } },
      }).catch(() => 0),
      prisma.iuranStatus.count({ where: { tenantId, status: 'unpaid' } }).catch(() => 0),
    ]);

    // Calculate current balance from financial transactions
    let currentBalance = 0;
    try {
      const income = await prisma.financialTransaction.aggregate({
        where: { tenantId, type: 'income' },
        _sum: { amount: true },
      });
      const expense = await prisma.financialTransaction.aggregate({
        where: { tenantId, type: 'expense' },
        _sum: { amount: true },
      });
      currentBalance =
        (Number(income._sum.amount) || 0) - (Number(expense._sum.amount) || 0);
    } catch {
      currentBalance = 0;
    }

    return NextResponse.json({
      data: {
        totalResidents,
        totalHouseholds,
        pendingLetters,
        activeEmergencies,
        upcomingEvents,
        unpaidIuran,
        currentBalance,
      },
    });
  } catch {
    return NextResponse.json(
      { code: 'COMMON_UNEXPECTED_ERROR', message: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}
