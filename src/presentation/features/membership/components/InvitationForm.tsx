'use client';

/**
 * InvitationForm — Modal/drawer component for inviting new members via email.
 *
 * Features:
 * - Email input with client-side validation
 * - Role dropdown filtered by delegation matrix
 * - OrgUnit dropdown filtered by user scope
 * - Pre-select current OrgUnit for org-scoped admins
 * - Support bulk email input (paste multiple, limit 50)
 * - Display success/error toasts
 * - Accessible: Focus trapping (23.9), proper labels (23.5), keyboard nav (23.8)
 *
 * @see Requirements 3.1-3.12 (Member Invitation Flow)
 * @see Requirements 23.5-23.12 (Accessibility)
 * @see Design Components > 3. Member Invitation Flow
 */

import React, { useCallback, useId, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap, useAriaLive } from '@presentation/hooks/useAccessibility';
import {
  useInvitationFormViewModel,
  BULK_EMAIL_LIMIT,
  type EmailValidationResult,
} from '../viewModel/useInvitationFormViewModel';
import { MembershipRole } from '@core/domains/membership/types/MembershipRole';
import type { OrgUnit } from '@core/domains/orgunit/entities/OrgUnit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the InvitationForm component.
 *
 * If using stand-alone mode, consume via the internal ViewModel:
 * ```tsx
 * <InvitationForm />
 * ```
 *
 * If using controlled mode (with external ViewModel), pass all props:
 * ```tsx
 * <InvitationForm {...vmProps} />
 * ```
 */
export interface InvitationFormProps {
  // ---------------------------------------------------------------------------
  // Modal State (optional - uses internal ViewModel if not provided)
  // ---------------------------------------------------------------------------

  /**
   * Whether the form modal/drawer is open.
   */
  isOpen?: boolean;

  /**
   * Callback when the form should close.
   */
  onClose?: () => void;

  // ---------------------------------------------------------------------------
  // Form Data (optional - uses internal ViewModel if not provided)
  // ---------------------------------------------------------------------------

  /**
   * Raw email input string.
   */
  emailInput?: string;

  /**
   * Parsed email validation result.
   */
  parsedEmails?: EmailValidationResult;

  /**
   * Whether bulk limit is exceeded.
   */
  isBulkLimitExceeded?: boolean;

  /**
   * Whether there are email validation errors.
   */
  hasEmailErrors?: boolean;

  /**
   * Callback when email input changes.
   */
  onEmailChange?: (value: string) => void;

  /**
   * Available roles for selection (filtered by delegation matrix).
   */
  availableRoles?: MembershipRole[];

  /**
   * Currently selected role.
   */
  selectedRole?: MembershipRole | null;

  /**
   * Callback when role selection changes.
   */
  onRoleChange?: (role: MembershipRole) => void;

  /**
   * Available OrgUnits for selection.
   */
  availableOrgUnits?: OrgUnit[];

  /**
   * Whether OrgUnits are loading.
   */
  isOrgUnitsLoading?: boolean;

  /**
   * Currently selected OrgUnit ID.
   */
  selectedOrgUnitId?: string | null;

  /**
   * Callback when OrgUnit selection changes.
   */
  onOrgUnitChange?: (orgUnitId: string | null) => void;

  /**
   * Whether OrgUnit field should be shown.
   */
  showOrgUnitField?: boolean;

  /**
   * Whether OrgUnit selection is required.
   */
  isOrgUnitRequired?: boolean;

  // ---------------------------------------------------------------------------
  // Submission State
  // ---------------------------------------------------------------------------

  /**
   * Whether form is currently submitting.
   */
  isSubmitting?: boolean;

  /**
   * Whether form can be submitted.
   */
  canSubmit?: boolean;

  /**
   * Callback when form is submitted.
   */
  onSubmit?: () => Promise<void>;

  // ---------------------------------------------------------------------------
  // Additional
  // ---------------------------------------------------------------------------

