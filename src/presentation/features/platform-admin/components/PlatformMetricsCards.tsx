'use client';

/**
 * PlatformMetricsCards — Component displaying system-wide platform metrics
 * for the Platform Admin Dashboard.
 *
 * Displays:
 * - Tenant counts by status (Active, Suspended, Closed, Provisioning)
 * - Total members and active sessions
 * - System health indicators (API response time, database latency, error rate)
 * - Health status with color coding (green/yellow/red for healthy/degraded/critical)
 *
 * RESPONSIVE DESIGN:
 * - Cards use responsive grid layout
 * - Single column on mobile, multi-column on larger screens
 * - Touch-friendly sizes with adequate padding
 *
 * ACCESSIBILITY:
 * - Health status uses both color and icon indicators
 * - Screen reader-friendly labels
 * - Proper semantic structure
 *
 * DARK MODE:
 * - Full dark mode support with appropriate color adjustments
 * - Health colors adjusted for dark backgrounds
 *
 * SECURITY CONSIDERATIONS:
 * - Access restricted to PLATFORM_ADMIN role (enforced at screen level)
 * - All data aggregated; no individual tenant data exposed
 *
 * @see Requirements 19.3 (Platform Dashboard system-wide metrics)
 * @see Design Section 11. Platform Admin Dashboard > PlatformMetricsCards
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  PlatformMetrics,
  SystemHealthStatus,
  TenantCountsByStatus,
  SystemHealth,
} from '@core/domains/platform/entities/PlatformMetrics';
import { Badge, type BadgeVariant } from '@presentation/components/atoms/Badge';
import { Spinner } from '@presentation/components/atoms/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for PlatformMetricsCards component.
 */
export interface PlatformMetricsCardsProps {
  /**
   * Platform metrics data to display.
   */
  metrics: PlatformMetrics | null;

  /**
   * Whether the metrics are currently loading.
   */
  isLoading?: boolean;

  /**
   * Whether there was an error loading metrics.
   */
  isError?: boolean;

  /**
   * Error message to display.
   */
  errorMessage?: string;

  /**
   * Callback to retry loading metrics.
   */
  onRetry?: () => void;

