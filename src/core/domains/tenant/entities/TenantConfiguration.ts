/**
 * TenantConfiguration — Domain entity representing tenant-specific configuration.
 *
 * Contains all configurable settings for the Tenant Settings Configuration tab,
 * including siren device, notification channels, localization, and emergency settings.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 12.2-12.10 (Tenant Configuration Settings)
 * @see Design Components and Interfaces > 8. Tenant Settings > 8.3 Configuration Form
 */

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * Siren connection status values.
 */
export type SirenConnectionStatus = 'connected' | 'disconnected' | 'unknown';

/**
 * Notification channel configuration.
 */
export interface NotificationChannels {
  /**
   * Whether Telegram notifications are enabled.
   */
  readonly telegram: boolean;

  /**
   * Whether WhatsApp notifications are enabled.
   */
  readonly whatsapp: boolean;

  /**
   * Whether Email notifications are enabled.
   */
  readonly email: boolean;
}

/**
 * Supported language codes.
 */
export type SupportedLanguage = 'id' | 'en';

/**
 * TenantConfiguration entity — configurable tenant settings.
 *
 * INVARIANTS:
 * - sirenDeviceId is optional (null if no device configured)
 * - sirenConnectionStatus reflects real-time device status
 * - timezone is a valid IANA timezone string
 * - language is a supported language code
 * - emergencyEscalationTimeout must be between 1-10 minutes
 *
 * SECURITY CONSIDERATIONS:
 * - Siren test requires explicit confirmation to prevent abuse
 * - Configuration changes require `tenant:manage` permission
 * - All changes logged to audit trail
 */
export interface TenantConfiguration {
  /**
   * Unique identifier for this tenant.
   */
  readonly tenantId: string;

  /**
   * Physical siren/alarm device ID (provider-specific, e.g., Tuya).
   * Null if no device is configured.
   */
  readonly sirenDeviceId: string | null;

  /**
   * Current connection status of the siren device.
   * - connected: Device is online and responsive
   * - disconnected: Device is offline or unreachable
   * - unknown: Status cannot be determined
   */
  readonly sirenConnectionStatus: SirenConnectionStatus;

  /**
   * Timestamp of the last siren test, if any.
   */
  readonly lastSirenTest: Date | null;

  /**
   * Notification channel preferences.
   */
  readonly notificationChannels: NotificationChannels;

  /**
   * IANA timezone string for the tenant (e.g., 'Asia/Jakarta').
   */
  readonly timezone: string;

  /**
   * Preferred language for the tenant.
   */
  readonly language: SupportedLanguage;

  /**
   * Time in minutes before an emergency escalates to next level.
   * Valid range: 1-10 minutes.
   */
  readonly emergencyEscalationTimeout: number;

  /**
   * When the configuration was last updated.
   */
  readonly updatedAt: Date;

  /**
   * Who last updated the configuration (user name/email).
   */
  readonly updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Data for updating tenant configuration.
 * All fields are optional - only provided fields will be updated.
 *
 * @see Requirements 12.7 (Configuration update)
 */
export interface UpdateTenantConfigurationInput {
  readonly sirenDeviceId?: string | null;
  readonly notificationChannels?: Partial<NotificationChannels>;
  readonly timezone?: string;
  readonly language?: SupportedLanguage;
  readonly emergencyEscalationTimeout?: number;
}

// ---------------------------------------------------------------------------
// Validation Rules
// ---------------------------------------------------------------------------

/**
 * Configuration validation rules for client-side and server-side validation.
 *
 * @see Requirements 12.9 (Configuration validation)
 */
export const CONFIGURATION_VALIDATION_RULES = {
  emergencyEscalationTimeout: {
    min: 1,
    max: 10,
  },
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Common IANA timezones for Indonesia and surrounding regions.
 * Full list can be expanded as needed.
 */
export const COMMON_TIMEZONES = [
  // Indonesia
  'Asia/Jakarta', // WIB (UTC+7)
  'Asia/Makassar', // WITA (UTC+8)
  'Asia/Jayapura', // WIT (UTC+9)
  // Other common timezones
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Bangkok',
  'Asia/Ho_Chi_Minh',
  'Asia/Manila',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Australia/Sydney',
  'Australia/Perth',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Pacific/Auckland',
  'UTC',
] as const;

/**
 * Supported languages for the platform.
 */
export const SUPPORTED_LANGUAGES: readonly { code: SupportedLanguage; name: string }[] = [
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'en', name: 'English' },
] as const;

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIGURATION = {
  timezone: 'Asia/Jakarta',
  language: 'id' as SupportedLanguage,
  emergencyEscalationTimeout: 2,
  notificationChannels: {
    telegram: true,
    whatsapp: false,
    email: true,
  },
} as const;

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Escalation timeout bounds.
 */
export const ESCALATION_TIMEOUT_BOUNDS = {
  MIN: 1,
  MAX: 10,
} as const;

/**
 * Validates that an escalation timeout is within valid bounds.
 * @param timeout The timeout value to validate
 * @returns true if valid
 */
export function isValidEscalationTimeout(timeout: number): boolean {
  return timeout >= ESCALATION_TIMEOUT_BOUNDS.MIN && timeout <= ESCALATION_TIMEOUT_BOUNDS.MAX;
}

/**
 * Validates that a timezone is a valid IANA timezone string.
 * @param timezone The timezone to validate
 * @returns true if valid (in the common timezones list)
 */
export function isValidTimezone(timezone: string): boolean {
  return (COMMON_TIMEZONES as readonly string[]).includes(timezone);
}

/**
 * Checks if a language code is supported.
 * @param language The language code to check
 * @returns true if supported
 */
export function isSupportedLanguage(language: string): language is SupportedLanguage {
  return SUPPORTED_LANGUAGES.some((l) => l.code === language);
}
