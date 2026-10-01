'use client';

/**
 * BulkActionsToolbar — Component for bulk operations on selected members.
 *
 * This component displays a toolbar with bulk action buttons when members
 * are selected in the Member List. It handles:
 * - Display of selected count and available actions
 * - Enabling/disabling actions based on selected member statuses
 * - Progress indicator during bulk operations
 * - Detailed error report on completion
 * - Enforcement of 100 member batch limit
 *
 * **Available Bulk Actions:**
 * - Bulk Suspend: For ACTIVE members only
 * - Bulk Activate: For SUSPENDED members only
 * - Bulk Change Role: Opens role selection dialog
 * - Export Selected: Exports selected members to CSV
 *
 * **SECURITY CONSIDERATIONS:**
 * - UI permission checks are for UX only; server-side authorization is enforced
 * - All bulk operations are audit logged server-side
 * - Individual operation failures do not rollback successful ones
 *
 * @see Requirements 6.1-6.9 (Bulk Membership Operations)
 * @see Design Section 5. Bulk Operations
 */

import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@presentation/components/atoms/Button';
import { Spinner } from '@presentation/components/atoms/Spinner';
import { ConfirmDialog } from '@presentation/components/molecules/ConfirmDialog';
import type { Member } from '@core/domains/membership/entities/Member';
import type {
  BulkOperationProgress,
  BulkOperationResult,
  BulkOperationFailure,
} from '@core/domains/membership/usecases/BulkMemberOperationUseCase';
import { MembershipStatus } from '@core/domains/membership/types/MembershipStatus';
import { MembershipRole } from '@core/domains/membership/types/MembershipRole';
import { getDelegatableRolesFor } from '@core/domains/membership/services/DelegationMatrixService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of members allowed for bulk operations.
 * @see Requirements 6.8
 */
export const BULK_OPERATION_LIMIT = 100;

/**
 * Role display labels mapping.
 */
