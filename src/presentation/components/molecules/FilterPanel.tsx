'use client';

import { useCallback, useState, useId, useRef, useEffect } from 'react';
import { Button } from '../atoms/Button';
import { Label } from '../atoms/Label';

/**
 * Individual filter option used in select/multiselect filters
 */
export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Filter definition for declarative filter configuration
 */
export interface FilterDefinition {
  /** Unique key identifying this filter */
  key: string;
  /** Display label for the filter */
  label: string;
  /** Type of filter input */
  type: 'text' | 'select' | 'multiselect' | 'daterange';
  /** Options for select/multiselect filters */
  options?: FilterOption[];
  /** Placeholder text for text filters */
  placeholder?: string;
}

/**
 * Date range value structure
 */
export interface DateRangeValue {
  from: string | null;
  to: string | null;
}

/**
 * All possible filter value types
 */
export type FilterValue =
  | string
  | string[]
  | DateRangeValue
  | null
  | undefined;

/**
 * FilterPanel props following ConfirmDialog pattern
 */
export interface FilterPanelProps {
  /** Array of filter definitions */
  filters: FilterDefinition[];
  /** Current filter values keyed by filter key */
  values: Record<string, FilterValue>;
  /** Callback when a filter value changes */
  onChange: (key: string, value: FilterValue) => void;
  /** Callback when clear button is clicked */
  onClear: () => void;
  /** Callback when apply button is clicked */
  onApply: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Apply button label */
  applyLabel?: string;
  /** Clear button label */
  clearLabel?: string;
  /** Whether the apply action is loading */
  loading?: boolean;
}

/**
 * Reusable FilterPanel component for declarative filter configuration.
 * Supports text, select, multiselect, and daterange filter types.
 *
 * @example
 * ```tsx
 * <FilterPanel
 *   filters={[
 *     { key: 'search', label: 'Search', type: 'text', placeholder: 'Search...' },
 *     { key: 'status', label: 'Status', type: 'select', options: [...] },
 *     { key: 'roles', label: 'Roles', type: 'multiselect', options: [...] },
 *     { key: 'dateRange', label: 'Date Range', type: 'daterange' },
 *   ]}
 *   values={filterValues}
 *   onChange={handleFilterChange}
 *   onClear={handleClearFilters}
 *   onApply={handleApplyFilters}
 * />
 * ```
 */
