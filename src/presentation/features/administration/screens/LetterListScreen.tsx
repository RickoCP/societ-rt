'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useLetterListViewModel } from '../viewModel/useLetterListViewModel';

interface LetterRow {
  id: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  documentUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

type StatusVariant = 'warning' | 'success' | 'danger' | 'default';

const statusVariantMap: Record<string, StatusVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const columns: DataTableColumn<LetterRow>[] = [
  { key: 'type', header: 'Type' },
  {
    key: 'status',
    header: 'Status',
    render: row => (
      <Badge variant={statusVariantMap[row.status] ?? 'default'}>
        {row.status}
      </Badge>
    ),
  },
  { key: 'requestedBy', header: 'Requested By' },
  { key: 'createdAt', header: 'Date' },
];

export function LetterListScreen() {
  const [page, setPage] = useState(1);
  const { letters, totalPages, isLoading, isError, error } =
    useLetterListViewModel(page);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Letter Requests
        </h1>
      </div>

      {isError && (
        <ErrorMessage
          message={error?.message ?? 'Failed to load letter requests'}
        />
      )}

      <DataTable<LetterRow>
        columns={columns}
        data={letters}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No letter requests found"
      />
    </div>
  );
}
