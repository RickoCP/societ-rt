'use client';

/**
 * Header — Application header with navigation, impersonation banner, tenant switcher,
 * notifications, user avatar, and logout.
 *
 * Integrates with:
 * - TenantSwitcher for multi-tenant context switching
 * - Toast notifications for switch success/error feedback
 *
 * @see Requirements 1.5-1.7 (Tenant Switcher integration)
 */

import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../atoms/Avatar';
import { NotificationBell } from './NotificationBell';
import { TenantSwitcher } from '@presentation/features/tenant-switcher/components/TenantSwitcher';
import { useTenantSwitcherViewModel } from '@presentation/features/tenant-switcher/viewModel/useTenantSwitcherViewModel';
import { showSuccessToast, showErrorToast } from '@infrastructure/stateManagement/toastStore';

export interface HeaderProps {
  userName: string;
  userAvatarUrl?: string | null;
  isImpersonating?: boolean;
  impersonatorName?: string;
  unreadCount?: number;
  onNotificationClick?: () => void;
  onLogout?: () => void;
  onMenuToggle?: () => void;
  /**
   * Whether to show the tenant switcher in the header.
   * When true, the header will render the TenantSwitcher component
   * using the useTenantSwitcherViewModel hook.
   */
  showTenantSwitcher?: boolean;
  className?: string;
}

export function Header({
  userName,
  userAvatarUrl,
  isImpersonating = false,
  impersonatorName,
  unreadCount = 0,
  onNotificationClick,
  onLogout,
  onMenuToggle,
  showTenantSwitcher = false,
  className = '',
}: HeaderProps) {
  const { t } = useTranslation();

  // Only use the tenant switcher ViewModel when showTenantSwitcher is true
  const tenantSwitcherVm = useTenantSwitcherViewModel();

  // Track previous error state to show toast only on new errors
  const previousErrorRef = useRef<string | null>(null);

  // Show error toast when switch fails
  useEffect(() => {
    if (!showTenantSwitcher) return;

    // Only show toast for new errors (not initial render or repeated errors)
    if (
      tenantSwitcherVm.error &&
      tenantSwitcherVm.error !== previousErrorRef.current
    ) {
      showErrorToast(t('tenant_switcher.switch_error'));
    }
    previousErrorRef.current = tenantSwitcherVm.error;
  }, [tenantSwitcherVm.error, showTenantSwitcher, t]);

  /**
   * Handle context switch with toast notifications.
   * Success toast is shown before page reload via the ViewModel.
   * Error toast is handled in useEffect above.
   *
   * @param tenantId - Target tenant ID
   * @param orgUnitId - Target OrgUnit ID (null for tenant-level)
   */
  const handleContextSwitch = useCallback(
    async (tenantId: string, orgUnitId: string | null) => {
      try {
        // Show success toast before the page reloads
        // The ViewModel will call window.location.reload() on success
        const tenantName =
          tenantSwitcherVm.memberships.find(
            m => m.tenantId === tenantId && m.orgUnitId === orgUnitId,
          )?.tenantName ?? 'tenant';

        // Pre-show success message (will be visible briefly before reload)
        showSuccessToast(
          t('tenant_switcher.switch_success', { tenantName }),
        );

        await tenantSwitcherVm.switchContext(tenantId, orgUnitId);
      } catch {
        // Error is handled in the ViewModel and through useEffect above
      }
    },
    [tenantSwitcherVm, t],
  );

  return (
    <header
      className={`flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-900 ${className}`}>
      {/* Mobile menu button */}
      {onMenuToggle && (
        <button
          type="button"
          onClick={onMenuToggle}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 md:hidden dark:text-gray-400 dark:hover:bg-gray-800"
          aria-label="Toggle menu"
        >
          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Impersonation banner */}
      {isImpersonating && (
        <div
          role="alert"
          className="mr-4 flex items-center gap-2 rounded-md bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
          <svg
            className="h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <span>
            Impersonating as {userName}
            {impersonatorName ? ` (by ${impersonatorName})` : ''}
          </span>
        </div>
      )}

      {/* Tenant Switcher - positioned after impersonation banner, before flex spacer */}
      {showTenantSwitcher && (
        <TenantSwitcher
          currentContext={tenantSwitcherVm.currentContext}
          memberships={tenantSwitcherVm.memberships}
          isDropdownOpen={tenantSwitcherVm.isDropdownOpen}
          isSwitching={tenantSwitcherVm.isSwitching}
          isLoading={tenantSwitcherVm.isLoading}
          canSwitch={tenantSwitcherVm.canSwitch}
          error={tenantSwitcherVm.error}
          onToggle={tenantSwitcherVm.toggleDropdown}
          onSwitch={handleContextSwitch}
          onClose={tenantSwitcherVm.closeDropdown}
          className="ml-2"
        />
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-4">
        <NotificationBell
          count={unreadCount}
          onClick={onNotificationClick}
        />
        <div className="flex items-center gap-2">
          <Avatar name={userName} src={userAvatarUrl} size="sm" />
          <span className="hidden text-sm font-medium text-gray-700 dark:text-gray-300 sm:inline">
            {userName}
          </span>
        </div>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            aria-label="Logout">
            Logout
          </button>
        )}
      </div>
    </header>
  );
}
