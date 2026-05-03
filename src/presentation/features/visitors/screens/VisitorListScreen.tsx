'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useVisitorListViewModel } from '../viewModel/useVisitorListViewModel';

interface VisitorRow {
  id: string;
  visitorName: string;
  purpose: string;
  destinationHousehold: string;
  checkInAt: string;
  checkOutAt: string | null;
}

const columns: DataTableColumn<VisitorRow>[] = [
  { key: 'visitorName', header: 'Visitor' },
  { key: 'purpose', header: 'Purpose' },
  { key: 'destinationHousehold', header: 'Destination' },
  { key: 'checkInAt', header: 'Check In' },
  {
    key: 'checkOutAt',
    header: 'Status',
    render: row => (
      <Badge variant={row.checkOutAt ? 'default' : 'success'}>
        {row.checkOutAt ? 'Left' : 'On-site'}
      </Badge>
    ),
  },
];

export function VisitorListScreen() {
  const [page, setPage] = useState(1);
  const { visitors, totalPages, isLoading, isError, error } =
    useVisitorListViewModel(page);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Visitor Log
      </h1>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load visitors'} />
      )}

      <DataTable<VisitorRow>
        columns={columns}
        data={visitors}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No visitor records found"
      />
    </div>
  );
}
