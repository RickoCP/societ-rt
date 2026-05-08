'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineEvent {
  id: string;
  type: 'incident' | 'alert' | 'device_event' | 'patrol_checkin' | 'gate_event';
  title: string;
  description: string | null;
  severity: string | null;
  category: string | null;
  location: string | null;
  actorId: string | null;
  timestamp: string;
}

export type TimeRange = '1h' | '6h' | '12h' | '24h' | '48h' | '7d';

const TIME_RANGE_HOURS: Record<TimeRange, number> = {
  '1h': 1,
  '6h': 6,
  '12h': 12,
  '24h': 24,
  '48h': 48,
  '7d': 168,
};

// ---------------------------------------------------------------------------
// API function
// ---------------------------------------------------------------------------

async function fetchTimeline(hours: number): Promise<TimelineEvent[]> {
  const res = await fetch(`/api/security-center/timeline?hours=${hours}`);

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch security timeline');
  }

  const json = (await res.json()) as { data: TimelineEvent[] };
  return json.data;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSecurityTimelineViewModel() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const hours = TIME_RANGE_HOURS[timeRange];

  const query = useQuery({
    queryKey: ['security-timeline', hours],
    queryFn: () => fetchTimeline(hours),
    refetchInterval: 30_000, // Refresh every 30s
  });

  return {
    events: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    timeRange,
    setTimeRange,
  };
}
