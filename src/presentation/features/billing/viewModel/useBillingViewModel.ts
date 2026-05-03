'use client';

import { useQuery } from '@tanstack/react-query';

interface SubscriptionPlan {
  id: string;
  name: string;
  maxUsers: number;
  features: string[];
  price: number;
}

interface Invoice {
  id: string;
  planName: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed';
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
}

interface PlansResponse {
  data: SubscriptionPlan[];
}

interface InvoiceListResponse {
  data: Invoice[];
  total: number;
  page: number;
  totalPages: number;
}

async function fetchPlans(): Promise<PlansResponse> {
  const res = await fetch('/api/billing/plans');
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch plans');
  }
  return (await res.json()) as PlansResponse;
}

async function fetchInvoices(page: number): Promise<InvoiceListResponse> {
  const res = await fetch(`/api/billing/invoices?page=${page}`);
  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch invoices');
  }
  return (await res.json()) as InvoiceListResponse;
}

export function useBillingPlansViewModel() {
  const query = useQuery({
    queryKey: ['billing-plans'],
    queryFn: fetchPlans,
  });

  return {
    plans: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

export function useInvoiceListViewModel(page = 1) {
  const query = useQuery({
    queryKey: ['billing-invoices', page],
    queryFn: () => fetchInvoices(page),
  });

  return {
    invoices: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
