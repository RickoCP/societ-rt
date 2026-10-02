'use client';

/**
 * TenantSettingsScreen — Admin screen for managing tenant profile, configuration, and lifecycle.
 *
 * Displays a tabbed interface for tenant owners to manage their tenant:
 * - Profile: Tenant name, address, logo, branding
 * - Configuration: Siren device, notifications, timezone, language
 * - Lifecycle: Status, suspend/reactivate, close tenant
 *
 * This screen follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * Features:
 * - Tabbed interface with three tabs: Profile, Configuration, Lifecycle
 * - Loading skeleton while data fetches
 * - Error state with retry button
 * - Mobile responsive design (tabs stack on small screens)
 * - Permission guard requiring `tenant:manage`
 * - Unsaved changes warning on navigation
 *
 * @see Requirements 11.1-11.4, 12.1 (Tenant Settings)
 * @see Design Components > 8. Tenant Settings
 */

import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PermissionGuard } from '@presentation/components/atoms/PermissionGuard';
import { Button } from '@presentation/components/atoms/Button';
import {
  useTenantSettingsViewModel,
  type TenantSettingsTab,
  TENANT_SETTINGS_TABS,
  TAB_CONFIG,
} from '../viewModel/useTenantSettingsViewModel';
import { ConfigurationForm } from '../components/ConfigurationForm';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Lifecycle status display configuration.
 */
const LIFECYCLE_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  PROVISIONING: {
    label: 'Provisioning',
    color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30',
    icon: '⏳',
  },
  ACTIVE: {
    label: 'Active',
    color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30',
    icon: '✅',
  },
  SUSPENDED: {
    label: 'Suspended',
    color: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30',
    icon: '⏸️',
  },
  CLOSING: {
    label: 'Closing',
    color: 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30',
    icon: '🚪',
  },
  CLOSED: {
    label: 'Closed',
    color: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30',
    icon: '🔒',
  },
  PURGED: {
    label: 'Purged',
    color: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30',
    icon: '🗑️',
  },
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Breadcrumb navigation for settings page.
 */
function SettingsBreadcrumb() {
  const { t } = useTranslation();

  return (
    <nav className="mb-4 flex items-center gap-2 text-sm" aria-label="Breadcrumb">
      <a
        href="/dashboard"
        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
        {t('navigation.dashboard', 'Dashboard')}
      </a>
      <svg
        className="h-4 w-4 text-gray-400"
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
      <a
        href="/dashboard/administration"
        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
        {t('navigation.administration', 'Administration')}
      </a>
      <svg
        className="h-4 w-4 text-gray-400"
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
      <span className="font-medium text-gray-900 dark:text-white">
        {t('tenant_settings.title', 'Tenant Settings')}
      </span>
    </nav>
  );
}

/**
 * Tab button component for the settings tabs.
 */
function TabButton({
  tab,
  isActive,
  onClick,
  isDirty,
}: {
  tab: TenantSettingsTab;
  isActive: boolean;
  onClick: () => void;
  isDirty: boolean;
}) {
  const { t } = useTranslation();
  const config = TAB_CONFIG[tab];

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`${tab}-panel`}
      id={`${tab}-tab`}
      onClick={onClick}
      className={`
        flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-colors
        ${
          isActive
            ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
        }
      `}>
      <span role="img" aria-hidden="true">
        {config.icon}
      </span>
      <span>{t(config.labelKey, tab)}</span>
      {isDirty && (
        <span
          className="ml-1 h-2 w-2 rounded-full bg-orange-400"
          title={t('tenant_settings.unsaved_changes', 'Unsaved changes')}
          aria-label={t('tenant_settings.unsaved_changes', 'Unsaved changes')}
        />
      )}
    </button>
  );
}

/**
 * Loading skeleton for the settings screen.
 */
function TenantSettingsSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-96 rounded bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-2">
        <div className="h-10 w-28 rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-36 rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-28 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* Content skeleton */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <div className="space-y-4">
          {/* Form fields skeleton */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-10 w-full rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
          {/* Button skeleton */}
          <div className="mt-6 flex justify-end">
            <div className="h-10 w-24 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Error state component with retry button.
 */
function TenantSettingsError({
  error,
  onRetry,
}: {
  error: { code: string; message: string } | null;
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
        {t('tenant_settings.fetch_error', 'Failed to load tenant settings')}
      </h3>
      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
        {t(
          'tenant_settings.generic_error',
          'An error occurred while fetching settings. Please try again.',
        )}
      </p>
      {error?.code && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-500">
          {t('common.error_code', 'Error code: {{code}}', { code: error.code })}
        </p>
      )}
      <Button variant="primary" size="sm" onClick={onRetry} className="mt-4">
        {t('tenant_settings.retry', 'Retry')}
      </Button>
    </div>
  );
}

