'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { Badge } from '@components/atoms/Badge';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useTenantListViewModel } from '../viewModel/useTenantListViewModel';

interface TenantRow {
  id: string;
  name: string;
  subdomain: string;
  status: string;
  rtRwNumber: string;
  region: string;
  createdAt: string;
}

const columns: DataTableColumn<TenantRow>[] = [
  { key: 'name', header: 'Name' },
  { key: 'subdomain', header: 'Subdomain' },
  { key: 'rtRwNumber', header: 'RT/RW' },
  { key: 'region', header: 'Region' },
  {
    key: 'status',
    header: 'Status',
    render: row => (
      <Badge variant={row.status === 'active' ? 'success' : 'warning'}>
        {row.status}
      </Badge>
    ),
  },
];

export function TenantListScreen() {
  const [page, setPage] = useState(1);
  const { tenants, totalPages, isLoading, isError, error } =
    useTenantListViewModel(page);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Tenant Management
        </h1>
      </div>

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load tenants'} />
      )}

      <DataTable<TenantRow>
        columns={columns}
        data={tenants}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage="No tenants found"
      />
    </div>
  );
}
