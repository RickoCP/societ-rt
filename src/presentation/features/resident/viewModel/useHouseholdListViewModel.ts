'use client';

import { useQuery } from '@tanstack/react-query';

interface Household {
  id: string;
  householdNumber: string;
  address: string;
  block: string;
  headOfHousehold: string;
  residentCount: number;
  createdAt: string;
}

interface HouseholdListResponse {
  data: Household[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchHouseholds(
  page: number,
  search: string,
): Promise<HouseholdListResponse> {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('search', search);

  const res = await fetch(`/api/residents/households?${params.toString()}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch households');
  }

  return (await res.json()) as HouseholdListResponse;
}

export function useHouseholdListViewModel(page = 1, search = '') {
  const query = useQuery({
    queryKey: ['households', page, search],
    queryFn: () => fetchHouseholds(page, search),
  });

  return {
    households: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
