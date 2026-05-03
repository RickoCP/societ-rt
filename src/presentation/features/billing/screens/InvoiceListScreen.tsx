'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useInvoiceListViewModel } from '../viewModel/useBillingViewModel';

interface InvoiceRow {
  id: string;
  planName: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed';
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
}

type StatusVariant = 'warning' | 'success' | 'danger' | 'default';

const statusVariantMap: Record<string, StatusVariant> = {
  pending: 'warning',
  paid: 'success',
  failed: 'danger',
};

const columns: DataTableColumn<InvoiceRow>[] = [
  { key: 'planName', header: 'Plan' },
  {
    key: 'amount',
    header: 'Amount',
    render: row => <span>Rp {row.amount.toLocaleString()}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: row => (
      <Badge variant={statusVariantMap[row.status] ?? 'default'}>
        {row.status}
      </Badge>
    ),
  },
  { key: 'dueDate', header: 'Due Date' },
  { key: 'createdAt', header: 'Created' },
];

export function InvoiceListScreen() {
  const [page, setPage] = useState(1);
  const { invoices, totalPages, isLoading, isError, error } =
    useInvoiceListViewModel(page);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Invoices
      </h1>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load invoices'} />
      )}

      <DataTable<InvoiceRow>
        columns={columns}
        data={invoices}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No invoices found"
      />
    </div>
  );
}
