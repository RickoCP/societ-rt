'use client';

import { useQuery } from '@tanstack/react-query';

interface LetterRequestDetail {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  documentUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

async function fetchLetterDetail(id: string): Promise<LetterRequestDetail> {
  const res = await fetch(`/api/administration/letters/${id}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch letter detail');
  }

  return (await res.json()) as LetterRequestDetail;
}

export function useLetterDetailViewModel(id: string) {
  const query = useQuery({
    queryKey: ['administration-letter', id],
    queryFn: () => fetchLetterDetail(id),
    enabled: !!id,
  });

  return {
    letter: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
