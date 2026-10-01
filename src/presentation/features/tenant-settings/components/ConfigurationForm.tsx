'use client';

/**
 * ConfigurationForm — Form component for managing tenant configuration settings.
 *
 * Features:
 * - Siren device section with device ID and connection status
 * - "Test Siren" button with confirmation dialog
 * - Notification channel toggles (Telegram, WhatsApp, Email)
 * - Timezone dropdown (IANA timezones)
 * - Language dropdown
 * - Emergency escalation timeout input (1-10 minutes)
 * - Last update timestamp and actor display
 * - Dirty state tracking
 * - Save and Reset buttons
 *
 * @see Requirements 12.2-12.10 (Tenant Configuration Settings)
 * @see Design Components > 8. Tenant Settings > 8.3 Configuration Form
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import { Input } from '@presentation/components/atoms/Input';
import { Label } from '@presentation/components/atoms/Label';
import { ConfirmDialog } from '@presentation/components/molecules/ConfirmDialog';
import {
  type TenantConfiguration,
  type SirenConnectionStatus,
  type NotificationChannels,
  type SupportedLanguage,
  COMMON_TIMEZONES,
  SUPPORTED_LANGUAGES,
  CONFIGURATION_VALIDATION_RULES,
} from '@core/domains/tenant/entities';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the ConfigurationForm component.
 */
export interface ConfigurationFormProps {
  /**
   * Current configuration data.
   * Null if data has not been loaded yet.
   */
  configuration: TenantConfiguration | null;

  /**
   * Whether the form is in a loading state.
   */
  isLoading?: boolean;

  /**
   * Whether the form is currently saving.
   */
  isSaving?: boolean;

  /**
   * Whether the siren test is in progress.
   */
  isSirenTesting?: boolean;

  /**
   * Callback when configuration changes.
   * Called with partial configuration containing only changed fields.
   */
  onConfigurationChange?: (changes: Partial<FormConfiguration>) => void;

  /**
   * Callback when save is requested.
   */
  onSave?: () => Promise<void>;

  /**
   * Callback when reset is requested.
   */
  onReset?: () => void;

  /**
   * Callback when siren test is requested.
   */
  onTestSiren?: () => Promise<void>;

  /**
   * Whether the form has unsaved changes (dirty state).
   */
  isDirty?: boolean;

  /**
   * Validation errors for form fields.
   */
  errors?: Record<string, string>;

  /**
   * CSS class name for the container.
   */
  className?: string;
}

/**
 * Form configuration type (editable fields only).
 */
