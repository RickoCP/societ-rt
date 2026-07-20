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
  createdBy: string;
  authorName: string;
  createdAt: string;
}

interface VoteListResponse {
  data: Vote[];
  total: number;
  page: number;
  totalPages: number;
}

interface CurrentUser {
  userId: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
}

async function fetchVotes(page: number): Promise<VoteListResponse> {
  const res = await fetch(`/api/voting?page=${page}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch votes');
  }

  return (await res.json()) as VoteListResponse;
}

async function fetchCurrentUser(): Promise<CurrentUser> {
  const res = await fetch('/api/auth/me');
  if (!res.ok) {
    throw new Error('Failed to fetch current user');
  }
  const json = (await res.json()) as { data: CurrentUser };
  return json.data;
}

async function deleteVoteRequest(id: string): Promise<void> {
  const res = await fetch(`/api/voting/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to delete vote');
  }
}

const DELETE_ALLOWED_ROLES = ['Super_Admin', 'Ketua_RT'];

export function useVoteListViewModel(page = 1) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['votes', page],
    queryFn: () => fetchVotes(page),
  });

  const userQuery = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVoteRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['votes'] });
    },
  });

  const canDeleteVote = (createdBy: string): boolean => {
    if (!userQuery.data) return false;
    const { role, userId } = userQuery.data;
    if (DELETE_ALLOWED_ROLES.includes(role)) return true;
    return createdBy === userId;
  };

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
    canDeleteVote,
  };
}
