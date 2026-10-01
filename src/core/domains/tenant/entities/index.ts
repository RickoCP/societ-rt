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
  RT_RW_NUMBER_PATTERN,
  HEX_COLOR_PATTERN,
  PROFILE_LIMITS,
  ALLOWED_LOGO_TYPES,
  isValidRtRwNumber,
  isValidHexColor,
} from './TenantProfile';

// Tenant Configuration entity
export type {
  TenantConfiguration,
  UpdateTenantConfigInput,
  NotificationChannels,
  SirenConnectionStatus,
  SupportedLanguageCode,
} from './TenantConfiguration';
export {
  ESCALATION_TIMEOUT_BOUNDS,
  COMMON_TIMEZONES,
  SUPPORTED_LANGUAGES,
  DEFAULT_NOTIFICATION_CHANNELS,
  DEFAULT_TENANT_CONFIG,
  isValidEscalationTimeout,
  isValidTimezone,
  isSupportedLanguage,
} from './TenantConfiguration';

// Tenant Lifecycle Status entity
export type {
  TenantLifecycleStatus,
  LifecycleTransitionInput,
  LifecycleEvent,
  LifecycleStatusValue,
  LifecycleActionValue,
} from './TenantLifecycleStatus';
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

export type {
  TenantProfile,
  UpdateTenantProfileInput,
} from './TenantProfile';
export { PROFILE_VALIDATION_RULES } from './TenantProfile';

export type {
  TenantConfiguration,
  NotificationChannels,
  UpdateTenantConfigurationInput,
} from './TenantConfiguration';
export {
  SirenConnectionStatus,
  ALL_SIREN_CONNECTION_STATUSES,
  CONFIGURATION_VALIDATION_RULES,
  SUPPORTED_LANGUAGES,
  DEFAULT_NOTIFICATION_CHANNELS,
  DEFAULT_TENANT_CONFIGURATION,
} from './TenantConfiguration';

export type {
  TenantLifecycleState,
  LifecycleEvent,
  SuspendTenantInput,
  ReactivateTenantInput,
  CloseTenantInput,
} from './TenantLifecycleStatus';
export {
  TenantLifecycleStatus,
  ALL_LIFECYCLE_STATUSES,
  LIFECYCLE_TRANSITIONS,
  OPERATIONAL_LIFECYCLE_STATUSES,
  RESTRICTED_LIFECYCLE_STATUSES,
  TERMINAL_LIFECYCLE_STATUSES,
  LifecycleEventType,
  isValidLifecycleTransition,
  isOperationalLifecycleStatus,
  isRestrictedLifecycleStatus,
  isTerminalLifecycleStatus,
  getAllowedLifecycleTransitions,
  canSuspendTenant,
  canReactivateTenant,
  canCloseTenant,
} from './TenantLifecycleStatus';