export interface FormConfiguration {
  notificationChannels: NotificationChannels;
  timezone: string;
  language: SupportedLanguage;
  emergencyEscalationTimeout: number;
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

/**
 * Toggle switch component for notification channels.
 */
function ToggleSwitch({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <label
          htmlFor={id}
          className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {label}
        </label>
        {description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`
          relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          disabled:cursor-not-allowed disabled:opacity-50
          ${checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}
        `}>
        <span
          aria-hidden="true"
          className={`
            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
            transition duration-200 ease-in-out
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );
}

/**
 * Connection status indicator component.
 */
function ConnectionStatusIndicator({
  status,
}: {
  status: SirenConnectionStatus;
}) {
  const { t } = useTranslation();

  const statusConfig: Record<
    SirenConnectionStatus,
    { color: string; bgColor: string; label: string }
  > = {
    connected: {
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-500',
      label: t('tenant_settings.siren_status_connected', 'Connected'),
    },
    disconnected: {
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-500',
      label: t('tenant_settings.siren_status_disconnected', 'Disconnected'),
    },
    unknown: {
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-400',
      label: t('tenant_settings.siren_status_unknown', 'Unknown'),
    },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${config.bgColor}`}
        aria-hidden="true"
      />
      <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
    </div>
  );
}

/**
 * Section card component for grouping form fields.
 */
function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * ConfigurationForm — Form for managing tenant configuration settings.
 *
 * @see Requirements 12.2-12.10
 */
export function ConfigurationForm({
  configuration,
  isLoading = false,
  isSaving = false,
  isSirenTesting = false,
  onConfigurationChange,
  onSave,
  onReset,
  onTestSiren,
  isDirty = false,
  errors = {},
  className = '',
}: ConfigurationFormProps) {
  const { t, i18n } = useTranslation();

  // ---------------------------------------------------------------------------
  // Local State
  // ---------------------------------------------------------------------------

  const [showTestSirenDialog, setShowTestSirenDialog] = useState(false);

  // Local form state (for optimistic updates)
  const [localConfig, setLocalConfig] = useState<FormConfiguration | null>(null);

  // Sync local state with configuration prop
  useEffect(() => {
    if (configuration) {
      setLocalConfig({
        notificationChannels: { ...configuration.notificationChannels },
        timezone: configuration.timezone,
        language: configuration.language,
        emergencyEscalationTimeout: configuration.emergencyEscalationTimeout,
      });
    }
  }, [configuration]);

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  const formattedLastUpdate = useMemo(() => {
    if (!configuration?.updatedAt) return null;

    const date = new Date(configuration.updatedAt);
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }, [configuration?.updatedAt, i18n.language]);

  const formattedLastSirenTest = useMemo(() => {
    if (!configuration?.lastSirenTest) return null;

    const date = new Date(configuration.lastSirenTest);
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }, [configuration?.lastSirenTest, i18n.language]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleNotificationChannelChange = useCallback(
    (channel: keyof NotificationChannels, enabled: boolean) => {
      if (!localConfig) return;

      const newChannels = {
        ...localConfig.notificationChannels,
        [channel]: enabled,
      };

      setLocalConfig({
        ...localConfig,
        notificationChannels: newChannels,
      });

      onConfigurationChange?.({ notificationChannels: newChannels });
    },
    [localConfig, onConfigurationChange],
  );

  const handleTimezoneChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (!localConfig) return;

      const timezone = e.target.value;
      setLocalConfig({ ...localConfig, timezone });
      onConfigurationChange?.({ timezone });
    },
    [localConfig, onConfigurationChange],
  );

  const handleLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (!localConfig) return;

