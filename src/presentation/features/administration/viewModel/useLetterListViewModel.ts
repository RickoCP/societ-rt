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

interface CurrentUser {
  userId: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
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

async function fetchCurrentUser(): Promise<CurrentUser> {
  const res = await fetch('/api/auth/me');
  if (!res.ok) {
    throw new Error('Failed to fetch current user');
  }
  const json = (await res.json()) as { data: CurrentUser };
  return json.data;
}

const ADMIN_ROLES = ['Super_Admin', 'Ketua_RT'];

export function useLetterListViewModel(page = 1) {
  const query = useQuery({
    queryKey: ['administration-letters', page],
    queryFn: () => fetchLetters(page),
  });

  const userQuery = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
  });

  const canApproveReject = (): boolean => {
    if (!userQuery.data) return false;
    return ADMIN_ROLES.includes(userQuery.data.role);
  };

  const canEditLetter = (userId: string, status: string): boolean => {
    if (!userQuery.data) return false;
    return userQuery.data.userId === userId && status === 'pending';
  };

  return {
    letters: query.data?.data ?? [],
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    canApproveReject,
    canEditLetter,
    currentUser: userQuery.data ?? null,
  };
}
