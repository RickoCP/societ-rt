/**
 * DashboardRepositoryImpl — Prisma aggregation queries for dashboard metrics.
 *
 * @see Requirements 28.1, 28.2
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type { DashboardRepository } from '@core/domains/dashboard/repositories/DashboardRepository';
import type {
  KetuaDashboardMetrics,
  PlatformDashboardMetrics,
} from '@core/domains/dashboard/entities';

export const DashboardRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): DashboardRepository => ({
  async getKetuaMetrics(
    tenantId: string,
  ): Promise<DomainResult<KetuaDashboardMetrics>> {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalResidents,
        balanceResult,
        unpaidIuranCount,
        activeVotesCount,
        activeEmergencyAlertsCount,
        recentAnnouncementsCount,
        upcomingEventsCount,
      ] = await Promise.all([
        prismaClient.resident.count({
          where: { tenantId, deletedAt: null },
        }),
        prismaClient.financialTransaction.groupBy({
          by: ['type'],
          where: { tenantId, deletedAt: null },
          _sum: { amount: true },
        }),
        prismaClient.iuranStatus.count({
          where: { tenantId, status: 'unpaid' },
        }),
        prismaClient.vote.count({
          where: { tenantId, deadline: { gte: now } },
        }),
        prismaClient.emergencyAlert.count({
          where: { tenantId, status: { in: ['active', 'responding'] } },
        }),
        prismaClient.announcement.count({
          where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
        }),
        prismaClient.communityEvent.count({
          where: { tenantId, date: { gte: now } },
        }),
      ]);

      let currentBalance = 0;
      for (const row of balanceResult) {
        const sum = Number(row._sum.amount ?? 0);
        if (row.type === 'income') {
          currentBalance += sum;
        } else {
          currentBalance -= sum;
        }
      }

      return ok({
        totalResidents,
        currentBalance,
        unpaidIuranCount,
        activeVotesCount,
        activeEmergencyAlertsCount,
        recentAnnouncementsCount,
        upcomingEventsCount,
      });
    } catch (error) {
      return fail(
        technicalError(
          'DASHBOARD_KETUA_METRICS_FAILED',
          'Failed to fetch Ketua dashboard metrics',
          { cause: error },
        ),
      );
    }
  },

  async getPlatformMetrics(): Promise<DomainResult<PlatformDashboardMetrics>> {
    try {
      const [
        totalTenants,
        activeTenants,
        suspendedTenants,
        totalUserCount,
        revenueResult,
        pendingInvoices,
        planCounts,
      ] = await Promise.all([
        prismaClient.tenant.count(),
        prismaClient.tenant.count({ where: { status: 'active' } }),
        prismaClient.tenant.count({ where: { status: 'suspended' } }),
        prismaClient.user.count({ where: { deletedAt: null } }),
        prismaClient.invoice.aggregate({
          where: { status: 'paid' },
          _sum: { amount: true },
        }),
        prismaClient.invoice.count({ where: { status: 'pending' } }),
        prismaClient.tenant.groupBy({
          by: ['subscriptionPlanId'],
          _count: { id: true },
        }),
      ]);

      // Resolve plan names
      const planIds = planCounts.map((p) => p.subscriptionPlanId);
      const plans = await prismaClient.subscriptionPlan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, name: true },
      });
      const planNameMap = new Map(plans.map((p) => [p.id, p.name]));

      const activeSubscriptionsByPlan: Record<string, number> = {};
      for (const row of planCounts) {
        const name = planNameMap.get(row.subscriptionPlanId) ?? 'Unknown';
        activeSubscriptionsByPlan[name] = row._count.id;
      }

      return ok({
        totalTenants,
        activeTenants,
        suspendedTenants,
        monthlyRecurringRevenue: Number(revenueResult._sum.amount ?? 0),
        totalUserCount,
        pendingInvoices,
        activeSubscriptionsByPlan,
      });
    } catch (error) {
      return fail(
        technicalError(
          'DASHBOARD_PLATFORM_METRICS_FAILED',
          'Failed to fetch platform dashboard metrics',
          { cause: error },
        ),
      );
    }
  },
});
