'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatrolRoute {
  id: string;
  name: string;
  checkpoints: { lat: number; lng: number; name: string }[];
}

export interface ActivePatrol {
  id: string;
  guardName: string;
  routeId: string;
  routeName: string;
  startedAt: string;
  currentLat: number | null;
  currentLng: number | null;
  checkpointsCompleted: number;
  totalCheckpoints: number;
  status: 'active' | 'paused' | 'completed';
}

export interface PatrolAnalytics {
  totalPatrolsToday: number;
  averageDurationMinutes: number;
  completionRate: number;
  missedCheckpoints: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchPatrolRoutes(): Promise<PatrolRoute[]> {
  const res = await fetch('/api/security/patrols/routes');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch patrol routes');
  }
  const json = (await res.json()) as { data: PatrolRoute[] };
  return json.data;
}

async function fetchActivePatrols(): Promise<ActivePatrol[]> {
  const res = await fetch('/api/security/patrols/active');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch active patrols');
  }
  const json = (await res.json()) as { data: ActivePatrol[] };
  return json.data;
}

async function fetchPatrolAnalytics(): Promise<PatrolAnalytics> {
  const res = await fetch('/api/security/patrols/analytics');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch patrol analytics');
  }
  const json = (await res.json()) as { data: PatrolAnalytics };
  return json.data;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePatrolManagementViewModel() {
  const queryClient = useQueryClient();

  const routesQuery = useQuery({
    queryKey: ['patrol-routes'],
    queryFn: fetchPatrolRoutes,
  });

  const activeQuery = useQuery({
    queryKey: ['active-patrols'],
    queryFn: fetchActivePatrols,
    refetchInterval: 5000,
  });

  const analyticsQuery = useQuery({
    queryKey: ['patrol-analytics'],
    queryFn: fetchPatrolAnalytics,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['active-patrols'] });
    await queryClient.invalidateQueries({ queryKey: ['patrol-analytics'] });
  };

  return {
    routes: routesQuery.data ?? [],
    activePatrols: activeQuery.data ?? [],
    analytics: analyticsQuery.data ?? null,
    isLoading: routesQuery.isLoading || activeQuery.isLoading,
    isError: routesQuery.isError || activeQuery.isError,
    error: routesQuery.error ?? activeQuery.error,
    refresh,
  };
}
