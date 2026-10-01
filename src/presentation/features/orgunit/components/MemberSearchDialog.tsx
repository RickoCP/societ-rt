'use client';

/**
 * MemberSearchDialog — Dialog component for searching and selecting members
 * to assign to an OrgUnit.
 *
 * This component provides:
 * - Search input for filtering members by name or email
 * - Multi-select capability for batch assignment
 * - Display of current OrgUnit assignment for each member
 * - Filtering based on user's authorization scope
 *
 * SECURITY CONSIDERATIONS:
 * - Members are filtered server-side by user's authorization scope
 * - UI filtering is for UX convenience only; server enforces actual scope
 * - Member selection does not grant access; assignment is validated server-side
 *
 * @see Requirements 9.4, 9.5 (OrgUnit Member Assignment)
 * @see Design Section 7 (OrgUnit Member Assignment - MemberSearchDialogProps)
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import { Input } from '@presentation/components/atoms/Input';
import { Spinner } from '@presentation/components/atoms/Spinner';
import { EmptyState } from '@presentation/components/molecules/EmptyState';
import type { MemberSummary } from '@core/domains/membership/entities/Member';
import type { MembershipRole } from '@core/domains/membership/types/MembershipRole';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for MemberSearchDialog component.
 *
 * @see Requirements 9.4, 9.5
 */
export interface MemberSearchDialogProps {
  /**
   * Controls whether the dialog is open.
   */
  isOpen: boolean;

  /**
   * Called when the dialog should be closed (cancel or backdrop click).
   */
  onClose: () => void;

  /**
   * Called when the user confirms selection with the selected member IDs.
   *
   * @param memberIds - Array of selected member IDs to assign
   */
  onConfirm: (memberIds: string[]) => void;

  /**
   * Array of member IDs to exclude from the search results.
   * Typically members already assigned to the target OrgUnit.
   */
  excludeIds?: string[];

  /**
   * User's authorization scope OrgUnit ID.
   * When provided, search results are filtered to members within this scope.
   * NULL for tenant-level admins (no scope filtering at UI level).
   * Note: Server-side always enforces actual scope.
   */
  scopeOrgUnitId?: string | null;

  /**
   * Callback to search for members by query string.
   * This should call the appropriate use case/repository to fetch members.
   *
   * @param query - Search query (name or email)
   * @returns Promise resolving to array of MemberSummary
   */
  onSearch: (query: string) => Promise<MemberSummary[]>;

  /**
   * Whether search is currently in progress.
   */
  isSearching?: boolean;

  /**
   * Whether confirm operation is in progress.
   */
  isConfirming?: boolean;

  /**
   * Title for the dialog. Defaults to i18n key 'member_search.title'.
   */
  title?: string;

  /**
   * Description text for the dialog.
   */
  description?: string;

  /**
   * Minimum characters required before search executes.
   * Defaults to 2.
   */
  minSearchLength?: number;

  /**
   * Debounce delay in milliseconds for search input.
   * Defaults to 300ms.
   */
  debounceMs?: number;

  /**
   * Maximum number of members that can be selected.
   * Defaults to no limit.
   */
  maxSelection?: number;

  /**
   * Additional CSS classes for the dialog.
   */
  className?: string;
}

/**
 * Internal state for a selectable member row.
 */
