'use client';

/**
 * PlatformDashboardScreen — Platform Admin Dashboard for system-wide monitoring.
 *
 * Displays:
 * - System-wide metrics (tenant counts, member counts, active sessions, health indicators)
 * - Tenant overview table with filtering and sorting
 * - Recent system alerts and warnings
 * - Auto-refresh with visual indicator
 *
 * This screen is restricted to PLATFORM_ADMIN role only.
 *
 * This screen follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * @see Requirements 19.1-19.11 (Platform Admin Dashboard)
 * @see Design Components > 11. Platform Admin Dashboard
 */

import { useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import { Spinner } from '@presentation/components/atoms/Spinner';
import { DataTable, type DataTableColumn, type SortDirection } from '@presentation/components/organisms/DataTable';
import { FilterPanel, type FilterDefinition, type FilterValue } from '@presentation/components/molecules/FilterPanel';
import { EmptyState } from '@presentation/components/molecules/EmptyState';
import {
  usePlatformDashboardViewModel,
  type SortDirection as ViewModelSortDirection,
} from '../viewModel/usePlatformDashboardViewModel';
import type { TenantOverview, TenantOverviewSortColumn } from '@core/domains/platform/entities/TenantOverview';
import type { SystemAlert, AlertSeverity } from '@core/domains/platform/entities/PlatformMetrics';
import type { LifecycleStatusValue } from '@core/domains/tenant/entities/TenantLifecycleStatus';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Lifecycle status display configuration.
 */
const LIFECYCLE_STATUS_CONFIG: Record<
  LifecycleStatusValue,
  { label: string; color: string }
> = {
  PROVISIONING: {
    label: 'Provisioning',
    color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30',
  },
  ACTIVE: {
    label: 'Active',
    color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30',
  },
  SUSPENDED: {
    label: 'Suspended',
    color: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30',
  },
  CLOSING: {
    label: 'Closing',
    color: 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30',
  },
  CLOSED: {
    label: 'Closed',
    color: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30',
  },
  PURGED: {
    label: 'Purged',
    color: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30',
  },
};

/**
 * Alert severity display configuration.
 */
const ALERT_SEVERITY_CONFIG: Record<AlertSeverity, { label: string; color: string }> = {
  critical: {
    label: 'Critical',
    color: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30',
  },
  high: {
    label: 'High',
    color: 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30',
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30',
  },
  low: {
    label: 'Low',
    color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30',
  },
  info: {
    label: 'Info',
    color: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30',
  },
};

/**
 * System health status configuration.
 */
const HEALTH_STATUS_CONFIG = {
  healthy: {
    label: 'Healthy',
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    icon: '✓',
  },
  degraded: {
    label: 'Degraded',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    icon: '⚠',
  },
  critical: {
    label: 'Critical',
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    icon: '✕',
  },
} as const;

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Lifecycle status badge component.
 */
function LifecycleStatusBadge({ status }: { status: LifecycleStatusValue }) {
  const config = LIFECYCLE_STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

/**
 * Alert severity badge component.
 */
function AlertSeverityBadge({ severity }: { severity: AlertSeverity }) {
  const config = ALERT_SEVERITY_CONFIG[severity];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

/**
 * Metric card component.
 */
function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className = '',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { direction: 'up' | 'down' | 'neutral'; value: string };
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900 ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          )}
          {trend && (
            <p
              className={`mt-1 flex items-center text-sm ${
                trend.direction === 'up'
                  ? 'text-green-600'
                  : trend.direction === 'down'
                    ? 'text-red-600'
                    : 'text-gray-500'
              }`}>
              {trend.direction === 'up' && '↑'}
              {trend.direction === 'down' && '↓'}
              {trend.value}
            </p>
          )}
        </div>
        {icon && (
          <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-800">{icon}</div>
        )}
      </div>
    </div>
  );
}

/**
 * System health card component.
 */
