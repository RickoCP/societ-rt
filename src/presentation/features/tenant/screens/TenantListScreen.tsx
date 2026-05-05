'use client';

import { useState } from 'react';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
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

  // Tenant resolve test state
  const [resolveSubdomain, setResolveSubdomain] = useState('');
  const [resolveResult, setResolveResult] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);

  const handleResolve = async () => {
    if (!resolveSubdomain.trim()) {
      setResolveError('Subdomain is required');
      return;
    }
    setResolveLoading(true);
    setResolveError(null);
    setResolveResult(null);

    try {
      const res = await fetch(
        `/api/tenants/resolve?subdomain=${encodeURIComponent(resolveSubdomain.trim())}`,
      );
      const json = await res.json();
      if (!res.ok) {
        setResolveError(`${res.status} — ${json.code}: ${json.message}`);
        return;
      }
      setResolveResult(JSON.stringify(json.data, null, 2));
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setResolveLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Tenant Management
        </h1>
      </div>

      {/* Tenant Resolve Test */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Tenant Resolve Test
        </h2>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
          Test the <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-700">GET /api/tenants/resolve?subdomain=...</code> endpoint.
          Try &quot;platform&quot; for a valid tenant or any other string for 404.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="resolve-subdomain"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Subdomain
            </label>
            <input
              id="resolve-subdomain"
              type="text"
              value={resolveSubdomain}
              onChange={e => setResolveSubdomain(e.target.value)}
              placeholder="platform"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              onKeyDown={e => e.key === 'Enter' && handleResolve()}
            />
          </div>
          <Button onClick={handleResolve} disabled={resolveLoading} variant="primary">
            {resolveLoading ? 'Resolving...' : 'Resolve'}
          </Button>
        </div>

        {resolveError && (
          <div className="mt-3">
            <ErrorMessage message={resolveError} />
          </div>
        )}

        {resolveResult && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
            <p className="mb-2 text-sm font-medium text-green-800 dark:text-green-300">
              Tenant found:
            </p>
            <pre className="overflow-x-auto rounded bg-white p-3 text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-200">
              {resolveResult}
            </pre>
          </div>
        )}
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
