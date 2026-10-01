'use client';

/**
 * SecurityEventsScreen — Platform Admin Security Events viewer.
 *
 * Displays security events with:
 * - Severity badges (Critical, High, Medium, Low)
 * - Event type filtering
 * - Date range filtering
 * - Acknowledged/unacknowledged filtering
 * - Sorting by timestamp, severity, type, tenant, user
 * - Event acknowledgment (single and bulk)
 * - Auto-refresh with visual indicator
 *
 * This screen is restricted to PLATFORM_ADMIN role only.
 *
 * This screen follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * @see Requirements 21.1-21.12 (Security Event Alerts)
 * @see Design Components > 11. Platform Admin Dashboard > SecurityEvent interface
 */

import { useMemo, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import { Spinner } from '@presentation/components/atoms/Spinner';
import {
  DataTable,
  type DataTableColumn,
  type SortDirection,
} from '@presentation/components/organisms/DataTable';
import {
  FilterPanel,
  type FilterDefinition,
  type FilterValue,
  type DateRangeValue,
} from '@presentation/components/molecules/FilterPanel';
import { EmptyState } from '@presentation/components/molecules/EmptyState';
import {
  useSecurityEventsViewModel,
  SEVERITY_CONFIG,
  EVENT_TYPE_CONFIG,
  SEVERITY_LEVELS,
  SECURITY_EVENT_TYPES,
  type SortDirection as ViewModelSortDirection,
} from '../viewModel/useSecurityEventsViewModel';
import type {
  SecurityEvent,
  SecurityEventSeverity,
  SecurityEventType,
  SecurityEventSortColumn,
} from '@core/domains/platform/entities/SecurityEvent';

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Severity badge component with color coding.
 *
 * @see Requirements 21.3 (Severity display)
 */
function SeverityBadge({ severity }: { severity: SecurityEventSeverity }) {
  const config = SEVERITY_CONFIG[severity];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgColor} ${config.color}`}>
      {config.label}
    </span>
  );
}

/**
 * Event type badge component.
 *
 * @see Requirements 21.2 (Event types)
 */
function EventTypeBadge({ type }: { type: SecurityEventType }) {
  const config = EVENT_TYPE_CONFIG[type];
  return (
    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
      {config.label}
    </span>
  );
}

/**
 * Acknowledged status indicator.
 *
 * @see Requirements 21.6 (Acknowledgment support)
 */
function AcknowledgedIndicator({
  acknowledged,
  acknowledgedByName,
  acknowledgedAt,
}: {
  acknowledged: boolean;
  acknowledgedByName: string | null;
  acknowledgedAt: Date | null;
}) {
  const { t } = useTranslation();

  if (!acknowledged) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
        {t('security.unacknowledged', 'Unacknowledged')}
      </span>
    );
  }

  return (
    <div className="flex flex-col">
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        {t('security.acknowledged', 'Acknowledged')}
      </span>
      {acknowledgedByName && acknowledgedAt && (
        <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {acknowledgedByName} • {new Date(acknowledgedAt).toLocaleString()}
        </span>
      )}
    </div>
  );
}

/**
 * Loading skeleton for the screen.
 */
function SecurityEventsSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-32 rounded bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-lg bg-gray-200 dark:bg-gray-700"
          />
        ))}
      </div>

      {/* Filter skeleton */}
      <div className="h-32 rounded-lg bg-gray-200 dark:bg-gray-700" />

      {/* Table skeleton */}
      <div className="h-96 rounded-lg bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

/**
 * Error state component with retry button.
 */
function SecurityEventsError({
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
        {t('security.fetch_error', 'Failed to load security events')}
      </h3>
      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
        {t('security.generic_error', 'An error occurred while loading security events. Please try again.')}
      </p>
      {error?.code && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-500">
          {t('common.error_code', 'Error code: {{code}}', { code: error.code })}
        </p>
      )}
      <Button variant="primary" size="sm" onClick={onRetry} className="mt-4">
        {t('security.retry', 'Retry')}
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
        {t('security.unauthorized', 'Access Denied')}
      </h2>
      <p className="mt-2 text-gray-500 dark:text-gray-400">
        {t(
          'security.unauthorized_description',
          'You do not have permission to view security events.',
        )}
      </p>
      <Button variant="secondary" onClick={() => router.push('/dashboard')} className="mt-6">
        {t('security.go_to_dashboard', 'Go to Dashboard')}
      </Button>
    </div>
  );
}

/**
 * Stats cards component for summary metrics.
 */
function StatsCards({
  totalCount,
  unacknowledgedCount,
  criticalUnacknowledgedCount,
}: {
  totalCount: number;
  unacknowledgedCount: number;
  criticalUnacknowledgedCount: number;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {t('security.total_events', 'Total Events')}
        </div>
        <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
          {totalCount.toLocaleString()}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {t('security.unacknowledged_events', 'Unacknowledged')}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-2xl font-semibold text-yellow-600 dark:text-yellow-400">
            {unacknowledgedCount.toLocaleString()}
          </span>
          {unacknowledgedCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
              {t('security.needs_attention', 'Needs attention')}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {t('security.critical_high', 'Critical/High Unacknowledged')}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={`text-2xl font-semibold ${
              criticalUnacknowledgedCount > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-green-600 dark:text-green-400'
            }`}>
            {criticalUnacknowledgedCount.toLocaleString()}
          </span>
          {criticalUnacknowledgedCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {t('security.urgent', 'Urgent')}
            </span>
          )}
        </div>
      </div>
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
  isFetching,
  onToggle,
  onRefresh,
}: {
  countdown: number;
  isActive: boolean;
  lastUpdated: Date | null;
  isFetching: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
      {lastUpdated && (
        <span>
          {t('security.last_updated', 'Last updated')}: {lastUpdated.toLocaleTimeString()}
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
          aria-label={
            isActive
              ? t('security.disable_auto_refresh', 'Disable auto-refresh')
              : t('security.enable_auto_refresh', 'Enable auto-refresh')
          }>
          {isFetching ? (
            <Spinner size="sm" />
          ) : (
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
          )}
          {isActive ? `${countdown}s` : t('security.paused', 'Paused')}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isFetching}
          aria-label={t('security.refresh_now', 'Refresh now')}>
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

/**
 * Bulk actions toolbar for selected events.
 */
function BulkActionsToolbar({
  selectedCount,
  onAcknowledge,
  onClearSelection,
  isAcknowledging,
}: {
  selectedCount: number;
  onAcknowledge: () => void;
  onClearSelection: () => void;
  isAcknowledging: boolean;
}) {
  const { t } = useTranslation();

  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-900/20">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
          {t('security.selected_count', '{{count}} selected', { count: selectedCount })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={isAcknowledging}>
          {t('security.clear_selection', 'Clear')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onAcknowledge}
          loading={isAcknowledging}>
          {t('security.acknowledge_selected', 'Acknowledge Selected')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Event detail modal component.
 */
function EventDetailModal({
  event,
  isOpen,
  onClose,
  onAcknowledge,
  isAcknowledging,
}: {
  event: SecurityEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onAcknowledge: (eventId: string, note?: string) => Promise<void>;
  isAcknowledging: boolean;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');

  const handleAcknowledge = useCallback(async () => {
    if (!event) return;
    await onAcknowledge(event.id, note || undefined);
    setNote('');
    onClose();
  }, [event, note, onAcknowledge, onClose]);

  if (!isOpen || !event) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}>
      <div
        className="mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-900"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('security.event_details', 'Event Details')}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-800">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 px-6 py-4">
          {/* Severity and Type */}
          <div className="flex items-center gap-3">
            <SeverityBadge severity={event.severity} />
            <EventTypeBadge type={event.type} />
            <AcknowledgedIndicator
              acknowledged={event.acknowledged}
              acknowledgedByName={event.acknowledgedByName}
              acknowledgedAt={event.acknowledgedAt}
            />
          </div>

          {/* Timestamp */}
          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t('security.timestamp', 'Timestamp')}
            </label>
            <p className="mt-1 text-gray-900 dark:text-white">
              {new Date(event.timestamp).toLocaleString()}
            </p>
          </div>

          {/* Details */}
          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t('security.details', 'Details')}
            </label>
            <p className="mt-1 text-gray-900 dark:text-white">{event.details}</p>
          </div>

          {/* Tenant */}
          {(event.tenantId || event.tenantName) && (
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('security.tenant', 'Tenant')}
              </label>
              <p className="mt-1 text-gray-900 dark:text-white">
                {event.tenantName ?? event.tenantId ?? '-'}
              </p>
            </div>
          )}

          {/* User */}
          {(event.userId || event.userName || event.userEmail) && (
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('security.user', 'User')}
              </label>
              <p className="mt-1 text-gray-900 dark:text-white">
                {event.userName ?? event.userEmail ?? event.userId ?? '-'}
              </p>
            </div>
          )}

          {/* IP Address */}
          <div>
            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t('security.ip_address', 'IP Address')}
            </label>
            <p className="mt-1 font-mono text-sm text-gray-900 dark:text-white">
              {event.ipAddress}
              {event.countryCode && ` (${event.countryCode})`}
            </p>
          </div>

          {/* User Agent */}
          {event.userAgent && (
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('security.user_agent', 'User Agent')}
              </label>
              <p className="mt-1 break-all font-mono text-xs text-gray-900 dark:text-white">
                {event.userAgent}
              </p>
            </div>
          )}

          {/* Metadata */}
          {Object.keys(event.metadata).length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('security.metadata', 'Metadata')}
              </label>
              <pre className="mt-1 overflow-auto rounded-md bg-gray-100 p-3 text-xs text-gray-900 dark:bg-gray-800 dark:text-white">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}

          {/* Correlation/Request IDs */}
          <div className="grid grid-cols-2 gap-4">
            {event.correlationId && (
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t('security.correlation_id', 'Correlation ID')}
                </label>
                <p className="mt-1 break-all font-mono text-xs text-gray-900 dark:text-white">
                  {event.correlationId}
                </p>
              </div>
            )}
            {event.requestId && (
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t('security.request_id', 'Request ID')}
                </label>
                <p className="mt-1 break-all font-mono text-xs text-gray-900 dark:text-white">
                  {event.requestId}
                </p>
              </div>
            )}
          </div>

          {/* Acknowledge form (if not acknowledged) */}
          {!event.acknowledged && (
            <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
              <label
                htmlFor="acknowledge-note"
                className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {t('security.acknowledge_note', 'Acknowledgment Note (optional)')}
              </label>
              <textarea
                id="acknowledge-note"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={t('security.acknowledge_note_placeholder', 'Add a note about this event...')}
                rows={3}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <Button variant="ghost" onClick={onClose}>
            {t('common.close', 'Close')}
          </Button>
          {!event.acknowledged && (
            <Button
              variant="primary"
              onClick={handleAcknowledge}
              loading={isAcknowledging}>
              {t('security.acknowledge', 'Acknowledge')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * SecurityEventsContent — The main content of the Security Events screen.
 */
function SecurityEventsContent() {
  const { t } = useTranslation();
  const vm = useSecurityEventsViewModel();

  // Modal state
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const selectedEvent = selectedEventId ? vm.getEventById(selectedEventId) : null;

  // ---------------------------------------------------------------------------
  // Filter Configuration
  // ---------------------------------------------------------------------------

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      {
        key: 'search',
        label: t('security.filter_search', 'Search'),
        type: 'text',
        placeholder: t('security.filter_search_placeholder', 'Search events...'),
      },
      {
        key: 'severities',
        label: t('security.filter_severity', 'Severity'),
        type: 'multiselect',
        options: SEVERITY_LEVELS.map(s => ({
          value: s,
          label: SEVERITY_CONFIG[s].label,
        })),
      },
      {
        key: 'types',
        label: t('security.filter_type', 'Event Type'),
        type: 'multiselect',
        options: SECURITY_EVENT_TYPES.map(type => ({
          value: type,
          label: EVENT_TYPE_CONFIG[type].label,
        })),
      },
      {
        key: 'acknowledged',
        label: t('security.filter_acknowledged', 'Status'),
        type: 'select',
        options: [
          { value: 'unacknowledged', label: t('security.unacknowledged', 'Unacknowledged') },
          { value: 'acknowledged', label: t('security.acknowledged', 'Acknowledged') },
        ],
      },
      {
        key: 'dateRange',
        label: t('security.filter_date_range', 'Date Range'),
        type: 'daterange',
      },
    ],
    [t],
  );

  const filterValues = useMemo(
    () => ({
      search: vm.filters.search,
      severities: vm.filters.severities,
      types: vm.filters.types,
      acknowledged: vm.filters.acknowledged === 'all' ? '' : vm.filters.acknowledged,
      dateRange: {
        from: vm.filters.dateFrom ? vm.filters.dateFrom.toISOString().split('T')[0] : null,
        to: vm.filters.dateTo ? vm.filters.dateTo.toISOString().split('T')[0] : null,
      } as DateRangeValue,
    }),
    [vm.filters],
  );

  const handleFilterChange = useCallback(
    (key: string, value: FilterValue) => {
      if (key === 'search') {
        vm.setFilters({ search: value as string });
      } else if (key === 'severities') {
        vm.setFilters({ severities: value as SecurityEventSeverity[] });
      } else if (key === 'types') {
        vm.setFilters({ types: value as SecurityEventType[] });
      } else if (key === 'acknowledged') {
        vm.setFilters({
          acknowledged: value ? (value as 'acknowledged' | 'unacknowledged') : 'all',
        });
      } else if (key === 'dateRange') {
        const dateRange = value as DateRangeValue;
        vm.setFilters({
          dateFrom: dateRange?.from ? new Date(dateRange.from) : null,
          dateTo: dateRange?.to ? new Date(dateRange.to) : null,
        });
      }
    },
    [vm],
  );

  // ---------------------------------------------------------------------------
  // Table Columns
  // ---------------------------------------------------------------------------

  const columns = useMemo<DataTableColumn<SecurityEvent>[]>(
    () => [
      {
        key: 'timestamp',
        header: t('security.column_timestamp', 'Timestamp'),
        sortable: true,
        render: row => (
          <span className="whitespace-nowrap text-gray-600 dark:text-gray-300">
            {new Date(row.timestamp).toLocaleString()}
          </span>
        ),
      },
      {
        key: 'severity',
        header: t('security.column_severity', 'Severity'),
        sortable: true,
        render: row => <SeverityBadge severity={row.severity} />,
      },
      {
        key: 'type',
        header: t('security.column_type', 'Event Type'),
        sortable: true,
        render: row => <EventTypeBadge type={row.type} />,
      },
      {
        key: 'tenantName',
        header: t('security.column_tenant', 'Tenant'),
        sortable: true,
        render: row => (
          <span className="text-gray-600 dark:text-gray-300">
            {row.tenantName ?? '-'}
          </span>
        ),
      },
      {
        key: 'userName',
        header: t('security.column_user', 'User'),
        sortable: true,
        render: row => (
          <div className="flex flex-col">
            <span className="text-gray-900 dark:text-white">
              {row.userName ?? '-'}
            </span>
            {row.userEmail && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {row.userEmail}
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'ipAddress',
        header: t('security.column_ip', 'IP Address'),
        sortable: false,
        render: row => (
          <span className="font-mono text-sm text-gray-600 dark:text-gray-300">
            {row.ipAddress}
          </span>
        ),
      },
      {
        key: 'acknowledged',
        header: t('security.column_status', 'Status'),
        sortable: false,
        render: row => (
          <AcknowledgedIndicator
            acknowledged={row.acknowledged}
            acknowledgedByName={row.acknowledgedByName}
            acknowledgedAt={row.acknowledgedAt}
          />
        ),
      },
      {
        key: 'actions',
        header: t('security.column_actions', 'Actions'),
        sortable: false,
        render: row => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedEventId(row.id)}>
              {t('security.view', 'View')}
            </Button>
            {!row.acknowledged && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => vm.acknowledgeEvent(row.id)}
                loading={vm.isAcknowledging}>
                {t('security.acknowledge', 'Ack')}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, vm],
  );

  // ---------------------------------------------------------------------------
  // Sort Handler
  // ---------------------------------------------------------------------------

  const handleSortChange = useCallback(
    (column: string, direction: SortDirection) => {
      vm.setSort(column as SecurityEventSortColumn, direction as ViewModelSortDirection);
    },
    [vm],
  );

  // ---------------------------------------------------------------------------
  // Row Click Handler
  // ---------------------------------------------------------------------------

  const handleRowClick = useCallback((event: SecurityEvent) => {
    setSelectedEventId(event.id);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Authorization loading
  if (vm.isAuthLoading) {
    return <SecurityEventsSkeleton />;
  }

  // Unauthorized
  if (!vm.isPlatformAdmin) {
    return <UnauthorizedPage />;
  }

  // Data loading
  if (vm.isLoading && vm.events.length === 0) {
    return <SecurityEventsSkeleton />;
  }

  // Error state
  if (vm.isError && vm.events.length === 0) {
    return <SecurityEventsError error={vm.error} onRetry={vm.refresh} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {t('security.title', 'Security Events')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('security.subtitle', 'Monitor and manage security events across the platform')}
          </p>
        </div>
        <RefreshIndicator
          countdown={vm.refreshCountdown}
          isActive={vm.isAutoRefreshActive}
          lastUpdated={vm.lastUpdated}
          isFetching={vm.isFetching}
          onToggle={vm.toggleAutoRefresh}
          onRefresh={vm.refresh}
        />
      </div>

      {/* Stats Cards */}
      <StatsCards
        totalCount={vm.totalCount}
        unacknowledgedCount={vm.unacknowledgedCount}
        criticalUnacknowledgedCount={vm.criticalUnacknowledgedCount}
      />

      {/* Filters */}
      <FilterPanel
        filters={filterDefinitions}
        values={filterValues}
        onChange={handleFilterChange}
        onClear={vm.clearFilters}
        onApply={() => {}} // Filters are applied immediately
        applyLabel={t('security.apply_filters', 'Apply')}
        clearLabel={t('security.clear_filters', 'Clear')}
      />

      {/* Bulk Actions Toolbar */}
      <BulkActionsToolbar
        selectedCount={vm.selectedIds.size}
        onAcknowledge={vm.acknowledgeSelected}
        onClearSelection={vm.clearSelection}
        isAcknowledging={vm.isAcknowledging}
      />

      {/* Events Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        {vm.isLoading && vm.events.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : vm.events.length === 0 ? (
          <EmptyState
            title={t('security.no_events', 'No security events found')}
            description={t(
              'security.no_events_description',
              'No events match your current filters.',
            )}
            action={
              <Button variant="secondary" size="sm" onClick={vm.clearFilters}>
                {t('security.clear_filters', 'Clear Filters')}
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={vm.events}
            rowKey={row => row.id}
            loading={vm.isLoading}
            emptyMessage={t('security.no_events', 'No security events found')}
            sortable
            sortColumn={vm.sortColumn}
            sortDirection={vm.sortDirection}
            onSortChange={handleSortChange}
            page={vm.page}
            totalPages={vm.totalPages}
            onPageChange={vm.setPage}
            selectable
            selectedIds={vm.selectedIds}
            onSelectionChange={ids => {
              // Sync selection state with ViewModel
              const currentIds = vm.selectedIds;
              // Find IDs that were added
              ids.forEach(id => {
                if (!currentIds.has(id)) {
                  vm.toggleSelection(id);
                }
              });
              // Find IDs that were removed
              currentIds.forEach(id => {
                if (!ids.has(id)) {
                  vm.toggleSelection(id);
                }
              });
            }}
            disableSelection={row => row.acknowledged}
          />
        )}
      </div>

      {/* Page Size Selector */}
      {vm.events.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <label
              htmlFor="event-page-size"
              className="text-gray-500 dark:text-gray-400">
              {t('security.page_size', 'Show')}
            </label>
            <select
              id="event-page-size"
              value={vm.pageSize}
              onChange={e => vm.setPageSize(Number(e.target.value) as 10 | 25 | 50 | 100)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800">
              {[10, 25, 50, 100].map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span className="text-gray-500 dark:text-gray-400">
              {t('security.per_page', 'per page')}
            </span>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {t('security.showing_range', 'Showing {{from}}-{{to}} of {{total}}', {
              from: (vm.page - 1) * vm.pageSize + 1,
              to: Math.min(vm.page * vm.pageSize, vm.totalCount),
              total: vm.totalCount,
            })}
          </span>
        </div>
      )}

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent ?? null}
        isOpen={!!selectedEventId}
        onClose={() => setSelectedEventId(null)}
        onAcknowledge={vm.acknowledgeEvent}
        isAcknowledging={vm.isAcknowledging}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported Component
// ---------------------------------------------------------------------------

/**
 * SecurityEventsScreen — The Platform Admin Security Events screen.
 *
 * Requires PLATFORM_ADMIN role to access. Displays security events
 * with filtering, sorting, and acknowledgment capabilities.
 *
 * @example
 * ```tsx
 * // In app/dashboard/admin/security-events/page.tsx
 * import { SecurityEventsScreen } from '@presentation/features/platform-admin';
 *
 * export default function SecurityEventsPage() {
 *   return <SecurityEventsScreen />;
 * }
 * ```
 *
 * @see Requirements 21.1-21.12
 */
export function SecurityEventsScreen() {
  return <SecurityEventsContent />;
}

export default SecurityEventsScreen;
