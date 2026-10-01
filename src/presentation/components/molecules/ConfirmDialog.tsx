'use client';

/**
 * ConfirmDialog — Accessible confirmation dialog component.
 *
 * Features:
 * - Native <dialog> element for built-in accessibility
 * - Focus trapping within dialog when open
 * - Keyboard support (Escape to close)
 * - Screen reader announcements
 *
 * @see Requirements 23.9 (Focus trapping for modals)
 * @see Requirements 23.5 (Form labels and ARIA attributes)
 */

import { useCallback, useEffect, useId, useRef } from 'react';
import { Button } from '../atoms/Button';
import { useFocusTrap, useAriaLive } from '@presentation/hooks/useAccessibility';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uniqueId = useId();
  const titleId = `confirm-dialog-title-${uniqueId}`;
  const descId = `confirm-dialog-desc-${uniqueId}`;

  // Focus trap for accessibility (Requirements 23.9)
  const focusTrapRef = useFocusTrap<HTMLDivElement>({
    enabled: open,
    returnFocusOnDeactivate: true,
    initialFocusSelector: 'button[data-cancel]', // Focus cancel button first for safety
  });

  // ARIA live announcements (Requirements 23.10)
  const announce = useAriaLive({
    politeness: variant === 'danger' ? 'assertive' : 'polite',
  });

  // Announce dialog opening to screen readers
  useEffect(() => {
    if (open) {
      const announcementText = description
        ? `${title}. ${description}`
        : title;
      announce(announcementText);
    }
  }, [open, title, description, announce]);

  // Handle dialog open/close
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Handle Escape key
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        event.preventDefault();
        onCancel();
      }
    },
    [loading, onCancel],
  );

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 m-auto max-w-md rounded-lg border-0 bg-white p-0 shadow-xl backdrop:bg-black/50 dark:bg-gray-800"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      aria-modal="true"
      role="alertdialog">
      <div ref={focusTrapRef} className="p-6">
        <h2
          id={titleId}
          className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        {description && (
          <p
            id={descId}
            className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3" role="group" aria-label="Dialog actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={loading}
            data-cancel>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="sm"
            loading={loading}
            onClick={onConfirm}
            aria-describedby={description ? descId : undefined}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