  /**
   * CSS class name for the container.
   */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

/**
 * Email validation summary component.
 */
function EmailValidationSummary({
  parsedEmails,
  isBulkLimitExceeded,
  t,
}: {
  parsedEmails: EmailValidationResult;
  isBulkLimitExceeded: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const { valid, invalid, duplicates } = parsedEmails;

  if (valid.length === 0 && invalid.length === 0 && duplicates.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 text-sm space-y-1">
      {/* Valid emails count */}
      {valid.length > 0 && (
        <p className={isBulkLimitExceeded ? 'text-red-600' : 'text-green-600'}>
          {t('invitation.valid_emails_count', { count: valid.length })}
          {isBulkLimitExceeded && (
            <span className="ml-1">
              ({t('invitation.bulk_limit_exceeded', { limit: BULK_EMAIL_LIMIT })})
            </span>
          )}
        </p>
      )}

      {/* Invalid emails */}
      {invalid.length > 0 && (
        <div className="text-red-600">
          <p>{t('invitation.invalid_emails_count', { count: invalid.length })}:</p>
          <ul className="list-disc list-inside ml-2">
            {invalid.slice(0, 5).map((email, idx) => (
              <li key={idx} className="truncate max-w-xs">
                {email}
              </li>
            ))}
            {invalid.length > 5 && (
              <li>{t('invitation.and_more', { count: invalid.length - 5 })}</li>
            )}
          </ul>
        </div>
      )}

      {/* Duplicate emails */}
      {duplicates.length > 0 && (
        <p className="text-yellow-600">
          {t('invitation.duplicate_emails_count', { count: duplicates.length })}
        </p>
      )}
    </div>
  );
}

/**
 * Role label component with i18n support.
 */
function getRoleLabel(role: MembershipRole, t: (key: string) => string): string {
  const labels: Record<MembershipRole, string> = {
    [MembershipRole.PLATFORM_ADMIN]: t('roles.platform_admin'),
    [MembershipRole.TENANT_OWNER]: t('roles.tenant_owner'),
    [MembershipRole.ORG_ADMIN]: t('roles.org_admin'),
    [MembershipRole.RT_ADMIN]: t('roles.rt_admin'),
    [MembershipRole.SECURITY]: t('roles.security'),
    [MembershipRole.RESIDENT]: t('roles.resident'),
  };
  return labels[role] ?? role;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * InvitationForm — Form component for inviting new members.
 *
 * Can be used in two modes:
 * 1. Stand-alone mode: Uses internal ViewModel
 * 2. Controlled mode: All props provided externally
 *
 * @see Requirements 3.1-3.12
 * @see Requirements 23.9 (Focus trapping for modals)
 */
export function InvitationForm(props: InvitationFormProps) {
  const { t } = useTranslation();
  const uniqueId = useId();
  const titleId = `invitation-form-title-${uniqueId}`;
  const descId = `invitation-form-desc-${uniqueId}`;

  // Use internal ViewModel when props are not provided
  const internalVm = useInvitationFormViewModel();

  // Determine which values to use (props or internal ViewModel)
  const isOpen = props.isOpen ?? internalVm.isOpen;
  const onClose = props.onClose ?? internalVm.close;

  const emailInput = props.emailInput ?? internalVm.emailInput;
  const parsedEmails = props.parsedEmails ?? internalVm.parsedEmails;
  const isBulkLimitExceeded = props.isBulkLimitExceeded ?? internalVm.isBulkLimitExceeded;
  const hasEmailErrors = props.hasEmailErrors ?? internalVm.hasEmailErrors;
  const onEmailChange = props.onEmailChange ?? internalVm.setEmailInput;

  const availableRoles = props.availableRoles ?? internalVm.availableRoles;
  const selectedRole = props.selectedRole ?? internalVm.selectedRole;
  const onRoleChange = props.onRoleChange ?? internalVm.setSelectedRole;

  const availableOrgUnits = props.availableOrgUnits ?? internalVm.availableOrgUnits;
  const isOrgUnitsLoading = props.isOrgUnitsLoading ?? internalVm.isOrgUnitsLoading;
  const selectedOrgUnitId = props.selectedOrgUnitId ?? internalVm.selectedOrgUnitId;
  const onOrgUnitChange = props.onOrgUnitChange ?? internalVm.setSelectedOrgUnitId;
  const showOrgUnitField = props.showOrgUnitField ?? internalVm.showOrgUnitField;
  const isOrgUnitRequired = props.isOrgUnitRequired ?? internalVm.isOrgUnitRequired;

  const isSubmitting = props.isSubmitting ?? internalVm.isSubmitting;
  const canSubmit = props.canSubmit ?? internalVm.canSubmit;
  const onSubmit = props.onSubmit ?? internalVm.submit;

  // Focus trap for accessibility (Requirements 23.9)
  const focusTrapRef = useFocusTrap<HTMLDivElement>({
    enabled: isOpen,
    returnFocusOnDeactivate: true,
    initialFocusSelector: '#invitation-emails', // Focus email input first
  });

  // ARIA live announcements for validation feedback (Requirements 23.10)
  const announce = useAriaLive({ politeness: 'polite' });

  // Announce validation errors to screen readers
  useEffect(() => {
    if (hasEmailErrors && parsedEmails.invalid.length > 0) {
      announce(t('invitation.invalid_emails_count', { count: parsedEmails.invalid.length }));
    }
  }, [hasEmailErrors, parsedEmails.invalid.length, announce, t]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (canSubmit) {
        await onSubmit();
      }
    },
    [canSubmit, onSubmit],
  );

  // Handle role change
  const handleRoleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const role = e.target.value as MembershipRole;
      if (role) {
        onRoleChange(role);
      }
    },
    [onRoleChange],
  );

