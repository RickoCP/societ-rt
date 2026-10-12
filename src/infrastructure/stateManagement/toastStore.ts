/**
 * Toast Store — Manages toast notification state with auto-dismiss functionality.
 *
 * Uses Zustand for shared UI state (not business logic).
 *
 * Features:
 * - Add toasts with configurable type, message, duration, and optional action
 * - Auto-generated unique IDs for each toast
 * - Auto-dismiss: 3s for success, 5s for error (per Requirements 24.6, 24.7)
 * - Manual dismiss via removeToast
 * - ARIA live region support for screen reader announcements (Requirements 23.10)
 *
 * _Requirements: 24.6, 24.7, 23.10_
 */

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface ToastConfig {
  readonly type: ToastType;
  readonly message: string;
  readonly duration?: number; // in milliseconds, optional override
  readonly action?: ToastAction;
  /** Suppress ARIA announcement (for programmatic toasts that shouldn't be announced) */
  readonly silent?: boolean;
}

export interface Toast extends ToastConfig {
  readonly id: string;
}

interface ToastState {
  readonly toasts: Toast[];
  addToast: (config: ToastConfig) => string;
  /**
   * Replace an existing toast's content/type in place. Used to turn a
   * persistent `loading` toast into a `success`/`error` toast once the
   * underlying async operation settles. Re-applies the auto-dismiss timer
   * for the new type. Falls back to adding a new toast if the id is gone.
   */
  updateToast: (id: string, config: ToastConfig) => void;
  removeToast: (id: string) => void;
  clearAllToasts: () => void;
}

// Default durations per type (in milliseconds)
// A duration of 0 means "no auto-dismiss" (must be dismissed manually or
// replaced via updateToast). Loading toasts are persistent by design.
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000, // 3 seconds
  error: 5000, // 5 seconds
  warning: 5000, // 5 seconds (same as error)
  info: 4000, // 4 seconds
  loading: 0, // persistent until updated or removed
};

// Counter for generating unique IDs
let toastIdCounter = 0;

function generateToastId(): string {
  toastIdCounter += 1;
  return `toast-${Date.now()}-${toastIdCounter}`;
}

/**
 * Announces a message to screen readers via ARIA live region.
 * Creates the live region element if it doesn't exist.
 *
 * @see Requirements 23.10 (ARIA live regions for dynamic content)
 */
function announceToScreenReader(message: string, type: ToastType): void {
  // Determine politeness based on toast type
  // Error/warning should be assertive, success/info should be polite
  const politeness = type === 'error' || type === 'warning' ? 'assertive' : 'polite';
  
  // Get or create the ARIA live region element
  let liveRegion = document.getElementById('toast-aria-live-region');
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.id = 'toast-aria-live-region';
    liveRegion.setAttribute('aria-live', politeness);
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.setAttribute('role', 'status');
    // Visually hidden but accessible to screen readers
    liveRegion.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `;
    document.body.appendChild(liveRegion);
  }

  // Update politeness level if different
  liveRegion.setAttribute('aria-live', politeness);
  
  // Clear and then set content (ensures screen reader picks up the change)
  liveRegion.textContent = '';
  
  // Use requestAnimationFrame to ensure the clear is processed first
  requestAnimationFrame(() => {
    if (liveRegion) {
      liveRegion.textContent = message;
    }
  });
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (config: ToastConfig): string => {
    const id = generateToastId();
    const duration = config.duration ?? DEFAULT_DURATIONS[config.type];

    const toast: Toast = {
      id,
      type: config.type,
      message: config.message,
      duration,
      action: config.action,
      silent: config.silent,
    };

    set(state => ({
      toasts: [...state.toasts, toast],
    }));

    // Announce to screen readers (unless silent)
    if (!config.silent && typeof document !== 'undefined') {
      announceToScreenReader(config.message, config.type);
    }

    // Set up auto-dismiss timer
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }

    return id;
  },

  updateToast: (id: string, config: ToastConfig): void => {
    const exists = get().toasts.some(toast => toast.id === id);

    // If the toast was already dismissed, surface the result as a new toast
    // so the outcome is never silently lost.
    if (!exists) {
      get().addToast(config);
      return;
    }

    const duration = config.duration ?? DEFAULT_DURATIONS[config.type];

    set(state => ({
      toasts: state.toasts.map(toast =>
        toast.id === id
          ? {
              id,
              type: config.type,
              message: config.message,
              duration,
              action: config.action,
              silent: config.silent,
            }
          : toast,
      ),
    }));

    if (!config.silent && typeof document !== 'undefined') {
      announceToScreenReader(config.message, config.type);
    }

    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }
  },

  removeToast: (id: string): void => {
    set(state => ({
      toasts: state.toasts.filter(toast => toast.id !== id),
    }));
  },

  clearAllToasts: (): void => {
    set({ toasts: [] });
  },
}));

// Convenience helpers for common toast types
export const showSuccessToast = (
  message: string,
  action?: ToastAction
): string => {
  return useToastStore.getState().addToast({
    type: 'success',
    message,
    action,
  });
};

export const showErrorToast = (message: string, action?: ToastAction): string => {
  return useToastStore.getState().addToast({
    type: 'error',
    message,
    action,
  });
};

export const showWarningToast = (
  message: string,
  action?: ToastAction
): string => {
  return useToastStore.getState().addToast({
    type: 'warning',
    message,
    action,
  });
};

export const showInfoToast = (message: string, action?: ToastAction): string => {
  return useToastStore.getState().addToast({
    type: 'info',
    message,
    action,
  });
};

/**
 * Show a persistent loading toast (does not auto-dismiss) and return its id.
 * Resolve it afterwards with {@link updateToast} to swap in a success/error
 * toast, or with {@link useToastStore.getState().removeToast} to clear it.
 */
export const showLoadingToast = (message: string): string => {
  return useToastStore.getState().addToast({
    type: 'loading',
    message,
  });
};

/**
 * Replace an existing toast (typically a loading toast) with a new one.
 * Thin wrapper over the store's updateToast for ergonomic call sites.
 */
export const updateToast = (
  id: string,
  config: ToastConfig,
): void => {
  useToastStore.getState().updateToast(id, config);
};
