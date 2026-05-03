'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Patrol {
  id: string;
  date: string;
  shift: string;
  assignedGuard: string;
  status: string;
  checkedInAt: string | null;
}

interface PatrolListResponse {
  data: Patrol[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchPatrols(page: number): Promise<PatrolListResponse> {
  const res = await fetch(`/api/security/patrols?page=${page}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch patrols');
  }

  return (await res.json()) as PatrolListResponse;
}

async function checkInRequest(): Promise<void> {
  const res = await fetch('/api/security/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timestamp: new Date().toISOString() }),
  });

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to check in');
  }
}

export function usePatrolViewModel(page = 1) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['patrols', page],
    queryFn: () => fetchPatrols(page),
  });

  const checkInMutation = useMutation({
    mutationFn: checkInRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patrols'] });
    },
  });

  return {
    patrols: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    checkIn: checkInMutation.mutate,
    isCheckingIn: checkInMutation.isPending,
  };
}
