'use client';

/**
 * ToastContainer — Renders the active toast notifications from the toast store.
 *
 * Shared UI organism. Reads UI state from {@link useToastStore} (Zustand) and
 * renders a fixed, stacked list of toasts. Supports success / error / warning /
 * info and a persistent `loading` variant (with a spinner) that is typically
 * replaced in place once an async operation settles.
 *
 * Mount once at the app root so toasts are globally available. Visual output
 * is paired with the store's ARIA live region for screen reader announcements.
 */

import { useToastStore, type ToastType } from '@infrastructure/stateManagement/toastStore';

const typeClasses: Record<ToastType, string> = {
  success:
    'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-200',
  error:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200',
  warning:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  loading:
    'border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100',
};

function ToastIcon({ type }: { type: ToastType }) {
  if (type === 'loading') {
    return (
      <svg
        className="h-5 w-5 shrink-0 animate-spin text-blue-600 dark:text-blue-400"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    );
  }

  const icon =
    type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';

  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-sm font-bold" aria-hidden="true">
      {icon}
    </span>
  );
}

export function ToastContainer() {
  const toasts = useToastStore(state => state.toasts);
  const removeToast = useToastStore(state => state.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      aria-hidden={false}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${typeClasses[toast.type]}`}>
          <ToastIcon type={toast.type} />

          <p className="min-w-0 flex-1 text-sm font-medium">{toast.message}</p>

          {toast.action && (
            <button
              type="button"
              onClick={toast.action.onClick}
              className="shrink-0 text-sm font-semibold underline underline-offset-2 hover:no-underline">
              {toast.action.label}
            </button>
          )}

          {toast.type !== 'loading' && (
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              aria-label="Tutup notifikasi"
              className="shrink-0 text-current opacity-60 transition-opacity hover:opacity-100">
              <svg
                className="h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
