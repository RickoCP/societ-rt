'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';

export interface DestructiveConfirmationDialogProps {
  /** Controls whether the dialog is open */
  open: boolean;
  /** The title of the confirmation dialog */
  title: string;
  /** A description or warning message about the destructive action */
  description?: string;
  /** The exact text the user must type to enable confirmation */
  confirmationText: string;
  /** Label for the confirm button. Defaults to 'Confirm' */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to 'Cancel' */
  cancelLabel?: string;
  /** Whether the confirm action is in progress */
  loading?: boolean;
  /** Called when the user confirms (only enabled when confirmation text matches) */
  onConfirm: () => void;
  /** Called when the user cancels or closes the dialog */
  onCancel: () => void;
  /** Instruction text shown above the input. Defaults to 'Type "{confirmationText}" to confirm:' */
  inputLabel?: string;
}

/**
 * DestructiveConfirmationDialog is a confirmation dialog for irreversible actions.
 * It requires the user to type an exact confirmation text before the confirm button is enabled.
 *
 * Use this for actions like:
 * - Revoking membership
 * - Closing a tenant
 * - Deleting critical data
 *
 * @example
 * ```tsx
 * <DestructiveConfirmationDialog
 *   open={isOpen}
 *   title="Revoke Membership"
 *   description="This action cannot be undone. The member will lose all access immediately."
 *   confirmationText="REVOKE"
 *   confirmLabel="Revoke Access"
 *   onConfirm={handleRevoke}
 *   onCancel={() => setIsOpen(false)}
 * />
 * ```
 *
 * _Requirements: 4.5, 10.5, 13.9_
 */
export function DestructiveConfirmationDialog({
  open,
  title,
  description,
  confirmationText,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  onConfirm,
  onCancel,
  inputLabel,
}: DestructiveConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  const canConfirm = inputValue === confirmationText;

  // Reset input when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setInputValue('');
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      // Focus the input when dialog opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Handle escape key and backdrop click via native dialog close event
  const handleDialogClose = () => {
    onCancel();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow Enter key to confirm when text matches
    if (e.key === 'Enter' && canConfirm && !loading) {
      e.preventDefault();
      onConfirm();
    }
  };

  if (!open) return null;

  const defaultInputLabel = `Type "${confirmationText}" to confirm:`;
  const displayInputLabel = inputLabel ?? defaultInputLabel;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      className="fixed inset-0 z-50 m-auto max-w-md rounded-lg border-0 bg-white p-0 shadow-xl backdrop:bg-black/50 dark:bg-gray-800"
      aria-labelledby="destructive-confirm-dialog-title"
      aria-describedby={description ? 'destructive-confirm-dialog-desc' : undefined}>
      <div className="p-6">
        {/* Danger indicator */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <svg
              className="h-5 w-5 text-red-600 dark:text-red-400"
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
            id="destructive-confirm-dialog-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
        </div>

        {description && (
          <p
            id="destructive-confirm-dialog-desc"
            className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}

        {/* Confirmation input */}
        <div className="mb-6">
          <Input
            ref={inputRef}
            label={displayInputLabel}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={confirmationText}
            autoComplete="off"
            spellCheck={false}
            aria-required="true"
          />
          {inputValue.length > 0 && !canConfirm && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
              Text does not match. Please type exactly: {confirmationText}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={loading}
            disabled={!canConfirm}
            onClick={onConfirm}
            aria-disabled={!canConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
