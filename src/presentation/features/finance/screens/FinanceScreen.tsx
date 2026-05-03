'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useTransactionListViewModel } from '../viewModel/useTransactionListViewModel';

interface TransactionRow {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  date: string;
  createdBy: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

const columns: DataTableColumn<TransactionRow>[] = [
  { key: 'date', header: 'Date' },
  { key: 'description', header: 'Description' },
  { key: 'category', header: 'Category' },
  {
    key: 'type',
    header: 'Type',
    render: row => (
      <Badge variant={row.type === 'income' ? 'success' : 'danger'}>
        {row.type}
      </Badge>
    ),
  },
  {
    key: 'amount',
    header: 'Amount',
    render: row => (
      <span
        className={
          row.type === 'income'
            ? 'text-green-600 dark:text-green-400'
            : 'text-red-600 dark:text-red-400'
        }>
        {row.type === 'income' ? '+' : '-'}
        {formatCurrency(row.amount)}
      </span>
    ),
  },
];

export function FinanceScreen() {
  const [page, setPage] = useState(1);
  const { transactions, balance, totalPages, isLoading, isError, error } =
    useTransactionListViewModel(page);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Finance Management
        </h1>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Current Balance
        </p>
        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          {formatCurrency(balance)}
        </p>
      </div>

      {isError && (
        <ErrorMessage
          message={error?.message ?? 'Failed to load transactions'}
        />
      )}

      <DataTable<TransactionRow>
        columns={columns}
        data={transactions}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No transactions found"
      />
    </div>
  );
}
