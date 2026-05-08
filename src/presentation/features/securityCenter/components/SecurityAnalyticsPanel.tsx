'use client';

import { Spinner } from '@components/atoms/Spinner';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useSecurityAnalyticsViewModel } from '../viewModel/useSecurityAnalyticsViewModel';
import type { AnalyticsDays } from '../viewModel/useSecurityAnalyticsViewModel';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS_OPTIONS: { value: AnalyticsDays; label: string }[] = [
  { value: 7, label: '7 Days' },
  { value: 14, label: '14 Days' },
  { value: 30, label: '30 Days' },
  { value: 90, label: '90 Days' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function BarChart({
  items,
  labelKey,
  valueKey,
}: {
  items: { label: string; value: number }[];
  labelKey: string;
  valueKey: string;
}) {
  const maxValue = Math.max(...items.map(i => i.value), 1);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{labelKey}</span>
        <span>{valueKey}</span>
      </div>
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-xs text-gray-600 dark:text-gray-400">
            {item.label}
          </span>
          <div className="flex-1">
            <div
              className="h-4 rounded bg-blue-500 dark:bg-blue-400"
              style={{ width: `${(item.value / maxValue) * 100}%`, minWidth: item.value > 0 ? '4px' : '0' }}
              role="progressbar"
              aria-valuenow={item.value}
              aria-valuemin={0}
              aria-valuemax={maxValue}
              aria-label={`${item.label}: ${item.value}`}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SecurityAnalyticsPanel() {
  const { analytics, isLoading, isError, error, days, setDays } =
    useSecurityAnalyticsViewModel();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Security Analytics
        </h3>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value) as AnalyticsDays)}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
          aria-label="Analytics time range"
        >
          {DAYS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}

      {isError && (
        <ErrorMessage message={error?.message ?? 'Failed to load analytics'} />
      )}

      {!isLoading && !isError && analytics && (
        <div className="flex flex-col gap-5">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Avg Response Time"
              value={`${analytics.averageResponseTime.toFixed(1)} min`}
            />
            <StatCard
              label="Patrol Coverage"
              value={`${analytics.patrolCoveragePercentage}%`}
            />
            <StatCard
              label="Total Incidents"
              value={analytics.incidentsBySeverity.reduce((sum, i) => sum + i.count, 0)}
            />
            <StatCard
              label="Device Events"
              value={analytics.deviceEventFrequency.reduce((sum, d) => sum + d.count, 0)}
            />
          </div>

          {/* Incidents by Severity */}
          <div>
            <h4 className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
              Incidents by Severity
            </h4>
            <BarChart
              items={analytics.incidentsBySeverity.map(i => ({
                label: i.severity,
                value: i.count,
              }))}
              labelKey="Severity"
              valueKey="Count"
            />
          </div>

          {/* Incidents by Category */}
          <div>
            <h4 className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
              Incidents by Category
            </h4>
            <BarChart
              items={analytics.incidentsByCategory.map(i => ({
                label: i.category.replace(/_/g, ' '),
                value: i.count,
              }))}
              labelKey="Category"
              valueKey="Count"
            />
          </div>

          {/* Device Event Frequency */}
          {analytics.deviceEventFrequency.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                Device Event Frequency
              </h4>
              <BarChart
                items={analytics.deviceEventFrequency.map(d => ({
                  label: d.deviceType.replace(/_/g, ' '),
                  value: d.count,
                }))}
                labelKey="Device Type"
                valueKey="Count"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
