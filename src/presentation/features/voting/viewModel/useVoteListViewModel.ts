'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Vote {
  id: string;
  title: string;
  description: string;
  mode: 'anonymous' | 'verified';
  deadline: string;
  optionCount: number;
  totalVotes: number;
  createdAt: string;
}

interface VoteListResponse {
  data: Vote[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchVotes(page: number): Promise<VoteListResponse> {
  const res = await fetch(`/api/voting?page=${page}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch votes');
  }

  return (await res.json()) as VoteListResponse;
}

async function deleteVoteRequest(id: string): Promise<void> {
  const res = await fetch(`/api/voting/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to delete vote');
  }
}

export function useVoteListViewModel(page = 1) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['votes', page],
    queryFn: () => fetchVotes(page),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVoteRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['votes'] });
    },
  });

  return {
    votes: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    deleteVote: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}