  /**
   * Additional CSS classes.
   */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Health status configuration with colors and icons.
 * Uses semantic colors with dark mode variants.
 */
const HEALTH_STATUS_CONFIG: Record<
  SystemHealthStatus,
  {
    color: string;
    bgColor: string;
    iconColor: string;
    badgeVariant: BadgeVariant;
  }
> = {
  healthy: {
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    iconColor: 'text-green-500 dark:text-green-400',
    badgeVariant: 'success',
  },
  degraded: {
    color: 'text-yellow-700 dark:text-yellow-300',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    iconColor: 'text-yellow-500 dark:text-yellow-400',
    badgeVariant: 'warning',
  },
  critical: {
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    iconColor: 'text-red-500 dark:text-red-400',
    badgeVariant: 'danger',
  },
};

/**
 * Tenant status icon and color configuration.
 */
const TENANT_STATUS_CONFIG: Record<
  keyof TenantCountsByStatus,
  {
    color: string;
    bgColor: string;
    iconColor: string;
  }
> = {
  active: {
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    iconColor: 'text-green-500 dark:text-green-400',
  },
  suspended: {
    color: 'text-yellow-700 dark:text-yellow-300',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    iconColor: 'text-yellow-500 dark:text-yellow-400',
  },
  closed: {
    color: 'text-gray-700 dark:text-gray-300',
    bgColor: 'bg-gray-50 dark:bg-gray-800',
    iconColor: 'text-gray-500 dark:text-gray-400',
  },
  provisioning: {
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-500 dark:text-blue-400',
  },
  total: {
    color: 'text-purple-700 dark:text-purple-300',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    iconColor: 'text-purple-500 dark:text-purple-400',
  },
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Format number with locale-aware formatting.
 */
function formatNumber(value: number, locale: string = 'id-ID'): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Format milliseconds for display.
 */
function formatMs(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`;
  }
  return `${Math.round(value)}ms`;
}

/**
 * Format percentage for display.
 */
function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

/**
 * Format date for relative time display.
 */
function formatRelativeTime(date: Date, locale: string = 'id-ID'): string {
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  if (diffSeconds < 3600) {
    return `${Math.floor(diffSeconds / 60)}m ago`;
  }
  if (diffSeconds < 86400) {
    return `${Math.floor(diffSeconds / 3600)}h ago`;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Base card component for metrics.
 */
interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  statusConfig?: {
    color: string;
    bgColor: string;
    iconColor: string;
  };
  className?: string;
  children?: React.ReactNode;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  statusConfig,
  className = '',
  children,
}: MetricCardProps) {
  const bgClass = statusConfig?.bgColor ?? 'bg-white dark:bg-gray-900';

  return (
    <div
      className={`
        rounded-xl border border-gray-200 p-5 transition-shadow hover:shadow-md
        dark:border-gray-700
        ${bgClass}
        ${className}
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {title}
          </p>
          <p
            className={`mt-2 text-3xl font-bold ${
              statusConfig?.color ?? 'text-gray-900 dark:text-gray-100'
            }`}
          >
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              {trend.direction === 'up' && (
                <TrendUpIcon className="h-4 w-4 text-green-500" />
              )}
              {trend.direction === 'down' && (
                <TrendDownIcon className="h-4 w-4 text-red-500" />
              )}
              <span
                className={`text-sm font-medium ${
                  trend.direction === 'up'
                    ? 'text-green-600 dark:text-green-400'
                    : trend.direction === 'down'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {trend.value > 0 ? '+' : ''}
                {trend.value}%
              </span>
            </div>
          )}
        </div>
        {icon && (
          <div
            className={`flex-shrink-0 rounded-lg p-2 ${
              statusConfig?.bgColor ?? 'bg-gray-100 dark:bg-gray-800'
            }`}
          >
            <div className={statusConfig?.iconColor ?? 'text-gray-500 dark:text-gray-400'}>
              {icon}
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Tenant counts card section.
 */
interface TenantCountsCardProps {
  counts: TenantCountsByStatus;
  locale: string;
}

function TenantCountsCard({ counts, locale }: TenantCountsCardProps) {
  const { t } = useTranslation();

  const items = [
    { key: 'active' as const, label: t('platform.tenant_status.active', 'Active') },
    { key: 'suspended' as const, label: t('platform.tenant_status.suspended', 'Suspended') },
    { key: 'closed' as const, label: t('platform.tenant_status.closed', 'Closed') },
    { key: 'provisioning' as const, label: t('platform.tenant_status.provisioning', 'Provisioning') },
  ];

  return (
    <MetricCard
      title={t('platform.metrics.total_tenants', 'Total Tenants')}
      value={formatNumber(counts.total, locale)}
      icon={<BuildingIcon className="h-6 w-6" />}
      statusConfig={TENANT_STATUS_CONFIG.total}
    >
      <div className="mt-4 grid grid-cols-2 gap-3">
        {items.map(({ key, label }) => {
          const config = TENANT_STATUS_CONFIG[key];
          const count = counts[key];

          return (
            <div
              key={key}
              className={`rounded-lg p-2.5 ${config.bgColor}`}
            >
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {label}
              </p>
              <p className={`mt-1 text-lg font-bold ${config.color}`}>
                {formatNumber(count, locale)}
              </p>
            </div>
          );
        })}
      </div>
    </MetricCard>
  );
}

/**
 * System health card with indicators.
 */
interface SystemHealthCardProps {
  health: SystemHealth;
  locale: string;
}

function SystemHealthCard({ health, locale }: SystemHealthCardProps) {
  const { t } = useTranslation();
  const statusConfig = HEALTH_STATUS_CONFIG[health.status];

  return (
    <MetricCard
      title={t('platform.metrics.system_health', 'System Health')}
      value={t(`platform.health_status.${health.status}`, health.status)}
      subtitle={t('platform.metrics.last_updated', 'Last updated: {{time}}', {
        time: formatRelativeTime(health.collectedAt, locale),
      })}
      icon={<HealthStatusIcon status={health.status} className="h-6 w-6" />}
      statusConfig={statusConfig}
    >
      <div className="mt-4 space-y-3">
        {/* API Response Time */}
        <HealthMetricRow
          label={t('platform.metrics.api_response_time', 'API Response Time')}
          value={formatMs(health.apiResponseTimeMs)}
          status={getMetricStatus(health.apiResponseTimeMs, 500, 2000)}
        />

        {/* Database Latency */}
        <HealthMetricRow
          label={t('platform.metrics.database_latency', 'Database Latency')}
          value={formatMs(health.databaseLatencyMs)}
          status={getMetricStatus(health.databaseLatencyMs, 100, 500)}
        />

        {/* Error Rate */}
        <HealthMetricRow
          label={t('platform.metrics.error_rate', 'Error Rate')}
          value={formatPercent(health.errorRatePercent)}
          status={getMetricStatus(health.errorRatePercent, 1, 5)}
        />
      </div>
    </MetricCard>
  );
}

/**
 * Individual health metric row.
 */
interface HealthMetricRowProps {
  label: string;
  value: string;
  status: SystemHealthStatus;
}

function HealthMetricRow({ label, value, status }: HealthMetricRowProps) {
  const config = HEALTH_STATUS_CONFIG[status];

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${config.color}`}>{value}</span>
        <HealthIndicatorDot status={status} />
      </div>
    </div>
  );
}

/**
 * Small health indicator dot with color.
 */
function HealthIndicatorDot({ status }: { status: SystemHealthStatus }) {
  const colorClass =
    status === 'healthy'
      ? 'bg-green-500 dark:bg-green-400'
      : status === 'degraded'
        ? 'bg-yellow-500 dark:bg-yellow-400'
        : 'bg-red-500 dark:bg-red-400';

  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${colorClass}`}
      role="status"
      aria-label={status}
    />
  );
}

/**
 * Determine health status based on value and thresholds.
 */
function getMetricStatus(
  value: number,
  degradedThreshold: number,
  criticalThreshold: number,
): SystemHealthStatus {
  if (value >= criticalThreshold) return 'critical';
  if (value >= degradedThreshold) return 'degraded';
  return 'healthy';
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function BuildingIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  );
}

function UsersIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function ActivityIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M22 12h-4l-3 9L9 3l-3 9H2"
      />
    </svg>
  );
}

function HealthStatusIcon({
  status,
  className = '',
}: {
  status: SystemHealthStatus;
  className?: string;
}) {
  if (status === 'healthy') {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }

  if (status === 'degraded') {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    );
  }

  // Critical
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function TrendUpIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  );
}

function TrendDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function RefreshIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Loading Skeleton
// ---------------------------------------------------------------------------

function MetricCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-3 h-8 w-16 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-2 h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="h-10 w-10 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}

function MetricsLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map(i => (
        <MetricCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error State
// ---------------------------------------------------------------------------

interface MetricsErrorStateProps {
  message: string;
  onRetry?: () => void;
}

function MetricsErrorState({ message, onRetry }: MetricsErrorStateProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-900/20">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
        <svg
          className="h-6 w-6 text-red-600 dark:text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
        {t('platform.metrics.error_title', 'Failed to load metrics')}
      </h3>
      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:bg-red-700 dark:hover:bg-red-600"
        >
          <RefreshIcon className="h-4 w-4" />
          {t('common.retry', 'Retry')}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * PlatformMetricsCards — Displays system-wide platform metrics in card layout.
 *
 * This component is designed for the Platform Admin Dashboard and shows:
 * - Tenant counts grouped by lifecycle status
 * - Total member count across all tenants
 * - Active sessions count
 * - System health indicators with status coloring
 *
 * @example
 * ```tsx
 * <PlatformMetricsCards
 *   metrics={platformMetrics}
 *   isLoading={isLoading}
 *   isError={isError}
 *   errorMessage={error?.message}
 *   onRetry={refetch}
 * />
 * ```
 *
 * @see Requirements 19.3 (Platform Dashboard system-wide metrics)
 */
export function PlatformMetricsCards({
  metrics,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  className = '',
}: PlatformMetricsCardsProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  // Handle loading state
  if (isLoading) {
    return <MetricsLoadingSkeleton />;
  }

  // Handle error state
  if (isError) {
    return (
      <MetricsErrorState
        message={errorMessage ?? t('platform.metrics.error_generic', 'An error occurred')}
        onRetry={onRetry}
      />
    );
  }

  // Handle no data state
  if (!metrics) {
    return (
      <MetricsErrorState
        message={t('platform.metrics.no_data', 'No metrics data available')}
        onRetry={onRetry}
      />
    );
  }

  return (
    <div className={`flex flex-col gap-6 ${className}`}>
      {/* Refresh Indicator */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('platform.metrics.title', 'Platform Metrics')}
        </h2>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <RefreshIcon className="h-4 w-4" />
          <span>
            {t('platform.metrics.auto_refresh', 'Auto-refresh: {{seconds}}s', {
              seconds: metrics.refreshIntervalSeconds,
            })}
          </span>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Tenant Counts Card */}
        <div className="sm:col-span-2 lg:col-span-2">
          <TenantCountsCard counts={metrics.tenantsByStatus} locale={locale} />
        </div>

        {/* Total Members Card */}
        <MetricCard
          title={t('platform.metrics.total_members', 'Total Members')}
          value={formatNumber(metrics.totalMembers, locale)}
          icon={<UsersIcon className="h-6 w-6" />}
          statusConfig={{
            color: 'text-blue-700 dark:text-blue-300',
            bgColor: 'bg-blue-50 dark:bg-blue-900/20',
            iconColor: 'text-blue-500 dark:text-blue-400',
          }}
        />

        {/* Active Sessions Card */}
        <MetricCard
          title={t('platform.metrics.active_sessions', 'Active Sessions')}
          value={formatNumber(metrics.activeSessions, locale)}
          icon={<ActivityIcon className="h-6 w-6" />}
          statusConfig={{
            color: 'text-indigo-700 dark:text-indigo-300',
            bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
            iconColor: 'text-indigo-500 dark:text-indigo-400',
          }}
        />
      </div>

      {/* System Health Card - Full Width */}
      <SystemHealthCard health={metrics.systemHealth} locale={locale} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  MetricCard,
  TenantCountsCard,
  SystemHealthCard,
  HealthMetricRow,
  HealthIndicatorDot,
  MetricCardSkeleton,
  MetricsLoadingSkeleton,
  MetricsErrorState,
  HEALTH_STATUS_CONFIG,
  TENANT_STATUS_CONFIG,
  formatNumber,
  formatMs,
  formatPercent,
  formatRelativeTime,
  getMetricStatus,
};

export type { MetricCardProps, TenantCountsCardProps, SystemHealthCardProps };

export default PlatformMetricsCards;
