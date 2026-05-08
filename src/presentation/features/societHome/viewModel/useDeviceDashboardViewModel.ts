'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeviceStatus = 'online' | 'offline' | 'pairing';

export interface Device {
  id: string;
  name: string;
  type: string;
  status: DeviceStatus;
  batteryLevel: number | null;
  lastActivity: string;
  firmwareVersion: string | null;
}

export interface DeviceEvent {
  id: string;
  deviceId: string;
  eventType: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface DeviceAlertPreference {
  deviceId: string;
  alertOnOffline: boolean;
  alertOnLowBattery: boolean;
  alertOnMotion: boolean;
}

interface PairDeviceInput {
  pairingCode: string;
  deviceName: string;
}

interface SendCommandInput {
  deviceId: string;
  command: string;
  params?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchDevices(): Promise<Device[]> {
  const res = await fetch('/api/iot/devices');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch devices');
  }
  const json = (await res.json()) as { data: Device[] };
  return json.data;
}

async function fetchDeviceEvents(deviceId: string): Promise<DeviceEvent[]> {
  const res = await fetch(`/api/iot/devices/${deviceId}/events`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch device events');
  }
  const json = (await res.json()) as { data: DeviceEvent[] };
  return json.data;
}

async function pairDevice(input: PairDeviceInput): Promise<Device> {
  const res = await fetch('/api/iot/devices/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to pair device');
  }
  const json = (await res.json()) as { data: Device };
  return json.data;
}

async function sendDeviceCommand(input: SendCommandInput): Promise<void> {
  const res = await fetch(`/api/iot/devices/${input.deviceId}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: input.command, params: input.params }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to send command');
  }
}

async function updateAlertPreferences(prefs: DeviceAlertPreference): Promise<void> {
  const res = await fetch(`/api/iot/devices/${prefs.deviceId}/alerts`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to update alert preferences');
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDeviceDashboardViewModel() {
  const queryClient = useQueryClient();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [realtimeEvents, setRealtimeEvents] = useState<DeviceEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const devicesQuery = useQuery({
    queryKey: ['iot-devices'],
    queryFn: fetchDevices,
    refetchInterval: 15000,
  });

  const eventsQuery = useQuery({
    queryKey: ['device-events', selectedDeviceId],
    queryFn: () => fetchDeviceEvents(selectedDeviceId!),
    enabled: !!selectedDeviceId,
  });

  const pairMutation = useMutation({
    mutationFn: pairDevice,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['iot-devices'] });
    },
  });

  const commandMutation = useMutation({
    mutationFn: sendDeviceCommand,
  });

  const alertPrefsMutation = useMutation({
    mutationFn: updateAlertPreferences,
  });

  // WebSocket for realtime device events
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws?channel=device_events`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as DeviceEvent;
          setRealtimeEvents(prev => [data, ...prev].slice(0, 50));
          void queryClient.invalidateQueries({ queryKey: ['iot-devices'] });
        } catch {
          // Ignore malformed messages
        }
      };

      return () => {
        ws.close();
      };
    } catch {
      // WebSocket not available
      return undefined;
    }
  }, [queryClient]);

  const handleSelectDevice = useCallback((id: string | null) => {
    setSelectedDeviceId(id);
  }, []);

  return {
    devices: devicesQuery.data ?? [],
    isLoading: devicesQuery.isLoading,
    isError: devicesQuery.isError,
    error: devicesQuery.error,

    selectedDeviceId,
    setSelectedDeviceId: handleSelectDevice,
    deviceEvents: eventsQuery.data ?? [],
    realtimeEvents,

    pairDevice: pairMutation.mutate,
    isPairing: pairMutation.isPending,
    pairError: pairMutation.error,

    sendCommand: commandMutation.mutate,
    isSendingCommand: commandMutation.isPending,

    updateAlertPreferences: alertPrefsMutation.mutate,
    isUpdatingAlerts: alertPrefsMutation.isPending,
  };
}
