'use client';

/**
 * MemberActions — Component for displaying member action buttons based on status.
 *
 * This component implements the ACTION_VISIBILITY matrix from the design:
 * - INVITED: Resend Invitation, Cancel Invitation
 * - ACTIVE: Suspend
 * - SUSPENDED: Activate, Revoke
 * - REVOKED: No actions (terminal state)
 *
 * Actions are conditionally rendered based on:
 * 1. Member's current status
 * 2. User's `membership:write` permission
 * 3. User's delegation scope (can only manage roles they can delegate)
 * 4. Self-modification prevention (cannot modify own membership)
 *
 * SECURITY CONSIDERATIONS:
 * - UI permission checks are for UX only; server-side authorization is enforced
 * - Revoke uses DestructiveConfirmationDialog requiring user to type "REVOKE"
 * - All actions audit logged server-side
 *
 * @see Requirements 4.1-4.11 (Member Status Management)
 * @see Design Section 2.4 (Member Actions Component)
 */

import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import { ConfirmDialog } from '@presentation/components/molecules/ConfirmDialog';
import { DestructiveConfirmationDialog } from '@presentation/components/molecules/DestructiveConfirmationDialog';
import { usePermissions } from '@presentation/hooks/usePermissions';
import type { Member } from '@core/domains/membership/entities/Member';
import { MembershipStatus } from '@core/domains/membership/types/MembershipStatus';
import { MembershipRole } from '@core/domains/membership/types/MembershipRole';
import { getDelegatableRolesFor } from '@core/domains/membership/services/DelegationMatrixService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for MemberActions component.
 */
export interface MemberActionsProps {
  /** The member to display actions for */
  member: Member;

  /** Callback when suspend action is confirmed */
  onSuspend: (memberId: string, reason?: string) => Promise<void>;

  /** Callback when activate action is confirmed */
  onActivate: (memberId: string) => Promise<void>;

  /** Callback when revoke action is confirmed */
  onRevoke: (memberId: string) => Promise<void>;

  /** Callback when resend invitation action is triggered */
  onResendInvitation: (memberId: string) => Promise<void>;

  /** Callback when cancel invitation action is confirmed */
  onCancelInvitation: (memberId: string) => Promise<void>;

  /** Callback when edit action is triggered (optional) */
  onEdit?: (memberId: string) => void;

  /** Whether the current user can write memberships (from permission) */
  canWrite?: boolean;

  /** Whether the current user can delegate (from permission) */
  canDelegate?: boolean;

  /** Current user's membership ID (for self-modification prevention) */
  currentUserMembershipId?: string;

  /** Current user's role (for delegation matrix check) */
  currentUserRole?: MembershipRole;

  /** Loading state for actions */
  isLoading?: boolean;

  /** Display variant - 'row' for inline buttons, 'menu' for dropdown */
  variant?: 'row' | 'menu';

  /** Additional CSS classes */
  className?: string;
}

/**
 * Action type for internal tracking.
 */
type MemberAction =
  | 'suspend'
  | 'activate'
  | 'revoke'
  | 'resendInvitation'
  | 'cancelInvitation'
  | 'edit';

/**
 * ACTION_VISIBILITY matrix — defines which actions are available per status.
 *
 * @see Design Section 2.4 (Member Actions Component)
 * @see Requirements 4.1 (status-specific action buttons)
 */
const ACTION_VISIBILITY: Record<MembershipStatus, readonly MemberAction[]> = {
  [MembershipStatus.INVITED]: ['resendInvitation', 'cancelInvitation'],
  [MembershipStatus.ACTIVE]: ['suspend'],
  [MembershipStatus.SUSPENDED]: ['activate', 'revoke'],
  [MembershipStatus.REVOKED]: [], // Terminal state — no actions
} as const;

/**
 * Dialog state for confirmation dialogs.
 */
