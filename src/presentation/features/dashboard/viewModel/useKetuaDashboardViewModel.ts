'use client';

import { useQuery } from '@tanstack/react-query';

interface DashboardMetrics {
  totalResidents: number;
  totalHouseholds: number;
  pendingLetters: number;
  activeEmergencies: number;
  upcomingEvents: number;
  unpaidIuran: number;
  currentBalance: number;
}

async function fetchDashboard(): Promise<DashboardMetrics> {
  const res = await fetch('/api/dashboard');

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch dashboard');
  }

  return (await res.json()) as DashboardMetrics;
}

export function useKetuaDashboardViewModel() {
  const query = useQuery({
    queryKey: ['dashboard-ketua'],
    queryFn: fetchDashboard,
  });

  return {
    metrics: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