const ROLE_LABELS: Record<MembershipRole, string> = {
  [MembershipRole.PLATFORM_ADMIN]: 'Platform Admin',
  [MembershipRole.TENANT_OWNER]: 'Tenant Owner',
  [MembershipRole.ORG_ADMIN]: 'Org Admin',
  [MembershipRole.RT_ADMIN]: 'RT Admin',
  [MembershipRole.SECURITY]: 'Security',
  [MembershipRole.RESIDENT]: 'Resident',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Bulk action type.
 */
export type BulkActionType = 'suspend' | 'activate' | 'changeRole' | 'export';

/**
 * Props for BulkActionsToolbar component.
 */
export interface BulkActionsToolbarProps {
  /** Number of selected members */
  selectedCount: number;

  /** Array of selected members */
  selectedMembers: Member[];

  /** Callback to execute bulk suspend operation */
  onBulkSuspend: (
    memberIds: string[],
    reason?: string,
    onProgress?: (progress: BulkOperationProgress) => void,
  ) => Promise<BulkOperationResult>;

  /** Callback to execute bulk activate operation */
  onBulkActivate: (
    memberIds: string[],
    onProgress?: (progress: BulkOperationProgress) => void,
  ) => Promise<BulkOperationResult>;

  /** Callback to execute bulk role change operation */
  onBulkChangeRole: (
    memberIds: string[],
    newRole: MembershipRole,
    newOrgUnitId: string | null,
    reason?: string,
    onProgress?: (progress: BulkOperationProgress) => void,
  ) => Promise<BulkOperationResult>;

  /** Callback to export selected members */
  onExport: (memberIds: string[]) => Promise<void>;

  /** Callback to clear all selections */
  onClearSelection: () => void;

  /** Current user's role for delegation matrix check */
  currentUserRole?: MembershipRole;

  /** Whether bulk operations are allowed (permission check) */
  canBulkOperate?: boolean;

  /** Additional CSS classes */
  className?: string;
}

/**
 * Dialog state for confirmation and progress dialogs.
 */
interface DialogState {
  open: boolean;
  type: BulkActionType | null;
}

/**
 * Progress state during bulk operations.
 */
interface OperationState {
  isRunning: boolean;
  progress: BulkOperationProgress | null;
  result: BulkOperationResult | null;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Determine which bulk actions are available based on selected member statuses.
 *
 * Rules:
 * - Suspend: Only available when ALL selected members are ACTIVE
 * - Activate: Only available when ALL selected members are SUSPENDED
 * - Change Role: Available when ALL selected members have the same status (ACTIVE)
 * - Export: Always available
 *
 * @see Requirements 6.5 (mixed status handling)
 * @see Design Section 5.1 (getAvailableBulkActions)
 */
export function getAvailableBulkActions(members: Member[]): BulkActionType[] {
  if (members.length === 0) return [];

  const actions: BulkActionType[] = ['export']; // Always available

  const statuses = new Set(members.map(m => m.status));

  // Check if all members have the same status
  if (statuses.size === 1) {
    if (statuses.has(MembershipStatus.ACTIVE)) {
      actions.push('suspend', 'changeRole');
    }
    if (statuses.has(MembershipStatus.SUSPENDED)) {
      actions.push('activate');
    }
  }

  return actions;
}

/**
 * Get the delegatable roles based on current user's role.
 *
 * @param currentUserRole - The current user's role
 * @returns Array of roles that can be assigned
 */
function getDelegableRoles(
  currentUserRole: MembershipRole | undefined,
): MembershipRole[] {
  if (!currentUserRole) return [];
  return getDelegatableRolesFor(currentUserRole);
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Progress indicator component for bulk operations.
 */
function BulkOperationProgressIndicator({
  progress,
}: {
  progress: BulkOperationProgress;
}) {
  const { t } = useTranslation();
  const percentage =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
    <div className="space-y-3">
      {/* Progress text */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-300">
          {t('member_bulk.progress_processing', 'Processing...')}
        </span>
        <span className="font-medium text-gray-900 dark:text-white">
          {progress.completed} / {progress.total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full bg-blue-600 transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={progress.completed}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-label={t('member_bulk.progress_aria', 'Bulk operation progress')}
        />
      </div>

      {/* Status counts */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-green-600 dark:text-green-400">
          {t('member_bulk.progress_success', '{{count}} succeeded', {
            count: progress.successes.length,
          })}
        </span>
        {progress.failures.length > 0 && (
          <span className="text-red-600 dark:text-red-400">
            {t('member_bulk.progress_failed', '{{count}} failed', {
              count: progress.failures.length,
            })}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Error report component displaying failures from bulk operations.
 */
function BulkOperationErrorReport({
  result,
  selectedMembers,
  onClose,
}: {
  result: BulkOperationResult;
  selectedMembers: Member[];
  onClose: () => void;
}) {
  const { t } = useTranslation();

  // Create a map for quick member lookup
  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    selectedMembers.forEach(m => map.set(m.id, m));
    return map;
  }, [selectedMembers]);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">
              {t('member_bulk.result_summary', 'Operation Complete')}
            </h4>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t(
                'member_bulk.result_summary_detail',
                '{{success}} succeeded, {{failed}} failed out of {{total}} total',
                {
                  success: result.successCount,
                  failed: result.failureCount,
                  total: result.total,
                },
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {result.successCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                {result.successCount} ✓
              </span>
            )}
            {result.failureCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
                {result.failureCount} ✕
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Failure details */}
      {result.failures.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('member_bulk.failed_operations', 'Failed Operations')}
          </h5>
          <div className="max-h-60 overflow-y-auto rounded-lg border border-red-200 dark:border-red-800">
            <table className="min-w-full divide-y divide-red-200 dark:divide-red-800">
              <thead className="bg-red-50 dark:bg-red-900/20">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-red-700 dark:text-red-400">
                    {t('member_bulk.column_member', 'Member')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-red-700 dark:text-red-400">
                    {t('member_bulk.column_error', 'Error')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100 bg-white dark:divide-red-900/50 dark:bg-gray-900">
                {result.failures.map((failure: BulkOperationFailure) => {
                  const member = memberMap.get(failure.membershipId);
                  return (
                    <tr key={failure.membershipId}>
                      <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                        {member?.name ?? member?.email ?? failure.membershipId}
                      </td>
                      <td className="px-4 py-2 text-sm text-red-600 dark:text-red-400">
                        {failure.errorMessage}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Close button */}
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={onClose}>
          {t('common.close', 'Close')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Role selection dialog for bulk role change.
 */
function RoleSelectionDialog({
  open,
  onClose,
  onConfirm,
  availableRoles,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (role: MembershipRole) => void;
  availableRoles: MembershipRole[];
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const [selectedRole, setSelectedRole] = useState<MembershipRole | null>(null);

  const handleConfirm = useCallback(() => {
    if (selectedRole) {
      onConfirm(selectedRole);
    }
  }, [selectedRole, onConfirm]);

  // Reset selection when dialog closes
  const handleClose = useCallback(() => {
    setSelectedRole(null);
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-selection-title">
      <div className="mx-4 max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <h3
          id="role-selection-title"
          className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('member_bulk.change_role_title', 'Select New Role')}
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {t(
            'member_bulk.change_role_description',
            'Select the role to assign to all selected members.',
          )}
        </p>

        {/* Role selection */}
        <div className="mt-4 space-y-2">
          {availableRoles.map(role => (
            <label
              key={role}
              className={`flex cursor-pointer items-center rounded-lg border p-3 transition-colors ${
                selectedRole === role
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                  : 'border-gray-200 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700'
              }`}>
              <input
                type="radio"
                name="bulkRole"
                value={role}
                checked={selectedRole === role}
                onChange={() => setSelectedRole(role)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-3 text-sm font-medium text-gray-900 dark:text-white">
                {ROLE_LABELS[role]}
              </span>
            </label>
          ))}
        </div>

        {availableRoles.length === 0 && (
          <p className="mt-4 text-sm text-yellow-600 dark:text-yellow-400">
            {t(
              'member_bulk.no_delegable_roles',
              'You do not have permission to change roles.',
            )}
          </p>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={!selectedRole || isLoading}
            loading={isLoading}>
            {t('member_bulk.apply_role', 'Apply Role')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * BulkActionsToolbar — Displays bulk action buttons for selected members.
 *
 * @example
 * ```tsx
 * <BulkActionsToolbar
 *   selectedCount={selectedIds.size}
 *   selectedMembers={selectedMembers}
 *   onBulkSuspend={handleBulkSuspend}
 *   onBulkActivate={handleBulkActivate}
 *   onBulkChangeRole={handleBulkChangeRole}
 *   onExport={handleExport}
 *   onClearSelection={clearSelection}
 *   currentUserRole={userContext.role}
 *   canBulkOperate={canBulkOperate}
 * />
 * ```
 */
export function BulkActionsToolbar({
  selectedCount,
  selectedMembers,
  onBulkSuspend,
  onBulkActivate,
  onBulkChangeRole,
  onExport,
  onClearSelection,
  currentUserRole,
  canBulkOperate = true,
  className = '',
}: BulkActionsToolbarProps) {
  const { t } = useTranslation();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [dialogState, setDialogState] = useState<DialogState>({
    open: false,
    type: null,
  });

  const [operationState, setOperationState] = useState<OperationState>({
    isRunning: false,
    progress: null,
    result: null,
  });

  const [suspendReason, setSuspendReason] = useState('');
  const [showResultDialog, setShowResultDialog] = useState(false);

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  const isLimitExceeded = selectedCount > BULK_OPERATION_LIMIT;
  const availableActions = useMemo(
    () => getAvailableBulkActions(selectedMembers),
    [selectedMembers],
  );
  const delegableRoles = useMemo(
    () => getDelegableRoles(currentUserRole),
    [currentUserRole],
  );

  // Check if specific actions are available
  const canSuspend = availableActions.includes('suspend') && !isLimitExceeded;
  const canActivate = availableActions.includes('activate') && !isLimitExceeded;
  const canChangeRole =
    availableActions.includes('changeRole') &&
    !isLimitExceeded &&
    delegableRoles.length > 0;
  const canExportSelected = availableActions.includes('export');

  const memberIds = useMemo(
    () => selectedMembers.map(m => m.id),
    [selectedMembers],
  );

  // ---------------------------------------------------------------------------
  // Progress Handler
  // ---------------------------------------------------------------------------

  const handleProgress = useCallback((progress: BulkOperationProgress) => {
    setOperationState(prev => ({
      ...prev,
      progress,
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // Dialog Handlers
  // ---------------------------------------------------------------------------

  const openDialog = useCallback((type: BulkActionType) => {
    setDialogState({ open: true, type });
    if (type === 'suspend') {
      setSuspendReason('');
    }
  }, []);

  const closeDialog = useCallback(() => {
    setDialogState({ open: false, type: null });
    setSuspendReason('');
  }, []);

  const closeResultDialog = useCallback(() => {
    setShowResultDialog(false);
    setOperationState({
      isRunning: false,
      progress: null,
      result: null,
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Bulk Operation Handlers
  // ---------------------------------------------------------------------------

  const handleBulkSuspend = useCallback(async () => {
    setOperationState({
      isRunning: true,
      progress: null,
      result: null,
    });
    closeDialog();

    try {
      const result = await onBulkSuspend(
        memberIds,
        suspendReason || undefined,
        handleProgress,
      );
      setOperationState(prev => ({
        ...prev,
        isRunning: false,
        result,
      }));
      setShowResultDialog(true);
    } catch {
      setOperationState(prev => ({
        ...prev,
        isRunning: false,
      }));
    }
  }, [memberIds, suspendReason, onBulkSuspend, handleProgress, closeDialog]);

  const handleBulkActivate = useCallback(async () => {
    setOperationState({
      isRunning: true,
      progress: null,
      result: null,
    });
    closeDialog();

    try {
      const result = await onBulkActivate(memberIds, handleProgress);
      setOperationState(prev => ({
        ...prev,
        isRunning: false,
        result,
      }));
      setShowResultDialog(true);
    } catch {
      setOperationState(prev => ({
        ...prev,
        isRunning: false,
      }));
    }
  }, [memberIds, onBulkActivate, handleProgress, closeDialog]);

  const handleBulkChangeRole = useCallback(
    async (newRole: MembershipRole) => {
      setOperationState({
        isRunning: true,
        progress: null,
        result: null,
      });
      closeDialog();

      try {
        // For bulk role change, we pass null for orgUnitId
        // The backend will handle validation per member
        const result = await onBulkChangeRole(
          memberIds,
          newRole,
          null,
          undefined,
          handleProgress,
        );
        setOperationState(prev => ({
          ...prev,
          isRunning: false,
          result,
        }));
        setShowResultDialog(true);
      } catch {
        setOperationState(prev => ({
          ...prev,
          isRunning: false,
        }));
      }
    },
    [memberIds, onBulkChangeRole, handleProgress, closeDialog],
  );

  const handleExport = useCallback(async () => {
    try {
      await onExport(memberIds);
    } catch {
      // Error handling is done by the parent
    }
  }, [memberIds, onExport]);

  // ---------------------------------------------------------------------------
  // Don't render if no selection
  // ---------------------------------------------------------------------------

  if (selectedCount === 0) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Main Toolbar */}
      <div
        className={`flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3 dark:bg-blue-900/20 ${className}`}
        role="toolbar"
        aria-label={t('member_bulk.toolbar_label', 'Bulk actions toolbar')}>
        {/* Left: Selected count */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {t('member_bulk.selected_count', '{{count}} selected', {
              count: selectedCount,
            })}
          </span>

          {/* Limit exceeded warning */}
          {isLimitExceeded && (
            <span className="text-xs text-yellow-600 dark:text-yellow-400">
              {t(
                'member_bulk.limit_exceeded',
                'Max {{limit}} for bulk operations',
                { limit: BULK_OPERATION_LIMIT },
              )}
            </span>
          )}
        </div>

        {/* Right: Action buttons */}
        <div className="flex items-center gap-2">
          {/* Progress indicator when running */}
          {operationState.isRunning && operationState.progress && (
            <div className="mr-4 flex items-center gap-2">
              <Spinner size="sm" />
              <span className="text-xs text-gray-600 dark:text-gray-300">
                {operationState.progress.completed} /{' '}
                {operationState.progress.total}
              </span>
            </div>
          )}

          {/* Bulk Suspend */}
          {canSuspend && canBulkOperate && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openDialog('suspend')}
              disabled={operationState.isRunning}
              aria-label={t('member_bulk.suspend_aria', 'Suspend selected members')}>
              {t('member_bulk.suspend', 'Suspend')}
            </Button>
          )}

          {/* Bulk Activate */}
          {canActivate && canBulkOperate && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => openDialog('activate')}
              disabled={operationState.isRunning}
              aria-label={t(
                'member_bulk.activate_aria',
                'Activate selected members',
              )}>
              {t('member_bulk.activate', 'Activate')}
            </Button>
          )}

          {/* Bulk Change Role */}
          {canChangeRole && canBulkOperate && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openDialog('changeRole')}
              disabled={operationState.isRunning}
              aria-label={t(
                'member_bulk.change_role_aria',
                'Change role for selected members',
              )}>
              {t('member_bulk.change_role', 'Change Role')}
            </Button>
          )}

          {/* Export Selected */}
          {canExportSelected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              disabled={operationState.isRunning}
              aria-label={t(
                'member_bulk.export_aria',
                'Export selected members',
              )}>
              {t('member_bulk.export', 'Export')}
            </Button>
          )}

          {/* Clear Selection */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            disabled={operationState.isRunning}
            aria-label={t('member_bulk.clear_aria', 'Clear selection')}>
            {t('member_bulk.clear', 'Clear')}
          </Button>
        </div>
      </div>

      {/* Progress Overlay */}
      {operationState.isRunning && operationState.progress && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          role="dialog"
          aria-modal="true"
          aria-labelledby="progress-dialog-title">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3
              id="progress-dialog-title"
              className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              {t('member_bulk.processing_title', 'Processing Bulk Operation')}
            </h3>
            <BulkOperationProgressIndicator progress={operationState.progress} />
          </div>
        </div>
      )}

      {/* Result Dialog */}
      {showResultDialog && operationState.result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-dialog-title">
          <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3
              id="result-dialog-title"
              className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              {operationState.result.allSucceeded
                ? t('member_bulk.result_title_success', 'Operation Successful')
                : operationState.result.allFailed
                  ? t('member_bulk.result_title_failed', 'Operation Failed')
                  : t(
                      'member_bulk.result_title_partial',
                      'Operation Completed with Errors',
                    )}
            </h3>
            <BulkOperationErrorReport
              result={operationState.result}
              selectedMembers={selectedMembers}
              onClose={closeResultDialog}
            />
          </div>
        </div>
      )}

      {/* Suspend Confirmation Dialog */}
      <ConfirmDialog
        open={dialogState.open && dialogState.type === 'suspend'}
        title={t('member_bulk.suspend_confirm_title', 'Suspend Members')}
        description={t(
          'member_bulk.suspend_confirm_description',
          'Are you sure you want to suspend {{count}} members? They will lose access until reactivated.',
          { count: selectedCount },
        )}
        confirmLabel={t('member_bulk.suspend_confirm', 'Suspend All')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        loading={operationState.isRunning}
        onConfirm={handleBulkSuspend}
        onCancel={closeDialog}
      />

      {/* Activate Confirmation Dialog */}
      <ConfirmDialog
        open={dialogState.open && dialogState.type === 'activate'}
        title={t('member_bulk.activate_confirm_title', 'Activate Members')}
        description={t(
          'member_bulk.activate_confirm_description',
          'Are you sure you want to activate {{count}} members? They will regain access to the platform.',
          { count: selectedCount },
        )}
        confirmLabel={t('member_bulk.activate_confirm', 'Activate All')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="primary"
        loading={operationState.isRunning}
        onConfirm={handleBulkActivate}
        onCancel={closeDialog}
      />

      {/* Role Selection Dialog */}
      <RoleSelectionDialog
        open={dialogState.open && dialogState.type === 'changeRole'}
        onClose={closeDialog}
        onConfirm={handleBulkChangeRole}
        availableRoles={delegableRoles}
        isLoading={operationState.isRunning}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { getAvailableBulkActions as getAvailableBulkActionsForMembers };
export type { BulkOperationProgress, BulkOperationResult, BulkOperationFailure };
