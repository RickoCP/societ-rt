'use client';

/**
 * LifecyclePanel — Component for displaying and managing tenant lifecycle status.
 *
 * Features:
 * - Current status display with visual indicator (icon and color badge)
 * - Status transition history with timestamps and actors
 * - "Suspend Tenant" button (ACTIVE state, tenant:manage permission)
 * - "Reactivate Tenant" button (SUSPENDED state)
 * - "Close Tenant" button (SUSPENDED state, PLATFORM_ADMIN only)
 * - DestructiveConfirmationDialog for close action (requires typing confirmation)
 * - Visual state machine diagram showing lifecycle states
 * - Expandable history section (default 10 items)
 *
 * @see Requirements 13.1-13.11 (Tenant Lifecycle Management)
 * @see Design Components > 8. Tenant Settings > 8.4 Lifecycle State Machine
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@presentation/components/atoms/Button';
import { ConfirmDialog } from '@presentation/components/molecules/ConfirmDialog';
import { DestructiveConfirmationDialog } from '@presentation/components/molecules/DestructiveConfirmationDialog';
import {
  showSuccessToast,
  showErrorToast,
} from '@infrastructure/stateManagement/toastStore';
import {
  LifecycleStatus,
  type LifecycleStatusValue,
  type LifecycleEvent,
  isTerminalStatus,
} from '@core/domains/tenant/entities/TenantLifecycleStatus';
import type { AppError } from '@core/utils';

import { TENANT_SETTINGS_QUERY_KEY, type TenantLifecycleStatus } from '../viewModel/useTenantSettingsViewModel';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default number of history items to show before expanding.
 */
const DEFAULT_HISTORY_LIMIT = 10;

/**
 * Status configuration for visual display.
 */
const STATUS_CONFIG: Record<
  TenantLifecycleStatus,
  {
    color: string;
    bgColor: string;
    borderColor: string;
    icon: string;
    labelKey: string;
  }
