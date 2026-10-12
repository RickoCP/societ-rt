'use client';

/**
 * SearchableSelect — Accessible single-select dropdown with a built-in search filter.
 *
 * Shared UI molecule (Atomic Design). A drop-in replacement for a native
 * `<select>` where the option list can be long enough to benefit from
 * type-ahead filtering (e.g. household pickers).
 *
 * Contains NO business logic: options, labels, and the selected value are fully
 * controlled via props. All user-facing text is passed in by the caller so each
 * feature can route it through its own i18n.
 *
 * Accessibility:
 * - Trigger exposes `role="combobox"` with `aria-expanded` / `aria-controls`.
 * - Listbox uses `role="listbox"`; options use `role="option"` + `aria-selected`.
 * - Full keyboard support: Enter/Space/ArrowDown to open, Arrow keys to move,
 *   Enter to choose, Escape to close, type-ahead via the search input.
 * - Closes on outside click and on blur leaving the component.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface SearchableSelectOption {
  /** Stable value submitted when the option is chosen. */
  readonly value: string;
  /** Visible label shown in the list and trigger. */
  readonly label: string;
  /**
   * Optional extra text searched in addition to `label`. Useful when the
   * visible label omits data the user may still want to search by.
   */
  readonly keywords?: string;
}

export interface SearchableSelectProps {
  /** Selected option value (controlled). Empty string means "nothing selected". */
  readonly value: string;
  /** Called with the chosen option value, or '' when the selection is cleared. */
  readonly onChange: (value: string) => void;
  /** Options to display. */
  readonly options: readonly SearchableSelectOption[];
  /** Text shown on the trigger when nothing is selected. */
  readonly placeholder?: string;
  /** Placeholder for the search input inside the dropdown. */
  readonly searchPlaceholder?: string;
  /** Message shown when the filter matches no options. */
  readonly noResultsText?: string;
  /** Disables the control (e.g. while options are loading). */
  readonly disabled?: boolean;
  /** Text to show on the trigger while disabled due to loading. */
  readonly loadingText?: string;
  /** When true, the trigger shows `loadingText` instead of the placeholder. */
  readonly isLoading?: boolean;
  /** id applied to the trigger so an external `<label htmlFor>` can target it. */
  readonly id?: string;
  /** Accessible name when no visible label is associated. */
  readonly ariaLabel?: string;
  /** Marks the field as required for form semantics. */
  readonly required?: boolean;
  /** Extra classes for the outer wrapper. */
  readonly className?: string;
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  noResultsText = 'No results',
  disabled = false,
  loadingText = 'Loading…',
  isLoading = false,
  id,
  ariaLabel,
  required = false,
  className = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  const selectedOption = useMemo(
    () => options.find(o => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter(o => {
      const haystack = `${o.label} ${o.keywords ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query]);

  const isDisabled = disabled || isLoading;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [open]);

  // Focus the search box and reset highlight whenever the menu opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      const selectedIdx = options.findIndex(o => o.value === value);
      setActiveIndex(selectedIdx);
      // Defer focus until the input is mounted.
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, options, value]);

  const commit = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      setOpen(false);
    },
    [onChange],
  );

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (isDisabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = filtered[activeIndex];
      if (option) commit(option.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const triggerText = isLoading
    ? loadingText
    : (selectedOption?.label ?? placeholder);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        disabled={isDisabled}
        onClick={() => !isDisabled && setOpen(o => !o)}
        onKeyDown={handleTriggerKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-left text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
        <span className={selectedOption ? '' : 'text-gray-400 dark:text-gray-400'}>
          {triggerText}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
          onKeyDown={handleListKeyDown}>
          <div className="border-b border-gray-100 p-2 dark:border-gray-700">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>

          <ul
            id={listboxId}
            role="listbox"
            className="max-h-60 overflow-y-auto py-1"
            aria-label={ariaLabel}>
            {filtered.length === 0 ? (
              <li
                role="option"
                aria-selected={false}
                aria-disabled
                className="px-4 py-2 text-sm text-gray-400">
                {noResultsText}
              </li>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commit(option.value)}
                    className={`cursor-pointer px-4 py-2 text-sm ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                        : 'text-gray-800 dark:text-gray-100'
                    } ${isSelected ? 'font-semibold' : ''}`}>
                    {option.label}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
