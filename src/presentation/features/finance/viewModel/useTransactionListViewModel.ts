'use client';

import { useQuery } from '@tanstack/react-query';

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

export function useTransactionListViewModel(page = 1) {
  const query = useQuery({
    queryKey: ['transactions', page],
    queryFn: () => fetchTransactions(page),
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
  };
}
