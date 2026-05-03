'use client';

import { useQuery } from '@tanstack/react-query';

interface LetterRequest {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  documentUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LetterListResponse {
  data: LetterRequest[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchLetters(page: number): Promise<LetterListResponse> {
  const res = await fetch(`/api/administration/letters?page=${page}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch letter requests');
  }

  return (await res.json()) as LetterListResponse;
}

export function useLetterListViewModel(page = 1) {
  const query = useQuery({
    queryKey: ['administration-letters', page],
    queryFn: () => fetchLetters(page),
  });

  return {
    letters: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
