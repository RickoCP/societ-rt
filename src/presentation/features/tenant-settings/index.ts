/**
 * Tenant Settings Feature Module
 *
 * Exports all public components, hooks, and types for the tenant settings feature.
 *
 * This feature provides administrative UI for managing:
 * - Tenant profile (name, address, logo, branding)
 * - Tenant configuration (siren, notifications, timezone, language)
 * - Tenant lifecycle (status, suspend, reactivate, close)
 *
 * @see Requirements 11.1-11.10 (Tenant Settings Profile)
 * @see Requirements 12.1-12.10 (Tenant Configuration Settings)
 * @see Requirements 13.1-13.11 (Tenant Lifecycle Management)
 */

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

export { TenantSettingsScreen } from './screens/TenantSettingsScreen';
export { default as TenantSettingsScreenDefault } from './screens/TenantSettingsScreen';

// ---------------------------------------------------------------------------
// ViewModels
// ---------------------------------------------------------------------------

export {
  useTenantSettingsViewModel,
  TENANT_SETTINGS_QUERY_KEY,
  TENANT_SETTINGS_TABS,
  TAB_CONFIG,
} from './viewModel/useTenantSettingsViewModel';

export type {
  TenantSettingsTab,
  TenantProfile,
  TenantConfiguration,
  TenantLifecycleStatus,
  LifecycleEvent,
  TenantSettings,
  TenantSettingsViewModel,
  ConfigurationFormData,
} from './viewModel/useTenantSettingsViewModel';

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export {
  ConfigurationForm,
} from './components';

export type {
  ConfigurationFormProps,
  FormConfiguration,
} from './components';