> = {
  PROVISIONING: {
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/40',
    borderColor: 'border-blue-200 dark:border-blue-800',
    icon: '⏳',
    labelKey: 'tenant_settings.lifecycle.status_provisioning',
  },
  ACTIVE: {
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-900/40',
    borderColor: 'border-green-200 dark:border-green-800',
    icon: '✓',
    labelKey: 'tenant_settings.lifecycle.status_active',
  },
  SUSPENDED: {
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-100 dark:bg-amber-900/40',
    borderColor: 'border-amber-200 dark:border-amber-800',
    icon: '⚠',
    labelKey: 'tenant_settings.lifecycle.status_suspended',
  },
  CLOSING: {
    color: 'text-orange-700 dark:text-orange-300',
    bgColor: 'bg-orange-100 dark:bg-orange-900/40',
    borderColor: 'border-orange-200 dark:border-orange-800',
    icon: '🔄',
    labelKey: 'tenant_settings.lifecycle.status_closing',
  },
  CLOSED: {
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-900/40',
    borderColor: 'border-red-200 dark:border-red-800',
    icon: '🔒',
    labelKey: 'tenant_settings.lifecycle.status_closed',
  },
  PURGED: {
    color: 'text-gray-700 dark:text-gray-300',
    bgColor: 'bg-gray-100 dark:bg-gray-900/40',
    borderColor: 'border-gray-200 dark:border-gray-800',
    icon: '🗑',
    labelKey: 'tenant_settings.lifecycle.status_purged',
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the LifecyclePanel component.
 */
export interface LifecyclePanelProps {
  /**
   * Current tenant lifecycle status.
   */
  currentStatus: TenantLifecycleStatus | null;

  /**
   * Timestamp when the status was last changed.
   */
  statusChangedAt?: Date | null;

  /**
   * Name of the actor who last changed the status.
   */
  statusChangedBy?: string | null;

  /**
   * Lifecycle event history.
   */
  history: LifecycleEvent[];

  /**
   * Tenant name (used for close confirmation).
   */
  tenantName?: string;

  /**
   * Whether the user can suspend the tenant.
   */
  canSuspend?: boolean;

  /**
   * Whether the user can reactivate the tenant.
   */
  canReactivate?: boolean;

  /**
   * Whether the user can close the tenant (PLATFORM_ADMIN only).
   */
  canClose?: boolean;

  /**
   * Whether data is loading.
   */
  isLoading?: boolean;

  /**
   * Additional CSS classes.
   */
  className?: string;
}

/**
 * Lifecycle action types.
 */
type LifecycleActionType = 'suspend' | 'reactivate' | 'close';

/**
 * Input for suspend action.
 */
interface SuspendInput {
  reason: string;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Suspend tenant.
 */
async function suspendTenant(input: SuspendInput): Promise<void> {
  const response = await fetch('/api/admin/tenant/lifecycle/suspend', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type: response.status === 403 ? 'authorization' : 'technical',
      code: errorData.code ?? 'SUSPEND_ERROR',
      message: errorData.message ?? `Failed to suspend tenant: ${response.status}`,
    };
    throw error;
  }
}

/**
 * Reactivate tenant.
 */
async function reactivateTenant(): Promise<void> {
  const response = await fetch('/api/admin/tenant/lifecycle/reactivate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type: response.status === 403 ? 'authorization' : 'technical',
      code: errorData.code ?? 'REACTIVATE_ERROR',
      message: errorData.message ?? `Failed to reactivate tenant: ${response.status}`,
    };
    throw error;
  }
}

/**
 * Close tenant.
 */
async function closeTenant(): Promise<void> {
  const response = await fetch('/api/admin/tenant/lifecycle/close', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type: response.status === 403 ? 'authorization' : 'technical',
      code: errorData.code ?? 'CLOSE_ERROR',
      message: errorData.message ?? `Failed to close tenant: ${response.status}`,
    };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

/**
 * Status badge component.
 */
function StatusBadge({
  status,
  className = '',
}: {
  status: TenantLifecycleStatus;
  className?: string;
}) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium
        ${config.bgColor} ${config.color} ${config.borderColor} border
        ${className}
      `}>
      <span aria-hidden="true">{config.icon}</span>
      <span>{t(config.labelKey, status)}</span>
    </span>
  );
}

/**
 * State machine diagram showing lifecycle states.
 */
function StateMachineDiagram({
  currentStatus,
}: {
  currentStatus: TenantLifecycleStatus | null;
}) {
  const { t } = useTranslation();

  const states: TenantLifecycleStatus[] = [
    'PROVISIONING',
    'ACTIVE',
    'SUSPENDED',
    'CLOSING',
    'CLOSED',
    'PURGED',
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
      <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
        {t('tenant_settings.lifecycle.state_diagram_title', 'Lifecycle States')}
      </h4>

      {/* Horizontal state machine visualization */}
      <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
        {states.map((state, index) => {
          const config = STATUS_CONFIG[state];
          const isActive = state === currentStatus;
          const isPast =
            currentStatus &&
            states.indexOf(state) < states.indexOf(currentStatus);

          return (
            <React.Fragment key={state}>
              {/* State node */}
              <div className="flex flex-col items-center">
                <div
                  className={`
                    flex h-10 w-10 items-center justify-center rounded-full text-sm
                    transition-all duration-200
                    ${
                      isActive
                        ? `${config.bgColor} ${config.color} ring-2 ring-offset-2 ring-offset-gray-50 dark:ring-offset-gray-900/50 ${config.borderColor.replace('border-', 'ring-')}`
                        : isPast
                          ? 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                          : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                    }
                  `}
                  title={t(config.labelKey, state)}>
                  <span aria-hidden="true">{config.icon}</span>
                </div>
                <span
                  className={`
                    mt-1 text-xs whitespace-nowrap
                    ${isActive ? config.color : 'text-gray-500 dark:text-gray-400'}
                  `}>
                  {t(config.labelKey, state)}
                </span>
              </div>

              {/* Arrow connector */}
              {index < states.length - 1 && (
                <div
                  className={`
                    mx-1 flex-shrink-0 h-0.5 w-4 md:w-8
                    ${isPast ? 'bg-gray-400' : 'bg-gray-200 dark:bg-gray-700'}
                  `}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Bidirectional arrow for ACTIVE ↔ SUSPENDED */}
      <div className="mt-2 flex justify-center">
        <div className="inline-flex items-center gap-2 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          <span>{t('tenant_settings.lifecycle.bidirectional_hint', 'ACTIVE ↔ SUSPENDED (can reactivate)')}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * History event item component.
 */
function HistoryEventItem({
  event,
}: {
  event: LifecycleEvent;
}) {
  const { t, i18n } = useTranslation();

  const formattedDate = useMemo(() => {
    const date = new Date(event.timestamp);
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }, [event.timestamp, i18n.language]);

  const fromConfig = STATUS_CONFIG[event.fromStatus as TenantLifecycleStatus];
  const toConfig = STATUS_CONFIG[event.toStatus as TenantLifecycleStatus];

  return (
    <div className="flex gap-3 border-b border-gray-100 py-3 last:border-b-0 dark:border-gray-800">
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <div
          className={`h-3 w-3 rounded-full ${toConfig.bgColor} ${toConfig.borderColor} border`}
          aria-hidden="true"
        />
        <div className="flex-1 w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
      </div>

      {/* Event details */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {/* Status transition */}
          <span className={`font-medium ${fromConfig.color}`}>
            {t(fromConfig.labelKey, event.fromStatus)}
          </span>
          <span className="text-gray-400" aria-hidden="true">→</span>
          <span className={`font-medium ${toConfig.color}`}>
            {t(toConfig.labelKey, event.toStatus)}
          </span>
        </div>

        {/* Reason if provided */}
        {event.reason && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">
              {t('tenant_settings.lifecycle.reason', 'Reason')}:
            </span>{' '}
            {event.reason}
          </p>
        )}

        {/* Metadata */}
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span>
            <span className="font-medium">
              {t('tenant_settings.lifecycle.by', 'By')}:
            </span>{' '}
            {event.actorName ?? t('tenant_settings.lifecycle.system', 'System')}
          </span>
          <span>{formattedDate}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Form section card component.
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

/**
 * Suspend confirmation dialog with reason input.
 */
function SuspendConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  reasonLabel,
  reasonPlaceholder,
  loading,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  loading: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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
      aria-labelledby="suspend-dialog-title"
      aria-describedby="suspend-dialog-desc">
      <div className="p-6">
        <h2
          id="suspend-dialog-title"
          className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        <p
          id="suspend-dialog-desc"
          className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>

        {/* Suspension reason input */}
        <div className="mt-4">
          <label
            htmlFor="suspend-reason"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {reasonLabel}
          </label>
          <textarea
            id="suspend-reason"
            rows={3}
            value={reason}
            onChange={e => onReasonChange(e.target.value)}
            placeholder={reasonPlaceholder}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm
              placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500
              dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={loading}
            onClick={onConfirm}>
            {confirmLabel}
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
 * LifecyclePanel — Panel for displaying and managing tenant lifecycle.
 *
 * @see Requirements 13.1-13.11
 */
export function LifecyclePanel({
  currentStatus,
  statusChangedAt,
  statusChangedBy,
  history,
  tenantName = '',
  canSuspend = false,
  canReactivate = false,
  canClose = false,
  isLoading = false,
  className = '',
}: LifecyclePanelProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  // ---------------------------------------------------------------------------
  // Local State
  // ---------------------------------------------------------------------------

  const [showHistoryAll, setShowHistoryAll] = useState(false);
  const [activeDialog, setActiveDialog] = useState<LifecycleActionType | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  const displayedHistory = useMemo(() => {
    if (showHistoryAll) return history;
    return history.slice(0, DEFAULT_HISTORY_LIMIT);
  }, [history, showHistoryAll]);

  const hasMoreHistory = history.length > DEFAULT_HISTORY_LIMIT;

  const formattedStatusChangedAt = useMemo(() => {
    if (!statusChangedAt) return null;
    const date = new Date(statusChangedAt);
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }, [statusChangedAt, i18n.language]);

  // Check if current status is a terminal state (no actions available)
  const isTerminal = currentStatus ? isTerminalStatus(currentStatus as LifecycleStatusValue) : false;

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const suspendMutation = useMutation({
    mutationFn: suspendTenant,
    onSuccess: () => {
      showSuccessToast(t('tenant_settings.lifecycle.suspend_success', 'Tenant suspended successfully'));
      queryClient.invalidateQueries({ queryKey: [TENANT_SETTINGS_QUERY_KEY] });
      setActiveDialog(null);
      setSuspendReason('');
    },
    onError: (error: AppError) => {
      // Use user-safe message only, do not expose technical details
      showErrorToast(error.userMessage ?? t('tenant_settings.lifecycle.suspend_error', 'Failed to suspend tenant'));
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateTenant,
    onSuccess: () => {
      showSuccessToast(t('tenant_settings.lifecycle.reactivate_success', 'Tenant reactivated successfully'));
      queryClient.invalidateQueries({ queryKey: [TENANT_SETTINGS_QUERY_KEY] });
      setActiveDialog(null);
    },
    onError: (error: AppError) => {
      // Use user-safe message only, do not expose technical details
      showErrorToast(error.userMessage ?? t('tenant_settings.lifecycle.reactivate_error', 'Failed to reactivate tenant'));
    },
  });

  const closeMutation = useMutation({
    mutationFn: closeTenant,
    onSuccess: () => {
      showSuccessToast(t('tenant_settings.lifecycle.close_success', 'Tenant closed successfully'));
      queryClient.invalidateQueries({ queryKey: [TENANT_SETTINGS_QUERY_KEY] });
      setActiveDialog(null);
    },
    onError: (error: AppError) => {
      // Use user-safe message only, do not expose technical details
      showErrorToast(error.userMessage ?? t('tenant_settings.lifecycle.close_error', 'Failed to close tenant'));
    },
  });

  const isActionInProgress = suspendMutation.isPending || reactivateMutation.isPending || closeMutation.isPending;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleOpenSuspendDialog = useCallback(() => {
    setSuspendReason('');
    setActiveDialog('suspend');
  }, []);

  const handleOpenReactivateDialog = useCallback(() => {
    setActiveDialog('reactivate');
  }, []);

  const handleOpenCloseDialog = useCallback(() => {
    setActiveDialog('close');
  }, []);

  const handleCloseDialog = useCallback(() => {
    setActiveDialog(null);
    setSuspendReason('');
  }, []);

  const handleConfirmSuspend = useCallback(() => {
    suspendMutation.mutate({ reason: suspendReason });
  }, [suspendMutation, suspendReason]);

  const handleConfirmReactivate = useCallback(() => {
    reactivateMutation.mutate();
  }, [reactivateMutation]);

  const handleConfirmClose = useCallback(() => {
    closeMutation.mutate();
  }, [closeMutation]);

  const handleToggleHistory = useCallback(() => {
    setShowHistoryAll(prev => !prev);
  }, []);

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (isLoading || !currentStatus) {
    return (
      <div className={`space-y-6 ${className}`}>
        {/* Loading skeleton */}
        <div className="animate-pulse space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mt-4 flex items-center gap-4">
              <div className="h-10 w-32 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <div className="h-5 w-32 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mt-4 h-24 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[currentStatus];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Current Status Section */}
      <FormSection
        title={t('tenant_settings.lifecycle.current_status_title', 'Current Status')}
        description={t(
          'tenant_settings.lifecycle.current_status_description',
          'The current operational state of this tenant.',
        )}>
        <div className="space-y-4">
          {/* Status badge and info */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <StatusBadge status={currentStatus} />
              
              {/* Status changed info */}
              {(formattedStatusChangedAt || statusChangedBy) && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {formattedStatusChangedAt && (
                    <span>
                      {t('tenant_settings.lifecycle.changed_at', 'Changed')}: {formattedStatusChangedAt}
                    </span>
                  )}
                  {statusChangedBy && (
                    <span className="ml-2">
                      {t('tenant_settings.lifecycle.by', 'by')} {statusChangedBy}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            {!isTerminal && (
              <div className="flex flex-wrap gap-2">
                {/* Suspend button - visible when ACTIVE */}
                {canSuspend && currentStatus === 'ACTIVE' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleOpenSuspendDialog}
                    disabled={isActionInProgress}>
                    {t('tenant_settings.lifecycle.suspend_button', 'Suspend Tenant')}
                  </Button>
                )}

                {/* Reactivate button - visible when SUSPENDED */}
                {canReactivate && currentStatus === 'SUSPENDED' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleOpenReactivateDialog}
                    disabled={isActionInProgress}>
                    {t('tenant_settings.lifecycle.reactivate_button', 'Reactivate Tenant')}
                  </Button>
                )}

                {/* Close button - visible when SUSPENDED and PLATFORM_ADMIN only */}
                {canClose && currentStatus === 'SUSPENDED' && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleOpenCloseDialog}
                    disabled={isActionInProgress}>
                    {t('tenant_settings.lifecycle.close_button', 'Close Tenant')}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Warning for non-operational statuses */}
          {currentStatus === 'SUSPENDED' && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
              <div className="flex gap-2">
                <span className="text-amber-600 dark:text-amber-400" aria-hidden="true">⚠️</span>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {t(
                    'tenant_settings.lifecycle.suspended_warning',
                    'This tenant is suspended. Non-emergency operations are blocked. Emergency features remain available.',
                  )}
                </p>
              </div>
            </div>
          )}

          {currentStatus === 'CLOSING' && (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-900/20">
              <div className="flex gap-2">
                <span className="text-orange-600 dark:text-orange-400" aria-hidden="true">🔄</span>
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  {t(
                    'tenant_settings.lifecycle.closing_warning',
                    'This tenant is being closed. Data retention period is active.',
                  )}
                </p>
              </div>
            </div>
          )}

          {(currentStatus === 'CLOSED' || currentStatus === 'PURGED') && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
              <div className="flex gap-2">
                <span className="text-red-600 dark:text-red-400" aria-hidden="true">🔒</span>
                <p className="text-sm text-red-700 dark:text-red-300">
                  {currentStatus === 'CLOSED'
                    ? t(
                        'tenant_settings.lifecycle.closed_warning',
                        'This tenant is closed. Access is limited to read-only operations.',
                      )
                    : t(
                        'tenant_settings.lifecycle.purged_warning',
                        'This tenant has been purged. All data has been permanently deleted.',
                      )}
                </p>
              </div>
            </div>
          )}
        </div>
      </FormSection>

      {/* State Machine Diagram Section */}
      <FormSection
        title={t('tenant_settings.lifecycle.state_machine_title', 'Lifecycle State Machine')}
        description={t(
          'tenant_settings.lifecycle.state_machine_description',
          'Visual representation of possible tenant lifecycle states and transitions.',
        )}>
        <StateMachineDiagram currentStatus={currentStatus} />
      </FormSection>

      {/* History Section */}
      <FormSection
        title={t('tenant_settings.lifecycle.history_title', 'Status History')}
        description={t(
          'tenant_settings.lifecycle.history_description',
          'Record of all lifecycle status transitions.',
        )}>
        <div className="space-y-2">
          {displayedHistory.length > 0 ? (
            <>
              {displayedHistory.map(event => (
                <HistoryEventItem key={event.id} event={event} />
              ))}

              {/* Show more/less toggle */}
              {hasMoreHistory && (
                <div className="pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleToggleHistory}>
                    {showHistoryAll
                      ? t('tenant_settings.lifecycle.show_less', 'Show less')
                      : t('tenant_settings.lifecycle.show_more', 'Show all {{count}} events', {
                          count: history.length,
                        })}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('tenant_settings.lifecycle.no_history', 'No status history available.')}
            </p>
          )}
        </div>
      </FormSection>

      {/* Suspend Confirmation Dialog - Custom implementation with reason input */}
      {activeDialog === 'suspend' && (
        <SuspendConfirmationDialog
          open={true}
          title={t('tenant_settings.lifecycle.suspend_confirm_title', 'Suspend Tenant')}
          description={t(
            'tenant_settings.lifecycle.suspend_confirm_description',
            'Are you sure you want to suspend this tenant? All non-emergency operations will be blocked. You can reactivate the tenant later.',
          )}
          confirmLabel={t('tenant_settings.lifecycle.suspend_confirm_button', 'Suspend')}
          cancelLabel={t('common.cancel', 'Cancel')}
          reasonLabel={t('tenant_settings.lifecycle.suspend_reason_label', 'Reason (optional)')}
          reasonPlaceholder={t(
            'tenant_settings.lifecycle.suspend_reason_placeholder',
            'Enter reason for suspension...',
          )}
          loading={suspendMutation.isPending}
          reason={suspendReason}
          onReasonChange={setSuspendReason}
          onConfirm={handleConfirmSuspend}
          onCancel={handleCloseDialog}
        />
      )}

      {/* Reactivate Confirmation Dialog */}
      <ConfirmDialog
        open={activeDialog === 'reactivate'}
        title={t('tenant_settings.lifecycle.reactivate_confirm_title', 'Reactivate Tenant')}
        description={t(
          'tenant_settings.lifecycle.reactivate_confirm_description',
          'Are you sure you want to reactivate this tenant? All tenant operations will be restored.',
        )}
        confirmLabel={t('tenant_settings.lifecycle.reactivate_confirm_button', 'Reactivate')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="primary"
        loading={reactivateMutation.isPending}
        onConfirm={handleConfirmReactivate}
        onCancel={handleCloseDialog}
      />

      {/* Close Confirmation Dialog (Destructive) */}
      <DestructiveConfirmationDialog
        open={activeDialog === 'close'}
        title={t('tenant_settings.lifecycle.close_confirm_title', 'Close Tenant')}
        description={t(
          'tenant_settings.lifecycle.close_confirm_description',
          'This action is irreversible. Closing this tenant will initiate data retention period, after which all data will be permanently deleted. The tenant cannot be reopened.',
        )}
        confirmationText={`CLOSE ${tenantName}`.toUpperCase()}
        inputLabel={t(
          'tenant_settings.lifecycle.close_confirm_input_label',
          `Type "CLOSE ${tenantName.toUpperCase()}" to confirm:`,
        )}
        confirmLabel={t('tenant_settings.lifecycle.close_confirm_button', 'Close Tenant')}
        cancelLabel={t('common.cancel', 'Cancel')}
        loading={closeMutation.isPending}
        onConfirm={handleConfirmClose}
        onCancel={handleCloseDialog}
      />
    </div>
  );
}

export default LifecyclePanel;
