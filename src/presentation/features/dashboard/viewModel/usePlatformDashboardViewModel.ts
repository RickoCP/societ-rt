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

async function fetchPlatformDashboard(): Promise<PlatformMetrics> {
  const res = await fetch('/api/dashboard/platform');

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch platform dashboard');
  }

  return (await res.json()) as PlatformMetrics;
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
