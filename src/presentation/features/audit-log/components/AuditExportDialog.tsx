'use client';

/**
 * AuditExportDialog — Modal dialog for exporting audit logs.
 *
 * Provides format selection (CSV/JSON), date range pre-filling from current filters,
 * row count warning for large exports (>10,000), progress indicator during export,
 * and automatic download trigger on completion.
 *
 * @see Requirements 18.1-18.10 (Audit Log Export)
 * @see Design Components > 10. Audit Log > Export functionality
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@presentation/components/atoms/Button';
import { Label } from '@presentation/components/atoms/Label';
import { useFocusTrap, useAriaLive } from '@presentation/hooks/useAccessibility';
import type {
  AuditExportFormat,
  AuditExportResult,
} from '@core/domains/audit/entities/AuditLogEntry';
import type { AuditFilters } from '@core/domains/audit/entities/AuditFilters';
import {
  MAX_AUDIT_EXPORT_ROWS,
  generateAuditExportFilename,
} from '@core/domains/audit/entities/AuditLogEntry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for AuditExportDialog component.
 */
export interface AuditExportDialogProps {
  /** Whether the dialog is open */
  readonly isOpen: boolean;
  /** Callback when dialog should close */
  readonly onClose: () => void;
  /** Current filters from the audit log viewer (pre-fill date range) */
  readonly currentFilters: AuditFilters;
  /** Tenant slug/name for filename generation */
  readonly tenantSlug: string;
  /** Total row count matching current filters (for warning display) */
  readonly rowCount: number;
  /** Whether row count is still loading */
  readonly isLoadingCount?: boolean;
  /** Callback to execute the export */
  readonly onExport: (
    format: AuditExportFormat,
    dateFrom: Date,
    dateTo: Date,
  ) => Promise<AuditExportResult>;
  /** Additional CSS classes */
  readonly className?: string;
}

/**
 * Export state machine states.
 */
type ExportState = 'idle' | 'exporting' | 'success' | 'error';

/**
 * Format option configuration.
 */
interface FormatOption {
  readonly value: AuditExportFormat;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly icon: ReactNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Export format options configuration.
 */
const FORMAT_OPTIONS: readonly FormatOption[] = [
  {
    value: 'csv',
    labelKey: 'audit.export.format_csv',
    descriptionKey: 'audit.export.format_csv_description',
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    value: 'json',
    labelKey: 'audit.export.format_json',
    descriptionKey: 'audit.export.format_json_description',
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
      </svg>
    ),
  },
] as const;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Format a date for display in the date input.
 */
function formatDateForInput(date: Date | null): string {
  if (!date) return '';
  return date.toISOString().split('T')[0] ?? '';
}

/**
 * Parse a date string from input.
 */
function parseDateFromInput(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Get default date range (last 30 days) if no filters provided.
 */
function getDefaultDateRange(): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);

  const from = new Date();
  from.setDate(from.getDate() - 30);
  from.setHours(0, 0, 0, 0);

  return { from, to };
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

/**
 * Format selection radio button component.
 */
