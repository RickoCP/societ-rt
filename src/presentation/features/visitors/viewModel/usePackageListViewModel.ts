'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface PackageRow {
  id: string;
  recipientHouseholdId: string;
  recipientHousehold: string;
  recipientAddress: string;
  courierName: string;
  description: string;
  arrivalTimestamp: string;
  collectedAt: string | null;
  loggedBy: string;
  createdAt: string;
}

interface Household {
  id: string;
  householdNumber: string;
  address: string;
}

interface PackageListResponse {
  data: PackageRow[];
}

interface HouseholdListResponse {
  data: Household[];
}

async function fetchPackages(): Promise<PackageListResponse> {
  const res = await fetch('/api/packages');
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch packages');
  }
  return (await res.json()) as PackageListResponse;
}

async function fetchHouseholds(): Promise<HouseholdListResponse> {
  const res = await fetch('/api/residents/households?page=1');
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch households');
  }
  return (await res.json()) as HouseholdListResponse;
}

async function createPackageRequest(params: {
  courierName: string;
  description: string;
  recipientHouseholdId: string;
}): Promise<void> {
  const res = await fetch('/api/packages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string; code?: string };
    throw new Error(body.message ?? body.code ?? 'Failed to create package');
  }
}

async function collectPackageRequest(id: string): Promise<void> {
  const res = await fetch(`/api/packages/${id}/collect`, { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to collect package');
  }
}

export function usePackageListViewModel() {
  const queryClient = useQueryClient();

  const packagesQuery = useQuery({
    queryKey: ['packages'],
    queryFn: fetchPackages,
  });

  const householdsQuery = useQuery({
    queryKey: ['households-for-packages'],
    queryFn: fetchHouseholds,
  });

  const createMutation = useMutation({
    mutationFn: createPackageRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['packages'] });
    },
  });

  const collectMutation = useMutation({
    mutationFn: collectPackageRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['packages'] });
    },
  });

  return {
    packages: packagesQuery.data?.data ?? [],
    households: householdsQuery.data?.data ?? [],
    isLoading: packagesQuery.isLoading,
    isError: packagesQuery.isError,
    error: packagesQuery.error,
    createPackage: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    collectPackage: collectMutation.mutate,
    isCollecting: collectMutation.isPending,
  };
}
