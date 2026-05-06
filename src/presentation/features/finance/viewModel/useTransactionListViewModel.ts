'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  date: string;
  createdBy: string;
}

interface TransactionListResponse {
  data: Transaction[];
  balance: number;
  total: number;
  page: number;
  totalPages: number;
}

interface CreateTransactionParams {
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  date: string;
}

interface RecordIuranParams {
  householdId: string;
  month: string;
  transactionId: string;
}

async function fetchTransactions(
  page: number,
): Promise<TransactionListResponse> {
  const res = await fetch(`/api/finance/transactions?page=${page}`);

  if (!res.ok) {
    const body = (await res.json()) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch transactions');
  }

  return (await res.json()) as TransactionListResponse;
}

async function createTransactionRequest(params: CreateTransactionParams): Promise<{ id: string }> {
  const res = await fetch('/api/finance/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string; code?: string };
    throw new Error(body.message ?? body.code ?? 'Failed to create transaction');
  }
  const json = (await res.json()) as { data: { id: string } };
  return json.data;
}

async function recordIuranRequest(params: RecordIuranParams): Promise<void> {
  const res = await fetch('/api/finance/iuran', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = (await res.json()) as { message?: string; code?: string };
    throw new Error(body.message ?? body.code ?? 'Failed to record iuran');
  }
}

async function checkIuranRequest(params: { householdId: string; month: string }): Promise<unknown> {
  const res = await fetch(`/api/finance/iuran?householdId=${params.householdId}&month=${params.month}`);
  if (!res.ok) {
    const body = (await res.json()) as { message?: string; code?: string };
    throw new Error(body.message ?? body.code ?? 'Not found');
  }
  const json = (await res.json()) as { data: unknown };
  return json.data;
}

async function fetchReportRequest(params: { startDate: string; endDate: string }): Promise<unknown> {
  const res = await fetch(`/api/finance/report?startDate=${params.startDate}&endDate=${params.endDate}`);
  if (!res.ok) {
    const body = (await res.json()) as { message?: string; code?: string };
    throw new Error(body.message ?? body.code ?? 'Failed to get report');
  }
  const json = (await res.json()) as { data: unknown };
  return json.data;
}

export function useTransactionListViewModel(page = 1) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['transactions', page],
    queryFn: () => fetchTransactions(page),
  });

  const createTxMutation = useMutation({
    mutationFn: createTransactionRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const recordIuranMutation = useMutation({
    mutationFn: recordIuranRequest,
  });

  const checkIuranMutation = useMutation({
    mutationFn: checkIuranRequest,
  });

  const reportMutation = useMutation({
    mutationFn: fetchReportRequest,
  });

  return {
    transactions: query.data?.data ?? [],
    balance: query.data?.balance ?? 0,
    total: query.data?.total ?? 0,
    totalPages: query.data?.totalPages ?? 1,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    createTransaction: createTxMutation.mutateAsync,
    isCreatingTx: createTxMutation.isPending,
    createTxError: createTxMutation.error,
    recordIuran: recordIuranMutation.mutateAsync,
    isRecordingIuran: recordIuranMutation.isPending,
    recordIuranError: recordIuranMutation.error,
    checkIuran: checkIuranMutation.mutateAsync,
    checkIuranError: checkIuranMutation.error,
    fetchReport: reportMutation.mutateAsync,
    isFetchingReport: reportMutation.isPending,
    reportError: reportMutation.error,
  };
}
