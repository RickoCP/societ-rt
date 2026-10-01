'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useCallback, Suspense } from 'react';
import { Button } from '@presentation/components/atoms/Button';

/**
 * i18n key mapping for common denial reasons.
 * These codes can be passed via the `reason` query parameter.
 */
const REASON_I18N_KEYS: Record<string, string> = {
  permission_denied: 'unauthorized.reason.permission_denied',
  role_insufficient: 'unauthorized.reason.role_insufficient',
  tenant_access_denied: 'unauthorized.reason.tenant_access_denied',
  session_expired: 'unauthorized.reason.session_expired',
  resource_not_accessible: 'unauthorized.reason.resource_not_accessible',
  feature_not_available: 'unauthorized.reason.feature_not_available',
  subscription_limit: 'unauthorized.reason.subscription_limit',
  suspended: 'unauthorized.reason.suspended',
};

/**
 * Default reasons messages for fallback.
 */
const DEFAULT_REASONS: Record<string, string> = {
  permission_denied: 'You do not have the required permissions to access this page.',
  role_insufficient: 'Your role does not grant access to this resource.',
  tenant_access_denied: 'You do not have access to this tenant or organization.',
  session_expired: 'Your session has expired. Please log in again.',
  resource_not_accessible: 'The requested resource is not accessible.',
  feature_not_available: 'This feature is not available for your account.',
  subscription_limit: 'This feature requires a higher subscription plan.',
  suspended: 'Your account has been suspended. Please contact an administrator.',
};

/**
 * Inner content component that reads search params.
 * Wrapped in Suspense to support useSearchParams in Next.js 14+.
 */
function UnauthorizedContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get optional reason code from URL params
  const reasonCode = searchParams.get('reason');
  // Get optional custom message from URL params (URL-encoded)
  const customMessage = searchParams.get('message');
  // Get optional redirect URL for "Go Back" (defaults to browser back)
  const redirectUrl = searchParams.get('redirect');

  /**
   * Determine the reason message to display.
   * Priority: custom message > i18n mapped reason > default reason > generic message
   */
  const getReasonMessage = useCallback(() => {
    if (customMessage) {
      return decodeURIComponent(customMessage);
    }

    if (reasonCode && REASON_I18N_KEYS[reasonCode]) {
      return t(REASON_I18N_KEYS[reasonCode], DEFAULT_REASONS[reasonCode] || '');
    }

    if (reasonCode && DEFAULT_REASONS[reasonCode]) {
      return DEFAULT_REASONS[reasonCode];
    }

    return null;
  }, [customMessage, reasonCode, t]);

  const reasonMessage = getReasonMessage();

  /**
   * Handle "Go Back" button click.
   * Uses redirect URL if provided, otherwise browser history.
   */
  const handleGoBack = useCallback(() => {
    if (redirectUrl) {
      router.push(decodeURIComponent(redirectUrl));
    } else if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  }, [redirectUrl, router]);

  /**
   * Handle "Go to Dashboard" button click.
   */
  const handleGoToDashboard = useCallback(() => {
    router.push('/');
  }, [router]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900"
      role="main"
      aria-labelledby="unauthorized-title">
      {/* Lock Icon */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <svg
          className="h-10 w-10 text-red-600 dark:text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>

      {/* Title */}
      <h1
        id="unauthorized-title"
        className="text-center text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
        {t('unauthorized.title', 'Access Denied')}
      </h1>

      {/* Description */}
      <p className="mt-3 max-w-md text-center text-gray-600 dark:text-gray-400">
        {t(
          'unauthorized.description',
          'You do not have permission to access this page or resource.'
        )}
      </p>

      {/* Reason (if provided) */}
      {reasonMessage && (
        <div
          className="mt-6 max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-700/50 dark:bg-amber-900/20"
          role="alert"
          aria-live="polite">
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {t('unauthorized.reason_label', 'Reason')}
              </p>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                {reasonMessage}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button
          variant="secondary"
          onClick={handleGoBack}
          aria-label={t('unauthorized.go_back_aria', 'Go back to the previous page')}>
          <svg
            className="mr-2 h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          {t('unauthorized.go_back', 'Go Back')}
        </Button>
        <Button
          variant="primary"
          onClick={handleGoToDashboard}
          aria-label={t('unauthorized.go_to_dashboard_aria', 'Navigate to dashboard')}>
          <svg
            className="mr-2 h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
          {t('unauthorized.go_to_dashboard', 'Go to Dashboard')}
        </Button>
      </div>

      {/* Help Text */}
      <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-500">
        {t(
          'unauthorized.help_text',
          'If you believe this is an error, please contact your administrator.'
        )}
      </p>
    </div>
  );
}

/**
 * Loading fallback for Suspense boundary.
 */
function UnauthorizedLoading() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900"
      role="main">
      {/* Skeleton Lock Icon */}
      <div className="mb-6 h-20 w-20 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
      {/* Skeleton Title */}
      <div className="h-8 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      {/* Skeleton Description */}
      <div className="mt-3 h-4 w-72 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      {/* Skeleton Buttons */}
      <div className="mt-8 flex gap-3">
        <div className="h-10 w-28 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-36 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}

/**
 * Unauthorized page component.
 *
 * Displays a user-friendly message when access is denied.
 * Supports optional query parameters:
 * - `reason`: A predefined reason code (e.g., 'permission_denied', 'role_insufficient')
 * - `message`: A custom URL-encoded message to display
 * - `redirect`: A URL to navigate to when clicking "Go Back"
 *
 * @example
 * // Basic usage
 * /unauthorized
 *
 * @example
 * // With reason code
 * /unauthorized?reason=permission_denied
 *
 * @example
 * // With custom message
 * /unauthorized?message=You%20need%20ADMIN%20role%20to%20access%20this%20feature
 *
 * @example
 * // With redirect URL
 * /unauthorized?reason=role_insufficient&redirect=%2Fdashboard
 *
 * @see Requirements 22.7 - Unauthorized access graceful handling
 */
export default function UnauthorizedPage() {
  return (
    <Suspense fallback={<UnauthorizedLoading />}>
      <UnauthorizedContent />
    </Suspense>
  );
}
