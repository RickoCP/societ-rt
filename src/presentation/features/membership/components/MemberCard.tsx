'use client';

/**
 * MemberCard — Modal component for viewing and editing member details.
 *
 * Displays:
 * - Member profile info (avatar, name, email, role, OrgUnit, status, dates)
 * - Editable role dropdown (filtered by delegation matrix) if has permission
 * - OrgUnit selection when org-scoped role selected
 * - Role change history section
 *
 * SECURITY CONSIDERATIONS:
 * - UI permission checks are for UX only; server-side authorization is enforced
 * - Role dropdown is filtered by delegation matrix
 * - OrgUnit selection is scoped to user's authorization
 *
 * @see Requirements 5.1-5.11 (Member Role Change)
 * @see Design Section 4. Member Role Change > 4.1 Member Card Modal
 */

import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import { Avatar } from '@presentation/components/atoms/Avatar';
import { Spinner } from '@presentation/components/atoms/Spinner';
import type { MemberCardViewModel } from '../viewModel/useMemberCardViewModel';
import { MembershipRole } from '@core/domains/membership/types/MembershipRole';
import { MembershipStatus } from '@core/domains/membership/types/MembershipStatus';
import { isOrgScopedRole } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for MemberCard component.
 */
export interface MemberCardProps {
  /**
   * ViewModel instance from useMemberCardViewModel.
   */
  viewModel: MemberCardViewModel;

  /**
   * Whether the modal is open.
   */
  isOpen: boolean;

