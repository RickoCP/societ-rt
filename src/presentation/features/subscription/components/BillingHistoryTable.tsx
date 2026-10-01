'use client';

/**
 * BillingHistoryTable — Component for displaying billing/payment history.
 *
 * Displays billing entries in a paginated table with:
 * - Date, description, amount, status, and invoice action columns
 * - Color-coded status badges (Paid=green, Pending=yellow, Failed=red, Refunded=gray)
 * - "Download Invoice" button for paid entries
 * - "Retry Payment" button for failed entries
 * - Pagination and date range filtering
 * - Empty state when no billing history exists
 *
 * CLEAN ARCHITECTURE:
 * - This is a presentation-only component
 * - All business logic resides in the BillingEntry entity helper functions
 * - Data fetching is handled by the parent ViewModel
 *
 * SECURITY CONSIDERATIONS:
 * - Invoice downloads use signed URLs (handled server-side)
 * - Payment retry requires server-side authentication
 * - UI permission checks are for UX only; authorization is enforced server-side
 *
 * @see Requirements 16.1-16.11 (Billing History)
 * @see Design Section 9. Subscription Management > 9.3 Billing History
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import { Badge, type BadgeVariant } from '@presentation/components/atoms/Badge';
import { DataTable, type DataTableColumn } from '@presentation/components/organisms/DataTable';
import {
  type BillingEntry,
  type BillingStatus,
  getBillingStatusColor,
  canRetryPayment,
  canDownloadInvoice,
  formatBillingAmount,
} from '@core/domains/subscription/entities/BillingEntry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Date filter value for date range filtering.
 */
export interface DateFilter {
  /** Start date of the filter range */
  readonly dateFrom: Date | null;
  /** End date of the filter range */
  readonly dateTo: Date | null;
}

/**
 * Props for the BillingHistoryTable component.
 */
export interface BillingHistoryTableProps {
  /**
   * Array of billing entries to display.
   */
  entries: readonly BillingEntry[];

  /**
   * Whether data is currently loading.
   */
  isLoading?: boolean;

  /**
   * Current page number (1-indexed).
   * @see Requirements 16.7
   */
  page: number;

  /**
   * Total number of pages available.
   */
  totalPages: number;

  /**
   * Callback when page changes.
   */
  onPageChange: (page: number) => void;

  /**
   * Current date filter values.
   * @see Requirements 16.8
   */
  dateFilter?: DateFilter;

  /**
   * Callback when date filter changes.
   */
  onDateFilterChange?: (filter: DateFilter) => void;

  /**
   * Callback when "Download Invoice" is clicked.
   * @see Requirements 16.5-16.6
   */
  onDownloadInvoice?: (entry: BillingEntry) => void;

  /**
   * Callback when "Retry Payment" is clicked.
   * @see Requirements 16.10-16.11
   */
  onRetryPayment?: (entry: BillingEntry) => void;

  /**
   * ID of the entry currently being processed (for loading state).
   */
  processingEntryId?: string | null;