function SystemHealthCard({
  status,
  apiResponseTimeMs,
  databaseLatencyMs,
  errorRatePercent,
}: {
  status: 'healthy' | 'degraded' | 'critical';
  apiResponseTimeMs: number;
  databaseLatencyMs: number;
  errorRatePercent: number;
}) {
  const { t } = useTranslation();
  const config = HEALTH_STATUS_CONFIG[status];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {t('platform.system_health', 'System Health')}
          </p>
          <p className={`mt-1 text-2xl font-semibold ${config.color}`}>
            {config.icon} {config.label}
          </p>
        </div>
        <div className={`rounded-full p-2 ${config.bgColor}`}>
          <svg
            className={`h-6 w-6 ${config.color}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-200 pt-4 dark:border-gray-700">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('platform.api_response', 'API Response')}
          </p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {apiResponseTimeMs}ms
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('platform.db_latency', 'DB Latency')}
          </p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {databaseLatencyMs}ms
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('platform.error_rate', 'Error Rate')}
          </p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {errorRatePercent.toFixed(2)}%
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for the dashboard.
 */
function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Metrics skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-lg bg-gray-200 dark:bg-gray-700"
          />
        ))}
      </div>

      {/* System health skeleton */}
      <div className="h-40 rounded-lg bg-gray-200 dark:bg-gray-700" />

      {/* Table skeleton */}
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="h-10 w-64 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-10 w-32 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-10 w-32 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="h-96 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}

/**
 * Error state component with retry button.
 */
function DashboardError({
  error,
  onRetry,
}: {
  error: { code: string; message: string } | null;
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
        {t('platform.fetch_error', 'Failed to load dashboard data')}
      </h3>
      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
        {t('platform.generic_error', 'An error occurred while loading the dashboard. Please try again.')}
      </p>
      {error?.code && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-500">
          {t('common.error_code', 'Error code: {{code}}', { code: error.code })}
        </p>
      )}
      <Button variant="primary" size="sm" onClick={onRetry} className="mt-4">
        {t('platform.retry', 'Retry')}
      </Button>
    </div>
  );
}

/**
 * Unauthorized page component.
 */
function UnauthorizedPage() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center">
      <svg
        className="mb-4 h-16 w-16 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
        {t('platform.unauthorized', 'Access Denied')}
      </h2>
      <p className="mt-2 text-gray-500 dark:text-gray-400">
        {t(
          'platform.unauthorized_description',
          'You do not have permission to access the Platform Admin Dashboard.',
        )}
      </p>
      <Button variant="secondary" onClick={() => router.push('/dashboard')} className="mt-6">
        {t('platform.go_to_dashboard', 'Go to Dashboard')}
      </Button>
    </div>
  );
}

/**
 * Alert list item component.
 */
function AlertListItem({
  alert,
  onAcknowledge,
}: {
  alert: SystemAlert;
  onAcknowledge: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start justify-between border-b border-gray-200 py-3 last:border-0 dark:border-gray-700">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <AlertSeverityBadge severity={alert.severity} />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {alert.title}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{alert.message}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
          {alert.tenantName && <span>{alert.tenantName}</span>}
          <span>•</span>
          <span>{new Date(alert.createdAt).toLocaleString()}</span>
        </div>
      </div>
      {!alert.acknowledged && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAcknowledge(alert.id)}
          className="ml-4 shrink-0">
          {t('platform.acknowledge', 'Acknowledge')}
        </Button>
      )}
    </div>
  );
}

/**
 * Auto-refresh indicator component.
 */
function RefreshIndicator({
  countdown,
  isActive,
  lastUpdated,
  onToggle,
  onRefresh,
}: {
  countdown: number;
  isActive: boolean;
  lastUpdated: Date | null;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
      {lastUpdated && (
        <span>
          {t('platform.last_updated', 'Last updated')}: {lastUpdated.toLocaleTimeString()}
        </span>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggle}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
            isActive
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}
          aria-label={isActive ? t('platform.disable_auto_refresh', 'Disable auto-refresh') : t('platform.enable_auto_refresh', 'Enable auto-refresh')}>
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {isActive ? `${countdown}s` : t('platform.paused', 'Paused')}
        </button>
        <Button variant="ghost" size="sm" onClick={onRefresh} aria-label={t('platform.refresh_now', 'Refresh now')}>
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * PlatformDashboardContent — The main content of the Platform Dashboard screen.
 */
function PlatformDashboardContent() {
  const { t } = useTranslation();
  const vm = usePlatformDashboardViewModel();

  // ---------------------------------------------------------------------------
  // Filter Configuration
  // ---------------------------------------------------------------------------

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      {
        key: 'search',
        label: t('platform.filter_search', 'Search'),
        type: 'text',
        placeholder: t('platform.filter_search_placeholder', 'Search tenants...'),
      },
      {
        key: 'status',
        label: t('platform.filter_status', 'Status'),
        type: 'select',
        options: Object.entries(LIFECYCLE_STATUS_CONFIG).map(([value, config]) => ({
          value,
          label: config.label,
        })),
      },
      {
        key: 'plan',
        label: t('platform.filter_plan', 'Plan'),
        type: 'select',
        options: [
          { value: 'Basic', label: 'Basic' },
          { value: 'Standard', label: 'Standard' },
          { value: 'Pro', label: 'Pro' },
        ],
      },
    ],
    [t],
  );

  const filterValues = useMemo(
    () => ({
      search: vm.tenantFilters.search,
      status: vm.tenantFilters.status ?? '',
      plan: vm.tenantFilters.plan ?? '',
    }),
    [vm.tenantFilters],
  );

  const handleFilterChange = useCallback(
    (key: string, value: FilterValue) => {
      if (key === 'search') {
        vm.setTenantFilters({ search: value as string });
      } else if (key === 'status') {
        vm.setTenantFilters({ status: value ? (value as LifecycleStatusValue) : null });
      } else if (key === 'plan') {
        vm.setTenantFilters({ plan: value ? (value as string) : null });
      }
    },
    [vm],
  );

  // ---------------------------------------------------------------------------
  // Table Columns
  // ---------------------------------------------------------------------------

  const columns = useMemo<DataTableColumn<TenantOverview>[]>(
    () => [
      {
        key: 'name',
        header: t('platform.column_name', 'Tenant Name'),
        sortable: true,
        render: row => (
          <div className="flex items-center gap-3">
            {row.logoUrl ? (
              <img
                src={row.logoUrl}
                alt={row.name}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {row.name.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-medium text-gray-900 dark:text-white">{row.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{row.slug}</div>
            </div>
          </div>
        ),
      },
      {
        key: 'status',
        header: t('platform.column_status', 'Status'),
        sortable: true,
        render: row => <LifecycleStatusBadge status={row.status} />,
      },
      {
        key: 'memberCount',
        header: t('platform.column_members', 'Members'),
        sortable: true,
        render: row => (
          <span className="text-gray-600 dark:text-gray-300">{row.memberCount}</span>
        ),
      },
      {
        key: 'subscriptionPlan',
        header: t('platform.column_plan', 'Plan'),
        sortable: true,
        render: row => (
          <div>
            <span className="font-medium text-gray-900 dark:text-white">
              {row.subscription.planName}
            </span>
            {row.subscription.isTrial && (
              <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                ({row.subscription.trialDaysRemaining}d trial)
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'createdAt',
        header: t('platform.column_created', 'Created'),
        sortable: true,
        render: row => (
          <span className="text-gray-600 dark:text-gray-300">
            {new Date(row.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        key: 'lastActivityAt',
        header: t('platform.column_last_activity', 'Last Activity'),
        sortable: true,
        render: row => (
          <span className="text-gray-600 dark:text-gray-300">
            {row.lastActivityAt
              ? new Date(row.lastActivityAt).toLocaleDateString()
              : t('platform.never', 'Never')}
          </span>
        ),
      },
    ],
    [t],
  );

  // ---------------------------------------------------------------------------
  // Sort Handler
  // ---------------------------------------------------------------------------

  const handleSortChange = useCallback(
    (column: string, direction: SortDirection) => {
      vm.setTenantSort(column as TenantOverviewSortColumn, direction as ViewModelSortDirection);
    },
    [vm],
  );

  // ---------------------------------------------------------------------------
  // Row Click Handler
  // ---------------------------------------------------------------------------

  const handleRowClick = useCallback(
    (tenant: TenantOverview) => {
      vm.navigateToTenant(tenant.id);
    },
    [vm],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Authorization loading
  if (vm.isAuthLoading) {
    return <DashboardSkeleton />;
  }

  // Unauthorized
  if (!vm.isPlatformAdmin) {
    return <UnauthorizedPage />;
  }

  // Data loading
  if (vm.isMetricsLoading && !vm.metrics) {
    return <DashboardSkeleton />;
  }

  // Error state
  if (vm.isMetricsError && !vm.metrics) {
    return <DashboardError error={vm.metricsError} onRetry={vm.refreshMetrics} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {t('platform.title', 'Platform Dashboard')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('platform.subtitle', 'Monitor and manage all tenants across the platform')}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <RefreshIndicator
            countdown={vm.refreshCountdown}
            isActive={vm.isAutoRefreshActive}
            lastUpdated={vm.metricsLastUpdated}
            onToggle={vm.toggleAutoRefresh}
            onRefresh={vm.refreshMetrics}
          />
          <Button variant="primary" onClick={vm.provisionNewTenant}>
            {t('platform.provision_tenant', 'Provision New Tenant')}
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      {vm.metrics && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title={t('platform.active_tenants', 'Active Tenants')}
              value={vm.metrics.tenantsByStatus.active}
              subtitle={t('platform.total_tenants', '{{count}} total', {
                count:
                  vm.metrics.tenantsByStatus.active +
                  vm.metrics.tenantsByStatus.suspended +
                  vm.metrics.tenantsByStatus.closed +
                  vm.metrics.tenantsByStatus.provisioning,
              })}
              icon={
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              }
            />
            <MetricCard
              title={t('platform.suspended_tenants', 'Suspended')}
              value={vm.metrics.tenantsByStatus.suspended}
              icon={
                <svg
                  className="h-6 w-6 text-yellow-600"
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
              }
            />
            <MetricCard
              title={t('platform.total_members', 'Total Members')}
              value={vm.metrics.totalMembers.toLocaleString()}
              icon={
                <svg
                  className="h-6 w-6 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              }
            />
            <MetricCard
              title={t('platform.active_sessions', 'Active Sessions')}
              value={vm.metrics.activeSessions.toLocaleString()}
              icon={
                <svg
                  className="h-6 w-6 text-purple-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              }
            />
          </div>

          {/* System Health Card */}
          <SystemHealthCard
            status={vm.metrics.systemHealth.status}
            apiResponseTimeMs={vm.metrics.systemHealth.apiResponseTimeMs}
            databaseLatencyMs={vm.metrics.systemHealth.databaseLatencyMs}
            errorRatePercent={vm.metrics.systemHealth.errorRatePercent}
          />
        </>
      )}

      {/* Alerts Section */}
      {vm.alerts.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('platform.recent_alerts', 'Recent Alerts')}
              {vm.criticalAlertCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
                  {vm.criticalAlertCount}
                </span>
              )}
            </h2>
          </div>
          <div className="mt-4">
            {vm.alerts.slice(0, 5).map(alert => (
              <AlertListItem
                key={alert.id}
                alert={alert}
                onAcknowledge={vm.acknowledgeAlert}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tenant Overview Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('platform.tenant_overview', 'Tenant Overview')}
          </h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {t('platform.tenant_count', '{{count}} tenants', { count: vm.tenantTotalCount })}
          </span>
        </div>

        {/* Filters */}
        <FilterPanel
          filters={filterDefinitions}
          values={filterValues}
          onChange={handleFilterChange}
          onClear={vm.clearTenantFilters}
          onApply={() => {}} // Filters are applied immediately
          applyLabel={t('platform.apply_filters', 'Apply')}
          clearLabel={t('platform.clear_filters', 'Clear')}
        />

        {/* Tenant Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          {vm.isTenantsLoading && vm.tenants.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : vm.tenants.length === 0 ? (
            <EmptyState
              title={t('platform.no_tenants', 'No tenants found')}
              description={t(
                'platform.no_tenants_description',
                'Try adjusting your filters or provision a new tenant.',
              )}
              action={
                <Button variant="primary" size="sm" onClick={vm.provisionNewTenant}>
                  {t('platform.provision_tenant', 'Provision New Tenant')}
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={vm.tenants}
              rowKey={row => row.id}
              loading={vm.isTenantsLoading}
              emptyMessage={t('platform.no_tenants', 'No tenants found')}
              sortable
              sortColumn={vm.tenantSortColumn}
              sortDirection={vm.tenantSortDirection}
              onSortChange={handleSortChange}
              page={vm.tenantPage}
              totalPages={vm.tenantTotalPages}
              onPageChange={vm.setTenantPage}
              onRowClick={handleRowClick}
            />
          )}
        </div>

        {/* Page Size Selector */}
        {vm.tenants.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <label
                htmlFor="tenant-page-size"
                className="text-gray-500 dark:text-gray-400">
                {t('platform.page_size', 'Show')}
              </label>
              <select
                id="tenant-page-size"
                value={vm.tenantPageSize}
                onChange={e =>
                  vm.setTenantPageSize(Number(e.target.value) as 10 | 25 | 50 | 100)
                }
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800">
                {[10, 25, 50, 100].map(size => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span className="text-gray-500 dark:text-gray-400">
                {t('platform.per_page', 'per page')}
              </span>
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('platform.showing_range', 'Showing {{from}}-{{to}} of {{total}}', {
                from: (vm.tenantPage - 1) * vm.tenantPageSize + 1,
                to: Math.min(vm.tenantPage * vm.tenantPageSize, vm.tenantTotalCount),
                total: vm.tenantTotalCount,
              })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported Component
// ---------------------------------------------------------------------------

/**
 * PlatformDashboardScreen — The Platform Admin Dashboard screen.
 *
 * Requires PLATFORM_ADMIN role to access. Displays system-wide metrics,
 * tenant overview table, and recent alerts.
 *
 * @example
 * ```tsx
 * // In app/dashboard/admin/page.tsx
 * import { PlatformDashboardScreen } from '@presentation/features/platform-admin';
 *
 * export default function PlatformAdminPage() {
 *   return <PlatformDashboardScreen />;
 * }
 * ```
 *
 * @see Requirements 19.1-19.11
 */
export function PlatformDashboardScreen() {
  return <PlatformDashboardContent />;
}

export default PlatformDashboardScreen;
