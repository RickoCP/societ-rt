'use client';

import { useQuery } from '@tanstack/react-query';

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  createdBy: string;
  authorName: string;
  publishedAt: string;
  createdAt: string;
}

interface AnnouncementListResponse {
  data: Announcement[];
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

async function fetchAnnouncements(
  page: number,
  category?: string,
): Promise<AnnouncementListResponse> {
  const params = new URLSearchParams({ page: String(page) });
  if (category) params.set('category', category);
  const res = await fetch(`/api/announcements?${params.toString()}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch announcements');
  }

  return (await res.json()) as AnnouncementListResponse;
}

async function fetchCurrentUser(): Promise<CurrentUser> {
  const res = await fetch('/api/auth/me');
  if (!res.ok) {
    throw new Error('Failed to fetch current user');
  }
  const json = (await res.json()) as { data: CurrentUser };
  return json.data;
}

const EDIT_DELETE_ALLOWED_ROLES = ['Super_Admin', 'Ketua_RT'];

export function useAnnouncementListViewModel(page = 1, category?: string) {
  const query = useQuery({
    queryKey: ['announcements', page, category],
    queryFn: () => fetchAnnouncements(page, category),
  });

  const userQuery = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
  });

  const canEditDelete = (createdBy: string): boolean => {
    if (!userQuery.data) return false;
    const { role, userId } = userQuery.data;
    if (EDIT_DELETE_ALLOWED_ROLES.includes(role)) return true;
    return createdBy === userId;
  };

  return {
    announcements: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    canEditDelete,
  };
}
