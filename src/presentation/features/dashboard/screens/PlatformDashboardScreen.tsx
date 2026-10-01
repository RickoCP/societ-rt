'use client';

/**
 * PlatformDashboardScreen — Dashboard screen for platform metrics overview.
 *
 * Displays platform-wide metrics:
 * - Total tenants and tenant status breakdown
 * - Total users
 * - Monthly revenue
 * - Pending invoices
 *
 * This screen follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * Features:
 * - Grid of metric cards
 * - Loading skeleton while fetching
 * - Error state with retry button
 *
 * @see Requirements 24.1-24.2 (Loading and Error States)
 */

import { useTranslation } from 'react-i18next';
import { Button } from '@components/atoms/Button';
import { usePlatformDashboardViewModel } from '../viewModel/usePlatformDashboardViewModel';

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

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

/**
 * Loading skeleton for the dashboard screen.
 * Matches the layout of actual content to prevent layout shift.
 *
 * @see Requirements 24.1, 24.2 (Loading skeletons matching content layout)
 */
function PlatformDashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Title skeleton */}
      <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700" />

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mt-2 h-8 w-16 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Error state component with retry button.
 *
 * @see Requirements 24.3 (Error state with retry button)
 */
function PlatformDashboardError({
  error,
  onRetry,
}: {
  error: { message?: string } | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 py-12 dark:border-red-900 dark:bg-red-900/20">
      <svg
        className="mb-4 h-12 w-12 text-red-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <h3 className="text-lg font-medium text-red-800 dark:text-red-200">
        {t('platform.fetch_error', 'Failed to load platform dashboard')}
      </h3>
      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
        {error?.message ??
          t(
            'platform.generic_error',
            'An error occurred while fetching dashboard data.',
          )}
      </p>
      <Button variant="primary" size="sm" onClick={onRetry} className="mt-4">
        {t('platform.retry', 'Retry')}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * PlatformDashboardScreen — The Platform Dashboard screen displaying metrics.
 *
 * @see Requirements 24.1-24.2 (Loading states)
 * @see Requirements 24.3 (Error state with retry)
 */
export function PlatformDashboardScreen() {
  const { t } = useTranslation();
  const { metrics, isLoading, isError, error, refetch } = usePlatformDashboardViewModel();

  // Show loading skeleton during initial load
  if (isLoading) {
    return <PlatformDashboardSkeleton />;
  }

  // Show error state with retry
  if (isError || !metrics) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('platform.title', 'Platform Administration')}
        </h1>
        <PlatformDashboardError error={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('platform.title', 'Platform Administration')}
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label={t('platform.total_tenants', 'Total Tenants')} value={metrics.totalTenants} />
        <MetricCard label={t('platform.active_tenants', 'Active Tenants')} value={metrics.activeTenants} />
        <MetricCard label={t('platform.suspended_tenants', 'Suspended Tenants')} value={metrics.suspendedTenants} />
        <MetricCard label={t('platform.total_users', 'Total Users')} value={metrics.totalUsers} />
        <MetricCard label={t('platform.monthly_revenue', 'Monthly Revenue')} value={`Rp ${(metrics.monthlyRevenue ?? 0).toLocaleString()}`} />
        <MetricCard label={t('platform.pending_invoices', 'Pending Invoices')} value={metrics.pendingInvoices} />
      </div>
    </div>
  );
}