interface DialogState {
  open: boolean;
  type: 'suspend' | 'activate' | 'revoke' | 'cancelInvitation' | null;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if the current user can manage the target member based on delegation matrix.
 *
 * A user can manage a member if:
 * 1. They have `membership:write` permission
 * 2. The target member's role is within their delegation scope
 *
 * @param currentUserRole - The current user's role
 * @param targetMemberRole - The target member's role
 * @returns true if the user can manage the target member
 */
function canManageMember(
  currentUserRole: MembershipRole | undefined,
  targetMemberRole: MembershipRole,
): boolean {
  if (!currentUserRole) return false;

  // PLATFORM_ADMIN can manage all roles (special case)
  // Note: PLATFORM_ADMIN has empty delegation set but can manage via platform operations
  if (currentUserRole === MembershipRole.PLATFORM_ADMIN) {
    return true;
  }

  // TENANT_OWNER can manage anyone except PLATFORM_ADMIN and other TENANT_OWNERs
  if (currentUserRole === MembershipRole.TENANT_OWNER) {
    return (
      targetMemberRole !== MembershipRole.PLATFORM_ADMIN &&
      targetMemberRole !== MembershipRole.TENANT_OWNER
    );
  }

  // For other roles, check if target role is in their delegation set
  // This means they can manage members with roles they can delegate
  const delegatableRoles = getDelegatableRolesFor(currentUserRole);
  return delegatableRoles.includes(targetMemberRole);
}

/**
 * Check if the member is the current user (self-modification prevention).
 *
 * @see Requirements 4.10 (self-suspension/revocation prevention)
 */
function isSelf(member: Member, currentUserMembershipId?: string): boolean {
  if (!currentUserMembershipId) return false;
  return member.id === currentUserMembershipId;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * MemberActions — Displays action buttons for a member based on their status.
 *
 * @example
 * ```tsx
 * <MemberActions
 *   member={member}
 *   onSuspend={handleSuspend}
 *   onActivate={handleActivate}
 *   onRevoke={handleRevoke}
 *   onResendInvitation={handleResendInvitation}
 *   onCancelInvitation={handleCancelInvitation}
 *   currentUserMembershipId={currentUser.membershipId}
 *   currentUserRole={currentUser.role}
 * />
 * ```
 */
export function MemberActions({
  member,
  onSuspend,
  onActivate,
  onRevoke,
  onResendInvitation,
  onCancelInvitation,
  onEdit,
  canWrite: canWriteProp,
  canDelegate: canDelegateProp,
  currentUserMembershipId,
  currentUserRole,
  isLoading = false,
  variant = 'row',
  className = '',
}: MemberActionsProps) {
  const { t } = useTranslation();
  const { hasPermission, userContext, isLoading: permissionsLoading } = usePermissions();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [dialogState, setDialogState] = useState<DialogState>({
    open: false,
    type: null,
    loading: false,
  });

  const [suspendReason, setSuspendReason] = useState('');

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  // Determine effective permission state
  const effectiveCanWrite = canWriteProp ?? hasPermission('membership:write');
  const effectiveCanDelegate = canDelegateProp ?? hasPermission('membership:delegate');
  const effectiveCurrentUserRole =
    currentUserRole ?? (userContext?.role as MembershipRole | undefined);
  const effectiveCurrentUserMembershipId =
    currentUserMembershipId ?? userContext?.membershipId;

  // Check if this is the current user's own membership
  const isSelfMember = isSelf(member, effectiveCurrentUserMembershipId);

  // Check if user can manage this member (delegation matrix check)
  const canManageThisMember = useMemo(() => {
    // Cannot manage self
    if (isSelfMember) return false;

    // Must have write permission
    if (!effectiveCanWrite) return false;

    // Check delegation matrix
    return canManageMember(effectiveCurrentUserRole, member.role);
  }, [isSelfMember, effectiveCanWrite, effectiveCurrentUserRole, member.role]);

  // Get available actions for this member's status
  const availableActions = useMemo(() => {
    if (!canManageThisMember) return [];
    return ACTION_VISIBILITY[member.status] ?? [];
  }, [canManageThisMember, member.status]);

  // Check if specific actions should be shown
  const showSuspend = availableActions.includes('suspend');
  const showActivate = availableActions.includes('activate');
  const showRevoke = availableActions.includes('revoke');
  const showResendInvitation = availableActions.includes('resendInvitation');
  const showCancelInvitation = availableActions.includes('cancelInvitation');

  // No actions available
  const noActionsAvailable = availableActions.length === 0;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const openDialog = useCallback(
    (type: DialogState['type']) => {
      setDialogState({ open: true, type, loading: false });
      if (type === 'suspend') {
        setSuspendReason('');
      }
    },
    [],
  );

  const closeDialog = useCallback(() => {
    setDialogState({ open: false, type: null, loading: false });
    setSuspendReason('');
  }, []);

  const handleSuspendConfirm = useCallback(async () => {
    setDialogState(prev => ({ ...prev, loading: true }));
    try {
      await onSuspend(member.id, suspendReason || undefined);
      closeDialog();
    } catch {
      // Error handling is done by the parent component
      setDialogState(prev => ({ ...prev, loading: false }));
    }
  }, [member.id, suspendReason, onSuspend, closeDialog]);

  const handleActivateConfirm = useCallback(async () => {
    setDialogState(prev => ({ ...prev, loading: true }));
    try {
      await onActivate(member.id);
      closeDialog();
    } catch {
      setDialogState(prev => ({ ...prev, loading: false }));
    }
  }, [member.id, onActivate, closeDialog]);

  const handleRevokeConfirm = useCallback(async () => {
    setDialogState(prev => ({ ...prev, loading: true }));
    try {
      await onRevoke(member.id);
      closeDialog();
    } catch {
      setDialogState(prev => ({ ...prev, loading: false }));
    }
  }, [member.id, onRevoke, closeDialog]);

  const handleCancelInvitationConfirm = useCallback(async () => {
    setDialogState(prev => ({ ...prev, loading: true }));
    try {
      await onCancelInvitation(member.id);
      closeDialog();
    } catch {
      setDialogState(prev => ({ ...prev, loading: false }));
    }
  }, [member.id, onCancelInvitation, closeDialog]);

  const handleResendInvitation = useCallback(async () => {
    try {
      await onResendInvitation(member.id);
    } catch {
      // Error handling is done by the parent component
    }
  }, [member.id, onResendInvitation]);

  const handleEdit = useCallback(() => {
    onEdit?.(member.id);
  }, [member.id, onEdit]);

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (permissionsLoading) {
    return (
      <div
        className={`flex items-center gap-2 ${className}`}
        aria-busy="true"
        aria-label={t('common.loading')}>
        <span className="h-8 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // No Actions State
  // ---------------------------------------------------------------------------

  // If no actions available (revoked status, no permissions, or self)
  if (noActionsAvailable) {
    // Show disabled state message if it's self-modification attempt
    if (isSelfMember && member.status !== MembershipStatus.REVOKED) {
      return (
        <div className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>
          <span aria-label={t('member_actions.self_modification_disabled')}>
            {t('member_actions.cannot_modify_self')}
          </span>
        </div>
      );
    }

    // For revoked members or insufficient permissions, show nothing or a dash
    return (
      <div className={`text-sm text-gray-400 dark:text-gray-500 ${className}`}>
        <span aria-label={t('member_actions.no_actions_available')}>—</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const baseButtonClass = variant === 'row' ? '' : 'w-full justify-start';

  return (
    <>
      <div
        className={`flex ${variant === 'row' ? 'flex-row items-center gap-2' : 'flex-col gap-1'} ${className}`}
        role="group"
        aria-label={t('member_actions.actions_group_label', { memberName: member.name })}>
        {/* Resend Invitation (INVITED status only) */}
        {showResendInvitation && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResendInvitation}
            disabled={isLoading}
            className={baseButtonClass}
            aria-label={t('member_actions.resend_invitation_aria', { memberName: member.name })}>
            {t('member_actions.resend_invitation')}
          </Button>
        )}

        {/* Cancel Invitation (INVITED status only) */}
        {showCancelInvitation && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openDialog('cancelInvitation')}
            disabled={isLoading}
            className={baseButtonClass}
            aria-label={t('member_actions.cancel_invitation_aria', { memberName: member.name })}>
            {t('member_actions.cancel_invitation')}
          </Button>
        )}

        {/* Suspend (ACTIVE status only) */}
        {showSuspend && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openDialog('suspend')}
            disabled={isLoading}
            className={baseButtonClass}
            aria-label={t('member_actions.suspend_aria', { memberName: member.name })}>
            {t('member_actions.suspend')}
          </Button>
        )}

        {/* Activate (SUSPENDED status only) */}
        {showActivate && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => openDialog('activate')}
            disabled={isLoading}
            className={baseButtonClass}
            aria-label={t('member_actions.activate_aria', { memberName: member.name })}>
            {t('member_actions.activate')}
          </Button>
        )}

        {/* Revoke (SUSPENDED status only) - destructive action */}
        {showRevoke && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => openDialog('revoke')}
            disabled={isLoading}
            className={baseButtonClass}
            aria-label={t('member_actions.revoke_aria', { memberName: member.name })}>
            {t('member_actions.revoke')}
          </Button>
        )}

        {/* Edit (optional, if onEdit prop provided) */}
        {onEdit && canManageThisMember && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEdit}
            disabled={isLoading}
            className={baseButtonClass}
            aria-label={t('member_actions.edit_aria', { memberName: member.name })}>
            {t('common.edit')}
          </Button>
        )}
      </div>

      {/* Suspend Confirmation Dialog */}
      <ConfirmDialog
        open={dialogState.open && dialogState.type === 'suspend'}
        title={t('member_actions.suspend_confirm_title')}
        description={t('member_actions.suspend_confirm_description', {
          memberName: member.name,
        })}
        confirmLabel={t('member_actions.suspend')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={dialogState.loading}
        onConfirm={handleSuspendConfirm}
        onCancel={closeDialog}
      />

      {/* Activate Confirmation Dialog */}
      <ConfirmDialog
        open={dialogState.open && dialogState.type === 'activate'}
        title={t('member_actions.activate_confirm_title')}
        description={t('member_actions.activate_confirm_description', {
          memberName: member.name,
        })}
        confirmLabel={t('member_actions.activate')}
        cancelLabel={t('common.cancel')}
        variant="primary"
        loading={dialogState.loading}
        onConfirm={handleActivateConfirm}
        onCancel={closeDialog}
      />

      {/* Cancel Invitation Confirmation Dialog */}
      <ConfirmDialog
        open={dialogState.open && dialogState.type === 'cancelInvitation'}
        title={t('member_actions.cancel_invitation_confirm_title')}
        description={t('member_actions.cancel_invitation_confirm_description', {
          memberEmail: member.email,
        })}
        confirmLabel={t('member_actions.cancel_invitation')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={dialogState.loading}
        onConfirm={handleCancelInvitationConfirm}
        onCancel={closeDialog}
      />

      {/* Revoke Confirmation Dialog (Destructive - requires typing "REVOKE") */}
      <DestructiveConfirmationDialog
        open={dialogState.open && dialogState.type === 'revoke'}
        title={t('member_actions.revoke_confirm_title')}
        description={t('member_actions.revoke_confirm_description', {
          memberName: member.name,
        })}
        confirmationText="REVOKE"
        confirmLabel={t('member_actions.revoke')}
        cancelLabel={t('common.cancel')}
        loading={dialogState.loading}
        onConfirm={handleRevokeConfirm}
        onCancel={closeDialog}
        inputLabel={t('member_actions.revoke_input_label')}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { ACTION_VISIBILITY, canManageMember, isSelf };
export type { MemberAction };
