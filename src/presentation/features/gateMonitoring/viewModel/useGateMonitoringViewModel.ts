'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GateStatus = 'open' | 'closed' | 'offline';

export interface Gate {
  id: string;
  name: string;
  status: GateStatus;
  openSince: string | null;
  lastEvent: string;
  location: string;
}

export interface GateEvent {
  id: string;
  gateId: string;
  eventType: string;
  timestamp: string;
  triggeredBy: string | null;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchGates(): Promise<Gate[]> {
  const res = await fetch('/api/security/gates');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch gates');
  }
  const json = (await res.json()) as { data: Gate[] };
  return json.data;
}

async function fetchGateEvents(gateId: string): Promise<GateEvent[]> {
  const res = await fetch(`/api/security/gates/${gateId}/events`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch gate events');
  }
  const json = (await res.json()) as { data: GateEvent[] };
  return json.data;
}

async function controlGate(input: { gateId: string; action: 'open' | 'close' }): Promise<void> {
  const res = await fetch(`/api/security/gates/${input.gateId}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: input.action }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to control gate');
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGateMonitoringViewModel() {
  const queryClient = useQueryClient();

  const gatesQuery = useQuery({
    queryKey: ['gates'],
    queryFn: fetchGates,
    refetchInterval: 5000,
  });

  const controlMutation = useMutation({
    mutationFn: controlGate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['gates'] });
    },
  });

  return {
    gates: gatesQuery.data ?? [],
    isLoading: gatesQuery.isLoading,
    isError: gatesQuery.isError,
    error: gatesQuery.error,
    controlGate: controlMutation.mutate,
    isControlling: controlMutation.isPending,
    fetchGateEvents,
  };
}
