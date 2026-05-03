/**
 * DashboardMetrics — Domain entities for dashboard aggregation.
 *
 * KetuaDashboardMetrics: metrics visible to Ketua_RT for their tenant.
 * PlatformDashboardMetrics: metrics visible to Super_Admin across all tenants.
 *
 * @see Requirements 28.1, 28.2
 */

export interface KetuaDashboardMetrics {
  readonly totalResidents: number;
  readonly currentBalance: number;
  readonly unpaidIuranCount: number;
  readonly activeVotesCount: number;
  readonly activeEmergencyAlertsCount: number;
  readonly recentAnnouncementsCount: number;
  readonly upcomingEventsCount: number;
}

export interface PlatformDashboardMetrics {
  readonly totalTenants: number;
  readonly monthlyRecurringRevenue: number;
  readonly totalUserCount: number;
  readonly activeSubscriptionsByPlan: Record<string, number>;
}
