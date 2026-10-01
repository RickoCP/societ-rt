'use client';

/**
 * ImpersonationBanner — Displays a prominent banner during tenant impersonation.
 *
 * Shows:
 * - Impersonated tenant name
 * - Remaining time countdown (auto-expires after 30 minutes)
 * - "Exit Impersonation" button
 *
 * The banner is positioned prominently at the top of the viewport
 * to ensure the Platform Admin is always aware of impersonation mode.
 *
 * @see Requirements 20.3 (Display prominent impersonation banner)
 * @see Requirements 20.4 (Include Exit Impersonation button, log actions)
 * @see Requirements 20.5 (Exit impersonation restores PLATFORM_ADMIN context)
 * @see Task 28.4 (Create Impersonation Banner component)
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import { useImpersonationStore } from '@infrastructure/stateManagement/impersonationStore';
import { useAdminUiStore } from '@infrastructure/stateManagement/adminUiStore';
import {
  showSuccessToast,
  showErrorToast,
} from '@infrastructure/stateManagement/toastStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default impersonation duration in milliseconds (30 minutes).
 */
const DEFAULT_IMPERSONATION_DURATION_MS = 30 * 60 * 1000;

/**
 * Warning threshold - show warning when less than 5 minutes remaining.
 */
const WARNING_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Update interval for countdown timer (1 second).
 */
const COUNTDOWN_INTERVAL_MS = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImpersonationBannerProps {
  /**
   * Callback to handle ending impersonation.
   * Called when user clicks "Exit Impersonation" button.
   * Should call EndImpersonationUseCase and clear impersonation state.
   */
  onEndImpersonation?: () => Promise<void>;

  /**
   * CSS class name for styling overrides.
   */
  className?: string;

  /**
   * Whether the Exit Impersonation action is loading.
   */
  isExiting?: boolean;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Formats remaining time as MM:SS.
 *
 * @param milliseconds - Remaining time in milliseconds
 * @returns Formatted time string (e.g., "25:30")
 */
function formatRemainingTime(milliseconds: number): string {
  if (milliseconds <= 0) return '00:00';

  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ImpersonationBanner component.
 *
 * Displays a prominent banner during impersonation with tenant name,
 * countdown timer, and Exit button.
 */
export function ImpersonationBanner({
  onEndImpersonation,
  className = '',
  isExiting = false,
}: ImpersonationBannerProps) {
  const { t } = useTranslation();

  // Get impersonation state from stores
  const {
    isImpersonating,
    impersonatedTenantId,
    impersonatedTenantName,
    impersonationSessionId,
    endImpersonation: clearImpersonationState,
  } = useImpersonationStore();

  const { impersonationStartedAt, clearOriginalAuthContext } = useAdminUiStore();

  // Local state for countdown
  const [remainingTime, setRemainingTime] = useState<number>(
    DEFAULT_IMPERSONATION_DURATION_MS,
  );
  const [isExpired, setIsExpired] = useState(false);

  // ---------------------------------------------------------------------------
  // Countdown Timer Effect
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isImpersonating || !impersonationStartedAt) {
      return;
    }

    const calculateRemainingTime = () => {
      const elapsed = Date.now() - impersonationStartedAt.getTime();
      const remaining = DEFAULT_IMPERSONATION_DURATION_MS - elapsed;
      return Math.max(0, remaining);
    };

    // Initial calculation
    const initialRemaining = calculateRemainingTime();
    setRemainingTime(initialRemaining);

    if (initialRemaining <= 0) {
      setIsExpired(true);
      return;
    }

    // Update every second
    const intervalId = setInterval(() => {
      const remaining = calculateRemainingTime();
      setRemainingTime(remaining);

      if (remaining <= 0) {
        setIsExpired(true);
        clearInterval(intervalId);
      }
    }, COUNTDOWN_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isImpersonating, impersonationStartedAt]);

  // ---------------------------------------------------------------------------
  // Auto-Expire Effect
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (isExpired && isImpersonating) {
      // Auto-expire: show warning and trigger exit
      showErrorToast(t('impersonation.session_expired'));

      // Clear local state
      clearImpersonationState();
      clearOriginalAuthContext();

      // Trigger callback if provided (to call backend and reload)
      if (onEndImpersonation) {
        onEndImpersonation().catch(() => {
          // Error is handled in the callback
        });
      }
    }
  }, [
    isExpired,
    isImpersonating,
    clearImpersonationState,
    clearOriginalAuthContext,
    onEndImpersonation,
    t,
  ]);

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle Exit Impersonation button click.
   * Calls the provided callback and shows appropriate toast.
   */
  const handleExitImpersonation = useCallback(async () => {
    if (isExiting) return;

    try {
      if (onEndImpersonation) {
        await onEndImpersonation();
      }

      // Clear local state
      clearImpersonationState();
      clearOriginalAuthContext();

      showSuccessToast(t('impersonation.exit_success'));
    } catch (error) {
      showErrorToast(t('impersonation.exit_error'));
      // Re-throw for caller to handle
      throw error;
    }
  }, [
    onEndImpersonation,
    clearImpersonationState,
    clearOriginalAuthContext,
    isExiting,
    t,
  ]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Don't render if not impersonating
  if (!isImpersonating || !impersonatedTenantId) {
    return null;
  }

  const isWarning = remainingTime <= WARNING_THRESHOLD_MS && remainingTime > 0;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        fixed top-0 left-0 right-0 z-50
        flex items-center justify-between
        px-4 py-2
        ${isWarning ? 'bg-orange-600' : 'bg-purple-700'}
        text-white
        shadow-lg
        transition-colors duration-300
        ${className}
      `.trim()}
      data-testid="impersonation-banner"
    >
      {/* Left section: Icon and tenant name */}
      <div className="flex items-center gap-3">
        {/* Eye icon indicating impersonation */}
        <svg
          className="h-5 w-5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>

        {/* Impersonation message */}
        <span className="text-sm font-medium">
          {t('impersonation.banner_message', {
            tenantName: impersonatedTenantName ?? t('impersonation.unknown_tenant'),
          })}
        </span>
      </div>

      {/* Center section: Countdown timer */}
      <div className="flex items-center gap-2">
        {/* Clock icon */}
        <svg
          className="h-4 w-4 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        {/* Time remaining */}
        <span
          className={`
            text-sm font-mono font-semibold
            ${isWarning ? 'animate-pulse' : ''}
          `.trim()}
          aria-label={t('impersonation.time_remaining', {
            time: formatRemainingTime(remainingTime),
          })}
        >
          {formatRemainingTime(remainingTime)}
        </span>

        {isWarning && (
          <span className="text-xs opacity-80">
            {t('impersonation.expiring_soon')}
          </span>
        )}
      </div>

      {/* Right section: Exit button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleExitImpersonation}
        disabled={isExiting}
        className={`
          border-white text-white
          hover:bg-white hover:text-purple-700
          focus:ring-white focus:ring-offset-purple-700
          disabled:opacity-50 disabled:cursor-not-allowed
        `.trim()}
        aria-label={t('impersonation.exit_button')}
        data-testid="exit-impersonation-button"
      >
        {isExiting ? (
          <>
            {/* Loading spinner */}
            <svg
              className="animate-spin h-4 w-4 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            {t('impersonation.exiting')}
          </>
        ) : (
          <>
            {/* Exit icon */}
            <svg
              className="h-4 w-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            {t('impersonation.exit_button')}
          </>
        )}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default Export
// ---------------------------------------------------------------------------

export default ImpersonationBanner;