      const language = e.target.value as SupportedLanguage;
      setLocalConfig({ ...localConfig, language });
      onConfigurationChange?.({ language });
    },
    [localConfig, onConfigurationChange],
  );

  const handleEscalationTimeoutChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!localConfig) return;

      const value = parseInt(e.target.value, 10);
      const { min, max } = CONFIGURATION_VALIDATION_RULES.emergencyEscalationTimeout;

      // Clamp value to valid range
      const clampedValue = Math.min(Math.max(value || min, min), max);

      setLocalConfig({ ...localConfig, emergencyEscalationTimeout: clampedValue });
      onConfigurationChange?.({ emergencyEscalationTimeout: clampedValue });
    },
    [localConfig, onConfigurationChange],
  );

  const handleTestSirenClick = useCallback(() => {
    setShowTestSirenDialog(true);
  }, []);

  const handleTestSirenConfirm = useCallback(async () => {
    setShowTestSirenDialog(false);
    await onTestSiren?.();
  }, [onTestSiren]);

  const handleTestSirenCancel = useCallback(() => {
    setShowTestSirenDialog(false);
  }, []);

  const handleSave = useCallback(async () => {
    await onSave?.();
  }, [onSave]);

  const handleReset = useCallback(() => {
    onReset?.();
    // Reset local state to original configuration
    if (configuration) {
      setLocalConfig({
        notificationChannels: { ...configuration.notificationChannels },
        timezone: configuration.timezone,
        language: configuration.language,
        emergencyEscalationTimeout: configuration.emergencyEscalationTimeout,
      });
    }
  }, [configuration, onReset]);

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (isLoading || !configuration || !localConfig) {
    return (
      <div className={`space-y-6 ${className}`}>
        {/* Loading skeleton */}
        <div className="animate-pulse space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-4 space-y-3">
                <div className="h-10 w-full rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-10 w-full rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Siren Device Section */}
      <FormSection
        title={t('tenant_settings.siren_section_title', 'Siren Device')}
        description={t(
          'tenant_settings.siren_section_description',
          'Configure the physical siren/alarm device for emergency alerts.',
        )}>
        <div className="space-y-4">
          {/* Device ID (Read-only) */}
          <div className="space-y-1.5">
            <Label htmlFor="siren-device-id">
              {t('tenant_settings.siren_device_id', 'Device ID')}
            </Label>
            <Input
              id="siren-device-id"
              type="text"
              value={configuration.sirenDeviceId ?? '-'}
              disabled
              className="bg-gray-50 dark:bg-gray-900"
              aria-describedby="siren-device-id-hint"
            />
            <p id="siren-device-id-hint" className="text-xs text-gray-500 dark:text-gray-400">
              {t(
                'tenant_settings.siren_device_id_hint',
                'Contact support to update the device ID.',
              )}
            </p>
          </div>

          {/* Connection Status */}
          <div className="space-y-1.5">
            <Label>
              {t('tenant_settings.siren_connection_status', 'Connection Status')}
            </Label>
            <ConnectionStatusIndicator status={configuration.sirenConnectionStatus} />
          </div>

          {/* Test Siren Button */}
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTestSirenClick}
              loading={isSirenTesting}
              disabled={
                !configuration.sirenDeviceId ||
                configuration.sirenConnectionStatus !== 'connected' ||
                isSirenTesting
              }>
              {t('tenant_settings.test_siren', 'Test Siren')}
            </Button>

            {/* Last Test Timestamp */}
            {formattedLastSirenTest && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('tenant_settings.last_siren_test', 'Last test: {{time}}', {
                  time: formattedLastSirenTest,
                })}
              </span>
            )}
          </div>

          {/* Disabled hint */}
          {(!configuration.sirenDeviceId ||
            configuration.sirenConnectionStatus !== 'connected') && (
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              {!configuration.sirenDeviceId
                ? t('tenant_settings.siren_no_device', 'No siren device configured.')
                : t(
                    'tenant_settings.siren_not_connected',
                    'Siren device is not connected. Test unavailable.',
                  )}
            </p>
          )}
        </div>
      </FormSection>

      {/* Notification Channels Section */}
      <FormSection
        title={t('tenant_settings.notifications_section_title', 'Notification Channels')}
        description={t(
          'tenant_settings.notifications_section_description',
          'Configure which channels are enabled for sending notifications.',
        )}>
        <div className="space-y-4">
          <ToggleSwitch
            id="notification-telegram"
            label={t('tenant_settings.notification_telegram', 'Telegram')}
            description={t(
              'tenant_settings.notification_telegram_description',
              'Send notifications via Telegram bot.',
            )}
            checked={localConfig.notificationChannels.telegram}
            onChange={checked => handleNotificationChannelChange('telegram', checked)}
            disabled={isSaving}
          />

          <ToggleSwitch
            id="notification-whatsapp"
            label={t('tenant_settings.notification_whatsapp', 'WhatsApp')}
            description={t(
              'tenant_settings.notification_whatsapp_description',
              'Send notifications via WhatsApp Business.',
            )}
            checked={localConfig.notificationChannels.whatsapp}
            onChange={checked => handleNotificationChannelChange('whatsapp', checked)}
            disabled={isSaving}
          />

          <ToggleSwitch
            id="notification-email"
            label={t('tenant_settings.notification_email', 'Email')}
            description={t(
              'tenant_settings.notification_email_description',
              'Send notifications via email.',
            )}
            checked={localConfig.notificationChannels.email}
            onChange={checked => handleNotificationChannelChange('email', checked)}
            disabled={isSaving}
          />
        </div>
      </FormSection>

      {/* Localization Settings Section */}
      <FormSection
        title={t('tenant_settings.localization_section_title', 'Localization')}
        description={t(
          'tenant_settings.localization_section_description',
          'Configure timezone and language preferences.',
        )}>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Timezone */}
          <div className="space-y-1.5">
            <Label htmlFor="timezone">
              {t('tenant_settings.timezone', 'Timezone')}
            </Label>
            <select
              id="timezone"
              value={localConfig.timezone}
              onChange={handleTimezoneChange}
              disabled={isSaving}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm
                focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500
                disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50
                dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
              {COMMON_TIMEZONES.map(tz => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            {errors.timezone && (
              <p className="text-sm text-red-600 dark:text-red-400">{errors.timezone}</p>
            )}
          </div>

          {/* Language */}
          <div className="space-y-1.5">
            <Label htmlFor="language">
              {t('tenant_settings.language', 'Language')}
            </Label>
            <select
              id="language"
              value={localConfig.language}
              onChange={handleLanguageChange}
              disabled={isSaving}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm
                focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500
                disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50
                dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
            {errors.language && (
              <p className="text-sm text-red-600 dark:text-red-400">{errors.language}</p>
            )}
          </div>
        </div>
      </FormSection>

      {/* Emergency Settings Section */}
      <FormSection
        title={t('tenant_settings.emergency_section_title', 'Emergency Settings')}
        description={t(
          'tenant_settings.emergency_section_description',
          'Configure emergency escalation behavior.',
        )}>
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="escalation-timeout" required>
            {t('tenant_settings.escalation_timeout', 'Escalation Timeout (minutes)')}
          </Label>
          <Input
            id="escalation-timeout"
            type="number"
            min={CONFIGURATION_VALIDATION_RULES.emergencyEscalationTimeout.min}
            max={CONFIGURATION_VALIDATION_RULES.emergencyEscalationTimeout.max}
            value={localConfig.emergencyEscalationTimeout}
            onChange={handleEscalationTimeoutChange}
            disabled={isSaving}
            error={errors.emergencyEscalationTimeout}
            aria-describedby="escalation-timeout-hint"
          />
          <p id="escalation-timeout-hint" className="text-xs text-gray-500 dark:text-gray-400">
            {t(
              'tenant_settings.escalation_timeout_hint',
              'Time before an emergency alert escalates to the next level (1-10 minutes).',
            )}
          </p>
        </div>
      </FormSection>

      {/* Audit Info Section */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500 dark:text-gray-400">
          {formattedLastUpdate && (
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {t('tenant_settings.last_updated', 'Last updated:')}
              </span>{' '}
              {formattedLastUpdate}
            </div>
          )}
          {configuration.updatedBy && (
            <div>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {t('tenant_settings.updated_by', 'By:')}
              </span>{' '}
              {configuration.updatedBy}
            </div>
          )}
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-700">
        <Button
          variant="ghost"
          size="md"
          onClick={handleReset}
          disabled={!isDirty || isSaving}>
          {t('tenant_settings.reset', 'Reset')}
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          loading={isSaving}
          disabled={!isDirty || isSaving}>
          {t('tenant_settings.save_configuration', 'Save Configuration')}
        </Button>
      </div>

      {/* Test Siren Confirmation Dialog */}
      <ConfirmDialog
        open={showTestSirenDialog}
        title={t('tenant_settings.test_siren_confirm_title', 'Test Siren')}
        description={t(
          'tenant_settings.test_siren_confirm_description',
          'This will activate the siren briefly for testing purposes. The siren will sound for a few seconds.',
        )}
        confirmLabel={t('tenant_settings.test_siren_confirm_button', 'Test Now')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="primary"
        loading={isSirenTesting}
        onConfirm={handleTestSirenConfirm}
        onCancel={handleTestSirenCancel}
      />
    </div>
  );
}

export default ConfigurationForm;
