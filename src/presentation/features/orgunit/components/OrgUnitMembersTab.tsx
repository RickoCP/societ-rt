'use client';

/**
 * OrgUnitMembersTab — Component displaying members assigned to an OrgUnit.
 *
 * This component is used within the OrgUnitDetailsPanel Members tab to display
 * a simplified list of members directly assigned to the selected OrgUnit.
 * It supports:
 * - Simplified member list display (name, email, role, remove action)
 * - "Assign Members" button (permission-gated with `membership:write`)
 * - "Remove from OrgUnit" action per member (disabled at root level)
 *
 * SECURITY CONSIDERATIONS:
 * - UI permission checks are for UX only; server-side authorization is enforced
 * - Remove action is permission-gated via PermissionGuard
 * - Remove action is disabled at root OrgUnit level (cannot orphan members)
 *
 * @see Requirements 9.1-9.3, 9.8, 9.9 (OrgUnit Member Assignment)
 * @see Design Section 7 (OrgUnit Member Assignment)
 */

import { useMemo, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import { PermissionGuard } from '@presentation/components/atoms/PermissionGuard';
import { Spinner } from '@presentation/components/atoms/Spinner';
import { EmptyState } from '@presentation/components/molecules/EmptyState';
import type { MemberSummary } from '@core/domains/membership/entities/Member';
import type { MembershipRole } from '@core/domains/membership/types/MembershipRole';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for OrgUnitMembersTab component.
 *
 * @see Requirements 9.1-9.3, 9.8, 9.9
 */
export interface OrgUnitMembersTabProps {
  /**
   * The OrgUnit ID for which to display members.
   */
  orgUnitId: string;

  /**
   * Array of members directly assigned to this OrgUnit.
   */
  members: MemberSummary[];

  /**
   * Callback when "Assign Members" button is clicked.
   * Opens the MemberSearchDialog for multi-select assignment.
   */
  onAssignMembers: (memberIds: string[]) => Promise<void>;

  /**
   * Callback when "Remove from OrgUnit" action is clicked for a member.
   * Reassigns the member to the parent OrgUnit (not revoke membership).
   *
   * @param memberId - The ID of the member to remove from this OrgUnit
   */
  onRemoveMember: (memberId: string) => Promise<void>;

  /**
   * Whether the user has write permission for memberships.
   * Controls visibility of action buttons.
   * Note: Server-side authorization is always enforced.
   */
  canWrite?: boolean;

  /**
   * Whether this is a root OrgUnit (parentId === null).
   * When true, "Remove from OrgUnit" action is disabled because
   * members cannot be orphaned from the hierarchy.
   *
   * @see Requirement 9.9
   */
  isRootOrgUnit?: boolean;

  /**
   * Whether members are currently being loaded.
   */
  isLoading?: boolean;

  /**
   * Whether the Assign Members operation is in progress.
   */
  isAssigning?: boolean;

  /**
   * Set of member IDs currently being removed (for loading state).
   */
  removingMemberIds?: Set<string>;

  /**
   * Additional CSS classes to apply to the container.
   */
  className?: string;
}

/**
 * Props for individual member row.
 */
interface MemberRowProps {
  member: MemberSummary;
  canWrite: boolean;
  isRootOrgUnit: boolean;
  isRemoving: boolean;
  onRemove: () => void;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get the i18n key for a membership role.
 *
 * @param role - The membership role
 * @returns Translation key for the role label
 */
function getRoleTranslationKey(role: MembershipRole): string {
  const roleKeys: Record<string, string> = {
    PLATFORM_ADMIN: 'roles.platform_admin',
    TENANT_OWNER: 'roles.tenant_owner',
    ORG_ADMIN: 'roles.org_admin',
    RT_ADMIN: 'roles.rt_admin',
    SECURITY: 'roles.security',
    RESIDENT: 'roles.resident',
  };
  return roleKeys[role] ?? 'roles.unknown';
}

/**
 * Generate initials from a name for avatar fallback.
 *
 * @param name - Full name
 * @returns Initials (up to 2 characters)
 */
function getInitials(name: string): string {
  if (!name) return '?';
  
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Loading skeleton for the members tab.
 */
function MembersTabSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse space-y-3 ${className}`}
      role="status"
      aria-label="Loading members">
      {/* Header skeleton */}
      <div className="flex justify-between items-center mb-4">
        <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-9 w-36 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>

      {/* Member rows skeleton */}
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="space-y-2">
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          </div>
          <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state when no members are assigned.
 */
function MembersEmptyState({
  canAssign,
  onAssign,
  className = '',
}: {
  canAssign: boolean;
  onAssign: () => void;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <EmptyState
      className={className}
      title={t('orgunit.members.empty_title')}
      description={t('orgunit.members.empty_description')}
      icon={
        <svg
          className="w-12 h-12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75"
          />
        </svg>
      }
      action={
        canAssign ? (
          <Button
            variant="primary"
            size="sm"
            onClick={onAssign}
            aria-label={t('orgunit.members.assign_members')}>
            <svg
              className="w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
            {t('orgunit.members.assign_members')}
          </Button>
        ) : undefined
      }
    />
  );
}

/**
 * Avatar component for member display.
 */
function MemberAvatar({
  name,
  profilePictureUrl,
  className = '',
}: {
  name: string;
  profilePictureUrl?: string;
  className?: string;
}) {
  const initials = getInitials(name);

  if (profilePictureUrl) {
    return (
      <img
        src={profilePictureUrl}
        alt={name}
        className={`w-10 h-10 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-medium text-sm ${className}`}
      aria-hidden="true">
      {initials}
    </div>
  );
}

/**
 * Individual member row component.
 */
function MemberRow({
  member,
  canWrite,
  isRootOrgUnit,
  isRemoving,
  onRemove,
}: MemberRowProps) {
  const { t } = useTranslation();
  const roleLabel = t(getRoleTranslationKey(member.role));

  // Disable remove at root level per Requirement 9.9
  const canRemove = canWrite && !isRootOrgUnit;
  const removeDisabledReason = isRootOrgUnit
    ? t('orgunit.members.remove_disabled_root')
    : undefined;

  return (
    <div
      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
      role="row"
      aria-label={t('orgunit.members.member_row_aria', { name: member.name })}>
      {/* Member Info */}
      <div className="flex items-center gap-3 min-w-0">
        <MemberAvatar
          name={member.name}
          profilePictureUrl={member.profilePictureUrl}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {member.name}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {member.email}
          </p>
        </div>
      </div>

      {/* Role Badge and Actions */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Role Badge */}
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
          {roleLabel}
        </span>

        {/* Remove Action (permission-gated) */}
        <PermissionGuard permissions={['membership:write']} showLoading={false}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={!canRemove || isRemoving}
            loading={isRemoving}
            title={removeDisabledReason}
            aria-label={t('orgunit.members.remove_member_aria', {
              name: member.name,
            })}
            className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400">
            {!isRemoving && (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
          </Button>
        </PermissionGuard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * OrgUnitMembersTab — Displays members assigned to an OrgUnit with assignment
 * and removal actions.
 *
 * @example
 * ```tsx
 * <OrgUnitMembersTab
 *   orgUnitId="ou-123"
 *   members={members}
 *   onAssignMembers={handleAssign}
 *   onRemoveMember={handleRemove}
 *   canWrite={hasWritePermission}
 *   isRootOrgUnit={false}
 * />
 * ```
 *
 * @see Requirements 9.1-9.3, 9.8, 9.9
 */
export function OrgUnitMembersTab({
  orgUnitId,
  members,
  onAssignMembers,
  onRemoveMember,
  canWrite = false,
  isRootOrgUnit = false,
  isLoading = false,
  isAssigning = false,
  removingMemberIds = new Set(),
  className = '',
}: OrgUnitMembersTabProps): ReactNode {
  const { t } = useTranslation();

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  const memberCount = useMemo(() => members.length, [members]);

  const hasMemberWritePermission = useMemo(() => {
    // This is for UI purposes only; server-side authorization is enforced
    return canWrite;
  }, [canWrite]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleAssignMembers = useCallback(async () => {
    // The actual member selection is handled by the parent via a dialog
    // This callback triggers opening the MemberSearchDialog
    // The parent will call onAssignMembers with the selected member IDs
    await onAssignMembers([]);
  }, [onAssignMembers]);

  const handleRemoveMember = useCallback(
    async (memberId: string) => {
      await onRemoveMember(memberId);
    },
    [onRemoveMember],
  );

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return <MembersTabSkeleton className={className} />;
  }

  // ---------------------------------------------------------------------------
  // Empty State
  // ---------------------------------------------------------------------------

  if (memberCount === 0) {
    return (
      <MembersEmptyState
        canAssign={hasMemberWritePermission}
        onAssign={handleAssignMembers}
        className={className}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={`space-y-4 ${className}`}
      role="region"
      aria-label={t('orgunit.members.tab_label')}>
      {/* Header with Assign Members button */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {t('orgunit.members.count', { count: memberCount })}
        </div>

        {/* Assign Members Button (permission-gated) */}
        <PermissionGuard permissions={['membership:write']} showLoading={false}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleAssignMembers}
            loading={isAssigning}
            aria-label={t('orgunit.members.assign_members_aria', {
              orgUnitId,
            })}>
            {!isAssigning && (
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
            )}
            {t('orgunit.members.assign_members')}
          </Button>
        </PermissionGuard>
      </div>

      {/* Root OrgUnit Warning */}
      {isRootOrgUnit && hasMemberWritePermission && (
        <div
          className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-800 dark:text-yellow-200"
          role="alert">
          <svg
            className="w-5 h-5 flex-shrink-0 mt-0.5"
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
          <span>{t('orgunit.members.root_warning')}</span>
        </div>
      )}

      {/* Members List */}
      <div className="space-y-2" role="list" aria-label={t('orgunit.members.list_label')}>
        {members.map(member => (
          <MemberRow
            key={member.id}
            member={member}
            canWrite={hasMemberWritePermission}
            isRootOrgUnit={isRootOrgUnit}
            isRemoving={removingMemberIds.has(member.id)}
            onRemove={() => handleRemoveMember(member.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Named Export
// ---------------------------------------------------------------------------

export default OrgUnitMembersTab;
