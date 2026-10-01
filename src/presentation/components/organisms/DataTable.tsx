'use client';

import { useCallback, useMemo } from 'react';
import { Spinner } from '../atoms/Spinner';
import { EmptyState } from '../molecules/EmptyState';
import { useBreakpoint, MIN_TOUCH_TARGET_SIZE } from '@presentation/hooks/useMediaQuery';

/**
 * Sort direction type for sortable columns
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort state object representing current sorting configuration
 */
export interface SortState {
  column: string;
  direction: SortDirection;
}

/**
 * Column visibility priority for responsive design.
 * Columns with lower priority are hidden first on smaller screens.
 *
 * @see Requirements 23.2 (DataTable collapse non-essential columns on mobile)
 */
export type ColumnPriority = 'essential' | 'high' | 'medium' | 'low';

/**
 * Responsive visibility configuration for columns.
 */
export interface ColumnResponsiveConfig {
  /** Priority determines which columns are hidden first on mobile */
  priority?: ColumnPriority;
  /** Hide on mobile (< 768px) */
  hideOnMobile?: boolean;
  /** Hide on tablet (768px - 1023px) */
  hideOnTablet?: boolean;
  /** Minimum breakpoint to show this column */
  minBreakpoint?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

/**
 * Column definition for DataTable
 */
export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  /** Whether this column is sortable. Defaults to false. */
  sortable?: boolean;
  /**
   * Responsive configuration for column visibility.
   * @see Requirements 23.2
   */
  responsive?: ColumnResponsiveConfig;
}

/**
 * Props for the DataTable component
 */
export interface DataTableProps<T> {
  /** Column definitions */
  columns: DataTableColumn<T>[];
  /** Data array to display */
  data: T[];
  /** Loading state - shows spinner when true */
  loading?: boolean;
  /** Current page number (1-indexed) */
  page?: number;
  /** Total number of pages */
  totalPages?: number;
  /** Callback when page changes */
  onPageChange?: (page: number) => void;
  /** Message shown when data is empty */
  emptyMessage?: string;
  /** Additional CSS classes */
  className?: string;
  /** Function to extract unique key from each row */
  rowKey: (row: T) => string;

  // Selection props (Requirement 6.1, 6.2)
  /** Enable row selection with checkboxes */
  selectable?: boolean;
  /** Set of currently selected row IDs */
  selectedIds?: Set<string>;
  /** Callback when selection changes */
  onSelectionChange?: (selectedIds: Set<string>) => void;
  /** Predicate to conditionally disable selection for specific rows */
  disableSelection?: (row: T) => boolean;

  // Sorting props (Requirement 2.7)
  /** Enable column sorting */
  sortable?: boolean;
  /** Current sort column key */
  sortColumn?: string;
  /** Current sort direction */
  sortDirection?: SortDirection;
  /** Callback when sort changes */
  onSortChange?: (column: string, direction: SortDirection) => void;

  // Responsive props (Requirement 23.1-23.2)
  /**
   * Enable responsive column hiding based on viewport width.
   * When enabled, columns with lower priority will be hidden on smaller screens.
   * @default true
   */
  responsive?: boolean;
  /**
   * Stack action buttons vertically on mobile.
   * @see Requirements 23.2
   * @default true
   */
  stackActionsOnMobile?: boolean;

  // Accessibility props (Requirements 23.5, 23.11)
  /**
   * Accessible caption/label for the table. Visible to screen readers.
   * @see Requirements 23.11 (alt text for images/icons)
   */
  caption?: string;
  /**
   * Hide the caption visually (still accessible to screen readers).
   * @default true
   */
  hiddenCaption?: boolean;
}

/**
 * Sort indicator icon component
 */