  /**
   * Additional CSS classes.
   */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Map billing status color to Badge variant.
 * @see Requirements 16.4
 */
const STATUS_TO_BADGE_VARIANT: Record<ReturnType<typeof getBillingStatusColor>, BadgeVariant> = {
  success: 'success',    // Paid - green
  warning: 'warning',    // Pending - yellow
  destructive: 'danger', // Failed - red
  muted: 'default',      // Refunded - gray
};

/**
 * Default page size for billing history.
 */
export const DEFAULT_BILLING_PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Format date for display.
 */
function formatDate(date: Date, locale: string = 'id-ID'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Format date for input field (YYYY-MM-DD).
 */
function formatDateForInput(date: Date | null): string {
  if (!date) return '';
  return date.toISOString().split('T')[0];
}

/**
 * Parse date from input field.
 */
function parseDateFromInput(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Get badge variant for billing status.
 */
function getStatusBadgeVariant(status: BillingStatus): BadgeVariant {
  const colorType = getBillingStatusColor(status);
  return STATUS_TO_BADGE_VARIANT[colorType];
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Status badge component with color coding.
 * @see Requirements 16.4
 */
function StatusBadge({ status }: { status: BillingStatus }) {
  const { t } = useTranslation();
  const variant = getStatusBadgeVariant(status);
  const statusKey = status.toLowerCase();

  return (
    <Badge variant={variant}>
      {t(`billing.status.${statusKey}`, status)}
    </Badge>
  );
}

/**
 * Invoice action button component.
 * @see Requirements 16.5-16.6, 16.10-16.11
 */
function InvoiceAction({
  entry,
  onDownloadInvoice,
  onRetryPayment,
  isProcessing,
}: {
  entry: BillingEntry;
  onDownloadInvoice?: (entry: BillingEntry) => void;
  onRetryPayment?: (entry: BillingEntry) => void;
  isProcessing: boolean;
}) {
  const { t } = useTranslation();

  // Show "Download Invoice" for paid entries with invoice available
  if (canDownloadInvoice(entry)) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDownloadInvoice?.(entry)}
        disabled={isProcessing}
        loading={isProcessing}
        aria-label={t('billing.download_invoice_aria', 'Download invoice for {{description}}', {
          description: entry.description,
        })}
      >
        <DownloadIcon />
        <span className="hidden sm:inline">
          {t('billing.download_invoice', 'Download')}
        </span>
      </Button>
    );
  }

  // Show "Retry Payment" for failed entries that can be retried
  if (canRetryPayment(entry)) {
    return (
      <Button
        variant="danger"
        size="sm"
        onClick={() => onRetryPayment?.(entry)}
        disabled={isProcessing}
        loading={isProcessing}
        aria-label={t('billing.retry_payment_aria', 'Retry payment for {{description}}', {
          description: entry.description,
        })}
      >
        <RetryIcon />
        <span className="hidden sm:inline">
          {t('billing.retry_payment', 'Retry')}
        </span>
      </Button>
    );
  }

  // No action available
  return (
    <span className="text-sm text-gray-400 dark:text-gray-500">
      {t('billing.no_action', '—')}
    </span>
  );
}

/**
 * Download icon component.
 */
function DownloadIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

/**
 * Retry icon component.
 */
function RetryIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

/**
 * Date range filter component.
 * @see Requirements 16.8
 */
function DateRangeFilter({
  dateFilter,
  onDateFilterChange,
}: {
  dateFilter?: DateFilter;
  onDateFilterChange?: (filter: DateFilter) => void;
}) {
  const { t } = useTranslation();

  const handleFromChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onDateFilterChange?.({
        dateFrom: parseDateFromInput(e.target.value),
        dateTo: dateFilter?.dateTo ?? null,
      });
    },
    [dateFilter?.dateTo, onDateFilterChange],
  );

  const handleToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onDateFilterChange?.({
        dateFrom: dateFilter?.dateFrom ?? null,
        dateTo: parseDateFromInput(e.target.value),
      });
    },
    [dateFilter?.dateFrom, onDateFilterChange],
  );

  const handleClear = useCallback(() => {
    onDateFilterChange?.({
      dateFrom: null,
      dateTo: null,
    });
  }, [onDateFilterChange]);

  const hasFilters = dateFilter?.dateFrom || dateFilter?.dateTo;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="billing-date-from"
          className="text-xs font-medium text-gray-600 dark:text-gray-400"
        >
          {t('billing.filter_from', 'From')}
        </label>
        <input
          id="billing-date-from"
          type="date"
          value={formatDateForInput(dateFilter?.dateFrom ?? null)}
          onChange={handleFromChange}
          max={formatDateForInput(dateFilter?.dateTo ?? new Date())}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="billing-date-to"
          className="text-xs font-medium text-gray-600 dark:text-gray-400"
        >
          {t('billing.filter_to', 'To')}
        </label>
        <input
          id="billing-date-to"
          type="date"
          value={formatDateForInput(dateFilter?.dateTo ?? null)}
          onChange={handleToChange}
          min={formatDateForInput(dateFilter?.dateFrom ?? null)}
          max={formatDateForInput(new Date())}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          aria-label={t('billing.clear_filter', 'Clear date filter')}
        >
          {t('common.reset', 'Reset')}
        </Button>
      )}
    </div>
  );
}

/**
 * Empty state component for no billing history.
 * @see Requirements 16.9
 */
