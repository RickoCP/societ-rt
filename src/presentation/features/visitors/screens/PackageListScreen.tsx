'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { usePackageListViewModel } from '../viewModel/usePackageListViewModel';

interface PackageRow {
  id: string;
  recipientName: string;
  courier: string;
  trackingNumber: string | null;
  status: 'received' | 'collected';
  receivedAt: string;
  collectedAt: string | null;
}

const columns: DataTableColumn<PackageRow>[] = [
  { key: 'recipientName', header: 'Recipient' },
  { key: 'courier', header: 'Courier' },
  { key: 'trackingNumber', header: 'Tracking #' },
  {
    key: 'status',
    header: 'Status',
    render: row => (
      <Badge variant={row.status === 'collected' ? 'success' : 'warning'}>
        {row.status}
      </Badge>
    ),
  },
  { key: 'receivedAt', header: 'Received' },
];

export function PackageListScreen() {
  const [page, setPage] = useState(1);
  const { packages, totalPages, isLoading, isError, error } =
    usePackageListViewModel(page);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Package Log
      </h1>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load packages'} />
      )}

      <DataTable<PackageRow>
        columns={columns}
        data={packages}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No package records found"
      />
    </div>
  );
}
