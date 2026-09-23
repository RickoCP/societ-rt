'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface DoorConfigView {
  householdId: string;
  monitorStart: string;
  monitorEnd: string;
  enabled: boolean;
  currentState: 'open' | 'closed' | 'unknown';
  deviceConfigured: boolean;
}

interface ConfigResponse {
  data: DoorConfigView | null;
}

async function fetchConfig(householdId: string): Promise<DoorConfigView | null> {
  const res = await fetch(`/api/door-sensors/${householdId}/window`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal memuat konfigurasi');
  }
  const json = (await res.json()) as ConfigResponse;
  return json.data;
}

interface SaveParams {
  monitorStart: string;
  monitorEnd: string;
  enabled: boolean;
}

async function saveWindow(
  householdId: string,
  params: SaveParams,
): Promise<void> {
  const res = await fetch(`/api/door-sensors/${householdId}/window`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal menyimpan jam monitoring');
  }
}

export function useMonitoringWindowViewModel(householdId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['doorConfig', householdId],
    queryFn: () => fetchConfig(householdId),
    enabled: Boolean(householdId),
  });

  const mutation = useMutation({
    mutationFn: (params: SaveParams) => saveWindow(householdId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doorConfig', householdId] });
    },
  });

  return {
    config: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    save: mutation.mutate,
    isSaving: mutation.isPending,
    saveError: mutation.error as Error | null,
    saved: mutation.isSuccess,
  };
}
