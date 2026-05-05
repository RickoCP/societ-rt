'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface EventDetail {
  id: string;
  title: string;
  description: string;
  location: string;
  eventDate: string;
  rsvpCount: number;
  maxRsvp: number | null;
  createdBy: string;
  createdAt: string;
  myRsvpStatus: string | null;
  attendees: Array<{ userName: string; response: string; respondedAt: string }>;
}

async function fetchEventDetail(id: string): Promise<EventDetail> {
  const res = await fetch(`/api/events/${id}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch event detail');
  }

  const json = (await res.json()) as { data: { id: string; title: string; description: string; location: string; date: string; time: string; rsvpCount: number; maxRsvp: number | null; createdBy: string; createdAt: string; myRsvpStatus: string | null; attendees: Array<{ userName: string; response: string; respondedAt: string }> } };
  const d = json.data;
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    location: d.location,
    eventDate: d.date ? new Date(d.date).toLocaleString() : '',
    rsvpCount: d.rsvpCount ?? 0,
    maxRsvp: d.maxRsvp ?? null,
    createdBy: d.createdBy ?? '',
    createdAt: d.createdAt ?? '',
    myRsvpStatus: d.myRsvpStatus ?? null,
    attendees: d.attendees ?? [],
  };
}

async function submitRsvp(eventId: string, response: 'attending' | 'not_attending'): Promise<void> {
  const res = await fetch(`/api/events/${eventId}/rsvp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response }),
  });

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
    mutationFn: (response: 'attending' | 'not_attending') => submitRsvp(id, response),
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
