'use client';

import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { usePlatformDashboardViewModel } from '../viewModel/usePlatformDashboardViewModel';

interface MetricCardProps {
  label: string;
  value: string | number;
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

export function PlatformDashboardScreen() {
  const { metrics, isLoading, isError, error } = usePlatformDashboardViewModel();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorMessage message={error?.message ?? 'Failed to load platform dashboard'} />
    );
  }

  if (!metrics) {
    return <ErrorMessage message="No platform data available" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Platform Administration
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Total Tenants" value={metrics.totalTenants} />
        <MetricCard label="Active Tenants" value={metrics.activeTenants} />
        <MetricCard label="Suspended Tenants" value={metrics.suspendedTenants} />
        <MetricCard label="Total Users" value={metrics.totalUsers} />
        <MetricCard label="Monthly Revenue" value={`Rp ${metrics.monthlyRevenue.toLocaleString()}`} />
        <MetricCard label="Pending Invoices" value={metrics.pendingInvoices} />
      </div>
    </div>
  );
}
