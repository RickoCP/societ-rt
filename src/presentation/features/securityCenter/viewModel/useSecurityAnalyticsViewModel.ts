'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IncidentCountBySeverity {
  severity: string;
  count: number;
}

interface IncidentCountByCategory {
  category: string;
  count: number;
}

interface DeviceEventFrequency {
  deviceType: string;
  count: number;
}

interface SecurityAnalytics {
  incidentsBySeverity: IncidentCountBySeverity[];
  averageResponseTime: number;
  incidentsByCategory: IncidentCountByCategory[];
  patrolCoveragePercentage: number;
  deviceEventFrequency: DeviceEventFrequency[];
  timeRange: {
    start: string;
    end: string;
  };
}

export type AnalyticsDays = 7 | 14 | 30 | 90;

// ---------------------------------------------------------------------------
// API function
// ---------------------------------------------------------------------------

async function fetchAnalytics(days: number): Promise<SecurityAnalytics> {
  const res = await fetch(`/api/security-center/analytics?days=${days}`);

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch security analytics');
  }

  const json = (await res.json()) as { data: SecurityAnalytics };
  return json.data;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSecurityAnalyticsViewModel() {
  const [days, setDays] = useState<AnalyticsDays>(30);

  const query = useQuery({
    queryKey: ['security-analytics', days],
    queryFn: () => fetchAnalytics(days),
    refetchInterval: 60_000, // Refresh every 60s
  });

  return {
    analytics: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    days,
    setDays,
  };
}
