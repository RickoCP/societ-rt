'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HouseholdOption {
  id: string;
  householdNumber: string;
  address: string;
  block: string;
  headOfHousehold: string;
}

export interface InstallationRequestRow {
  id: string;
  householdId: string;
  householdNumber: string;
  householdAddress: string;
  householdBlock: string | null;
  requestedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  note: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface RegisterSensorParams {
  householdId: string;
  tuyaDeviceId: string;
  deviceName: string;
  sirenZone: string;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchHouseholds(): Promise<HouseholdOption[]> {
  const res = await fetch('/api/residents/households?page=1');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal memuat daftar rumah');
  }
  const json = (await res.json()) as { data: HouseholdOption[] };
  return json.data;
}

async function fetchRequests(): Promise<InstallationRequestRow[]> {
  const res = await fetch('/api/door-sensors/requests');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal memuat pengajuan');
  }
  const json = (await res.json()) as { data: InstallationRequestRow[] };
  return json.data;
}

async function registerSensor(params: RegisterSensorParams): Promise<void> {
  const res = await fetch('/api/door-sensors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal mendaftarkan sensor');
  }
}

async function resolveRequest(params: {
  requestId: string;
  decision: 'approved' | 'rejected';
}): Promise<void> {
  const res = await fetch(
    `/api/door-sensors/requests/${params.requestId}/resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: params.decision }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal memproses pengajuan');
  }
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

export function useDoorSensorAdminViewModel() {
  const queryClient = useQueryClient();

  const householdsQuery = useQuery({
    queryKey: ['households', 'doorAdmin'],
    queryFn: fetchHouseholds,
  });

  const requestsQuery = useQuery({
    queryKey: ['doorInstallationRequests'],
    queryFn: fetchRequests,
  });

  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);

  const registerMutation = useMutation({
    mutationFn: registerSensor,
    onMutate: () => {
      setRegisterError(null);
      setRegisterSuccess(false);
    },
    onSuccess: () => {
      setRegisterSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['doorInstallationRequests'] });
      queryClient.invalidateQueries({ queryKey: ['doorDashboard'] });
    },
    onError: (err: unknown) => {
      setRegisterError(err instanceof Error ? err.message : 'Gagal mendaftarkan sensor');
    },
  });

  const resolveMutation = useMutation({
    mutationFn: resolveRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doorInstallationRequests'] });
    },
  });

  return {
    households: householdsQuery.data ?? [],
    householdsLoading: householdsQuery.isLoading,
    requests: requestsQuery.data ?? [],
    requestsLoading: requestsQuery.isLoading,
    requestsError: requestsQuery.error as Error | null,

    registerSensor: registerMutation.mutate,
    isRegistering: registerMutation.isPending,
    registerError,
    registerSuccess,

    resolveRequest: resolveMutation.mutate,
    isResolving: resolveMutation.isPending,
    resolvingId: resolveMutation.variables?.requestId ?? null,
  };
}
