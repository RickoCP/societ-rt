'use client';

import { useQuery } from '@tanstack/react-query';

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  createdBy: string;
  publishedAt: string;
  createdAt: string;
}

interface AnnouncementListResponse {
  data: Announcement[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchAnnouncements(
  page: number,
): Promise<AnnouncementListResponse> {
  const res = await fetch(`/api/announcements?page=${page}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch announcements');
  }

  return (await res.json()) as AnnouncementListResponse;
}

export function useAnnouncementListViewModel(page = 1) {
  const query = useQuery({
    queryKey: ['announcements', page],
    queryFn: () => fetchAnnouncements(page),
  });

  return {
    announcements: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
