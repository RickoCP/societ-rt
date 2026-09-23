'use client';

import { useQuery } from '@tanstack/react-query';

export interface DoorStateMarkerView {
  householdId: string;
  householdNumber: string;
  address: string;
  block: string | null;
  latitude: number | null;
  longitude: number | null;
  currentState: 'open' | 'closed' | 'unknown';
  monitoringEnabled: boolean;
  withinWindow: boolean;
  monitorStart: string;
  monitorEnd: string;
  sirenZone: string | null;
  alerting: boolean;
  lastStateChange: string | null;
}

interface DashboardResponse {
  data: DoorStateMarkerView[];
}

async function fetchDoorDashboard(): Promise<DoorStateMarkerView[]> {
  const res = await fetch('/api/door-monitoring/dashboard');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal memuat dasbor pintu');
  }
  const json = (await res.json()) as DashboardResponse;
  return json.data;
}

export function useDoorDashboardViewModel() {
  const query = useQuery({
    queryKey: ['doorDashboard'],
    queryFn: fetchDoorDashboard,
    // Door state is time-sensitive for security; poll periodically.
    refetchInterval: 15_000,
  });

  const markers = query.data ?? [];
  const alertingCount = markers.filter(m => m.alerting).length;
  const openCount = markers.filter(m => m.currentState === 'open').length;
  const monitoredCount = markers.filter(m => m.monitoringEnabled).length;

  return {
    markers,
    alertingCount,
    openCount,
    monitoredCount,
    total: markers.length,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