export function FilterPanel({
  filters,
  values,
  onChange,
  onClear,
  onApply,
  className = '',
  applyLabel = 'Apply',
  clearLabel = 'Clear',
  loading = false,
}: FilterPanelProps) {
  const panelId = useId();

  const hasActiveFilters = Object.values(values).some(value => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') {
      const dateRange = value as DateRangeValue;
      return dateRange.from !== null || dateRange.to !== null;
    }
    return false;
  });

  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}
      role="region"
      aria-label="Filter panel">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {filters.map(filter => (
          <FilterField
            key={filter.key}
            filter={filter}
            value={values[filter.key]}
            onChange={value => onChange(filter.key, value)}
            panelId={panelId}
          />
        ))}
      </div>

      <div className="mt-4 flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={!hasActiveFilters || loading}>
          {clearLabel}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onApply}
          loading={loading}>
          {applyLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Internal props for individual filter field
 */
interface FilterFieldProps {
  filter: FilterDefinition;
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  panelId: string;
}

/**
 * Individual filter field renderer based on filter type
 */
function FilterField({ filter, value, onChange, panelId }: FilterFieldProps) {
  const fieldId = `${panelId}-${filter.key}`;

  switch (filter.type) {
    case 'text':
      return (
        <TextFilter
          fieldId={fieldId}
          filter={filter}
          value={(value as string) ?? ''}
          onChange={onChange}
        />
      );
    case 'select':
      return (
        <SelectFilter
          fieldId={fieldId}
          filter={filter}
          value={(value as string) ?? ''}
          onChange={onChange}
        />
      );
    case 'multiselect':
      return (
        <MultiselectFilter
          fieldId={fieldId}
          filter={filter}
          value={(value as string[]) ?? []}
          onChange={onChange}
        />
      );
    case 'daterange':
      return (
        <DateRangeFilter
          fieldId={fieldId}
          filter={filter}
          value={(value as DateRangeValue) ?? { from: null, to: null }}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

/**
 * Text input filter
 */
interface TextFilterProps {
  fieldId: string;
  filter: FilterDefinition;
  value: string;
  onChange: (value: string) => void;
}

function TextFilter({ fieldId, filter, value, onChange }: TextFilterProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId}>{filter.label}</Label>
      <input
        id={fieldId}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={filter.placeholder}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
    </div>
  );
}

/**
 * Single select dropdown filter
 */
interface SelectFilterProps {
  fieldId: string;
  filter: FilterDefinition;
  value: string;
  onChange: (value: string) => void;
}

function SelectFilter({ fieldId, filter, value, onChange }: SelectFilterProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId}>{filter.label}</Label>
      <select
        id={fieldId}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
        <option value="">All</option>
        {filter.options?.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Multiselect dropdown filter with checkboxes
 */
interface MultiselectFilterProps {
  fieldId: string;
  filter: FilterDefinition;
  value: string[];
  onChange: (value: string[]) => void;
}

function MultiselectFilter({
  fieldId,
  filter,
  value,
  onChange,
}: MultiselectFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggleOption = useCallback(
    (optionValue: string) => {
      if (value.includes(optionValue)) {
        onChange(value.filter(v => v !== optionValue));
      } else {
        onChange([...value, optionValue]);
      }
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, optionValue: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggleOption(optionValue);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    },
    [handleToggleOption],
  );

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedLabels = filter.options
    ?.filter(opt => value.includes(opt.value))
    .map(opt => opt.label)
    .join(', ');

  return (
    <div className="relative flex flex-col gap-1.5" ref={containerRef}>
      <Label htmlFor={fieldId}>{filter.label}</Label>
      <button
        ref={buttonRef}
        id={fieldId}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
        <span
          className={
            value.length > 0 ? '' : 'text-gray-400 dark:text-gray-500'
          }>
          {value.length > 0 ? selectedLabels : 'Select...'}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-labelledby={fieldId}
          aria-multiselectable="true"
          className="absolute left-0 top-full z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800">
          {filter.options?.map(option => {
            const isSelected = value.includes(option.value);
            const optionId = `${fieldId}-option-${option.value}`;

            return (
              <div
                key={option.value}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => handleToggleOption(option.value)}
                onKeyDown={e => handleKeyDown(e, option.value)}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:hover:bg-gray-700 dark:focus:bg-gray-700">
                <input
                  type="checkbox"
                  id={optionId}
                  checked={isSelected}
                  onChange={() => handleToggleOption(option.value)}
                  tabIndex={-1}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                />
                <label
                  htmlFor={optionId}
                  className="flex-1 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                  {option.label}
                </label>
              </div>
            );
          })}
          {(!filter.options || filter.options.length === 0) && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              No options available
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Date range filter with from/to date inputs
 */
interface DateRangeFilterProps {
  fieldId: string;
  filter: FilterDefinition;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}

function DateRangeFilter({
  fieldId,
  filter,
  value,
  onChange,
}: DateRangeFilterProps) {
  const handleFromChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({
        ...value,
        from: e.target.value || null,
      });
    },
    [value, onChange],
  );

  const handleToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({
        ...value,
        to: e.target.value || null,
      });
    },
    [value, onChange],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{filter.label}</Label>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label htmlFor={`${fieldId}-from`} className="sr-only">
            From date
          </label>
          <input
            id={`${fieldId}-from`}
            type="date"
            value={value.from ?? ''}
            onChange={handleFromChange}
            max={value.to ?? undefined}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <span
          className="text-sm text-gray-500 dark:text-gray-400"
          aria-hidden="true">
          to
        </span>
        <div className="flex-1">
          <label htmlFor={`${fieldId}-to`} className="sr-only">
            To date
          </label>
          <input
            id={`${fieldId}-to`}
            type="date"
            value={value.to ?? ''}
            onChange={handleToChange}
            min={value.from ?? undefined}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      </div>
    </div>
  );
}
