'use client';

import { useQuery } from '@tanstack/react-query';

interface PackageLog {
  id: string;
  recipientName: string;
  courier: string;
  trackingNumber: string | null;
  status: 'received' | 'collected';
  receivedAt: string;
  collectedAt: string | null;
}

interface PackageListResponse {
  data: PackageLog[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchPackages(page: number): Promise<PackageListResponse> {
  const res = await fetch(`/api/packages?page=${page}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch packages');
  }

  return (await res.json()) as PackageListResponse;
}

export function usePackageListViewModel(page = 1) {
  const query = useQuery({
    queryKey: ['packages', page],
    queryFn: () => fetchPackages(page),
  });

  return {
    packages: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
