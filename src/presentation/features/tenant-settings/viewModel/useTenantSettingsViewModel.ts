'use client';

/**
 * useTenantSettingsViewModel — ViewModel for the Tenant Settings screen.
 *
 * Provides state and actions for:
 * - Fetching tenant settings (profile, configuration, lifecycle) with React Query
 * - Managing active tab state (Profile, Configuration, Lifecycle)
 * - Managing dirty state for unsaved changes warning
 * - Integrating with adminUiStore for sidebar state
 *
 * This ViewModel follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * @see Requirements 11.1-11.4, 12.1 (Tenant Settings)
 * @see Design Components > 8. Tenant Settings
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@presentation/hooks/usePermissions';
import { useSelectedAdminTenantId } from '@infrastructure/stateManagement';
import type { AppError } from '@core/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * React Query cache key for tenant settings queries.
 */
export const TENANT_SETTINGS_QUERY_KEY = 'tenantSettings';

/**
 * Tenant settings tab types.
 * @see Requirements 11.4
 */
export type TenantSettingsTab = 'profile' | 'configuration' | 'lifecycle';

/**
 * All available tabs in order.
 */
export const TENANT_SETTINGS_TABS: TenantSettingsTab[] = [
  'profile',
  'configuration',
  'lifecycle',
];

/**
 * Tab configuration with i18n keys and icons.
 */