function EmptyBillingState() {
  const { t } = useTranslation();

  return (
    <div
      className="flex flex-col items-center justify-center py-12 text-center"
      role="status"
      aria-label={t('billing.empty_history', 'No billing history')}
    >
      <svg
        className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z"
        />
      </svg>
      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
        {t('billing.empty_title', 'No billing history')}
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t('billing.empty_description', 'Billing entries will appear here once you start a subscription.')}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * BillingHistoryTable — Displays billing entries with filtering and actions.
 *
 * @example
 * ```tsx
 * <BillingHistoryTable
 *   entries={billingHistory}
 *   isLoading={isLoading}
 *   page={currentPage}
 *   totalPages={totalPages}
 *   onPageChange={setPage}
 *   dateFilter={dateFilter}
 *   onDateFilterChange={setDateFilter}
 *   onDownloadInvoice={handleDownloadInvoice}
 *   onRetryPayment={handleRetryPayment}
 * />
 * ```
 */
export function BillingHistoryTable({
  entries,
  isLoading = false,
  page,
  totalPages,
  onPageChange,
  dateFilter,
  onDateFilterChange,
  onDownloadInvoice,
  onRetryPayment,
  processingEntryId,
  className = '',
}: BillingHistoryTableProps) {
  const { t, i18n } = useTranslation();

  // ---------------------------------------------------------------------------
  // Table Columns Definition
  // ---------------------------------------------------------------------------

  const columns: DataTableColumn<BillingEntry>[] = useMemo(
    () => [
      {
        key: 'date',
        header: t('billing.column_date', 'Date'),
        sortable: true,
        render: (entry: BillingEntry) => (
          <span className="text-sm text-gray-900 dark:text-white">
            {formatDate(entry.date, i18n.language)}
          </span>
        ),
      },
      {
        key: 'description',
        header: t('billing.column_description', 'Description'),
        render: (entry: BillingEntry) => (
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {entry.description}
            </span>
            {entry.paymentMethod && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {entry.paymentMethod.brand ?? entry.paymentMethod.type} {entry.paymentMethod.maskedNumber}
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'amount',
        header: t('billing.column_amount', 'Amount'),
        sortable: true,
        render: (entry: BillingEntry) => (
          <span
            className={`text-sm font-medium ${
              entry.amount < 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-gray-900 dark:text-white'
            }`}
          >
            {formatBillingAmount(entry.amount, entry.currency)}
          </span>
        ),
      },
      {
        key: 'status',
        header: t('billing.column_status', 'Status'),
        render: (entry: BillingEntry) => <StatusBadge status={entry.status} />,
      },
      {
        key: 'action',
        header: t('billing.column_action', 'Invoice'),
        render: (entry: BillingEntry) => (
          <InvoiceAction
            entry={entry}
            onDownloadInvoice={onDownloadInvoice}
            onRetryPayment={onRetryPayment}
            isProcessing={processingEntryId === entry.id}
          />
        ),
      },
    ],
    [t, i18n.language, onDownloadInvoice, onRetryPayment, processingEntryId],
  );

  // ---------------------------------------------------------------------------
  // Row key extractor
  // ---------------------------------------------------------------------------

  const rowKey = useCallback((entry: BillingEntry) => entry.id, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Check if no data and not loading
  const showEmptyState = !isLoading && entries.length === 0;

  return (
    <div
      className={`flex flex-col gap-4 ${className}`}
      role="region"
      aria-label={t('billing.history_section', 'Billing History')}
    >
      {/* Header with title and date filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('billing.history_title', 'Billing History')}
        </h3>
        {onDateFilterChange && (
          <DateRangeFilter
            dateFilter={dateFilter}
            onDateFilterChange={onDateFilterChange}
          />
        )}
      </div>

      {/* Table or Empty State */}
      {showEmptyState ? (
        <EmptyBillingState />
      ) : (
        <DataTable<BillingEntry>
          columns={columns}
          data={entries as BillingEntry[]}
          loading={isLoading}
          page={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
          rowKey={rowKey}
          emptyMessage={t('billing.empty_history', 'No billing history')}
          className="rounded-lg border border-gray-200 dark:border-gray-700"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  StatusBadge,
  InvoiceAction,
  DateRangeFilter,
  EmptyBillingState,
  DownloadIcon,
  RetryIcon,
  formatDate,
  formatDateForInput,
  parseDateFromInput,
  getStatusBadgeVariant,
};

export default BillingHistoryTable;
