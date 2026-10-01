'use client';

/**
 * useDeleteOrgUnit — Hook for managing OrgUnit deletion with confirmation flow.
 *
 * This hook provides:
 * - Pre-deletion checks for children and members
 * - Blocking error display for non-empty OrgUnits
 * - Confirmation dialog state management for empty OrgUnits
 * - Delete mutation with success/error toasts
 * - Tree refresh and collapse to parent on success
 *
 * SECURITY CONSIDERATIONS:
 * - UI permission checks are for UX only; server-side authorization is enforced
 * - Delete operation is blocked if OrgUnit has children or members
 *
 * @see Requirements 8.9, 8.10 (OrgUnit CRUD Operations - Delete)
 * @see Design Section 6. OrgUnit Hierarchy Tree > Delete Flow
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  showSuccessToast,
  showErrorToast,
} from '@infrastructure/stateManagement/toastStore';
import { useAdminUiStore } from '@infrastructure/stateManagement/adminUiStore';
import type { OrgUnitNode } from '@core/domains/orgunit/entities/OrgUnitNode';
import type { AppError } from '@core/utils';
import { ORGUNIT_TREE_QUERY_KEY } from '../viewModel/useOrgUnitTreeViewModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Response type from the delete API endpoint.
 */
interface DeleteOrgUnitResponse {
  success: boolean;
  error?: {
    code: string;
    message: string;
    userMessage?: string;
  };
}

/**
 * Delete validation result with blocking reasons.
 */
export interface DeleteValidationResult {
  /** Whether deletion is allowed */
  canDelete: boolean;
  /** Blocking reason if canDelete is false */
  blockingReason?: 'has_children' | 'has_members' | 'is_root';
  /** User-friendly message for the blocking reason */
  blockingMessage?: string;
}

/**
 * State for the delete confirmation flow.
 */
export interface DeleteOrgUnitState {
  /** Whether the confirmation dialog is open */
  isConfirmDialogOpen: boolean;
  /** Whether a blocking error dialog should be shown */
  isBlockingErrorOpen: boolean;
  /** The blocking error details */
  blockingError: DeleteValidationResult | null;
  /** Whether the delete operation is in progress */
  isDeleting: boolean;
  /** The OrgUnit being deleted (for confirmation dialog context) */
  orgUnitToDelete: OrgUnitNode | null;
}

/**
 * Return type of useDeleteOrgUnit hook.
 */
export interface UseDeleteOrgUnitReturn {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Current state of the delete flow */
  state: DeleteOrgUnitState;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Initiate delete flow for an OrgUnit.
   * Validates children/members and shows appropriate dialog.
   *
   * @param orgUnit - The OrgUnit to delete
   */
  initiateDelete: (orgUnit: OrgUnitNode) => void;

  /**
   * Confirm deletion after user acknowledges confirmation dialog.
   */
  confirmDelete: () => Promise<void>;

  /**
   * Cancel the delete operation (close any open dialogs).
   */
  cancelDelete: () => void;

  /**
   * Close the blocking error dialog.
   */
  closeBlockingError: () => void;

