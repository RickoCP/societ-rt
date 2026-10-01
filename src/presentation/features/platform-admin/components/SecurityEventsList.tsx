'use client';

/**
 * SecurityEventsList — Security Events List component for Platform Admin Dashboard.
 *
 * Displays security events in a sortable DataTable with:
 * - Expandable row details
 * - Severity color badges (Critical=red, High=orange, Medium=yellow, Low=blue)
 * - Acknowledge button per event
 * - Bulk acknowledge selected events
 *
 * This component follows the Clean Architecture pattern and is used within
 * the Platform Admin Security Events screen.
 *
 * @see Requirements 21.2-21.6 (Security Event Alerts)
 * @see Design Components > 11. Platform Admin Dashboard > SecurityEvent interface
 */

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import { Spinner } from '@presentation/components/atoms/Spinner';
import {
  DataTable,
  type DataTableColumn,
  type SortDirection,
} from '@presentation/components/organisms/DataTable';
import { EmptyState } from '@presentation/components/molecules/EmptyState';
import type {
  SecurityEvent,
  SecurityEventSeverity,
  SecurityEventType,
  SecurityEventSort,
  SecurityEventSortColumn,
} from '@core/domains/platform/entities/SecurityEvent';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Severity badge color configuration.
 *
 * @see Requirements 21.3 (Severity display)
 */
const SEVERITY_BADGE_CONFIG: Record<
  SecurityEventSeverity,
  { bgColor: string; textColor: string; label: string }
> = {
  critical: {
    bgColor: 'bg-red-600',
    textColor: 'text-white',
    label: 'Critical',
  },
  high: {
    bgColor: 'bg-orange-500',
    textColor: 'text-white',
    label: 'High',
  },
  medium: {
    bgColor: 'bg-yellow-500',
    textColor: 'text-black',
    label: 'Medium',
  },
  low: {
    bgColor: 'bg-blue-400',
    textColor: 'text-white',
    label: 'Low',
  },
};

/**
 * Event type i18n key mapping.
 */
const EVENT_TYPE_I18N_KEYS: Record<SecurityEventType, string> = {
  failed_login_attempt: 'security.event_type.failed_login_attempt',
  token_reuse_detected: 'security.event_type.token_reuse_detected',
  unauthorized_access: 'security.event_type.unauthorized_access',
  rate_limit_violation: 'security.event_type.rate_limit_violation',
  cross_tenant_access_blocked: 'security.event_type.cross_tenant_access_blocked',
  token_version_reset: 'security.event_type.token_version_reset',
  suspicious_activity: 'security.event_type.suspicious_activity',
  password_reset_abuse: 'security.event_type.password_reset_abuse',
  bulk_operation_anomaly: 'security.event_type.bulk_operation_anomaly',
  api_abuse_detected: 'security.event_type.api_abuse_detected',
};

/**
 * Status badge configuration for acknowledged/unacknowledged events.
 */
const STATUS_BADGE_CONFIG = {
  acknowledged: {
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    textColor: 'text-green-700 dark:text-green-400',
    label: 'Acknowledged',
  },
  unacknowledged: {
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    textColor: 'text-gray-700 dark:text-gray-300',
    label: 'Unacknowledged',
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the SecurityEventsList component.
 */
export interface SecurityEventsListProps {
  /** Array of security events to display */
  events: readonly SecurityEvent[];
  /** Total count for pagination display */
  totalCount: number;
  /** Current page number (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Page size for pagination */
  pageSize: number;
  /** Whether the data is currently loading */
  isLoading: boolean;
  /** Current sort configuration */
  sort?: SecurityEventSort;
  /** Callback when page changes */
  onPageChange: (page: number) => void;
  /** Callback when sort changes */
  onSortChange: (sort: SecurityEventSort) => void;
  /** Callback when a single event is acknowledged */
  onAcknowledge: (eventId: string) => Promise<void>;
  /** Callback when multiple events are acknowledged */
  onBulkAcknowledge: (eventIds: readonly string[]) => Promise<void>;
  /** Whether user has permission to acknowledge events */
  canAcknowledge?: boolean;
  /** Count of unacknowledged events for badge display */
  unacknowledgedCount?: number;
  /** Count of critical/high unacknowledged events */
  criticalUnacknowledgedCount?: number;
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Severity badge component with color coding.
 *
 * @see Requirements 21.3 (Severity display)
 * @see Requirements 21.5 (Critical/High severity badge)
 */
function SeverityBadge({ severity }: { severity: SecurityEventSeverity }) {
  const { t } = useTranslation();
  const config = SEVERITY_BADGE_CONFIG[severity];
  const label = t(`security.severity.${severity}`, config.label);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgColor} ${config.textColor}`}
      role="status"
      aria-label={t('security.severity_label', 'Severity: {{severity}}', { severity: label })}>
      {label}
    </span>
  );
}

/**
 * Status badge for acknowledged/unacknowledged state.
 */
function StatusBadge({ acknowledged }: { acknowledged: boolean }) {
  const { t } = useTranslation();
  const config = acknowledged
    ? STATUS_BADGE_CONFIG.acknowledged
    : STATUS_BADGE_CONFIG.unacknowledged;
  const label = acknowledged
    ? t('security.status.acknowledged', config.label)
    : t('security.status.unacknowledged', config.label);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgColor} ${config.textColor}`}>
      {label}
    </span>
  );
}

