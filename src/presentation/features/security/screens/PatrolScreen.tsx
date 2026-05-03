'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { usePatrolViewModel } from '../viewModel/usePatrolViewModel';

interface PatrolRow {
  id: string;
  date: string;
  shift: string;
  assignedGuard: string;
  status: string;
  checkedInAt: string | null;
}

const columns: DataTableColumn<PatrolRow>[] = [
  { key: 'date', header: 'Date' },
  { key: 'shift', header: 'Shift' },
  { key: 'assignedGuard', header: 'Guard' },
  {
    key: 'status',
    header: 'Status',
    render: row => (
      <Badge
        variant={
          row.status === 'completed'
            ? 'success'
            : row.status === 'in_progress'
              ? 'info'
              : 'default'
        }>
        {row.status.replace('_', ' ')}
      </Badge>
    ),
  },
  {
    key: 'checkedInAt',
    header: 'Check-in',
    render: row => (
      <span className="text-sm text-gray-500 dark:text-gray-400">
        {row.checkedInAt ?? 'Not checked in'}
      </span>
    ),
  },
];

export function PatrolScreen() {
  const [page, setPage] = useState(1);
  const { patrols, totalPages, isLoading, isError, error, checkIn, isCheckingIn } =
    usePatrolViewModel(page);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Security Patrols
        </h1>
        <Button loading={isCheckingIn} onClick={() => checkIn()}>
          Check In
        </Button>
      </div>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load patrols'} />
      )}

      <DataTable<PatrolRow>
        columns={columns}
        data={patrols}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No patrol schedules found"
      />
    </div>
  );
}
