'use client';

/**
 * TenantOperations — Component for Platform Admin tenant administrative operations.
 *
 * Features:
 * - "Impersonate Tenant" button with confirmation and banner indication
 * - "Force Suspend" button with reason input
 * - "Force Close" button with destructive confirmation (requires typing "CLOSE {tenant-name}")
 * - "Reset Token Version" button with confirmation (force-logout all tenant users)
 * - "View Audit Trail" navigation button
 *
 * All operations:
 * - Require PLATFORM_ADMIN role
 * - Show confirmation dialogs before executing
 * - Display success/error toasts
 * - Log all actions to audit trail
 *
 * @see Requirements 20.2, 20.6-20.8 (Platform Admin Tenant Operations)
 * @see Design Components > 11. Platform Admin Dashboard > 11.2 Tenant Operations
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@presentation/components/atoms/Button';
import { ConfirmDialog } from '@presentation/components/molecules/ConfirmDialog';
import { DestructiveConfirmationDialog } from '@presentation/components/molecules/DestructiveConfirmationDialog';
import {
  showSuccessToast,
  showErrorToast,
} from '@infrastructure/stateManagement/toastStore';
import type { AppError } from '@core/utils';
import type { TenantDetail } from '@core/domains/platform/entities/TenantOverview';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Query key for platform dashboard.
 */
const PLATFORM_DASHBOARD_QUERY_KEY = 'platform-dashboard';

/**
 * Query key for tenant detail.
 */
const TENANT_DETAIL_QUERY_KEY = 'tenant-detail';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the TenantOperations component.
 */
export interface TenantOperationsProps {
  /**
   * Tenant detail object containing tenant information.
   */
  tenant: TenantDetail;

  /**
   * Callback when impersonation starts.
   * Called after successful impersonation API call.
   */
  onImpersonate?: (tenantId: string) => void;

  /**
   * Callback to navigate to audit trail.
   * Called when "View Audit Trail" is clicked.
   */
  onViewAuditTrail?: (tenantId: string) => void;

  /**
   * Whether the component is in a loading state.
   */
  isLoading?: boolean;

  /**
   * Whether the user has impersonation permission.
   * Default: true (PLATFORM_ADMIN role assumed).
   */
  canImpersonate?: boolean;

  /**
   * Whether the user can force suspend tenants.
   * Default: true (PLATFORM_ADMIN role assumed).
   */
  canForceSuspend?: boolean;

  /**
   * Whether the user can force close tenants.
   * Default: true (PLATFORM_ADMIN role assumed).
   */
  canForceClose?: boolean;

  /**
   * Whether the user can reset token versions.
   * Default: true (PLATFORM_ADMIN role assumed).
   */
  canResetTokenVersion?: boolean;

  /**
   * Additional CSS classes.
   */
  className?: string;
}

/**
 * Dialog type currently open.
 */
type ActiveDialogType =
  | 'impersonate'
  | 'forceSuspend'
  | 'forceClose'
  | 'resetTokenVersion'
  | null;

/**
 * Input for force suspend action.
 */
interface ForceSuspendInput {
  tenantId: string;
  reason: string;
}

/**
 * Input for force close action.
 */
interface ForceCloseInput {
  tenantId: string;
}

/**
 * Input for reset token version action.
 */
interface ResetTokenVersionInput {
  tenantId: string;
  reason?: string;
}

/**
 * Input for impersonate action.
 */
interface ImpersonateInput {
  tenantId: string;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Start tenant impersonation.
 *
 * @see Requirements 20.3-20.5
 */
async function startImpersonation(input: ImpersonateInput): Promise<void> {
  const response = await fetch('/api/platform/tenant/impersonate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: input.tenantId }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type: response.status === 403 ? 'authorization' : 'technical',
      code: errorData.code ?? 'IMPERSONATE_ERROR',
      message:
        errorData.message ?? `Failed to impersonate tenant: ${response.status}`,
    };
    throw error;
  }
}

/**
 * Force suspend a tenant.
 *
 * @see Requirements 20.6
 */
async function forceSuspendTenant(input: ForceSuspendInput): Promise<void> {
  const response = await fetch('/api/platform/tenant/force-suspend', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: input.tenantId,
      reason: input.reason,
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type: response.status === 403 ? 'authorization' : 'technical',
      code: errorData.code ?? 'FORCE_SUSPEND_ERROR',
      message: errorData.message ?? `Failed to suspend tenant: ${response.status}`,
    };
    throw error;
  }
}

