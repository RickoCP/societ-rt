'use client';

import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useKetuaDashboardViewModel } from '../viewModel/useKetuaDashboardViewModel';

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

export function KetuaDashboardScreen() {
  const { metrics, isLoading, isError, error } = useKetuaDashboardViewModel();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorMessage message={error?.message ?? 'Failed to load dashboard'} />
    );
  }

  if (!metrics) {
    return <ErrorMessage message="No dashboard data available" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Dashboard
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Residents" value={metrics.totalResidents} />
        <MetricCard label="Households" value={metrics.totalHouseholds} />
        <MetricCard label="Pending Letters" value={metrics.pendingLetters} />
        <MetricCard label="Active Emergencies" value={metrics.activeEmergencies} />
        <MetricCard label="Upcoming Events" value={metrics.upcomingEvents} />
        <MetricCard label="Unpaid Iuran" value={metrics.unpaidIuran} />
        <MetricCard label="Current Balance" value={`Rp ${metrics.currentBalance.toLocaleString()}`} />
      </div>
    </div>
  );
}
