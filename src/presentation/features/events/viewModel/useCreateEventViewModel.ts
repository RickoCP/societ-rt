'use client';

import { useMutation } from '@tanstack/react-query';

interface CreateEventInput {
  title: string;
  description: string;
  location: string;
  eventDate: string;
}

async function createEvent(input: CreateEventInput): Promise<{ id: string }> {
  const res = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to create event');
  }

  return (await res.json()) as { id: string };
}

export function useCreateEventViewModel() {
  const mutation = useMutation({
    mutationFn: createEvent,
  });

  return {
    createEvent: mutation.mutate,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
    data: mutation.data ?? null,
  };
}