function FormatSelector({
  option,
  selected,
  onSelect,
  disabled,
}: {
  option: FormatOption;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`
        flex flex-1 cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-all
        ${
          selected
            ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500'
        }
        ${disabled ? 'cursor-not-allowed opacity-50' : ''}
      `}>
      <div
        className={`
          flex h-10 w-10 items-center justify-center rounded-lg
          ${selected ? 'bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}
        `}>
        {option.icon}
      </div>
      <div className="flex flex-col items-start text-left">
        <span
          className={`
            font-medium
            ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}
          `}>
          {t(option.labelKey)}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {t(option.descriptionKey)}
        </span>
      </div>
      <div className="ml-auto">
        <div
          className={`
            flex h-5 w-5 items-center justify-center rounded-full border-2
            ${selected ? 'border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-400' : 'border-gray-300 dark:border-gray-500'}
          `}>
          {selected && (
            <svg
              className="h-3 w-3 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}

/**
 * Row count warning banner component.
 *
 * @see Requirements 18.5 (Maximum rows warning)
 */
function RowCountWarning({
  rowCount,
  isLoading,
  maxRows,
}: {
  rowCount: number;
  isLoading: boolean;
  maxRows: number;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-3 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-300">
        <svg
          className="h-4 w-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span>{t('audit.export.counting_rows')}</span>
      </div>
    );
  }

  const exceedsLimit = rowCount > maxRows;
  const isLargeExport = rowCount > 5000;

  if (exceedsLimit) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        <svg
          className="mt-0.5 h-4 w-4 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <div className="flex flex-col">
          <span className="font-medium">
            {t('audit.export.row_limit_exceeded_title', {
              count: rowCount.toLocaleString(),
              max: maxRows.toLocaleString(),
            })}
          </span>
          <span className="mt-1 text-xs">
            {t('audit.export.row_limit_exceeded_hint')}
          </span>
        </div>
      </div>
    );
  }

  if (isLargeExport) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
        <svg
          className="h-4 w-4 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clipRule="evenodd"
          />
        </svg>
        <span>
          {t('audit.export.large_export_info', {
            count: rowCount.toLocaleString(),
          })}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-3 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-300">
      <svg
        className="h-4 w-4 flex-shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        {t('audit.export.row_count_info', {
          count: rowCount.toLocaleString(),
        })}
      </span>
    </div>
  );
}

/**
 * Export progress indicator component.
 */
function ExportProgress({ filename }: { filename: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <div className="relative">
        <svg
          className="h-16 w-16 animate-spin text-blue-500"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            className="h-8 w-8 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </div>
      </div>
      <div className="text-center">
        <p className="font-medium text-gray-900 dark:text-gray-100">
          {t('audit.export.exporting')}
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {filename}
        </p>
      </div>
    </div>
  );
}

/**
 * Export success message component.
 */
function ExportSuccess({
  result,
  onClose,
}: {
  result: AuditExportResult;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <svg
          className="h-8 w-8 text-green-600 dark:text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <div className="text-center">
        <p className="font-medium text-gray-900 dark:text-gray-100">
          {t('audit.export.success')}
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('audit.export.rows_exported', {
            count: result.rowCount.toLocaleString(),
          })}
          {result.wasTruncated && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              ({t('audit.export.truncated')})
            </span>
          )}
        </p>
      </div>
      <Button variant="primary" size="sm" onClick={onClose}>
        {t('common.close')}
      </Button>
    </div>
  );
}

/**
 * Export error message component.
 */