function SortIcon({
  direction,
  isActive,
}: {
  direction?: SortDirection;
  isActive: boolean;
}) {
  if (!isActive) {
    // Show neutral sort indicator for sortable but inactive columns
    return (
      <svg
        className="ml-1 inline h-4 w-4 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
        />
      </svg>
    );
  }

  return direction === 'asc' ? (
    <svg
      className="ml-1 inline h-4 w-4 text-blue-600 dark:text-blue-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 15l7-7 7 7"
      />
    </svg>
  ) : (
    <svg
      className="ml-1 inline h-4 w-4 text-blue-600 dark:text-blue-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

/**
 * Checkbox component for row selection
 * @see Requirements 23.6 (44x44px minimum touch target)
 */
function SelectionCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  return (
    <label className="flex min-h-[44px] min-w-[44px] items-center justify-center cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        ref={el => {
          if (el) {
            el.indeterminate = indeterminate ?? false;
          }
        }}
        aria-label={ariaLabel}
        className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        }`}
      />
    </label>
  );
}

/**
 * DataTable component with pagination, selection, and sorting support.
 *
 * @example
 * // Basic usage
 * <DataTable
 *   columns={[{ key: 'name', header: 'Name' }]}
 *   data={users}
 *   rowKey={row => row.id}
 * />
 *
 * @example
 * // With selection
 * <DataTable
 *   columns={columns}
 *   data={members}
 *   rowKey={row => row.id}
 *   selectable
 *   selectedIds={selectedIds}
 *   onSelectionChange={setSelectedIds}
 *   disableSelection={row => row.status === 'REVOKED'}
 * />
 *
 * @example
 * // With sorting
 * <DataTable
 *   columns={[
 *     { key: 'name', header: 'Name', sortable: true },
 *     { key: 'email', header: 'Email', sortable: true },
 *   ]}
 *   data={members}
 *   rowKey={row => row.id}
 *   sortable
 *   sortColumn={sortColumn}
 *   sortDirection={sortDirection}
 *   onSortChange={handleSortChange}
 * />
 */
export function DataTable<T>({
  columns,
  data,
  loading = false,
  page = 1,
  totalPages = 1,
  onPageChange,
  emptyMessage = 'No data available',
  className = '',
  rowKey,
  // Selection props
  selectable = false,
  selectedIds,
  onSelectionChange,
  disableSelection,
  // Sorting props
  sortable = false,
  sortColumn,
  sortDirection,
  onSortChange,
  // Responsive props
  responsive = true,
  stackActionsOnMobile = true,
  // Accessibility props (Requirements 23.5, 23.11)
  caption,
  hiddenCaption = true,
}: DataTableProps<T>) {
  const { isMobile, isTablet, isAbove } = useBreakpoint();

  // Filter columns based on responsive configuration
  const visibleColumns = useMemo(() => {
    if (!responsive) return columns;

    return columns.filter(col => {
      const config = col.responsive;
      if (!config) return true;

      // Check hideOnMobile
      if (isMobile && config.hideOnMobile) return false;

      // Check hideOnTablet
      if (isTablet && config.hideOnTablet) return false;

      // Check minBreakpoint
      if (config.minBreakpoint && !isAbove(config.minBreakpoint)) return false;

      // Check priority-based hiding on mobile
      if (isMobile && config.priority) {
        // On mobile, only show essential and high priority columns
        return config.priority === 'essential' || config.priority === 'high';
      }

      // On tablet, show essential, high, and medium priority
      if (isTablet && config.priority) {
        return config.priority !== 'low';
      }

      return true;
    });
  }, [columns, responsive, isMobile, isTablet, isAbove]);

  // Calculate selection state
  const selectableRowIds = useMemo(() => {
    if (!selectable) return new Set<string>();
    return new Set(
      data
        .filter(row => !disableSelection?.(row))
        .map(row => rowKey(row))
    );
  }, [data, selectable, disableSelection, rowKey]);

  const allSelectableSelected = useMemo(() => {
    if (selectableRowIds.size === 0) return false;
    return Array.from(selectableRowIds).every(id => selectedIds?.has(id));
  }, [selectableRowIds, selectedIds]);

  const someSelected = useMemo(() => {
    if (!selectedIds || selectedIds.size === 0) return false;
    const hasAnySelected = Array.from(selectableRowIds).some(id =>
      selectedIds.has(id)
    );
    return hasAnySelected && !allSelectableSelected;
  }, [selectableRowIds, selectedIds, allSelectableSelected]);

  // Handle header checkbox (select all / deselect all)
  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;

    if (allSelectableSelected) {
      // Deselect all
      onSelectionChange(new Set());
    } else {
      // Select all selectable rows
      onSelectionChange(new Set(selectableRowIds));
    }
  }, [allSelectableSelected, selectableRowIds, onSelectionChange]);

  // Handle individual row selection
  const handleRowSelect = useCallback(
    (rowId: string) => {
      if (!onSelectionChange || !selectedIds) return;

      const newSelectedIds = new Set(selectedIds);
      if (newSelectedIds.has(rowId)) {
        newSelectedIds.delete(rowId);
      } else {
        newSelectedIds.add(rowId);
      }
      onSelectionChange(newSelectedIds);
    },
    [selectedIds, onSelectionChange]
  );

  // Handle column header click for sorting
  const handleSortClick = useCallback(
    (columnKey: string) => {
      if (!onSortChange) return;

      const newDirection: SortDirection =
        sortColumn === columnKey && sortDirection === 'asc' ? 'desc' : 'asc';
      onSortChange(columnKey, newDirection);
    },
    [sortColumn, sortDirection, onSortChange]
  );

  // Check if a column is sortable
  const isColumnSortable = useCallback(
    (col: DataTableColumn<T>) => {
      return sortable && (col.sortable ?? false);
    },
    [sortable]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <div className={`overflow-x-auto -mx-4 sm:mx-0 ${className}`}>
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        {/* Accessible caption for screen readers (Requirements 23.5, 23.11) */}
        {caption && (
          <caption
            className={
              hiddenCaption
                ? 'sr-only'
                : 'py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300'
            }>
            {caption}
          </caption>
        )}
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {/* Selection checkbox header */}
            {selectable && (
              <th
                scope="col"
                className="w-12 px-2 sm:px-4 py-3 text-left">
                <SelectionCheckbox
                  checked={allSelectableSelected}
                  indeterminate={someSelected}
                  disabled={selectableRowIds.size === 0}
                  onChange={handleSelectAll}
                  ariaLabel={
                    allSelectableSelected
                      ? 'Deselect all rows'
                      : 'Select all rows'
                  }
                />
              </th>
            )}
            {visibleColumns.map(col => {
              const columnSortable = isColumnSortable(col);
              const isActiveSort = sortColumn === col.key;

              return (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 ${
                    columnSortable
                      ? 'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700 min-h-[44px]'
                      : ''
                  }`}
                  onClick={
                    columnSortable ? () => handleSortClick(col.key) : undefined
                  }
                  onKeyDown={
                    columnSortable
                      ? e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSortClick(col.key);
                          }
                        }
                      : undefined
                  }
                  tabIndex={columnSortable ? 0 : undefined}
                  role={columnSortable ? 'button' : undefined}
                  aria-sort={
                    isActiveSort
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }>
                  <span className="flex items-center min-h-[44px] sm:min-h-0">
                    {col.header}
                    {columnSortable && (
                      <SortIcon
                        direction={sortDirection}
                        isActive={isActiveSort}
                      />
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
          {data.map(row => {
            const id = rowKey(row);
            const isSelected = selectedIds?.has(id) ?? false;
            const isDisabled = disableSelection?.(row) ?? false;

            return (
              <tr
                key={id}
                className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}>
                {/* Selection checkbox cell */}
                {selectable && (
                  <td className="w-12 whitespace-nowrap px-2 sm:px-4 py-3">
                    <SelectionCheckbox
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => handleRowSelect(id)}
                      ariaLabel={
                        isSelected ? `Deselect row ${id}` : `Select row ${id}`
                      }
                    />
                  </td>
                )}
                {visibleColumns.map(col => (
                  <td
                    key={col.key}
                    className="whitespace-nowrap px-2 sm:px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Pagination - responsive layout */}
      {totalPages > 1 && onPageChange && (
        <nav
          className={`flex items-center border-t border-gray-200 px-2 sm:px-4 py-3 dark:border-gray-700 ${
            isMobile ? 'flex-col gap-3' : 'justify-between'
          }`}
          aria-label="Table pagination">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="min-h-[44px] min-w-[44px] rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800">
            Previous
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="min-h-[44px] min-w-[44px] rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800">
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
