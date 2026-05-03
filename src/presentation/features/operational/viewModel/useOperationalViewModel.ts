'use client';

import { useQuery, useMutation } from '@tanstack/react-query';

interface TenantHealth {
  tenantId: string;
  tenantName: string;
  status: 'healthy' | 'degraded' | 'down';
  userCount: number;
  storageUsedMb: number;
  lastActivityAt: string;
}

interface TenantHealthResponse {
  data: TenantHealth[];
}

async function fetchTenantHealth(): Promise<TenantHealthResponse> {
  const res = await fetch('/api/admin/tenants/health');
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch tenant health');
  }
  return (await res.json()) as TenantHealthResponse;
}

async function startImpersonation(tenantId: string): Promise<{ token: string }> {
  const res = await fetch('/api/admin/impersonate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId }),
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to start impersonation');
  }
  return (await res.json()) as { token: string };
}

async function endImpersonation(): Promise<void> {
  const res = await fetch('/api/admin/impersonate/end', { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to end impersonation');
  }
}

export function useTenantHealthViewModel() {
  const query = useQuery({
    queryKey: ['tenant-health'],
    queryFn: fetchTenantHealth,
  });

  return {
    tenants: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useImpersonationViewModel() {
  const impersonateMutation = useMutation({ mutationFn: startImpersonation });
  const endMutation = useMutation({ mutationFn: endImpersonation });

  return {
    impersonate: impersonateMutation.mutate,
    isImpersonating: impersonateMutation.isPending,
    impersonateError: impersonateMutation.error,
    impersonateSuccess: impersonateMutation.isSuccess,

    endImpersonation: endMutation.mutate,
    isEndingImpersonation: endMutation.isPending,
    endError: endMutation.error,
  };
}
