'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface EmergencyAlert {
  id: string;
  reportedBy: string;
  status: 'active' | 'responding' | 'resolved';
  latitude: number | null;
  longitude: number | null;
  locationUnavailable: boolean;
  createdAt: string;
}

interface EmergencyListResponse {
  data: EmergencyAlert[];
}

async function fetchEmergencies(): Promise<EmergencyListResponse> {
  const res = await fetch('/api/emergency');

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch emergencies');
  }

  const json = (await res.json()) as EmergencyListResponse;
  return json;
}

async function triggerAlertRequest(params: {
  latitude: number | null;
  longitude: number | null;
}): Promise<void> {
  const res = await fetch('/api/emergency', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to trigger emergency alert');
  }
}

async function updateStatusRequest(params: {
  id: string;
  status: string;
}): Promise<void> {
  const res = await fetch(`/api/emergency/${params.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: params.status }),
  });

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to update status');
  }
}

export function useEmergencyViewModel() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['emergencies'],
    queryFn: fetchEmergencies,
  });

  const triggerMutation = useMutation({
    mutationFn: triggerAlertRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['emergencies'] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: updateStatusRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['emergencies'] });
    },
  });

  return {
    alerts: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    triggerAlert: triggerMutation.mutate,
    isTriggering: triggerMutation.isPending,
    triggerError: triggerMutation.error,
    updateStatus: statusMutation.mutate,
    isUpdating: statusMutation.isPending,
  };
}
