'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface EventDetail {
  id: string;
  title: string;
  description: string;
  location: string;
  eventDate: string;
  rsvpCount: number;
  createdBy: string;
  createdAt: string;
}

async function fetchEventDetail(id: string): Promise<EventDetail> {
  const res = await fetch(`/api/events/${id}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch event detail');
  }

  return (await res.json()) as EventDetail;
}

async function submitRsvp(eventId: string): Promise<void> {
  const res = await fetch(`/api/events/${eventId}/rsvp`, { method: 'POST' });

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to submit RSVP');
  }
}

export function useEventDetailViewModel(id: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['event', id],
    queryFn: () => fetchEventDetail(id),
    enabled: !!id,
  });

  const rsvpMutation = useMutation({
    mutationFn: () => submitRsvp(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['event', id] });
    },
  });

  return {
    event: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    submitRsvp: rsvpMutation.mutate,
    isSubmittingRsvp: rsvpMutation.isPending,
    rsvpError: rsvpMutation.error,
  };
}
