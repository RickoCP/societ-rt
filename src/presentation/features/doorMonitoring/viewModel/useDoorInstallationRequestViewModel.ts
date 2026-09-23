'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HouseholdOption,
  InstallationRequestRow,
} from './useDoorSensorAdminViewModel';

async function fetchHouseholds(): Promise<HouseholdOption[]> {
  const res = await fetch('/api/residents/households?page=1');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal memuat daftar rumah');
  }
  const json = (await res.json()) as { data: HouseholdOption[] };
  return json.data;
}

async function fetchMyRequests(): Promise<InstallationRequestRow[]> {
  const res = await fetch('/api/door-sensors/requests');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal memuat pengajuan');
  }
  const json = (await res.json()) as { data: InstallationRequestRow[] };
  return json.data;
}

async function createRequest(params: {
  householdId: string;
  note?: string;
}): Promise<void> {
  const res = await fetch('/api/door-sensors/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal mengirim pengajuan');
  }
}

export function useDoorInstallationRequestViewModel() {
  const queryClient = useQueryClient();

  const householdsQuery = useQuery({
    queryKey: ['households', 'doorRequest'],
    queryFn: fetchHouseholds,
  });

  const requestsQuery = useQuery({
    queryKey: ['doorInstallationRequests'],
    queryFn: fetchMyRequests,
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: createRequest,
    onMutate: () => {
      setSubmitError(null);
      setSubmitSuccess(false);
    },
    onSuccess: () => {
      setSubmitSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['doorInstallationRequests'] });
    },
    onError: (err: unknown) => {
      setSubmitError(err instanceof Error ? err.message : 'Gagal mengirim pengajuan');
    },
  });

  return {
    households: householdsQuery.data ?? [],
    householdsLoading: householdsQuery.isLoading,
    requests: requestsQuery.data ?? [],
    requestsLoading: requestsQuery.isLoading,
    submitRequest: mutation.mutate,
    isSubmitting: mutation.isPending,
    submitError,
    submitSuccess,
  };
}
