'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmergencyContactCategory =
  | 'police'
  | 'ambulance'
  | 'fire'
  | 'hospital'
  | 'security'
  | 'rt_officer'
  | 'other';

export interface EmergencyContactView {
  id: string;
  label: string;
  phone: string;
  category: EmergencyContactCategory;
  description: string | null;
  sortOrder: number;
}

export interface ContactFormInput {
  label: string;
  phone: string;
  category: EmergencyContactCategory;
  description?: string | null;
  sortOrder?: number;
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchContacts(): Promise<EmergencyContactView[]> {
  const res = await fetch('/api/emergency-contacts');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal memuat kontak darurat');
  }
  const json = (await res.json()) as { data: EmergencyContactView[] };
  return json.data;
}

async function createContact(input: ContactFormInput): Promise<void> {
  const res = await fetch('/api/emergency-contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal menambah kontak');
  }
}

async function updateContact(params: {
  id: string;
  input: Partial<ContactFormInput>;
}): Promise<void> {
  const res = await fetch(`/api/emergency-contacts/${params.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params.input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal memperbarui kontak');
  }
}

async function deleteContact(id: string): Promise<void> {
  const res = await fetch(`/api/emergency-contacts/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Gagal menghapus kontak');
  }
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

export function useEmergencyContactViewModel() {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['emergencyContacts'],
    queryFn: fetchContacts,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['emergencyContacts'] });

  const createMutation = useMutation({
    mutationFn: createContact,
    onMutate: () => setMutationError(null),
    onSuccess: invalidate,
    onError: (e: unknown) =>
      setMutationError(e instanceof Error ? e.message : 'Gagal menambah kontak'),
  });

  const updateMutation = useMutation({
    mutationFn: updateContact,
    onMutate: () => setMutationError(null),
    onSuccess: invalidate,
    onError: (e: unknown) =>
      setMutationError(e instanceof Error ? e.message : 'Gagal memperbarui kontak'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteContact,
    onMutate: () => setMutationError(null),
    onSuccess: invalidate,
    onError: (e: unknown) =>
      setMutationError(e instanceof Error ? e.message : 'Gagal menghapus kontak'),
  });

  return {
    contacts: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,

    createContact: createMutation.mutate,
    updateContact: updateMutation.mutate,
    deleteContact: deleteMutation.mutate,
    isMutating:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending,
    mutationError,
  };
}
