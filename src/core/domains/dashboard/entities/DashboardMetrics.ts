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
  /** Tenants with status = active. */
  readonly activeTenants: number;
  /** Tenants with status = suspended. */
  readonly suspendedTenants: number;
  readonly monthlyRecurringRevenue: number;
  readonly totalUserCount: number;
  /** Invoices with status = pending (awaiting payment). */
  readonly pendingInvoices: number;
  readonly activeSubscriptionsByPlan: Record<string, number>;
}
