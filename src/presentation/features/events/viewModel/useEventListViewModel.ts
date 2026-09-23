'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  rsvpCount: number;
  createdBy: string;
  authorName: string;
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
    authorName: string;
    rsvpCount: number;
    createdAt: string;
  }>;
}

interface CurrentUser {
  userId: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
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
      date: e.date,
      time: e.time,
      rsvpCount: e.rsvpCount ?? 0,
      createdBy: e.createdBy,
      authorName: e.authorName ?? 'Unknown',
      createdAt: e.createdAt,
    })),
    totalPages: 1,
  };
}

async function fetchCurrentUser(): Promise<CurrentUser> {
  const res = await fetch('/api/auth/me');
  if (!res.ok) {
    throw new Error('Failed to fetch current user');
  }
  const json = (await res.json()) as { data: CurrentUser };
  return json.data;
}

async function deleteEventRequest(id: string): Promise<void> {
  const res = await fetch(`/api/events/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to delete event');
  }
}

const DELETE_ALLOWED_ROLES = ['Super_Admin', 'Ketua_RT'];

export function useEventListViewModel(page = 1) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['events', page],
    queryFn: () => fetchEvents(page),
  });

  const userQuery = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEventRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const canDeleteEvent = (createdBy: string): boolean => {
    if (!userQuery.data) return false;
    const { role, userId } = userQuery.data;
    if (DELETE_ALLOWED_ROLES.includes(role)) return true;
    return createdBy === userId;
  };

  return {
    events: query.data?.data ?? [],
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    deleteEvent: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    canDeleteEvent,
  };
}