function ExportError({
  error,
  onRetry,
  onClose,
}: {
  error: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <svg
          className="h-8 w-8 text-red-600 dark:text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </div>
      <div className="text-center">
        <p className="font-medium text-gray-900 dark:text-gray-100">
          {t('audit.export.error')}
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{error}</p>
      </div>
      <div className="flex gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * AuditExportDialog component.
 *
 * Modal dialog for exporting audit logs with format selection,
 * date range configuration, row count warning, and progress tracking.
 *
 * @see Requirements 18.1-18.10 (Audit Log Export)
 * @see Requirements 23.9 (Focus trapping for modals)
 * @see Requirements 23.10 (ARIA live regions for dynamic content)
 */
export function AuditExportDialog({
  isOpen,
  onClose,
  currentFilters,
  tenantSlug,
  rowCount,
  isLoadingCount = false,
  onExport,
  className = '',
}: AuditExportDialogProps): ReactNode {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uniqueId = useId();
  const titleId = `export-dialog-title-${uniqueId}`;
  const descId = `export-dialog-description-${uniqueId}`;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [selectedFormat, setSelectedFormat] =
    useState<AuditExportFormat>('csv');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportResult, setExportResult] = useState<AuditExportResult | null>(
    null,
  );
  const [exportError, setExportError] = useState<string | null>(null);

  // Focus trap for accessibility (Requirements 23.9)
  const focusTrapRef = useFocusTrap<HTMLDivElement>({
    enabled: isOpen && exportState === 'idle',
    returnFocusOnDeactivate: true,
  });

  // ARIA live announcements (Requirements 23.10)
  const announce = useAriaLive({ politeness: 'polite' });

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  /**
   * Generated filename preview.
   *
   * @see Requirements 18.7 (filename pattern)
   */
  const generatedFilename = useMemo(() => {
    const from = dateFrom ?? getDefaultDateRange().from;
    const to = dateTo ?? getDefaultDateRange().to;
    return generateAuditExportFilename(tenantSlug, from, to, selectedFormat);
  }, [tenantSlug, dateFrom, dateTo, selectedFormat]);

  /**
   * Whether the export can proceed.
   */
  const canExport = useMemo(() => {
    if (exportState === 'exporting') return false;
    if (rowCount > MAX_AUDIT_EXPORT_ROWS) return false;
    if (isLoadingCount) return false;
    return true;
  }, [exportState, rowCount, isLoadingCount]);

  /**
   * Date validation error.
   */
  const dateError = useMemo(() => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return t('audit.export.date_error_invalid_range');
    }
    return null;
  }, [dateFrom, dateTo, t]);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  /**
   * Pre-fill date range from current filters when dialog opens.
   *
   * @see Requirements 18.3 (Date range pre-filled from current filter)
   */
  useEffect(() => {
    if (isOpen) {
      // Pre-fill from current filters or use default range
      const from = currentFilters.dateFrom ?? getDefaultDateRange().from;
      const to = currentFilters.dateTo ?? getDefaultDateRange().to;
      setDateFrom(from);
      setDateTo(to);

      // Reset export state
      setExportState('idle');
      setExportResult(null);
      setExportError(null);
    }
  }, [isOpen, currentFilters]);

  /**
   * Announce export state changes to screen readers (Requirements 23.10)
   */
  useEffect(() => {
    if (exportState === 'exporting') {
      announce(t('audit.export.exporting'));
    } else if (exportState === 'success' && exportResult) {
      announce(t('audit.export.success') + '. ' + t('audit.export.rows_exported', { count: exportResult.rowCount }));
    } else if (exportState === 'error' && exportError) {
      announce(t('audit.export.error') + ': ' + exportError);
    }
  }, [exportState, exportResult, exportError, announce, t]);

  /**
   * Dialog open/close management.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle dialog close via backdrop click or escape key.
   */
  const handleDialogClose = useCallback(() => {
    if (exportState === 'exporting') return; // Don't allow close while exporting
    onClose();
  }, [exportState, onClose]);

  /**
   * Handle export submission.
   *
   * @see Requirements 18.4 (Export process with progress and download trigger)
   */
  const handleExport = useCallback(async () => {
    if (!canExport || dateError) return;

    const from = dateFrom ?? getDefaultDateRange().from;
    const to = dateTo ?? getDefaultDateRange().to;

    setExportState('exporting');
    setExportError(null);

    try {
      const result = await onExport(selectedFormat, from, to);
      setExportResult(result);
      setExportState('success');

      // Trigger automatic download
      // @see Requirements 18.4 (Trigger download when ready)
      if (result.downloadUrl) {
        const link = document.createElement('a');
        link.href = result.downloadUrl;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t('audit.export_error');
      setExportError(errorMessage);
      setExportState('error');
    }
  }, [canExport, dateError, dateFrom, dateTo, onExport, selectedFormat, t]);

  /**
   * Handle retry after error.
   */
  const handleRetry = useCallback(() => {
    setExportState('idle');
    setExportError(null);
  }, []);

  /**
   * Handle date from change.
   */
  const handleDateFromChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDateFrom(parseDateFromInput(e.target.value));
    },
    [],
  );

  /**
   * Handle date to change.
   */
  const handleDateToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDateTo(parseDateFromInput(e.target.value));
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      className={`
        fixed inset-0 z-50 m-auto w-full max-w-lg rounded-xl border-0 bg-white p-0 shadow-2xl
        backdrop:bg-black/50 dark:bg-gray-800
        ${className}
      `}
      aria-labelledby={titleId}
      aria-describedby={descId}
      aria-modal="true">
      {/* Focus trap wrapper for form content (Requirements 23.9) */}
      <div ref={focusTrapRef}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <h2
              id={titleId}
              className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('audit.export.title')}
            </h2>
            <p
              id={descId}
              className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('audit.export.description')}
            </p>
          </div>
          {exportState !== 'exporting' && (
            <button
              type="button"
              onClick={handleDialogClose}
              className="rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={t('common.close')}>
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-4">
        {/* Progress / Success / Error States */}
        {exportState === 'exporting' && (
          <ExportProgress filename={generatedFilename} />
        )}

        {exportState === 'success' && exportResult && (
          <ExportSuccess result={exportResult} onClose={onClose} />
        )}

        {exportState === 'error' && exportError && (
          <ExportError
            error={exportError}
            onRetry={handleRetry}
            onClose={onClose}
          />
        )}

        {/* Idle State - Form */}
        {exportState === 'idle' && (
          <div className="flex flex-col gap-5">
            {/* Format Selection */}
            <div>
              <Label className="mb-2 block">
                {t('audit.export.format_label')}
              </Label>
              <div className="flex gap-3">
                {FORMAT_OPTIONS.map(option => (
                  <FormatSelector
                    key={option.value}
                    option={option}
                    selected={selectedFormat === option.value}
                    onSelect={() => setSelectedFormat(option.value)}
                    disabled={exportState !== 'idle'}
                  />
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div>
              <Label className="mb-2 block">
                {t('audit.export.date_range_label')}
              </Label>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label htmlFor="export-date-from" className="sr-only">
                    {t('audit.export.date_from')}
                  </label>
                  <input
                    id="export-date-from"
                    type="date"
                    value={formatDateForInput(dateFrom)}
                    onChange={handleDateFromChange}
                    max={formatDateForInput(dateTo)}
                    className={`
                      w-full rounded-md border px-3 py-2 text-sm shadow-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                      dark:bg-gray-800 dark:text-gray-100
                      ${dateError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 dark:border-gray-600'}
                    `}
                  />
                </div>
                <span
                  className="text-sm text-gray-500 dark:text-gray-400"
                  aria-hidden="true">
                  {t('common.to')}
                </span>
                <div className="flex-1">
                  <label htmlFor="export-date-to" className="sr-only">
                    {t('audit.export.date_to')}
                  </label>
                  <input
                    id="export-date-to"
                    type="date"
                    value={formatDateForInput(dateTo)}
                    onChange={handleDateToChange}
                    min={formatDateForInput(dateFrom)}
                    className={`
                      w-full rounded-md border px-3 py-2 text-sm shadow-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                      dark:bg-gray-800 dark:text-gray-100
                      ${dateError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 dark:border-gray-600'}
                    `}
                  />
                </div>
              </div>
              {dateError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {dateError}
                </p>
              )}
            </div>

            {/* Row Count Warning */}
            <RowCountWarning
              rowCount={rowCount}
              isLoading={isLoadingCount}
              maxRows={MAX_AUDIT_EXPORT_ROWS}
            />

            {/* Filename Preview */}
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('audit.export.filename_preview')}
              </span>
              <p className="mt-1 break-all font-mono text-sm text-gray-700 dark:text-gray-300">
                {generatedFilename}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {exportState === 'idle' && (
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <Button variant="ghost" size="sm" onClick={handleDialogClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleExport}
            disabled={!canExport || !!dateError}>
            {t('audit.export.export_button')}
          </Button>
        </div>
      )}
      </div>{/* End focus trap wrapper */}
    </dialog>
  );
}