/**
 * Event type badge with i18n label.
 */
function EventTypeBadge({ type }: { type: SecurityEventType }) {
  const { t } = useTranslation();
  const i18nKey = EVENT_TYPE_I18N_KEYS[type];
  const label = t(i18nKey, type.replace(/_/g, ' '));

  return (
    <span className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300">
      {label}
    </span>
  );
}

/**
 * Format timestamp for display.
 */
function formatTimestamp(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date instanceof Date ? date : new Date(date));
}

/**
 * Expandable row details component.
 */
function EventDetailsPanel({ event }: { event: SecurityEvent }) {
  const { t } = useTranslation();

  return (
    <div className="bg-gray-50 px-6 py-4 dark:bg-gray-800/50">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Details */}
        <div>
          <h4 className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            {t('security.details_label', 'Details')}
          </h4>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
            {event.details}
          </p>
        </div>

        {/* User Information */}
        {event.userId && (
          <div>
            <h4 className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              {t('security.user_label', 'User')}
            </h4>
            <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {event.userName ?? event.userEmail ?? event.userId}
            </p>
            {event.userEmail && event.userName && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {event.userEmail}
              </p>
            )}
          </div>
        )}

        {/* IP Address & Country */}
        <div>
          <h4 className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
            {t('security.ip_address_label', 'IP Address')}
          </h4>
          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
            {event.ipAddress}
            {event.countryCode && (
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                ({event.countryCode})
              </span>
            )}
          </p>
        </div>

        {/* User Agent */}
        {event.userAgent && (
          <div className="md:col-span-2 lg:col-span-3">
            <h4 className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              {t('security.user_agent_label', 'User Agent')}
            </h4>
            <p className="mt-1 truncate text-sm text-gray-900 dark:text-gray-100">
              {event.userAgent}
            </p>
          </div>
        )}

        {/* Correlation ID */}
        {event.correlationId && (
          <div>
            <h4 className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              {t('security.correlation_id_label', 'Correlation ID')}
            </h4>
            <p className="mt-1 font-mono text-xs text-gray-900 dark:text-gray-100">
              {event.correlationId}
            </p>
          </div>
        )}

        {/* Acknowledgment Information */}
        {event.acknowledged && (
          <div>
            <h4 className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              {t('security.acknowledged_by_label', 'Acknowledged By')}
            </h4>
            <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {event.acknowledgedByName ?? t('security.unknown_user', 'Unknown')}
            </p>
            {event.acknowledgedAt && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatTimestamp(event.acknowledgedAt, 'en')}
              </p>
            )}
          </div>
        )}

        {/* Metadata */}
        {Object.keys(event.metadata).length > 0 && (
          <div className="md:col-span-2 lg:col-span-3">
            <h4 className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              {t('security.metadata_label', 'Additional Information')}
            </h4>
            <pre className="mt-1 overflow-x-auto rounded bg-gray-100 p-2 text-xs text-gray-900 dark:bg-gray-900 dark:text-gray-100">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Bulk actions toolbar for selected events.
 */
function BulkActionsToolbar({
  selectedCount,
  selectedEvents,
  onBulkAcknowledge,
  onClearSelection,
  isProcessing,
}: {
  selectedCount: number;
  selectedEvents: readonly SecurityEvent[];
  onBulkAcknowledge: () => void;
  onClearSelection: () => void;
  isProcessing: boolean;
}) {
  const { t } = useTranslation();

  // Check if any selected events can be acknowledged
  const canBulkAcknowledge = useMemo(
    () => selectedEvents.some(e => !e.acknowledged),
    [selectedEvents],
  );

  const unacknowledgedCount = useMemo(
    () => selectedEvents.filter(e => !e.acknowledged).length,
    [selectedEvents],
  );

  return (
    <div className="flex items-center gap-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-900/20">
      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
        {t('security.selected_count', '{{count}} event(s) selected', {
          count: selectedCount,
        })}
      </span>

      <div className="flex items-center gap-2">
        {canBulkAcknowledge && (
          <Button
            variant="primary"
            size="sm"
            onClick={onBulkAcknowledge}
            loading={isProcessing}
            disabled={isProcessing}
            aria-label={t('security.bulk_acknowledge_aria', 'Acknowledge {{count}} selected events', {
              count: unacknowledgedCount,
            })}>
            {t('security.bulk_acknowledge', 'Acknowledge ({{count}})', {
              count: unacknowledgedCount,
            })}
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={isProcessing}>
          {t('security.clear_selection', 'Clear Selection')}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * SecurityEventsList — Main component for displaying security events.
 *
 * Provides:
 * - Sortable DataTable with security events
 * - Expandable row details
 * - Single and bulk acknowledge functionality
 * - Severity color coding
 *
 * @see Requirements 21.2-21.6
 */
export function SecurityEventsList({
  events,
  totalCount,
  page,
  totalPages,
  pageSize: _pageSize,
  isLoading,
  sort,
  onPageChange,
  onSortChange,
  onAcknowledge,
  onBulkAcknowledge,
  canAcknowledge = true,
  unacknowledgedCount,
  criticalUnacknowledgedCount,
}: SecurityEventsListProps) {
  const { t, i18n } = useTranslation();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // Selection state for bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Expanded row state for details view
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Processing state for acknowledge actions
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const selectedEvents = useMemo(
    () => events.filter(e => selectedIds.has(e.id)),
    [events, selectedIds],
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle row expand/collapse toggle.
   */
  const handleToggleExpand = useCallback((eventId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  /**
   * Handle single event acknowledgment.
   *
   * @see Requirements 21.6 (acknowledgment support)
   * @see Requirements 21.7 (acknowledgment logging)
   */
  const handleAcknowledge = useCallback(
    async (eventId: string) => {
      setProcessingIds(prev => new Set(prev).add(eventId));
      try {
        await onAcknowledge(eventId);
      } finally {
        setProcessingIds(prev => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
      }
    },
    [onAcknowledge],
  );

  /**
   * Handle bulk acknowledgment.
   *
   * @see Requirements 21.6 (acknowledgment support)
   */
  const handleBulkAcknowledge = useCallback(async () => {
    const unacknowledgedIds = selectedEvents
      .filter(e => !e.acknowledged)
      .map(e => e.id);

    if (unacknowledgedIds.length === 0) return;

    setIsBulkProcessing(true);
    try {
      await onBulkAcknowledge(unacknowledgedIds);
      setSelectedIds(new Set());
    } finally {
      setIsBulkProcessing(false);
    }
  }, [selectedEvents, onBulkAcknowledge]);

  /**
   * Handle selection change from DataTable.
   */
  const handleSelectionChange = useCallback((newSelectedIds: Set<string>) => {
    setSelectedIds(newSelectedIds);
  }, []);

  /**
   * Handle sort change from DataTable.
   */
  const handleSortChange = useCallback(
    (column: string, direction: SortDirection) => {
      onSortChange({
        column: column as SecurityEventSortColumn,
        direction,
      });
    },
    [onSortChange],
  );

  /**
   * Clear selection.
   */
  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ---------------------------------------------------------------------------
  // Table Columns
  // ---------------------------------------------------------------------------

  const columns = useMemo<DataTableColumn<SecurityEvent>[]>(
    () => [
      {
        key: 'timestamp',
        header: t('security.column.timestamp', 'Timestamp'),
        sortable: true,
        render: row => (
          <button
            type="button"
            onClick={() => handleToggleExpand(row.id)}
            className="flex items-center gap-2 text-left text-sm text-gray-900 hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400"
            aria-expanded={expandedIds.has(row.id)}
            aria-label={t('security.toggle_details', 'Toggle details for event')}>
            <svg
              className={`h-4 w-4 transition-transform ${
                expandedIds.has(row.id) ? 'rotate-90' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            <span>{formatTimestamp(row.timestamp, i18n.language)}</span>
          </button>
        ),
      },
      {
        key: 'type',
        header: t('security.column.event_type', 'Event Type'),
        sortable: true,
        render: row => <EventTypeBadge type={row.type} />,
      },
      {
        key: 'severity',
        header: t('security.column.severity', 'Severity'),
        sortable: true,
        render: row => <SeverityBadge severity={row.severity} />,
      },
      {
        key: 'tenantName',
        header: t('security.column.tenant', 'Tenant'),
        sortable: true,
        render: row => (
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {row.tenantName ?? t('security.platform_wide', 'Platform-wide')}
          </span>
        ),
      },
      {
        key: 'userName',
        header: t('security.column.user', 'User'),
        sortable: true,
        render: row => (
          <div className="text-sm">
            {row.userId ? (
              <>
                <div className="text-gray-900 dark:text-gray-100">
                  {row.userName ?? t('security.unknown_user', 'Unknown')}
                </div>
                {row.userEmail && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {row.userEmail}
                  </div>
                )}
              </>
            ) : (
              <span className="text-gray-500 dark:text-gray-400">—</span>
            )}
          </div>
        ),
      },
      {
        key: 'ipAddress',
        header: t('security.column.ip_address', 'IP Address'),
        sortable: false,
        render: row => (
          <span className="font-mono text-sm text-gray-700 dark:text-gray-300">
            {row.ipAddress}
          </span>
        ),
      },
      {
        key: 'acknowledged',
        header: t('security.column.status', 'Status'),
        sortable: false,
        render: row => <StatusBadge acknowledged={row.acknowledged} />,
      },
      {
        key: 'actions',
        header: t('security.column.actions', 'Actions'),
        sortable: false,
        render: row => {
          const isProcessing = processingIds.has(row.id);

          if (row.acknowledged) {
            return (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('security.already_acknowledged', 'Acknowledged')}
              </span>
            );
          }

          if (!canAcknowledge) {
            return null;
          }

          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAcknowledge(row.id)}
              loading={isProcessing}
              disabled={isProcessing}
              aria-label={t('security.acknowledge_aria', 'Acknowledge event {{id}}', {
                id: row.id,
              })}>
              {t('security.acknowledge', 'Acknowledge')}
            </Button>
          );
        },
      },
    ],
    [
      t,
      i18n.language,
      expandedIds,
      processingIds,
      canAcknowledge,
      handleToggleExpand,
      handleAcknowledge,
    ],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Loading state
  if (isLoading && events.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  // Empty state
  if (!isLoading && events.length === 0) {
    return (
      <EmptyState
        title={t('security.empty_title', 'No security events')}
        description={t(
          'security.empty_description',
          'There are no security events matching your current filters.',
        )}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with counts */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('security.events_title', 'Security Events')}
          </h2>
          {unacknowledgedCount !== undefined && unacknowledgedCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {t('security.unacknowledged_count', '{{count}} unacknowledged', {
                count: unacknowledgedCount,
              })}
            </span>
          )}
          {criticalUnacknowledgedCount !== undefined && criticalUnacknowledgedCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {t('security.critical_count', '{{count}} critical/high', {
                count: criticalUnacknowledgedCount,
              })}
            </span>
          )}
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {t('security.total_count', '{{count}} total events', { count: totalCount })}
        </span>
      </div>

      {/* Bulk actions toolbar */}
      {selectedIds.size > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedIds.size}
          selectedEvents={selectedEvents}
          onBulkAcknowledge={handleBulkAcknowledge}
          onClearSelection={handleClearSelection}
          isProcessing={isBulkProcessing}
        />
      )}

      {/* Data table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <DataTable
          columns={columns}
          data={[...events]}
          rowKey={row => row.id}
          loading={isLoading}
          emptyMessage={t('security.no_events', 'No security events found')}
          // Selection
          selectable={canAcknowledge}
          selectedIds={selectedIds}
          onSelectionChange={handleSelectionChange}
          disableSelection={row => row.acknowledged}
          // Sorting
          sortable
          sortColumn={sort?.column}
          sortDirection={sort?.direction}
          onSortChange={handleSortChange}
          // Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />

        {/* Expanded row details */}
        {events.map(
          event =>
            expandedIds.has(event.id) && (
              <EventDetailsPanel key={`details-${event.id}`} event={event} />
            ),
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export type { SecurityEventsListProps };