/**
 * Unauthorized message component.
 * @see Requirements 11.3
 */
function UnauthorizedMessage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <svg
        className="mb-4 h-12 w-12 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">
        {t('tenant_settings.unauthorized', 'Access Denied')}
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t(
          'tenant_settings.unauthorized_description',
          'You do not have permission to manage tenant settings.',
        )}
      </p>
    </div>
  );
}

/**
 * Profile Tab Placeholder Component.
 * Will be implemented in Task 16.
 */
function ProfileTabPlaceholder() {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="mb-4 text-4xl" role="img" aria-label="Profile">
          🏢
        </span>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          {t('tenant_settings.profile_placeholder_title', 'Tenant Profile')}
        </h3>
        <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
          {t(
            'tenant_settings.profile_placeholder_description',
            'Manage your tenant profile including name, address, logo, and branding colors. This section will be implemented in a future task.',
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * Configuration Tab Content Component.
 * Renders the ConfigurationForm with data from the ViewModel.
 * @see Requirements 12.2-12.10
 */
function ConfigurationTabContent({
  configuration,
  isLoading,
  isSaving,
  isSirenTesting,
  isDirty,
  errors,
  onConfigurationChange,
  onSave,
  onReset,
  onTestSiren,
}: {
  configuration: ReturnType<typeof useTenantSettingsViewModel>['configuration'];
  isLoading: boolean;
  isSaving: boolean;
  isSirenTesting: boolean;
  isDirty: boolean;
  errors: Record<string, string>;
  onConfigurationChange: ReturnType<typeof useTenantSettingsViewModel>['updateConfiguration'];
  onSave: () => Promise<void>;
  onReset: () => void;
  onTestSiren: () => Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
      <ConfigurationForm
        configuration={configuration}
        isLoading={isLoading}
        isSaving={isSaving}
        isSirenTesting={isSirenTesting}
        isDirty={isDirty}
        errors={errors}
        onConfigurationChange={onConfigurationChange}
        onSave={onSave}
        onReset={onReset}
        onTestSiren={onTestSiren}
      />
    </div>
  );
}

/**
 * Lifecycle Tab Placeholder Component.
 * Will be implemented in Task 18.
 */
function LifecycleTabPlaceholder({
  status,
}: {
  status: string | null;
}) {
  const { t } = useTranslation();
  const config = status ? LIFECYCLE_STATUS_CONFIG[status] : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="mb-4 text-4xl" role="img" aria-label="Lifecycle">
          🔄
        </span>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          {t('tenant_settings.lifecycle_placeholder_title', 'Tenant Lifecycle')}
        </h3>
        {status && config && (
          <div className="mt-4">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${config.color}`}>
              <span role="img" aria-hidden="true">
                {config.icon}
              </span>
              {t(`tenant_settings.status_${status.toLowerCase()}`, config.label)}
            </span>
          </div>
        )}
        <p className="mt-4 max-w-md text-sm text-gray-500 dark:text-gray-400">
          {t(
            'tenant_settings.lifecycle_placeholder_description',
            'Manage tenant lifecycle including suspend, reactivate, and close operations. This section will be implemented in a future task.',
          )}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Content Component
// ---------------------------------------------------------------------------

/**
 * TenantSettingsContent — The main content of the Tenant Settings screen.
 */
function TenantSettingsContent() {
  const { t } = useTranslation();
  const vm = useTenantSettingsViewModel();

  // Warn user about unsaved changes before navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (vm.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [vm.hasUnsavedChanges]);

  // ---------------------------------------------------------------------------
  // Tab Click Handler
  // ---------------------------------------------------------------------------

  const handleTabClick = useCallback(
    (tab: TenantSettingsTab) => {
      vm.setTab(tab);
    },
    [vm],
  );

  // ---------------------------------------------------------------------------
  // Render States
  // ---------------------------------------------------------------------------

  // Loading state
  if (vm.isLoading) {
    return (
      <div className="space-y-6">
        <SettingsBreadcrumb />
        <TenantSettingsSkeleton />
      </div>
    );
  }

  // Error state
  if (vm.isError) {
    return (
      <div className="space-y-6">
        <SettingsBreadcrumb />
        <TenantSettingsError error={vm.error} onRetry={vm.refetch} />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render Tab Content
  // ---------------------------------------------------------------------------

  const renderTabContent = () => {
    switch (vm.activeTab) {
      case 'profile':
        return <ProfileTabPlaceholder />;
      case 'configuration':
        return (
          <ConfigurationTabContent
            configuration={
              vm.configFormData
                ? {
                    tenantId: vm.settings?.id ?? '',
                    sirenDeviceId: vm.configuration?.sirenDeviceId ?? null,
                    sirenConnectionStatus:
                      vm.configuration?.sirenConnectionStatus ?? 'unknown',
                    lastSirenTest: null,
                    notificationChannels: vm.configFormData.notificationChannels,
                    timezone: vm.configFormData.timezone,
                    language: vm.configFormData.language as 'id' | 'en',
                    emergencyEscalationTimeout: vm.configFormData.emergencyEscalationTimeout,
                    updatedAt: vm.configuration?.lastUpdatedAt ?? new Date(),
                    updatedBy: vm.configuration?.lastUpdatedBy ?? null,
                  }
                : null
            }
            isLoading={vm.isLoading}
            isSaving={vm.isSavingConfig}
            isSirenTesting={vm.isSirenTesting}
            isDirty={vm.isConfigDirty}
            errors={vm.configErrors}
            onConfigurationChange={vm.updateConfiguration}
            onSave={vm.saveConfiguration}
            onReset={vm.resetConfiguration}
            onTestSiren={vm.testSiren}
          />
        );
      case 'lifecycle':
        return <LifecycleTabPlaceholder status={vm.lifecycleStatus} />;
      default:
        return null;
    }
  };

  // ---------------------------------------------------------------------------
  // Main Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <SettingsBreadcrumb />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {t('tenant_settings.title', 'Tenant Settings')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t(
              'tenant_settings.description',
              'Manage your community profile, configuration, and lifecycle.',
            )}
          </p>
        </div>

        {/* Current Status Badge */}
        {vm.lifecycleStatus && LIFECYCLE_STATUS_CONFIG[vm.lifecycleStatus] && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('tenant_settings.status_label', 'Status:')}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${LIFECYCLE_STATUS_CONFIG[vm.lifecycleStatus].color}`}>
              <span role="img" aria-hidden="true">
                {LIFECYCLE_STATUS_CONFIG[vm.lifecycleStatus].icon}
              </span>
              {t(
                `tenant_settings.status_${vm.lifecycleStatus.toLowerCase()}`,
                LIFECYCLE_STATUS_CONFIG[vm.lifecycleStatus].label,
              )}
            </span>
          </div>
        )}
      </div>

      {/* Unsaved Changes Warning */}
      {vm.hasUnsavedChanges && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-900 dark:bg-orange-900/20">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-orange-400"
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
            <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
              {t(
                'tenant_settings.unsaved_warning',
                'You have unsaved changes. Save before navigating away.',
              )}
            </span>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div
        role="tablist"
        aria-label={t('tenant_settings.tabs_label', 'Settings sections')}
        className="flex flex-wrap gap-2">
        {TENANT_SETTINGS_TABS.map(tab => (
          <TabButton
            key={tab}
            tab={tab}
            isActive={vm.activeTab === tab}
            onClick={() => handleTabClick(tab)}
            isDirty={
              (tab === 'profile' && vm.isProfileDirty) ||
              (tab === 'configuration' && vm.isConfigDirty)
            }
          />
        ))}
      </div>

      {/* Tab Content Panel */}
      <div
        role="tabpanel"
        id={`${vm.activeTab}-panel`}
        aria-labelledby={`${vm.activeTab}-tab`}
        tabIndex={0}>
        {renderTabContent()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported Component
// ---------------------------------------------------------------------------

/**
 * TenantSettingsScreen — The Tenant Settings screen wrapped with PermissionGuard.
 *
 * Requires `tenant:manage` permission to access.
 * @see Requirements 11.2
 *
 * @example
 * ```tsx
 * // In app/dashboard/administration/tenant-settings/page.tsx
 * import { TenantSettingsScreen } from '@presentation/features/tenant-settings/screens/TenantSettingsScreen';
 *
 * export default function TenantSettingsPage() {
 *   return <TenantSettingsScreen />;
 * }
 * ```
 */
export function TenantSettingsScreen() {
  return (
    <PermissionGuard
      permissions={['tenant:manage']}
      fallback={<UnauthorizedMessage />}>
      <TenantSettingsContent />
    </PermissionGuard>
  );
}

export default TenantSettingsScreen;