interface SelectableMember extends MemberSummary {
  isSelected: boolean;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get the i18n key for a membership role.
 *
 * @param role - The membership role
 * @returns Translation key for the role label
 */
function getRoleTranslationKey(role: MembershipRole): string {
  const roleKeys: Record<string, string> = {
    PLATFORM_ADMIN: 'roles.platform_admin',
    TENANT_OWNER: 'roles.tenant_owner',
    ORG_ADMIN: 'roles.org_admin',
    RT_ADMIN: 'roles.rt_admin',
    SECURITY: 'roles.security',
    RESIDENT: 'roles.resident',
  };
  return roleKeys[role] ?? 'roles.unknown';
}

/**
 * Generate initials from a name for avatar fallback.
 *
 * @param name - Full name
 * @returns Initials (up to 2 characters)
 */
function getInitials(name: string): string {
  if (!name) return '?';

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Debounce hook for search input.
 *
 * @param value - Value to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced value
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Search input component with icon.
 */
function SearchInput({
  value,
  onChange,
  placeholder,
  disabled,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <svg
          className="h-5 w-5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <Input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pl-10"
        aria-label={placeholder}
      />
    </div>
  );
}

/**
 * Loading skeleton for search results.
 */
function SearchResultsSkeleton() {
  return (
    <div className="animate-pulse space-y-2" role="status" aria-label="Loading search results">
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <div className="w-5 h-5 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty search state when no query entered.
 */
function EmptySearchState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <svg
        className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}

/**
 * No results state when search returns empty.
 */
function NoResultsState({ message }: { message: string }) {
  return (
    <EmptyState
      title={message}
      icon={
        <svg
          className="w-12 h-12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      }
    />
  );
}

/**
 * Member avatar component.
 */
function MemberAvatar({
  name,
  profilePictureUrl,
  className = '',
}: {
  name: string;
  profilePictureUrl?: string;
  className?: string;
}) {
  const initials = getInitials(name);

  if (profilePictureUrl) {
    return (
      <img
        src={profilePictureUrl}
        alt={name}
        className={`w-10 h-10 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-medium text-sm ${className}`}
      aria-hidden="true">
      {initials}
    </div>
  );
}

/**
 * Individual member row component with checkbox.
 */
function MemberRow({
  member,
  isSelected,
  onToggle,
  disabled,
}: {
  member: MemberSummary;
  isSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const roleLabel = t(getRoleTranslationKey(member.role));

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
        e.preventDefault();
        onToggle();
      }
    },
    [disabled, onToggle],
  );

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onToggle}
      onKeyDown={handleKeyDown}
      className={`
        flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
        ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
            : 'bg-gray-50 dark:bg-gray-800/50 border border-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}>
      {/* Checkbox */}
      <div
        className={`
          flex items-center justify-center w-5 h-5 rounded border-2 transition-colors
          ${
            isSelected
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'border-gray-300 dark:border-gray-600'
          }
        `}>
        {isSelected && (
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </div>

      {/* Avatar */}
      <MemberAvatar
        name={member.name}
        profilePictureUrl={member.profilePictureUrl}
      />

      {/* Member Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {member.name}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {member.email}
        </p>
      </div>

      {/* Role and OrgUnit */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
          {roleLabel}
        </span>
        {member.orgUnitName && (
          <span
            className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[150px]"
            title={member.orgUnitName}>
            {member.orgUnitName}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Selection summary bar showing count and clear action.
 */
function SelectionSummary({
  count,
  maxSelection,
  onClear,
}: {
  count: number;
  maxSelection?: number;
  onClear: () => void;
}) {
  const { t } = useTranslation();

  if (count === 0) return null;

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <span className="text-sm text-blue-700 dark:text-blue-300">
        {maxSelection
          ? t('member_search.selected_with_max', { count, max: maxSelection })
          : t('member_search.selected_count', { count })}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200">
        {t('member_search.clear_selection')}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * MemberSearchDialog — Dialog for searching and selecting members to assign
 * to an OrgUnit.
 *
 * Features:
 * - Search by name or email with debounce
 * - Multi-select with visual selection state
 * - Shows current OrgUnit assignment for each member
 * - Excludes already-assigned members
 * - Respects user's authorization scope filtering
 *
 * @example
 * ```tsx
 * <MemberSearchDialog
 *   isOpen={isDialogOpen}
 *   onClose={() => setIsDialogOpen(false)}
 *   onConfirm={handleMemberAssignment}
 *   onSearch={searchMembers}
 *   excludeIds={currentMemberIds}
 *   scopeOrgUnitId={userScopeOrgUnitId}
 * />
 * ```
 *
 * @see Requirements 9.4, 9.5
 */
export function MemberSearchDialog({
  isOpen,
  onClose,
  onConfirm,
  excludeIds = [],
  scopeOrgUnitId = null,
  onSearch,
  isSearching = false,
  isConfirming = false,
  title,
  description,
  minSearchLength = 2,
  debounceMs = 300,
  maxSelection,
  className = '',
}: MemberSearchDialogProps): ReactNode {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemberSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Debounce search query
  const debouncedQuery = useDebounce(searchQuery, debounceMs);

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  // Filter out excluded members from results
  const filteredResults = useMemo(() => {
    const excludeSet = new Set(excludeIds);
    return searchResults.filter(member => !excludeSet.has(member.id));
  }, [searchResults, excludeIds]);

  // Selection count
  const selectedCount = selectedIds.size;

  // Whether max selection is reached
  const isMaxSelectionReached = maxSelection
    ? selectedCount >= maxSelection
    : false;

  // Translated title and description
  const dialogTitle = title ?? t('member_search.title');
  const dialogDescription = description ?? t('member_search.description');

  // ---------------------------------------------------------------------------
  // Dialog Open/Close
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      // Focus search input when dialog opens
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedIds(new Set());
      setHasSearched(false);
      setSearchError(null);
    }
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Search Effect
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const performSearch = async () => {
      if (debouncedQuery.length < minSearchLength) {
        setSearchResults([]);
        setHasSearched(false);
        setSearchError(null);
        return;
      }

      try {
        setSearchError(null);
        const results = await onSearch(debouncedQuery);
        setSearchResults(results);
        setHasSearched(true);
      } catch (error) {
        setSearchError(
          error instanceof Error
            ? error.message
            : t('member_search.search_error'),
        );
        setSearchResults([]);
        setHasSearched(true);
      }
    };

    performSearch();
  }, [debouncedQuery, minSearchLength, onSearch, t]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleDialogClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) {
        handleDialogClose();
      }
    },
    [handleDialogClose],
  );

  const handleToggleSelection = useCallback(
    (memberId: string) => {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(memberId)) {
          next.delete(memberId);
        } else {
          // Check max selection limit
          if (maxSelection && next.size >= maxSelection) {
            return prev;
          }
          next.add(memberId);
        }
        return next;
      });
    },
    [maxSelection],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(selectedIds));
  }, [onConfirm, selectedIds]);

  const handleSelectAll = useCallback(() => {
    const allVisibleIds = filteredResults.map(m => m.id);
    if (maxSelection) {
      // Limit to max selection
      setSelectedIds(new Set(allVisibleIds.slice(0, maxSelection)));
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  }, [filteredResults, maxSelection]);

  // ---------------------------------------------------------------------------
  // Keyboard Navigation
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDialogClose();
      }
    },
    [handleDialogClose],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onClose={handleDialogClose}
      onKeyDown={handleKeyDown}
      className={`
        fixed inset-0 z-50 m-auto
        w-full max-w-2xl max-h-[90vh]
        overflow-hidden rounded-lg border-0
        bg-white dark:bg-gray-800
        p-0 shadow-xl
        backdrop:bg-black/50
        ${className}
      `}
      aria-labelledby="member-search-dialog-title"
      aria-describedby="member-search-dialog-desc">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h2
            id="member-search-dialog-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {dialogTitle}
          </h2>
          {dialogDescription && (
            <p
              id="member-search-dialog-desc"
              className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {dialogDescription}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleDialogClose}
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
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
      </div>

      {/* Search Input */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={t('member_search.search_placeholder')}
          disabled={isSearching || isConfirming}
        />
        {searchQuery.length > 0 && searchQuery.length < minSearchLength && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t('member_search.min_chars_hint', { count: minSearchLength })}
          </p>
        )}
      </div>

      {/* Selection Summary */}
      {selectedCount > 0 && (
        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">
          <SelectionSummary
            count={selectedCount}
            maxSelection={maxSelection}
            onClear={handleClearSelection}
          />
        </div>
      )}

      {/* Results */}
      <div
        className="px-6 py-4 overflow-y-auto"
        style={{ maxHeight: 'calc(90vh - 280px)' }}
        role="listbox"
        aria-multiselectable="true"
        aria-label={t('member_search.results_label')}>
        {/* Loading State */}
        {isSearching && <SearchResultsSkeleton />}

        {/* Error State */}
        {!isSearching && searchError && (
          <div
            className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
            role="alert">
            <p className="text-sm text-red-700 dark:text-red-300">
              {searchError}
            </p>
          </div>
        )}

        {/* Empty Search State - No query yet */}
        {!isSearching &&
          !searchError &&
          !hasSearched &&
          searchQuery.length < minSearchLength && (
            <EmptySearchState
              message={t('member_search.enter_search_query')}
            />
          )}

        {/* No Results State */}
        {!isSearching &&
          !searchError &&
          hasSearched &&
          filteredResults.length === 0 && (
            <NoResultsState message={t('member_search.no_results')} />
          )}

        {/* Results List */}
        {!isSearching &&
          !searchError &&
          hasSearched &&
          filteredResults.length > 0 && (
            <div className="space-y-2">
              {/* Select All Option (if results exist) */}
              {filteredResults.length > 1 && (
                <div className="flex justify-end mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    disabled={isMaxSelectionReached && selectedCount === filteredResults.length}
                    className="text-blue-600 dark:text-blue-400">
                    {t('member_search.select_all')}
                  </Button>
                </div>
              )}

              {filteredResults.map(member => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isSelected={selectedIds.has(member.id)}
                  onToggle={() => handleToggleSelection(member.id)}
                  disabled={
                    isConfirming ||
                    (isMaxSelectionReached && !selectedIds.has(member.id))
                  }
                />
              ))}
            </div>
          )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <Button variant="ghost" onClick={handleDialogClose} disabled={isConfirming}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={selectedCount === 0 || isConfirming}
          loading={isConfirming}>
          {t('member_search.assign_selected', { count: selectedCount })}
        </Button>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Named Export
// ---------------------------------------------------------------------------

export default MemberSearchDialog;
