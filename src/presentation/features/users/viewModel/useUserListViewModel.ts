'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

interface UserListResponse {
  data: User[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchUsers(page: number): Promise<UserListResponse> {
  const res = await fetch(`/api/residents?page=${page}&type=users`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch users');
  }

  return (await res.json()) as UserListResponse;
}

async function assignRoleRequest(params: {
  userId: string;
  role: string;
}): Promise<void> {
  const res = await fetch(`/api/residents/${params.userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: params.role }),
  });

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to assign role');
  }
}

export function useUserListViewModel(page = 1) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['users', page],
    queryFn: () => fetchUsers(page),
  });

  const roleMutation = useMutation({
    mutationFn: assignRoleRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  return {
    users: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    assignRole: roleMutation.mutate,
    isAssigning: roleMutation.isPending,
  };
}