export const TAB_CONFIG: Record<TenantSettingsTab, { labelKey: string; icon: string }> = {
  profile: {
    labelKey: 'tenant_settings.tab_profile',
    icon: '🏢',
  },
  configuration: {
    labelKey: 'tenant_settings.tab_configuration',
    icon: '⚙️',
  },
  lifecycle: {
    labelKey: 'tenant_settings.tab_lifecycle',
    icon: '🔄',
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Tenant profile data.
 * @see Requirements 11.5
 */
export interface TenantProfile {
  readonly name: string;
  readonly rtRwNumber: string;
  readonly region: string;
  readonly address: string;
  readonly contactPerson: string;
  readonly logoUrl: string | null;
  readonly primaryColor: string | null;
  readonly secondaryColor: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
}

/**
 * Tenant configuration data.
 * @see Requirements 12.2
 */
export interface TenantConfiguration {
  readonly sirenDeviceId: string | null;
  readonly sirenConnectionStatus: 'connected' | 'disconnected' | 'unknown';
  readonly notificationChannels: {
    readonly telegram: boolean;
    readonly whatsapp: boolean;
    readonly email: boolean;
  };
  readonly timezone: string;
  readonly language: string;
  readonly emergencyEscalationTimeout: number; // 1-10 minutes
  readonly lastUpdatedAt: Date | null;
  readonly lastUpdatedBy: string | null;
}

/**
 * Tenant lifecycle status.
 * @see Requirements 13.1-13.2
 */
export type TenantLifecycleStatus =
  | 'PROVISIONING'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'CLOSING'
  | 'CLOSED'
  | 'PURGED';

/**
 * Lifecycle transition event history entry.
 */
export interface LifecycleEvent {
  readonly id: string;
  readonly fromStatus: TenantLifecycleStatus;
  readonly toStatus: TenantLifecycleStatus;
  readonly reason: string | null;
  readonly actorName: string;
  readonly actorEmail: string;
  readonly timestamp: Date;
}

/**
 * Complete tenant settings data from API.
 */
export interface TenantSettings {
  readonly id: string;
  readonly profile: TenantProfile;
  readonly configuration: TenantConfiguration;
  readonly lifecycleStatus: TenantLifecycleStatus;
  readonly lifecycleHistory: LifecycleEvent[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Return type of useTenantSettingsViewModel hook.
 */
export interface TenantSettingsViewModel {
  // ---------------------------------------------------------------------------
  // Data State (React Query)
  // ---------------------------------------------------------------------------

  /**
   * Complete tenant settings data.
   */
  settings: TenantSettings | null;

  /**
   * Tenant profile data.
   */
  profile: TenantProfile | null;

  /**
   * Tenant configuration data.
   */
  configuration: TenantConfiguration | null;

  /**
   * Tenant lifecycle status.
   */
  lifecycleStatus: TenantLifecycleStatus | null;

  /**
   * Lifecycle event history.
   */
  lifecycleHistory: LifecycleEvent[];

  /**
   * Whether data is being fetched.
   */
  isLoading: boolean;

  /**
   * Whether fetch has failed.
   */
  isError: boolean;

  /**
   * Error details if fetch failed.
   */
  error: AppError | null;

  // ---------------------------------------------------------------------------
  // Tab State
  // ---------------------------------------------------------------------------

  /**
   * Currently active tab.
   */
  activeTab: TenantSettingsTab;

  // ---------------------------------------------------------------------------
  // Dirty State (Unsaved Changes)
  // ---------------------------------------------------------------------------

  /**
   * Whether profile form has unsaved changes.
   */
  isProfileDirty: boolean;

  /**
   * Whether configuration form has unsaved changes.
   */
  isConfigDirty: boolean;

  /**
   * Whether any form has unsaved changes.
   */
  hasUnsavedChanges: boolean;

  // ---------------------------------------------------------------------------
  // Permission State
  // ---------------------------------------------------------------------------

  /**
   * Whether user has tenant:manage permission.
   */
  canManage: boolean;

  /**
   * Whether user can suspend tenant.
   * Requires tenant:manage and ACTIVE lifecycle status.
   */
  canSuspend: boolean;

  /**
   * Whether user can reactivate tenant.
   * Requires tenant:manage and SUSPENDED lifecycle status.
   */
  canReactivate: boolean;

  /**
   * Whether user can close tenant.
   * Requires PLATFORM_ADMIN role and SUSPENDED lifecycle status.
   */
  canClose: boolean;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Set the active tab.
   * @param tab - Tab to activate
   */
  setTab: (tab: TenantSettingsTab) => void;

  /**
   * Set the profile dirty state.
   * @param isDirty - Whether profile has unsaved changes
   */
  setProfileDirty: (isDirty: boolean) => void;

  /**
   * Set the configuration dirty state.
   * @param isDirty - Whether configuration has unsaved changes
   */
  setConfigDirty: (isDirty: boolean) => void;

  /**
   * Reset all dirty states.
   */
  resetDirtyState: () => void;

  /**
   * Refetch tenant settings.
   */
  refetch: () => void;

  // ---------------------------------------------------------------------------
  // Configuration Actions
  // ---------------------------------------------------------------------------

  /**
   * Update configuration form data (local state, sets dirty flag).
   * @param changes - Partial configuration changes
   */
  updateConfiguration: (changes: Partial<ConfigurationFormData>) => void;

  /**
   * Save configuration changes to server.
   */
  saveConfiguration: () => Promise<void>;

  /**
   * Reset configuration form to original values.
   */
  resetConfiguration: () => void;

  /**
   * Test the siren device.
   */
  testSiren: () => Promise<void>;

  /**
   * Whether configuration is being saved.
   */
  isSavingConfig: boolean;

  /**
   * Whether siren test is in progress.
   */
  isSirenTesting: boolean;

  /**
   * Configuration validation errors.
   */
  configErrors: Record<string, string>;

  /**
   * Local configuration form data (with pending changes).
   */
  configFormData: ConfigurationFormData | null;
}

/**
 * Configuration form data type (matches TenantConfiguration but editable).
 */
export interface ConfigurationFormData {
  notificationChannels: {
    telegram: boolean;
    whatsapp: boolean;
    email: boolean;
  };
  timezone: string;
  language: string;
  emergencyEscalationTimeout: number;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Fetch tenant settings from the API.
 */
async function fetchTenantSettings(
  targetTenantId: string | null,
): Promise<TenantSettings> {
  const query = targetTenantId
    ? `?tenantId=${encodeURIComponent(targetTenantId)}`
    : '';
  const response = await fetch(`/api/admin/tenant/settings${query}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type:
        response.status === 401
          ? 'authentication'
          : response.status === 403
            ? 'authorization'
            : 'technical',
      code: errorData.code ?? 'TENANT_SETTINGS_FETCH_ERROR',
      message:
        errorData.message ?? `Failed to fetch tenant settings: ${response.status}`,
    };
    throw error;
  }

  const json = (await response.json()) as { data?: TenantSettings };

  if (!json.data) {
    throw {
      type: 'technical',
      code: 'TENANT_SETTINGS_INVALID_RESPONSE',
      message: 'Invalid response format from tenant settings API',
    } as AppError;
  }

  // Parse date fields
  return {
    ...json.data,
    createdAt: new Date(json.data.createdAt),
    updatedAt: new Date(json.data.updatedAt),
    configuration: {
      ...json.data.configuration,
      lastUpdatedAt: json.data.configuration.lastUpdatedAt
        ? new Date(json.data.configuration.lastUpdatedAt)
        : null,
    },
    lifecycleHistory: json.data.lifecycleHistory.map(event => ({
      ...event,
      timestamp: new Date(event.timestamp),
    })),
  };
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * useTenantSettingsViewModel — React hook for the Tenant Settings screen.
 *
 * @returns TenantSettingsViewModel with state and actions
 *
 * @example
 * ```tsx
 * const vm = useTenantSettingsViewModel();
 *
 * return (
 *   <TenantSettingsTabs
 *     activeTab={vm.activeTab}
 *     onTabChange={vm.setTab}
 *     profile={vm.profile}
 *     configuration={vm.configuration}
 *     lifecycleStatus={vm.lifecycleStatus}
 *     isLoading={vm.isLoading}
 *   />
 * );
 * ```
 */
export function useTenantSettingsViewModel(): TenantSettingsViewModel {
  // ---------------------------------------------------------------------------
  // Permissions
  // ---------------------------------------------------------------------------

  const {
    hasPermission,
    isLoading: isPermissionsLoading,
    role,
  } = usePermissions();

  const canManage = hasPermission('tenant:manage');

  // Selected tenant for PLATFORM_ADMIN cross-tenant viewing (null = own tenant).
  const selectedTenantId = useSelectedAdminTenantId();
  const isPlatformAdmin = role === 'PLATFORM_ADMIN';

  // ---------------------------------------------------------------------------
  // Tab State
  // ---------------------------------------------------------------------------

  const [activeTab, setActiveTab] = useState<TenantSettingsTab>('profile');

  // ---------------------------------------------------------------------------
  // Dirty State
  // ---------------------------------------------------------------------------

  const [isProfileDirty, setProfileDirty] = useState<boolean>(false);
  const [isConfigDirty, setConfigDirty] = useState<boolean>(false);

  const hasUnsavedChanges = isProfileDirty || isConfigDirty;

  // ---------------------------------------------------------------------------
  // Configuration Form State
  // ---------------------------------------------------------------------------

  const [configFormData, setConfigFormData] = useState<ConfigurationFormData | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isSirenTesting, setIsSirenTesting] = useState(false);
  const [configErrors, setConfigErrors] = useState<Record<string, string>>({});

  // ---------------------------------------------------------------------------
  // React Query
  // ---------------------------------------------------------------------------

  const {
    data,
    isLoading: isQueryLoading,
    isError,
    error: queryError,
    refetch,
  } = useQuery<TenantSettings, AppError>({
    queryKey: [TENANT_SETTINGS_QUERY_KEY, selectedTenantId],
    queryFn: () => fetchTenantSettings(selectedTenantId),
    enabled: canManage && !isPermissionsLoading,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const settings = data ?? null;
  const profile = data?.profile ?? null;
  const configuration = data?.configuration ?? null;
  const lifecycleStatus = data?.lifecycleStatus ?? null;
  const lifecycleHistory = data?.lifecycleHistory ?? [];

  const isLoading = isPermissionsLoading || isQueryLoading;

  const error = useMemo<AppError | null>(() => {
    if (!queryError) return null;
    return queryError;
  }, [queryError]);

  // Lifecycle-based permissions
  const canSuspend = canManage && lifecycleStatus === 'ACTIVE';
  const canReactivate = canManage && lifecycleStatus === 'SUSPENDED';
  const canClose = isPlatformAdmin && lifecycleStatus === 'SUSPENDED';

  // Initialize configFormData when configuration is loaded
  useEffect(() => {
    if (configuration && !configFormData) {
      setConfigFormData({
        notificationChannels: { ...configuration.notificationChannels },
        timezone: configuration.timezone,
        language: configuration.language,
        emergencyEscalationTimeout: configuration.emergencyEscalationTimeout,
      });
    }
  }, [configuration, configFormData]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const setTab = useCallback((tab: TenantSettingsTab) => {
    setActiveTab(tab);
  }, []);

  const resetDirtyState = useCallback(() => {
    setProfileDirty(false);
    setConfigDirty(false);
  }, []);

  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  // ---------------------------------------------------------------------------
  // Configuration Actions
  // ---------------------------------------------------------------------------

  const updateConfiguration = useCallback(
    (changes: Partial<ConfigurationFormData>) => {
      setConfigFormData(prev => {
        if (!prev) return prev;
        return { ...prev, ...changes };
      });
      setConfigDirty(true);
      // Clear any related errors
      setConfigErrors(prev => {
        const next = { ...prev };
        Object.keys(changes).forEach(key => {
          delete next[key];
        });
        return next;
      });
    },
    [],
  );

  const saveConfiguration = useCallback(async () => {
    if (!configFormData) return;

    // Validate escalation timeout
    const { emergencyEscalationTimeout } = configFormData;
    if (emergencyEscalationTimeout < 1 || emergencyEscalationTimeout > 10) {
      setConfigErrors({
        emergencyEscalationTimeout: 'tenant_settings.escalation_timeout_invalid',
      });
      return;
    }

    setIsSavingConfig(true);
    setConfigErrors({});

    try {
      const response = await fetch('/api/admin/tenant/settings/configuration', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(configFormData),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          code?: string;
          message?: string;
          fields?: Record<string, string>;
        };

        if (errorData.fields) {
          setConfigErrors(errorData.fields);
        }

        throw new Error(errorData.message ?? 'Failed to save configuration');
      }

      // Refetch to get updated data
      await refetch();
      setConfigDirty(false);
    } catch (err) {
      console.error('Failed to save configuration:', err);
      throw err;
    } finally {
      setIsSavingConfig(false);
    }
  }, [configFormData, refetch]);

  const resetConfiguration = useCallback(() => {
    if (configuration) {
      setConfigFormData({
        notificationChannels: { ...configuration.notificationChannels },
        timezone: configuration.timezone,
        language: configuration.language,
        emergencyEscalationTimeout: configuration.emergencyEscalationTimeout,
      });
      setConfigDirty(false);
      setConfigErrors({});
    }
  }, [configuration]);

  const testSiren = useCallback(async () => {
    setIsSirenTesting(true);
    try {
      const response = await fetch('/api/admin/tenant/settings/siren/test', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to test siren');
      }

      // Optionally refetch to get updated lastSirenTest
      await refetch();
    } catch (err) {
      console.error('Failed to test siren:', err);
      throw err;
    } finally {
      setIsSirenTesting(false);
    }
  }, [refetch]);

  // Reset dirty state when settings are refetched
  useEffect(() => {
    if (data) {
      resetDirtyState();
    }
  }, [data, resetDirtyState]);

  // ---------------------------------------------------------------------------
  // Return ViewModel
  // ---------------------------------------------------------------------------

  return {
    // Data
    settings,
    profile,
    configuration,
    lifecycleStatus,
    lifecycleHistory,
    isLoading,
    isError,
    error,

    // Tab
    activeTab,

    // Dirty State
    isProfileDirty,
    isConfigDirty,
    hasUnsavedChanges,

    // Permissions
    canManage,
    canSuspend,
    canReactivate,
    canClose,

    // Actions
    setTab,
    setProfileDirty,
    setConfigDirty,
    resetDirtyState,
    refetch: handleRefetch,

    // Configuration
    updateConfiguration,
    saveConfiguration,
    resetConfiguration,
    testSiren,
    isSavingConfig,
    isSirenTesting,
    configErrors,
    configFormData,
  };
}

export default useTenantSettingsViewModel;
