'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  showLoadingToast,
  updateToast,
} from '@infrastructure/stateManagement/toastStore';

interface VisitorRow {
  id: string;
  visitorName: string;
  purpose: string;
  destinationHouseholdId: string;
  entryTimestamp: string;
  exitTimestamp: string | null;
  loggedBy: string;
  createdAt: string;
}

interface Household {
  id: string;
  householdNumber: string;
  address: string;
}

interface VisitorListResponse {
  data: VisitorRow[];
}

interface HouseholdListResponse {
  data: Household[];
}

async function fetchVisitors(): Promise<VisitorListResponse> {
  const res = await fetch('/api/visitors');
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch visitors');
  }
  return (await res.json()) as VisitorListResponse;
}

async function fetchHouseholds(): Promise<HouseholdListResponse> {
  const res = await fetch('/api/residents/households?page=1');
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch households');
  }
  return (await res.json()) as HouseholdListResponse;
}

async function createVisitorRequest(params: {
  visitorName: string;
  purpose: string;
  destinationHouseholdId: string;
}): Promise<void> {
  const res = await fetch('/api/visitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string; code?: string };
    throw new Error(body.message ?? body.code ?? 'Failed to create visitor');
  }
}

async function checkoutVisitorRequest(id: string): Promise<void> {
  const res = await fetch(`/api/visitors/${id}/checkout`, { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to checkout visitor');
  }
}

async function deleteVisitorRequest(id: string): Promise<void> {
  const res = await fetch(`/api/visitors/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string; code?: string };
    throw new Error(body.message ?? body.code ?? 'Failed to delete visitor');
  }
}

export function useVisitorListViewModel() {
  const queryClient = useQueryClient();

  const visitorsQuery = useQuery({
    queryKey: ['visitors'],
    queryFn: fetchVisitors,
  });

  const householdsQuery = useQuery({
    queryKey: ['households-for-visitors'],
    queryFn: fetchHouseholds,
  });

  const createMutation = useMutation({
    mutationFn: createVisitorRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['visitors'] });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: checkoutVisitorRequest,
    onMutate: () => {
      const toastId = showLoadingToast('Memproses checkout tamu...');
      return { toastId };
    },
    onSuccess: async (_data, _id, context) => {
      await queryClient.invalidateQueries({ queryKey: ['visitors'] });
      if (context?.toastId) {
        updateToast(context.toastId, {
          type: 'success',
          message: 'Tamu berhasil checkout.',
        });
      }
    },
    onError: (error, _id, context) => {
      const message =
        error instanceof Error ? error.message : 'Gagal memproses checkout tamu.';
      if (context?.toastId) {
        updateToast(context.toastId, { type: 'error', message });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVisitorRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['visitors'] });
    },
  });

  return {
    visitors: visitorsQuery.data?.data ?? [],
    households: householdsQuery.data?.data ?? [],
    isLoading: visitorsQuery.isLoading,
    isError: visitorsQuery.isError,
    error: visitorsQuery.error,
    createVisitor: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    checkoutVisitor: checkoutMutation.mutate,
    isCheckingOut: checkoutMutation.isPending,
    deleteVisitor: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error,
  };
}
