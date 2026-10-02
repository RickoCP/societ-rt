/**
 * Tenant entities barrel export.
 *
 * @see Requirements 11.5, 12.2, 13.2 (Multi-Tenant Admin UI)
 */

export type {
  Tenant,
  CreateTenantInput,
  UpdateTenantBrandingInput,
  UpdateTenantSirenInput,
} from './Tenant';

// Tenant Profile entity
export type {
  TenantProfile,
  UpdateTenantProfileInput,
  AllowedLogoType,
} from './TenantProfile';
export {
  PROFILE_VALIDATION_RULES,
  PROFILE_LIMITS,
  RT_RW_NUMBER_PATTERN,
  HEX_COLOR_PATTERN,
  isValidRtRwNumber,
  isValidHexColor,
} from './TenantProfile';

// Tenant Configuration entity
export type {
  TenantConfiguration,
  NotificationChannels,
  SirenConnectionStatus,
  SupportedLanguage as SupportedLanguageCode,
  UpdateTenantConfigurationInput,
  UpdateTenantConfigurationInput as UpdateTenantConfigInput,
} from './TenantConfiguration';
export {
  COMMON_TIMEZONES,
  SUPPORTED_LANGUAGES,
  DEFAULT_CONFIGURATION as DEFAULT_NOTIFICATION_CHANNELS,
  DEFAULT_CONFIGURATION as DEFAULT_TENANT_CONFIG,
  DEFAULT_CONFIGURATION as DEFAULT_TENANT_CONFIGURATION,
  CONFIGURATION_VALIDATION_RULES,
  ESCALATION_TIMEOUT_BOUNDS,
  isValidEscalationTimeout,
  isValidTimezone,
  isSupportedLanguage,
} from './TenantConfiguration';

// Helper constants for siren status
export const ALL_SIREN_CONNECTION_STATUSES = [
  'connected',
  'disconnected',
  'unknown',
] as const;

// Tenant Lifecycle Status entity
export type {
  TenantLifecycleStatus,
  LifecycleTransitionInput,
  LifecycleEvent,
  LifecycleStatusValue,
  LifecycleActionValue,
} from './TenantLifecycleStatus';

// Alias types for backwards compatibility
export type TenantLifecycleState = import('./TenantLifecycleStatus').TenantLifecycleStatus;

export {
  LifecycleStatus,
  LifecycleAction,
  LIFECYCLE_TRANSITIONS,
  isValidLifecycleTransition,
  getTargetStatusForAction,
  getAvailableActions,
  isTerminalStatus,
  isOperationalStatus,
  requiresPlatformAdminForAction,
} from './TenantLifecycleStatus';

// Alias exports for backwards compatibility
export {
  LifecycleStatus as ALL_LIFECYCLE_STATUSES,
  LifecycleAction as LifecycleEventType,
  isOperationalStatus as isOperationalLifecycleStatus,
  isTerminalStatus as isTerminalLifecycleStatus,
  getAvailableActions as getAllowedLifecycleTransitions,
} from './TenantLifecycleStatus';
