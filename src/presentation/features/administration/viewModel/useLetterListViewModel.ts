'use client';

import { useQuery } from '@tanstack/react-query';

interface LetterRequest {
  id: string;
  letterType: string;
  purpose: string;
  status: 'pending' | 'approved' | 'rejected';
  userId: string;
  rejectionReason: string | null;
  documentUrl: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

interface LetterListResponse {
  data: LetterRequest[];
  pagination: { total: number; page: number; pageSize: number };
}

async function fetchLetters(page: number): Promise<{ data: LetterRequest[]; totalPages: number }> {
  const res = await fetch(`/api/administration/letters?page=${page}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch letter requests');
  }

  const json = (await res.json()) as LetterListResponse;
  const totalPages = Math.ceil((json.pagination?.total ?? 0) / (json.pagination?.pageSize ?? 20)) || 1;
  return { data: json.data, totalPages };
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
