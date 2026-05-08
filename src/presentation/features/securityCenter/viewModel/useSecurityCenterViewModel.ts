'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useSecurityWebSocket } from '../hooks/useSecurityWebSocket';
import type { SecurityWebSocketEvent } from '../hooks/useSecurityWebSocket';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GateStatusSummary {
  open: number;
  closed: number;
  offline: number;
}

interface CctvStatusSummary {
  online: number;
  offline: number;
}

interface PatrolStatusSummary {
  activeSessions: number;
}

interface SecurityEvent {
  id: string;
  type: 'incident' | 'alert' | 'device_event' | 'patrol_checkin' | 'gate_event';
  title: string;
  severity: string | null;
  category: string | null;
  timestamp: string;
}

interface DashboardMetrics {
  activeIncidents: number;
  emergencyAlerts: number;
  gateStatus: GateStatusSummary;
  cctvStatus: CctvStatusSummary;
  patrolStatus: PatrolStatusSummary;
  recentEvents: SecurityEvent[];
}

interface CriticalEvent {
  id: string;
  eventType: string;
  severity: string;
  message: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const res = await fetch('/api/security-center/dashboard');

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch security dashboard');
  }

  const json = (await res.json()) as { data: DashboardMetrics };
  return json.data;
}

async function broadcastAlert(input: {
  severity: string;
  message: string;
}): Promise<void> {
  const res = await fetch('/api/security-center/alerts/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to broadcast alert');
  }
}

// ---------------------------------------------------------------------------
// Critical event detection
// ---------------------------------------------------------------------------

const CRITICAL_EVENT_TYPES = new Set([
  'panic_button_pressed',
  'smoke_detected',
  'emergency_alert',
]);

function isCriticalEvent(event: SecurityWebSocketEvent): boolean {
  return CRITICAL_EVENT_TYPES.has(event.eventType);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const WS_CHANNELS = [
  'security_events',
  'incident_updates',
  'gate_events',
  'patrol_events',
  'alarm_events',
] as const;

export function useSecurityCenterViewModel() {
  const queryClient = useQueryClient();
  const [criticalEvent, setCriticalEvent] = useState<CriticalEvent | null>(null);

  const handleWebSocketMessage = useCallback(
    (event: SecurityWebSocketEvent) => {
      // Invalidate dashboard data on any security event
      void queryClient.invalidateQueries({ queryKey: ['security-dashboard'] });

      // Check for critical events
      if (isCriticalEvent(event)) {
        setCriticalEvent({
          id: (event.payload?.['id'] as string) ?? crypto.randomUUID(),
          eventType: event.eventType,
          severity: 'critical',
          message: (event.payload?.['message'] as string) ?? `Critical: ${event.eventType.replace(/_/g, ' ')}`,
          timestamp: event.timestamp,
        });
      }
    },
    [queryClient],
  );

  const { isConnected } = useSecurityWebSocket({
    channels: [...WS_CHANNELS],
    onMessage: handleWebSocketMessage,
  });

  const dashboardQuery = useQuery({
    queryKey: ['security-dashboard'],
    queryFn: fetchDashboardMetrics,
    refetchInterval: 10_000, // Fallback polling every 10s
  });

  const broadcastMutation = useMutation({
    mutationFn: broadcastAlert,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['security-dashboard'] });
    },
  });

  const dismissCriticalEvent = useCallback(() => {
    setCriticalEvent(null);
  }, []);

  return {
    // Dashboard data
    metrics: dashboardQuery.data ?? null,
    isLoading: dashboardQuery.isLoading,
    isError: dashboardQuery.isError,
    error: dashboardQuery.error,
    refetch: dashboardQuery.refetch,

    // WebSocket status
    isConnected,

    // Broadcast alert
    broadcastAlert: broadcastMutation.mutate,
    isBroadcasting: broadcastMutation.isPending,
    broadcastError: broadcastMutation.error,

    // Critical event alert
    criticalEvent,
    dismissCriticalEvent,
  };
}
