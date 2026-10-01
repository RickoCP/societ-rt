'use client';

/**
 * TenantSwitcher — Component for switching between tenant/OrgUnit contexts.
 *
 * Displays the current tenant name, OrgUnit (if applicable), and role.
 * When clicked, shows a dropdown with all ACTIVE memberships for quick switching.
 *
 * Features:
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Visual indicator (checkmark) for current context
 * - Disabled state for single membership users
 * - Loading and error states
 *
 * @see Requirements 1.1-1.10
 * @see Design Components > 1. Tenant Switcher Component
 */

import {
  useRef,
  useEffect,
  useCallback,
  KeyboardEvent as ReactKeyboardEvent,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { MembershipRole } from '@core/domains/membership';
import { Avatar } from '@presentation/components/atoms/Avatar';
import { Spinner } from '@presentation/components/atoms/Spinner';
import type { MembershipSummary, CurrentContext } from '../viewModel/useTenantSwitcherViewModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TenantSwitcherProps {
  /**
   * Current active context (tenant, OrgUnit, role).
   */
  currentContext: CurrentContext | null;

  /**
   * List of all ACTIVE memberships for switching.
   */
  memberships: MembershipSummary[];

  /**
   * Whether the dropdown is currently open.
   */
  isDropdownOpen: boolean;

  /**
   * Whether a context switch is in progress.
   */
  isSwitching?: boolean;

  /**
   * Whether memberships are being loaded.
   */
  isLoading?: boolean;

  /**
   * Whether the user can switch contexts (has multiple memberships).
   */
  canSwitch?: boolean;

  /**
   * Error message to display.
   */
  error?: string | null;

  /**
   * Callback when dropdown toggle is requested.
   */
  onToggle: () => void;

  /**
   * Callback when a membership is selected for context switch.
   */
  onSwitch: (tenantId: string, orgUnitId: string | null) => void;

  /**
   * Callback to close the dropdown.
   */
  onClose: () => void;

  /**
   * Additional CSS classes.
   */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Format role for display.
 */
function formatRole(role: MembershipRole): string {
  const roleLabels: Record<MembershipRole, string> = {
    [MembershipRole.PLATFORM_ADMIN]: 'Platform Admin',
    [MembershipRole.TENANT_OWNER]: 'Tenant Owner',
    [MembershipRole.ORG_ADMIN]: 'Org Admin',
    [MembershipRole.RT_ADMIN]: 'RT Admin',
    [MembershipRole.SECURITY]: 'Security',
    [MembershipRole.RESIDENT]: 'Resident',
  };
  return roleLabels[role] ?? role;
}

/**
 * Check if a membership matches the current context.
 */
function isCurrentMembership(
  membership: MembershipSummary,
  currentContext: CurrentContext | null,
): boolean {
  if (!currentContext) return false;
  return (
    membership.tenantId === currentContext.tenantId &&
    membership.orgUnitId === currentContext.orgUnitId
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * TenantSwitcher — Dropdown component for switching tenant/OrgUnit context.
 *
 * Accessibility:
 * - Button has aria-expanded and aria-haspopup
 * - Dropdown has role="menu" with menuitem children
 * - Arrow keys navigate, Enter selects, Escape closes
 *
 * @param props - TenantSwitcherProps
 */
export function TenantSwitcher({
  currentContext,
  memberships,
  isDropdownOpen,
  isSwitching = false,
  isLoading = false,
  canSwitch = true,
  error,
  onToggle,
  onSwitch,
  onClose,
  className = '',
}: TenantSwitcherProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isDropdownOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen, onClose]);

  // Reset highlighted index when dropdown opens/closes
  useEffect(() => {
    if (isDropdownOpen) {
      // Find current context index to highlight initially
      const currentIndex = memberships.findIndex(m =>
        isCurrentMembership(m, currentContext),
      );
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isDropdownOpen, memberships, currentContext]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!isDropdownOpen) {
        // Open dropdown on Enter or Space when focused on button
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
        return;
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setHighlightedIndex(prev =>
            prev < memberships.length - 1 ? prev + 1 : 0,
          );
          break;

        case 'ArrowUp':
          event.preventDefault();
          setHighlightedIndex(prev =>
            prev > 0 ? prev - 1 : memberships.length - 1,
          );
          break;

        case 'Enter':
          event.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < memberships.length) {
            const selected = memberships[highlightedIndex];
            if (selected) {
              onSwitch(selected.tenantId, selected.orgUnitId);
            }
          }
          break;

        case 'Escape':
          event.preventDefault();
          onClose();
          buttonRef.current?.focus();
          break;

        case 'Tab':
          // Close dropdown on tab out
          onClose();
          break;
      }
    },
    [isDropdownOpen, memberships, highlightedIndex, onToggle, onSwitch, onClose],
  );

  // Handle membership selection
  const handleMembershipClick = useCallback(
    (membership: MembershipSummary) => {
      if (isSwitching) return;
      onSwitch(membership.tenantId, membership.orgUnitId);
    },
    [isSwitching, onSwitch],
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 ${className}`}>
        <Spinner size="sm" />
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {t('common.loading')}
        </span>
      </div>
    );
  }

  // No context available
  if (!currentContext) {
    return null;
  }

  const isDisabled = !canSwitch || isSwitching;

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        disabled={isDisabled}
        aria-expanded={isDropdownOpen}
        aria-haspopup="menu"
        aria-label={t('tenant_switcher.button_label', 'Switch tenant context')}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
          isDisabled
            ? 'cursor-default opacity-75'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        {/* Current Tenant Info */}
        <div className="flex flex-col min-w-0">
          <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {currentContext.tenantName}
          </span>
          <span className="truncate text-xs text-gray-500 dark:text-gray-400">
            {currentContext.orgUnitName
              ? `${currentContext.orgUnitName} • ${formatRole(currentContext.role)}`
              : formatRole(currentContext.role)}
          </span>
        </div>

        {/* Dropdown Indicator */}
        {canSwitch && (
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${
              isDropdownOpen ? 'rotate-180' : ''
            }`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        )}

        {/* Switching Indicator */}
        {isSwitching && <Spinner size="sm" />}
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[280px] max-w-[360px] rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
          role="menu"
          aria-orientation="vertical"
        >
          {/* Error State */}
          {error && (
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Memberships List */}
          <ul
            ref={listRef}
            className="max-h-[300px] overflow-y-auto py-1"
            role="listbox"
          >
            {memberships.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                {t('tenant_switcher.no_memberships', 'No memberships available')}
              </li>
            ) : (
              memberships.map((membership, index) => {
                const isCurrent = isCurrentMembership(membership, currentContext);
                const isHighlighted = index === highlightedIndex;

                return (
                  <li key={membership.membershipId} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleMembershipClick(membership)}
                      disabled={isSwitching}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                        isHighlighted
                          ? 'bg-gray-100 dark:bg-gray-800'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      } ${isSwitching ? 'cursor-wait opacity-75' : ''}`}
                      aria-selected={isCurrent}
                    >
                      {/* Tenant Logo/Avatar */}
                      <Avatar
                        name={membership.tenantName}
                        src={membership.tenantLogoUrl}
                        size="sm"
                      />

                      {/* Membership Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                            {membership.tenantName}
                          </span>
                          {/* Current Context Indicator */}
                          {isCurrent && (
                            <svg
                              className="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-label={t('tenant_switcher.current', 'Current')}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                        <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {membership.orgUnitName
                            ? `${membership.orgUnitName} • ${formatRole(membership.role)}`
                            : formatRole(membership.role)}
                        </span>
                      </div>
                    </button>
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

export default TenantSwitcher;
