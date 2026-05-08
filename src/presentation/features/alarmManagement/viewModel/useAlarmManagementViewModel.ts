'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlarmStatus = 'armed' | 'disarmed' | 'triggered' | 'offline';

export interface AlarmDevice {
  id: string;
  name: string;
  type: string;
  status: AlarmStatus;
  zoneId: string;
  zoneName: string;
  lastTriggered: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface AlarmZone {
  id: string;
  name: string;
  polygon: { lat: number; lng: number }[];
  deviceCount: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchAlarmDevices(): Promise<AlarmDevice[]> {
  const res = await fetch('/api/security/alarms/devices');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch alarm devices');
  }
  const json = (await res.json()) as { data: AlarmDevice[] };
  return json.data;
}

async function fetchAlarmZones(): Promise<AlarmZone[]> {
  const res = await fetch('/api/security/alarms/zones');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch alarm zones');
  }
  const json = (await res.json()) as { data: AlarmZone[] };
  return json.data;
}

async function activateAlarm(deviceId: string): Promise<void> {
  const res = await fetch(`/api/security/alarms/devices/${deviceId}/activate`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to activate alarm');
  }
}

async function deactivateAlarm(deviceId: string): Promise<void> {
  const res = await fetch(`/api/security/alarms/devices/${deviceId}/deactivate`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to deactivate alarm');
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAlarmManagementViewModel() {
  const queryClient = useQueryClient();

  const devicesQuery = useQuery({
    queryKey: ['alarm-devices'],
    queryFn: fetchAlarmDevices,
    refetchInterval: 10000,
  });

  const zonesQuery = useQuery({
    queryKey: ['alarm-zones'],
    queryFn: fetchAlarmZones,
  });

  const activateMutation = useMutation({
    mutationFn: activateAlarm,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['alarm-devices'] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateAlarm,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['alarm-devices'] });
    },
  });

  return {
    devices: devicesQuery.data ?? [],
    zones: zonesQuery.data ?? [],
    isLoading: devicesQuery.isLoading,
    isError: devicesQuery.isError,
    error: devicesQuery.error,
    activateAlarm: activateMutation.mutate,
    deactivateAlarm: deactivateMutation.mutate,
    isActivating: activateMutation.isPending,
    isDeactivating: deactivateMutation.isPending,
  };
}
