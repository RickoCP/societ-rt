'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useAuditLogViewModel } from '../viewModel/useAuditLogViewModel';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  details: string;
  createdAt: string;
}

const columns: DataTableColumn<AuditRow>[] = [
  { key: 'action', header: 'Action' },
  { key: 'entityType', header: 'Entity' },
  { key: 'userName', header: 'User' },
  { key: 'details', header: 'Details' },
  { key: 'createdAt', header: 'Date' },
];

export function AuditLogScreen() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const filters = {
    action: actionFilter || undefined,
    entityType: entityFilter || undefined,
  };

  const { entries, totalPages, isLoading, isError, error } =
    useAuditLogViewModel(page, filters);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Audit Log
      </h1>

      <div className="flex gap-4">
        <input
          placeholder="Filter by action"
          value={actionFilter}
          onChange={e => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        <input
          placeholder="Filter by entity type"
          value={entityFilter}
          onChange={e => {
            setEntityFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load audit log'} />
      )}

      <DataTable<AuditRow>
        columns={columns}
        data={entries}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No audit entries found"
      />
    </div>
  );
}
