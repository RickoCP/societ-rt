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

interface InvitationResult {
  token: string;
  expiresAt: string;
}

async function inviteUserRequest(params: {
  email: string;
  role: string;
}): Promise<InvitationResult> {
  const res = await fetch('/api/auth/invitation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = (await res.json()) as { message?: string; code?: string };
    throw new Error(body.message ?? body.code ?? 'Failed to create invitation');
  }

  const json = (await res.json()) as { data: InvitationResult };
  return json.data;
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

  const inviteMutation = useMutation({
    mutationFn: inviteUserRequest,
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
    inviteUser: inviteMutation.mutateAsync,
    isInviting: inviteMutation.isPending,
    inviteError: inviteMutation.error,
  };
}
