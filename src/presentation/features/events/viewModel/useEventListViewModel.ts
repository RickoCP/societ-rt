'use client';

import { useQuery } from '@tanstack/react-query';

interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  eventDate: string;
  rsvpCount: number;
  createdBy: string;
  createdAt: string;
}

interface EventListResponse {
  data: CommunityEvent[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchEvents(page: number): Promise<EventListResponse> {
  const res = await fetch(`/api/events?page=${page}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch events');
  }

  return (await res.json()) as EventListResponse;
}

export function useEventListViewModel(page = 1) {
  const query = useQuery({
    queryKey: ['events', page],
    queryFn: () => fetchEvents(page),
  });

  return {
    events: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