  /**
   * Validate if an OrgUnit can be deleted.
   *
   * @param orgUnit - The OrgUnit to validate
   * @returns Validation result
   */
  validateDelete: (orgUnit: OrgUnitNode) => DeleteValidationResult;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Call the delete OrgUnit API endpoint.
 *
 * @param orgUnitId - The OrgUnit ID to delete
 * @returns Promise resolving to the delete response
 */
async function deleteOrgUnitApi(orgUnitId: string): Promise<DeleteOrgUnitResponse> {
  const response = await fetch(`/api/admin/orgunit/${orgUnitId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
      userMessage?: string;
    };

    return {
      success: false,
      error: {
        code: errorData.code ?? 'ORGUNIT_DELETE_FAILED',
        message: errorData.message ?? `Failed to delete OrgUnit: ${response.status}`,
        userMessage: errorData.userMessage,
      },
    };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * useDeleteOrgUnit — Hook for managing OrgUnit deletion with confirmation.
 *
 * Implements the delete flow per Requirements 8.9, 8.10:
 * - Checks for children and members before allowing delete
 * - Displays blocking error if non-empty
 * - Uses ConfirmDialog for empty OrgUnits
 * - Refreshes tree and collapses to parent on success
 *
 * @returns UseDeleteOrgUnitReturn with state and actions
 *
 * @example
 * ```tsx
 * const { state, initiateDelete, confirmDelete, cancelDelete } = useDeleteOrgUnit();
 *
 * // In OrgUnit tree node
 * <Button onClick={() => initiateDelete(orgUnit)}>Delete</Button>
 *
 * // Confirmation dialog
 * <ConfirmDialog
 *   open={state.isConfirmDialogOpen}
 *   onConfirm={confirmDelete}
 *   onCancel={cancelDelete}
 *   loading={state.isDeleting}
 * />
 * ```
 */
export function useDeleteOrgUnit(): UseDeleteOrgUnitReturn {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { setOrgUnitExpanded, orgUnitExpandedIds } = useAdminUiStore();

  // ---------------------------------------------------------------------------
  // Local State
  // ---------------------------------------------------------------------------

  const [state, setState] = useState<DeleteOrgUnitState>({
    isConfirmDialogOpen: false,
    isBlockingErrorOpen: false,
    blockingError: null,
    isDeleting: false,
    orgUnitToDelete: null,
  });

  // ---------------------------------------------------------------------------
  // Delete Mutation
  // ---------------------------------------------------------------------------

  const deleteMutation = useMutation<
    DeleteOrgUnitResponse,
    AppError,
    string
  >({
    mutationFn: deleteOrgUnitApi,
    onSuccess: (response, orgUnitId) => {
      if (!response.success) {
        // Handle error returned in success response (e.g., business error)
        const errorMessage =
          response.error?.userMessage ??
          response.error?.message ??
          t('orgunit.delete_error');
        showErrorToast(errorMessage);
        return;
      }

      // Success: show toast
      showSuccessToast(t('orgunit.delete_success'));

      // Collapse to parent: remove deleted OrgUnit from expanded and select parent
      const deletedOrgUnit = state.orgUnitToDelete;
      if (deletedOrgUnit?.parentId) {
        // Keep parent expanded, remove deleted node from expanded set
        const newExpandedIds = new Set(orgUnitExpandedIds);
        newExpandedIds.delete(orgUnitId);
        setOrgUnitExpanded(newExpandedIds);
      }

      // Invalidate and refetch the tree
      queryClient.invalidateQueries({ queryKey: [ORGUNIT_TREE_QUERY_KEY] });

      // Reset state
      setState({
        isConfirmDialogOpen: false,
        isBlockingErrorOpen: false,
        blockingError: null,
        isDeleting: false,
        orgUnitToDelete: null,
      });
    },
    onError: (error) => {
      const errorMessage =
        (error as AppError).userMessage ??
        (error as AppError).message ??
        t('orgunit.delete_error');
      showErrorToast(errorMessage);

      // Keep dialog open but stop loading
      setState((prev) => ({
        ...prev,
        isDeleting: false,
      }));
    },
  });

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  /**
   * Validate if an OrgUnit can be deleted.
   *
   * Per Requirements 8.9:
   * - Cannot delete if has children
   * - Cannot delete if has members
   * - Cannot delete root OrgUnits
   */
  const validateDelete = useCallback(
    (orgUnit: OrgUnitNode): DeleteValidationResult => {
      // Check for root OrgUnit
      if (orgUnit.parentId === null) {
        return {
          canDelete: false,
          blockingReason: 'is_root',
          blockingMessage: t('orgunit.delete_root_error'),
        };
      }

      // Check for children
      if (orgUnit.childCount > 0) {
        return {
          canDelete: false,
          blockingReason: 'has_children',
          blockingMessage: t('orgunit.delete_has_children'),
        };
      }

      // Check for members
      if (orgUnit.memberCount > 0) {
        return {
          canDelete: false,
          blockingReason: 'has_members',
          blockingMessage: t('orgunit.delete_has_members'),
        };
      }

      return { canDelete: true };
    },
    [t],
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Initiate the delete flow for an OrgUnit.
   *
   * 1. Validate the OrgUnit for deletion eligibility
   * 2. If blocked, show blocking error dialog
   * 3. If allowed, show confirmation dialog
   */
  const initiateDelete = useCallback(
    (orgUnit: OrgUnitNode) => {
      const validation = validateDelete(orgUnit);

      if (!validation.canDelete) {
        // Show blocking error dialog
        setState({
          isConfirmDialogOpen: false,
          isBlockingErrorOpen: true,
          blockingError: validation,
          isDeleting: false,
          orgUnitToDelete: orgUnit,
        });
      } else {
        // Show confirmation dialog
        setState({
          isConfirmDialogOpen: true,
          isBlockingErrorOpen: false,
          blockingError: null,
          isDeleting: false,
          orgUnitToDelete: orgUnit,
        });
      }
    },
    [validateDelete],
  );

  /**
   * Confirm and execute the delete operation.
   */
  const confirmDelete = useCallback(async () => {
    if (!state.orgUnitToDelete) return;

    setState((prev) => ({
      ...prev,
      isDeleting: true,
    }));

    await deleteMutation.mutateAsync(state.orgUnitToDelete.id);
  }, [state.orgUnitToDelete, deleteMutation]);

  /**
   * Cancel the delete operation and close dialogs.
   */
  const cancelDelete = useCallback(() => {
    setState({
      isConfirmDialogOpen: false,
      isBlockingErrorOpen: false,
      blockingError: null,
      isDeleting: false,
      orgUnitToDelete: null,
    });
  }, []);

  /**
   * Close the blocking error dialog.
   */
  const closeBlockingError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isBlockingErrorOpen: false,
      blockingError: null,
      orgUnitToDelete: null,
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    state,
    initiateDelete,
    confirmDelete,
    cancelDelete,
    closeBlockingError,
    validateDelete,
  };
}

export default useDeleteOrgUnit;
