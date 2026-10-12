'use client';

import { useQuery } from '@tanstack/react-query';

interface PlatformMetrics {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalUsers: number;
  monthlyRevenue: number;
  pendingInvoices: number;
}

/**
 * Server contract returned by GET /api/dashboard/platform.
 *
 * The route wraps the domain entity in a `{ data }` envelope, and the entity
 * uses domain field names (totalUserCount, monthlyRecurringRevenue) that differ
 * from the UI-facing names. We map here so the UI stays decoupled from the
 * domain shape.
 */
interface PlatformDashboardApiResponse {
  data: {
    totalTenants: number;
    activeTenants: number;
    suspendedTenants: number;
    totalUserCount: number;
    monthlyRecurringRevenue: number;
    pendingInvoices: number;
    activeSubscriptionsByPlan: Record<string, number>;
  };
}

async function fetchPlatformDashboard(): Promise<PlatformMetrics> {
  const res = await fetch('/api/dashboard/platform');

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch platform dashboard');
  }

  const body = (await res.json()) as PlatformDashboardApiResponse;
  const m = body.data;

  return {
    totalTenants: m.totalTenants,
    activeTenants: m.activeTenants,
    suspendedTenants: m.suspendedTenants,
    totalUsers: m.totalUserCount,
    monthlyRevenue: m.monthlyRecurringRevenue,
    pendingInvoices: m.pendingInvoices,
  };
}

export function usePlatformDashboardViewModel() {
  const query = useQuery({
    queryKey: ['dashboard-platform'],
    queryFn: fetchPlatformDashboard,
  });

  return {
    metrics: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
