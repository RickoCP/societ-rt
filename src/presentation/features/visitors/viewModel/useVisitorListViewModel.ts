'use client';

import { useQuery } from '@tanstack/react-query';

interface VisitorLog {
  id: string;
  visitorName: string;
  purpose: string;
  destinationHousehold: string;
  checkInAt: string;
  checkOutAt: string | null;
}

interface VisitorListResponse {
  data: VisitorLog[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchVisitors(page: number): Promise<VisitorListResponse> {
  const res = await fetch(`/api/visitors?page=${page}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch visitors');
  }

  return (await res.json()) as VisitorListResponse;
}

export function useVisitorListViewModel(page = 1) {
  const query = useQuery({
    queryKey: ['visitors', page],
    queryFn: () => fetchVisitors(page),
  });

  return {
    visitors: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
