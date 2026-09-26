/**
 * GET /api/dashboard — Dashboard metrics for the current tenant.
 *
 * BFF pattern: withPermission → query DB → return safe response.
 *
 * Migrated to withPermission pattern per Requirements 2.1, 2.2, 2.3.
 *
 * @see Requirements 28.1
 * @see Requirements 2.1 — withPermission pattern
 */

import { NextResponse, type NextRequest } from 'next/server';
import { container } from '@infrastructure/di/container';
import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { withPermission } from '@infrastructure/middleware/authorization/requirePermission';
import type { AuthorizedRouteHandler } from '@infrastructure/middleware/authorization/types';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import type { PrismaClient } from '@/generated/prisma/client';

/**
 * Response type for the dashboard endpoint.
 */
interface DashboardResponse {
  data: {
    totalResidents: number;
    totalHouseholds: number;
    pendingLetters: number;
    activeEmergencies: number;
    upcomingEvents: number;
    unpaidIuran: number;
    currentBalance: number;
  };
}

/**
 * Error response type for the dashboard endpoint.
 */
interface DashboardErrorResponse {
  code: string;
  message: string;
  correlationId: string;
}

/**
 * Handler for getting tenant dashboard metrics.
 *
 * AuthorizationContext is guaranteed to have resident:read permission
 * after withPermission validation.
 *
 * This endpoint aggregates key metrics for the tenant dashboard:
 * - Total residents and households
 * - Pending letter requests
 * - Active emergencies
 * - Upcoming events
 * - Unpaid iuran count
 * - Current financial balance
 */
const handleGetDashboard: AuthorizedRouteHandler<DashboardResponse | DashboardErrorResponse> = async (
  request: NextRequest,
  authContext: AuthorizationContext,
): Promise<NextResponse<DashboardResponse | DashboardErrorResponse>> => {
  const correlationId =
    request.headers.get('x-correlation-id') ?? generateCorrelationId();

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
};

/**
 * GET handler wrapped with resident:read permission requirement.
 *
 * Users with resident:read permission can access tenant dashboard metrics.
 * This includes: TENANT_OWNER, ORG_ADMIN, RT_ADMIN, SECURITY, RESIDENT roles.
 *
 * @see Permission Mapping: /api/dashboard → resident:read
 */
export const GET = withPermission(
  { permissions: ['resident:read'] },
  handleGetDashboard,
);
