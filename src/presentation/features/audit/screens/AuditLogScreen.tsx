'use client';

/**
 * AuditLogScreen — Admin screen for viewing the audit trail.
 *
 * Displays a filterable, paginated table of audit log entries within
 * the user's authorization scope.
 *
 * This screen follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * Features:
 * - DataTable with columns: action, entity, user, details, date
 * - Filtering by action and entity type
 * - Pagination
 * - Loading skeleton while fetching
 * - Error state with retry button
 *
 * @see Requirements 24.1-24.2 (Loading and Error States)
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type DataTableColumn } from '@components/organisms/DataTable';
import { Button } from '@components/atoms/Button';
import { useAuditLogViewModel } from '../viewModel/useAuditLogViewModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  details: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Loading skeleton for the audit log screen.
 * Matches the layout of actual content to prevent layout shift.
 *
 * @see Requirements 24.1, 24.2 (Loading skeletons matching content layout)
 */
function AuditLogSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Title skeleton */}
      <div className="h-8 w-32 rounded bg-gray-200 dark:bg-gray-700" />

      {/* Filters skeleton */}
      <div className="flex gap-4">
        <div className="h-10 w-48 rounded-md bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-48 rounded-md bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        {/* Table header skeleton */}
        <div className="flex gap-4 bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* Table rows skeleton */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
            <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 flex-1 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="flex gap-2">
          <div className="h-8 w-20 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-8 w-20 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  );
}

/**
 * Error state component with retry button.
 *
 * @see Requirements 24.3 (Error state with retry button)
 * @see Requirements 24.4 (No technical details exposed)
 * @see Requirements 24.6 (Error code for reference)
 */
function AuditLogError({
  error,
  onRetry,
}: {
  error: { code?: string; message?: string } | null;
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
        {t('audit_log.fetch_error', 'Failed to load audit log')}
      </h3>
      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
        {t(
          'audit_log.generic_error',
          'An error occurred while fetching the audit log. Please try again.',
        )}
      </p>
      {error?.code && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-500">
          {t('common.error_code', 'Error code: {{code}}', { code: error.code })}
        </p>
      )}
      <Button variant="primary" size="sm" onClick={onRetry} className="mt-4">
        {t('audit_log.retry', 'Retry')}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table Columns
// ---------------------------------------------------------------------------

/**
 * Column definitions with responsive configuration.
 * @see Requirements 23.2 (DataTable collapse non-essential columns on mobile)
 */
const columns: DataTableColumn<AuditRow>[] = [
  {
    key: 'action',
    header: 'Action',
    // Essential - always show the action type
    responsive: { priority: 'essential' },
  },
  {
    key: 'entityType',
    header: 'Entity',
    // High priority - important for context
    responsive: { priority: 'high' },
  },
  {
    key: 'userName',
    header: 'User',
    // High priority - important for accountability
    responsive: { priority: 'high' },
  },
  {
    key: 'details',
    header: 'Details',
    // Medium priority - hide on mobile to save space
    responsive: { priority: 'medium', hideOnMobile: true },
  },
  {
    key: 'createdAt',
    header: 'Date',
    // Low priority - hide on mobile and tablet
    responsive: { priority: 'low', hideOnMobile: true, hideOnTablet: true },
  },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * AuditLogScreen — The Audit Log screen displaying audit trail entries.
 *
 * @see Requirements 24.1-24.2 (Loading states)
 * @see Requirements 24.3 (Error state with retry)
 */
export function AuditLogScreen() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const filters = {
    action: actionFilter || undefined,
    entityType: entityFilter || undefined,
  };

  const { entries, totalPages, isLoading, isError, error, refetch } =
    useAuditLogViewModel(page, filters);

  // Handle retry
  const handleRetry = useCallback(() => {
    refetch?.();
  }, [refetch]);

  // Show loading skeleton during initial load
  if (isLoading && entries.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <AuditLogSkeleton />
      </div>
    );
  }

  // Show error state with retry
  if (isError && entries.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('audit_log.title', 'Audit Log')}
        </h1>
        <AuditLogError error={error} onRetry={handleRetry} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t('audit_log.title', 'Audit Log')}
      </h1>

      <div className="flex gap-4">
        <input
          placeholder={t('audit_log.filter_action', 'Filter by action')}
          value={actionFilter}
          onChange={e => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        <input
          placeholder={t('audit_log.filter_entity', 'Filter by entity type')}
          value={entityFilter}
          onChange={e => {
            setEntityFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>

      <DataTable<AuditRow>
        columns={columns}
        data={entries}
        loading={isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        rowKey={row => row.id}
        emptyMessage={t('audit_log.empty', 'No audit entries found')}
      />
    </div>
  );
}