/**
 * Force close a tenant.
 *
 * @see Requirements 20.7
 */
async function forceCloseTenant(input: ForceCloseInput): Promise<void> {
  const response = await fetch('/api/platform/tenant/force-close', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: input.tenantId }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type: response.status === 403 ? 'authorization' : 'technical',
      code: errorData.code ?? 'FORCE_CLOSE_ERROR',
      message: errorData.message ?? `Failed to close tenant: ${response.status}`,
    };
    throw error;
  }
}

/**
 * Reset token version for all tenant users.
 *
 * @see Requirements 20.8
 */
async function resetTokenVersion(input: ResetTokenVersionInput): Promise<void> {
  const response = await fetch('/api/platform/tenant/reset-token-version', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: input.tenantId,
      reason: input.reason,
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type: response.status === 403 ? 'authorization' : 'technical',
      code: errorData.code ?? 'RESET_TOKEN_VERSION_ERROR',
      message:
        errorData.message ?? `Failed to reset token version: ${response.status}`,
    };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

/**
 * Force Suspend Dialog with reason input.
 */
function ForceSuspendDialog({
  open,
  tenantName,
  loading,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  tenantName: string;
  loading: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  const canConfirm = reason.trim().length > 0;

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      className="fixed inset-0 z-50 m-auto max-w-md rounded-lg border-0 bg-white p-0 shadow-xl backdrop:bg-black/50 dark:bg-gray-800"
      aria-labelledby="force-suspend-dialog-title"
      aria-describedby="force-suspend-dialog-desc">
      <div className="p-6">
        {/* Warning indicator */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <svg
              className="h-5 w-5 text-amber-600 dark:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <h2
            id="force-suspend-dialog-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('platform.tenant_operations.force_suspend_title', 'Force Suspend Tenant')}
          </h2>
        </div>

        <p
          id="force-suspend-dialog-desc"
          className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {t(
            'platform.tenant_operations.force_suspend_description',
            'You are about to force suspend "{{tenantName}}". All non-emergency operations will be blocked immediately. This action will be logged to the audit trail.',
            { tenantName }
          )}
        </p>

        {/* Suspension reason input */}
        <div className="mb-6">
          <label
            htmlFor="force-suspend-reason"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('platform.tenant_operations.force_suspend_reason_label', 'Reason for Suspension (required)')}
          </label>
          <textarea
            id="force-suspend-reason"
            rows={3}
            value={reason}
            onChange={e => onReasonChange(e.target.value)}
            placeholder={t(
              'platform.tenant_operations.force_suspend_reason_placeholder',
              'Enter the reason for force suspending this tenant...'
            )}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm
              placeholder:text-gray-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500
              dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            required
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={loading}
            disabled={!canConfirm}
            onClick={onConfirm}>
            {t('platform.tenant_operations.force_suspend_confirm', 'Force Suspend')}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * Reset Token Version Dialog with reason input.
 */
function ResetTokenVersionDialog({
  open,
  tenantName,
  memberCount,
  loading,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  tenantName: string;
  memberCount: number;
  loading: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      className="fixed inset-0 z-50 m-auto max-w-md rounded-lg border-0 bg-white p-0 shadow-xl backdrop:bg-black/50 dark:bg-gray-800"
      aria-labelledby="reset-token-dialog-title"
      aria-describedby="reset-token-dialog-desc">
      <div className="p-6">
        {/* Warning indicator */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <svg
              className="h-5 w-5 text-orange-600 dark:text-orange-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
              />
            </svg>
          </div>
          <h2
            id="reset-token-dialog-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('platform.tenant_operations.reset_token_title', 'Reset Token Version')}
          </h2>
        </div>

        <p
          id="reset-token-dialog-desc"
          className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {t(
            'platform.tenant_operations.reset_token_description',
            'This will immediately invalidate all active sessions for "{{tenantName}}". All {{memberCount}} user(s) will be forced to log in again. Use this for security incidents or compromised tokens.',
            { tenantName, memberCount }
          )}
        </p>

        {/* Warning banner */}
        <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-900/20">
          <div className="flex gap-2">
            <span className="text-orange-600 dark:text-orange-400" aria-hidden="true">
              ⚠️
            </span>
            <p className="text-sm text-orange-700 dark:text-orange-300">
              {t(
                'platform.tenant_operations.reset_token_warning',
                'This action will disrupt all active user sessions. Ensure this is necessary before proceeding.'
              )}
            </p>
          </div>
        </div>

        {/* Reason input (optional) */}
        <div className="mb-6">
          <label
            htmlFor="reset-token-reason"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('platform.tenant_operations.reset_token_reason_label', 'Reason (optional)')}
          </label>
          <textarea
            id="reset-token-reason"
            rows={2}
            value={reason}
            onChange={e => onReasonChange(e.target.value)}
            placeholder={t(
              'platform.tenant_operations.reset_token_reason_placeholder',
              'Enter the reason for resetting tokens...'
            )}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm
              placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500
              dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="danger" size="sm" loading={loading} onClick={onConfirm}>
            {t('platform.tenant_operations.reset_token_confirm', 'Reset All Tokens')}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * TenantOperations — Platform Admin operations panel for a specific tenant.
 *
 * Provides buttons for:
 * - Impersonate Tenant
 * - Force Suspend
 * - Force Close
 * - Reset Token Version
 * - View Audit Trail
 *
 * @see Requirements 20.2, 20.6-20.8
 */
export function TenantOperations({
  tenant,
  onImpersonate,
  onViewAuditTrail,
  isLoading = false,
  canImpersonate = true,
  canForceSuspend = true,
  canForceClose = true,
  canResetTokenVersion = true,
  className = '',
}: TenantOperationsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Local State
  // ---------------------------------------------------------------------------

  const [activeDialog, setActiveDialog] = useState<ActiveDialogType>(null);
  const [forceSuspendReason, setForceSuspendReason] = useState('');
  const [resetTokenReason, setResetTokenReason] = useState('');

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  const tenantName = tenant.name;
  const tenantId = tenant.id;
  const tenantStatus = tenant.status;
  const memberCount = tenant.memberCount;

  // Force close confirmation text: "CLOSE {tenant-name}"
  const forceCloseConfirmationText = `CLOSE ${tenantName}`;

  // Determine which operations are available based on tenant status
  const canPerformSuspend = canForceSuspend && tenantStatus === 'ACTIVE';
  const canPerformClose = canForceClose && tenantStatus === 'SUSPENDED';
  const canPerformImpersonate = canImpersonate && tenantStatus !== 'CLOSED' && tenantStatus !== 'PURGED';
  const canPerformResetToken = canResetTokenVersion && tenantStatus !== 'CLOSED' && tenantStatus !== 'PURGED';

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const impersonateMutation = useMutation({
    mutationFn: startImpersonation,
    onSuccess: () => {
      showSuccessToast(
        t('platform.tenant_operations.impersonate_success', 'Impersonation started. You are now viewing as {{tenantName}}.', {
          tenantName,
        })
      );
      setActiveDialog(null);
      onImpersonate?.(tenantId);
    },
    onError: (error: AppError) => {
      // Use user-safe message only, do not expose technical details
      showErrorToast(
        error.userMessage ?? t('platform.tenant_operations.impersonate_error', 'Failed to start impersonation')
      );
    },
  });

  const forceSuspendMutation = useMutation({
    mutationFn: forceSuspendTenant,
    onSuccess: () => {
      showSuccessToast(
        t('platform.tenant_operations.force_suspend_success', 'Tenant "{{tenantName}}" has been suspended.', {
          tenantName,
        })
      );
      queryClient.invalidateQueries({ queryKey: [PLATFORM_DASHBOARD_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [TENANT_DETAIL_QUERY_KEY, tenantId] });
      setActiveDialog(null);
      setForceSuspendReason('');
    },
    onError: (error: AppError) => {
      // Use user-safe message only, do not expose technical details
      showErrorToast(
        error.userMessage ?? t('platform.tenant_operations.force_suspend_error', 'Failed to suspend tenant')
      );
    },
  });

  const forceCloseMutation = useMutation({
    mutationFn: forceCloseTenant,
    onSuccess: () => {
      showSuccessToast(
        t('platform.tenant_operations.force_close_success', 'Tenant "{{tenantName}}" has been closed.', {
          tenantName,
        })
      );
      queryClient.invalidateQueries({ queryKey: [PLATFORM_DASHBOARD_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [TENANT_DETAIL_QUERY_KEY, tenantId] });
      setActiveDialog(null);
    },
    onError: (error: AppError) => {
      // Use user-safe message only, do not expose technical details
      showErrorToast(
        error.userMessage ?? t('platform.tenant_operations.force_close_error', 'Failed to close tenant')
      );
    },
  });

  const resetTokenMutation = useMutation({
    mutationFn: resetTokenVersion,
    onSuccess: () => {
      showSuccessToast(
        t('platform.tenant_operations.reset_token_success', 'Token version reset. All {{memberCount}} user(s) must re-login.', {
          memberCount,
        })
      );
      queryClient.invalidateQueries({ queryKey: [TENANT_DETAIL_QUERY_KEY, tenantId] });
      setActiveDialog(null);
      setResetTokenReason('');
    },
    onError: (error: AppError) => {
      // Use user-safe message only, do not expose technical details
      showErrorToast(
        error.userMessage ?? t('platform.tenant_operations.reset_token_error', 'Failed to reset token version')
      );
    },
  });

  const isAnyMutationPending =
    impersonateMutation.isPending ||
    forceSuspendMutation.isPending ||
    forceCloseMutation.isPending ||
    resetTokenMutation.isPending;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleOpenImpersonateDialog = useCallback(() => {
    setActiveDialog('impersonate');
  }, []);

  const handleOpenForceSuspendDialog = useCallback(() => {
    setForceSuspendReason('');
    setActiveDialog('forceSuspend');
  }, []);

  const handleOpenForceCloseDialog = useCallback(() => {
    setActiveDialog('forceClose');
  }, []);

  const handleOpenResetTokenDialog = useCallback(() => {
    setResetTokenReason('');
    setActiveDialog('resetTokenVersion');
  }, []);

  const handleCloseDialog = useCallback(() => {
    setActiveDialog(null);
    setForceSuspendReason('');
    setResetTokenReason('');
  }, []);

  const handleConfirmImpersonate = useCallback(() => {
    impersonateMutation.mutate({ tenantId });
  }, [impersonateMutation, tenantId]);

  const handleConfirmForceSuspend = useCallback(() => {
    forceSuspendMutation.mutate({ tenantId, reason: forceSuspendReason });
  }, [forceSuspendMutation, tenantId, forceSuspendReason]);

  const handleConfirmForceClose = useCallback(() => {
    forceCloseMutation.mutate({ tenantId });
  }, [forceCloseMutation, tenantId]);

  const handleConfirmResetToken = useCallback(() => {
    resetTokenMutation.mutate({ tenantId, reason: resetTokenReason });
  }, [resetTokenMutation, tenantId, resetTokenReason]);

  const handleViewAuditTrail = useCallback(() => {
    onViewAuditTrail?.(tenantId);
  }, [onViewAuditTrail, tenantId]);

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-10 w-40 rounded-md bg-gray-200 dark:bg-gray-700" />
          <div className="flex flex-wrap gap-2">
            <div className="h-9 w-36 rounded-md bg-gray-200 dark:bg-gray-700" />
            <div className="h-9 w-32 rounded-md bg-gray-200 dark:bg-gray-700" />
            <div className="h-9 w-28 rounded-md bg-gray-200 dark:bg-gray-700" />
            <div className="h-9 w-40 rounded-md bg-gray-200 dark:bg-gray-700" />
            <div className="h-9 w-32 rounded-md bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Section Header */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {t('platform.tenant_operations.title', 'Administrative Actions')}
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t(
            'platform.tenant_operations.description',
            'Platform-level operations for this tenant. All actions are logged to the audit trail.'
          )}
        </p>
      </div>

      {/* Operations Buttons */}
      <div className="flex flex-wrap gap-2">
        {/* Impersonate Tenant Button */}
        {canPerformImpersonate && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenImpersonateDialog}
            disabled={isAnyMutationPending}
            aria-label={t('platform.tenant_operations.impersonate_aria', 'Impersonate {{tenantName}}', { tenantName })}>
            <svg
              className="mr-1.5 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
            {t('platform.tenant_operations.impersonate_button', 'Impersonate Tenant')}
          </Button>
        )}

        {/* Force Suspend Button */}
        {canPerformSuspend && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenForceSuspendDialog}
            disabled={isAnyMutationPending}
            aria-label={t('platform.tenant_operations.force_suspend_aria', 'Force suspend {{tenantName}}', { tenantName })}>
            <svg
              className="mr-1.5 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 5.25v13.5m-7.5-13.5v13.5"
              />
            </svg>
            {t('platform.tenant_operations.force_suspend_button', 'Force Suspend')}
          </Button>
        )}

        {/* Force Close Button */}
        {canPerformClose && (
          <Button
            variant="danger"
            size="sm"
            onClick={handleOpenForceCloseDialog}
            disabled={isAnyMutationPending}
            aria-label={t('platform.tenant_operations.force_close_aria', 'Force close {{tenantName}}', { tenantName })}>
            <svg
              className="mr-1.5 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
            {t('platform.tenant_operations.force_close_button', 'Force Close')}
          </Button>
        )}

        {/* Reset Token Version Button */}
        {canPerformResetToken && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenResetTokenDialog}
            disabled={isAnyMutationPending}
            aria-label={t('platform.tenant_operations.reset_token_aria', 'Reset token version for {{tenantName}}', { tenantName })}>
            <svg
              className="mr-1.5 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
              />
            </svg>
            {t('platform.tenant_operations.reset_token_button', 'Reset Token Version')}
          </Button>
        )}

        {/* View Audit Trail Button */}
        {onViewAuditTrail && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleViewAuditTrail}
            disabled={isAnyMutationPending}
            aria-label={t('platform.tenant_operations.view_audit_trail_aria', 'View audit trail for {{tenantName}}', { tenantName })}>
            <svg
              className="mr-1.5 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
            {t('platform.tenant_operations.view_audit_trail_button', 'View Audit Trail')}
          </Button>
        )}
      </div>

      {/* Status-based Info Messages */}
      {tenantStatus === 'SUSPENDED' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex gap-2">
            <span className="text-amber-600 dark:text-amber-400" aria-hidden="true">
              ⚠️
            </span>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t(
                'platform.tenant_operations.suspended_info',
                'This tenant is currently suspended. You can force close it or wait for the tenant owner to reactivate.'
              )}
            </p>
          </div>
        </div>
      )}

      {(tenantStatus === 'CLOSED' || tenantStatus === 'PURGED') && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex gap-2">
            <span className="text-gray-500 dark:text-gray-400" aria-hidden="true">
              ℹ️
            </span>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t(
                'platform.tenant_operations.closed_info',
                'This tenant is in a terminal state. No administrative operations are available.'
              )}
            </p>
          </div>
        </div>
      )}

      {/* Impersonate Confirmation Dialog */}
      <ConfirmDialog
        open={activeDialog === 'impersonate'}
        title={t('platform.tenant_operations.impersonate_confirm_title', 'Impersonate Tenant')}
        description={t(
          'platform.tenant_operations.impersonate_confirm_description',
          'You are about to switch your context to view the platform as "{{tenantName}}". An impersonation banner will be displayed. All actions during impersonation are logged.',
          { tenantName }
        )}
        confirmLabel={t('platform.tenant_operations.impersonate_confirm', 'Start Impersonation')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="primary"
        loading={impersonateMutation.isPending}
        onConfirm={handleConfirmImpersonate}
        onCancel={handleCloseDialog}
      />

      {/* Force Suspend Dialog */}
      <ForceSuspendDialog
        open={activeDialog === 'forceSuspend'}
        tenantName={tenantName}
        loading={forceSuspendMutation.isPending}
        reason={forceSuspendReason}
        onReasonChange={setForceSuspendReason}
        onConfirm={handleConfirmForceSuspend}
        onCancel={handleCloseDialog}
      />

      {/* Force Close Dialog (Destructive) */}
      <DestructiveConfirmationDialog
        open={activeDialog === 'forceClose'}
        title={t('platform.tenant_operations.force_close_confirm_title', 'Force Close Tenant')}
        description={t(
          'platform.tenant_operations.force_close_confirm_description',
          'This action is irreversible. Closing "{{tenantName}}" will permanently disable all access. Data will be retained according to the retention policy before purging.',
          { tenantName }
        )}
        confirmationText={forceCloseConfirmationText}
        inputLabel={t(
          'platform.tenant_operations.force_close_input_label',
          'Type "CLOSE {{tenantName}}" to confirm:',
          { tenantName }
        )}
        confirmLabel={t('platform.tenant_operations.force_close_confirm', 'Force Close')}
        cancelLabel={t('common.cancel', 'Cancel')}
        loading={forceCloseMutation.isPending}
        onConfirm={handleConfirmForceClose}
        onCancel={handleCloseDialog}
      />

      {/* Reset Token Version Dialog */}
      <ResetTokenVersionDialog
        open={activeDialog === 'resetTokenVersion'}
        tenantName={tenantName}
        memberCount={memberCount}
        loading={resetTokenMutation.isPending}
        reason={resetTokenReason}
        onReasonChange={setResetTokenReason}
        onConfirm={handleConfirmResetToken}
        onCancel={handleCloseDialog}
      />
    </div>
  );
}

export default TenantOperations;
