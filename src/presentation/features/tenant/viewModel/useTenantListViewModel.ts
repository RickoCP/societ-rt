'use client';

import { useQuery } from '@tanstack/react-query';

interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  rtRwNumber: string;
  region: string;
  createdAt: string;
}

interface TenantListResponse {
  data: Tenant[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchTenants(page: number): Promise<TenantListResponse> {
  const res = await fetch(`/api/tenants?page=${page}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch tenants');
  }

  return (await res.json()) as TenantListResponse;
}

export function useTenantListViewModel(page = 1) {
  const query = useQuery({
    queryKey: ['tenants', page],
    queryFn: () => fetchTenants(page),
  });

  return {
    tenants: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? 1,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