  /**
   * Callback to close the modal.
   */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

/**
 * Status badge component with color coding.
 */
function StatusBadge({ status }: { status: MembershipStatus }) {
  const { t } = useTranslation();

  const statusConfig: Record<
    MembershipStatus,
    { bgColor: string; textColor: string }
  > = {
    [MembershipStatus.ACTIVE]: {
      bgColor: 'bg-green-100 dark:bg-green-900/30',
      textColor: 'text-green-700 dark:text-green-300',
    },
    [MembershipStatus.SUSPENDED]: {
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      textColor: 'text-yellow-700 dark:text-yellow-300',
    },
    [MembershipStatus.INVITED]: {
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      textColor: 'text-blue-700 dark:text-blue-300',
    },
    [MembershipStatus.REVOKED]: {
      bgColor: 'bg-red-100 dark:bg-red-900/30',
      textColor: 'text-red-700 dark:text-red-300',
    },
  };

  const config = statusConfig[status] ?? {
    bgColor: 'bg-gray-100 dark:bg-gray-700',
    textColor: 'text-gray-700 dark:text-gray-300',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgColor} ${config.textColor}`}
      role="status"
      aria-label={t(`membership_status.${status.toLowerCase()}`)}
    >
      {t(`membership_status.${status.toLowerCase()}`)}
    </span>
  );
}

/**
 * Role badge component.
 */
function RoleBadge({ role }: { role: MembershipRole }) {
  const { t } = useTranslation();

  return (
    <span
      className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
      aria-label={t(`membership_role.${role.toLowerCase()}`)}
    >
      {t(`membership_role.${role.toLowerCase()}`)}
    </span>
  );
}

/**
 * Info row component for displaying label-value pairs.
 */
function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <dt className="min-w-32 text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="text-sm text-gray-900 dark:text-gray-100">
        {children ?? value ?? '—'}
      </dd>
    </div>
  );
}

/**
 * Format date for display.
 */
function formatDate(date: Date, locale: string = 'id-ID'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Format date for short display.
 */
function formatShortDate(date: Date, locale: string = 'id-ID'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * MemberCard — Modal for viewing and editing member details.
 *
 * @example
 * ```tsx
 * const vm = useMemberCardViewModel({
 *   member: selectedMember,
 *   isOpen: isModalOpen,
 *   onClose: handleClose,
 * });
 *
 * return (
 *   <MemberCard
 *     viewModel={vm}
 *     isOpen={isModalOpen}
 *     onClose={handleClose}
 *   />
 * );
 * ```
 */
export function MemberCard({ viewModel, isOpen, onClose }: MemberCardProps) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const {
    // Member Data
    member,
    isLoadingMember,
    memberError,

    // Role Change History
    changeHistory,
    isLoadingHistory,

    // Available Roles & OrgUnits
    availableRoles,
    availableOrgUnits,
    isLoadingOrgUnits,

    // Form State
    selectedRole,
    selectedOrgUnitId,
    reason,
    isDirty,
    requiresOrgUnit,
    isFormValid,

    // Permissions
    canEdit,

    // Mutation State
    isSaving,

    // Actions
    setSelectedRole,
    setSelectedOrgUnitId,
    setReason,
    resetForm,
    saveRoleChange,
  } = viewModel;

  // ---------------------------------------------------------------------------
  // Dialog Open/Close
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Handle Escape key and backdrop click
  const handleDialogClose = useCallback(() => {
    if (isDirty && !window.confirm(t('common.unsaved_changes_confirm'))) {
      return;
    }
    onClose();
  }, [isDirty, onClose, t]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) {
        handleDialogClose();
      }
    },
    [handleDialogClose],
  );

  // Handle form submit
  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isFormValid || isSaving) return;
      await saveRoleChange();
    },
    [isFormValid, isSaving, saveRoleChange],
  );

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (isDirty) {
      resetForm();
    }
    handleDialogClose();
  }, [isDirty, resetForm, handleDialogClose]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onClose={handleDialogClose}
      className="fixed inset-0 z-50 m-auto max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg border-0 bg-white p-0 shadow-xl backdrop:bg-black/50 dark:bg-gray-800"
      aria-labelledby="member-card-title"
      aria-describedby="member-card-description"
    >
      {/* Loading State */}
      {isLoadingMember && (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      )}

      {/* Error State */}
      {memberError && !isLoadingMember && (
        <div className="flex h-64 flex-col items-center justify-center gap-4 p-6">
          <p className="text-center text-red-600 dark:text-red-400">
            {t('member_card.load_error')}
          </p>
          <Button variant="secondary" onClick={handleDialogClose}>
            {t('common.close')}
          </Button>
        </div>
      )}

      {/* Member Details */}
      {member && !isLoadingMember && (
        <form onSubmit={handleSave} className="flex flex-col">
          {/* Header */}
          <div className="border-b border-gray-200 p-6 dark:border-gray-700">
            <div className="flex items-start gap-4">
              <Avatar
                name={member.name}
                src={member.profilePictureUrl}
                size="lg"
              />
              <div className="flex-1">
                <h2
                  id="member-card-title"
                  className="text-xl font-semibold text-gray-900 dark:text-white"
                >
                  {member.name}
                </h2>
                <p
                  id="member-card-description"
                  className="mt-1 text-sm text-gray-500 dark:text-gray-400"
                >
                  {member.email}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={member.status} />
                  <RoleBadge role={member.role} />
                </div>
              </div>
              {/* Close button */}
              <button
                type="button"
                onClick={handleDialogClose}
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                aria-label={t('common.close')}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[60vh] overflow-y-auto p-6">
            {/* Profile Information */}
            <section aria-labelledby="profile-section-title">
              <h3
                id="profile-section-title"
                className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                {t('member_card.profile_section')}
              </h3>
              <dl className="space-y-3">
                <InfoRow label={t('member_card.name')} value={member.name} />
                <InfoRow label={t('member_card.email')} value={member.email} />
                {member.phoneNumber && (
                  <InfoRow
                    label={t('member_card.phone')}
                    value={member.phoneNumber}
                  />
                )}
                <InfoRow label={t('member_card.org_unit')}>
                  {member.orgUnitName ?? t('member_card.tenant_level')}
                </InfoRow>
                <InfoRow
                  label={t('member_card.joined_date')}
                  value={formatDate(member.createdAt, i18n.language)}
                />
                <InfoRow
                  label={t('member_card.last_updated')}
                  value={formatDate(member.updatedAt, i18n.language)}
                />
              </dl>
            </section>

            {/* Role Management Section */}
            {canEdit && (
              <section
                aria-labelledby="role-section-title"
                className="mt-8 border-t border-gray-200 pt-6 dark:border-gray-700"
              >
                <h3
                  id="role-section-title"
                  className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                >
                  {t('member_card.role_management_section')}
                </h3>

                <div className="space-y-4">
                  {/* Role Selection */}
                  <div>
                    <label
                      htmlFor="role-select"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t('member_card.role_label')}
                    </label>
                    <select
                      id="role-select"
                      value={selectedRole ?? ''}
                      onChange={e =>
                        setSelectedRole(e.target.value as MembershipRole)
                      }
                      disabled={isSaving || availableRoles.length === 0}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:disabled:bg-gray-800"
                    >
                      {/* Current role is always shown */}
                      <option value={member.role}>
                        {t(`membership_role.${member.role.toLowerCase()}`)}
                        {' '}
                        ({t('member_card.current_role')})
                      </option>
                      {/* Available roles for change */}
                      {availableRoles.map(role => (
                        <option key={role} value={role}>
                          {t(`membership_role.${role.toLowerCase()}`)}
                        </option>
                      ))}
                    </select>
                    {availableRoles.length === 0 && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t('member_card.no_delegatable_roles')}
                      </p>
                    )}
                  </div>

                  {/* OrgUnit Selection (only for org-scoped roles) */}
                  {requiresOrgUnit && (
                    <div>
                      <label
                        htmlFor="orgunit-select"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        {t('member_card.org_unit_label')}
                        <span className="ml-1 text-red-500">*</span>
                      </label>
                      {isLoadingOrgUnits ? (
                        <div className="mt-1 flex items-center gap-2">
                          <Spinner size="sm" />
                          <span className="text-sm text-gray-500">
                            {t('common.loading')}
                          </span>
                        </div>
                      ) : (
                        <select
                          id="orgunit-select"
                          value={selectedOrgUnitId ?? ''}
                          onChange={e =>
                            setSelectedOrgUnitId(e.target.value || null)
                          }
                          disabled={isSaving}
                          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:disabled:bg-gray-800"
                          required={requiresOrgUnit}
                        >
                          <option value="">
                            {t('member_card.select_org_unit')}
                          </option>
                          {availableOrgUnits.map(orgUnit => (
                            <option key={orgUnit.id} value={orgUnit.id}>
                              {orgUnit.name} ({t(`orgunit_type.${orgUnit.type.toLowerCase()}`)})
                            </option>
                          ))}
                        </select>
                      )}
                      {!selectedOrgUnitId && requiresOrgUnit && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          {t('member_card.org_unit_required_hint')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Reason for change (optional) */}
                  <div>
                    <label
                      htmlFor="reason-input"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t('member_card.reason_label')}
                      <span className="ml-1 text-xs text-gray-400">
                        ({t('common.optional')})
                      </span>
                    </label>
                    <textarea
                      id="reason-input"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      disabled={isSaving}
                      rows={2}
                      maxLength={500}
                      placeholder={t('member_card.reason_placeholder')}
                      className="mt-1 block w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:disabled:bg-gray-800"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Read-only Role Display (when no edit permission) */}
            {!canEdit && (
              <section
                aria-labelledby="role-readonly-section-title"
                className="mt-8 border-t border-gray-200 pt-6 dark:border-gray-700"
              >
                <h3
                  id="role-readonly-section-title"
                  className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                >
                  {t('member_card.role_section')}
                </h3>
                <dl className="space-y-3">
                  <InfoRow label={t('member_card.role_label')}>
                    <RoleBadge role={member.role} />
                  </InfoRow>
                  <InfoRow label={t('member_card.org_unit_label')}>
                    {member.orgUnitName ?? t('member_card.tenant_level')}
                  </InfoRow>
                </dl>
              </section>
            )}

            {/* Role Change History */}
            <section
              aria-labelledby="history-section-title"
              className="mt-8 border-t border-gray-200 pt-6 dark:border-gray-700"
            >
              <h3
                id="history-section-title"
                className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                {t('member_card.history_section')}
              </h3>

              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-4">
                  <Spinner size="sm" />
                </div>
              ) : changeHistory.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  {t('member_card.no_history')}
                </p>
              ) : (
                <div className="space-y-3">
                  {changeHistory.map(entry => (
                    <div
                      key={entry.id}
                      className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-700/50"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {t(`membership_role.${entry.previousRole.toLowerCase()}`)}
                        </span>
                        <svg
                          className="h-4 w-4 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                          />
                        </svg>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {t(`membership_role.${entry.newRole.toLowerCase()}`)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>
                          {t('member_card.changed_by', {
                            name: entry.changedBy.name,
                          })}
                        </span>
                        <span>
                          {formatShortDate(entry.changedAt, i18n.language)}
                        </span>
                      </div>
                      {entry.reason && (
                        <p className="mt-2 text-xs italic text-gray-600 dark:text-gray-300">
                          "{entry.reason}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-gray-200 p-4 dark:border-gray-700">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              disabled={isSaving}
            >
              {canEdit && isDirty ? t('common.cancel') : t('common.close')}
            </Button>
            {canEdit && (
              <Button
                type="submit"
                variant="primary"
                loading={isSaving}
                disabled={!isFormValid || isSaving}
              >
                {t('common.save')}
              </Button>
            )}
          </div>
        </form>
      )}
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { StatusBadge, RoleBadge, InfoRow, formatDate, formatShortDate };
export default MemberCard;