  // Handle OrgUnit change
  const handleOrgUnitChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onOrgUnitChange(value || null);
    },
    [onOrgUnitChange],
  );

  // Handle backdrop click to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  // Handle Escape key to close (Requirements 23.8)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        onClose();
      }
    },
    [isSubmitting, onClose],
  );

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        ref={focusTrapRef}
        className={`bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 ${props.className ?? ''}`}
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-gray-900">
              {t('invitation.title')}
            </h2>
            <p id={descId} className="sr-only">
              {t('invitation.description', { defaultValue: 'Invite new members by email with role and organization unit assignment' })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label={t('common.close')}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {/* Email Input */}
            <div>
              <label
                htmlFor="invitation-emails"
                className="block text-sm font-medium text-gray-700"
              >
                {t('invitation.email_label')} *
              </label>
              <p className="text-xs text-gray-500 mt-1">
                {t('invitation.email_hint', { limit: BULK_EMAIL_LIMIT })}
              </p>
              <textarea
                id="invitation-emails"
                value={emailInput}
                onChange={e => onEmailChange(e.target.value)}
                placeholder={t('invitation.email_placeholder')}
                rows={4}
                className={`mt-1 block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                  hasEmailErrors || isBulkLimitExceeded
                    ? 'border-red-300'
                    : 'border-gray-300'
                }`}
                aria-describedby="email-validation-summary"
                disabled={isSubmitting}
              />
              <div id="email-validation-summary">
                <EmailValidationSummary
                  parsedEmails={parsedEmails}
                  isBulkLimitExceeded={isBulkLimitExceeded}
                  t={t}
                />
              </div>
            </div>

            {/* Role Selection */}
            <div>
              <label
                htmlFor="invitation-role"
                className="block text-sm font-medium text-gray-700"
              >
                {t('invitation.role_label')} *
              </label>
              <select
                id="invitation-role"
                value={selectedRole ?? ''}
                onChange={handleRoleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={isSubmitting || availableRoles.length === 0}
                required
              >
                <option value="">{t('invitation.role_placeholder')}</option>
                {availableRoles.map(role => (
                  <option key={role} value={role}>
                    {getRoleLabel(role, t)}
                  </option>
                ))}
              </select>
              {availableRoles.length === 0 && (
                <p className="mt-1 text-xs text-yellow-600">
                  {t('invitation.no_delegatable_roles')}
                </p>
              )}
            </div>

            {/* OrgUnit Selection */}
            {showOrgUnitField && (
              <div>
                <label
                  htmlFor="invitation-orgunit"
                  className="block text-sm font-medium text-gray-700"
                >
                  {t('invitation.orgunit_label')}
                  {isOrgUnitRequired && ' *'}
                </label>
                <select
                  id="invitation-orgunit"
                  value={selectedOrgUnitId ?? ''}
                  onChange={handleOrgUnitChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  disabled={isSubmitting || isOrgUnitsLoading}
                  required={isOrgUnitRequired}
                >
                  <option value="">
                    {isOrgUnitsLoading
                      ? t('common.loading')
                      : t('invitation.orgunit_placeholder')}
                  </option>
                  {availableOrgUnits.map(orgUnit => (
                    <option key={orgUnit.id} value={orgUnit.id}>
                      {orgUnit.name}
                    </option>
                  ))}
                </select>
                {!isOrgUnitRequired && (
                  <p className="mt-1 text-xs text-gray-500">
                    {t('invitation.orgunit_optional_hint')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center">
                  <svg
                    className="w-4 h-4 mr-2 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  {t('invitation.sending')}
                </span>
              ) : parsedEmails.valid.length > 1 ? (
                t('invitation.send_bulk', { count: parsedEmails.valid.length })
              ) : (
                t('invitation.send')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default InvitationForm;
