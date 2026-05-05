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
  data: Array<{
    id: string;
    title: string;
    description: string;
    date: string;
    time: string;
    location: string;
    createdBy: string;
    rsvpCount: number;
    createdAt: string;
  }>;
}

async function fetchEvents(page: number): Promise<{ data: CommunityEvent[]; totalPages: number }> {
  const res = await fetch(`/api/events?page=${page}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch events');
  }

  const json = (await res.json()) as EventListResponse;
  return {
    data: json.data.map(e => ({
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      eventDate: e.date ? new Date(e.date).toLocaleDateString() : '',
      rsvpCount: e.rsvpCount ?? 0,
      createdBy: e.createdBy,
      createdAt: e.createdAt,
    })),
    totalPages: 1,
  };
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
