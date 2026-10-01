'use client';

/**
 * PlanDowngradeDialog — Confirmation dialog for subscription plan downgrades.
 *
 * Shows:
 * - Warning about the downgrade
 * - Features that will be lost
 * - Decreased limits with usage validation
 * - Current usage vs new limits comparison
 * - Blocking error if usage exceeds new plan limits
 *
 * SECURITY CONSIDERATIONS:
 * - UI validation is for UX; server-side validation enforced
 * - Downgrade blocked if current usage exceeds new plan limits
 *
 * @see Requirements 15.6 (Downgrade confirmation with warnings and lost features)
 * @see Requirements 15.6 (Check usage against new plan limits before downgrade)
 * @see Design Components > 9. Subscription Management
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import type { PlanComparisonResult, PlanFeatureItem } from '@core/domains/subscription/entities/AdminSubscriptionPlan';
import type { DowngradeValidationResult, DowngradeViolation } from '@core/domains/subscription/repositories/SubscriptionAdminRepository';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Plan summary for display in dialog.
 */
export interface PlanSummary {
  readonly id: string;
  readonly name: string;
  readonly tier: string;
  readonly price: number;
  readonly currency: string;
  readonly billingCycle: 'monthly' | 'yearly';
}

/**
 * Current usage metrics.
 */
export interface CurrentUsage {
  readonly members: number;
  readonly orgUnits: number;
  readonly storage: number; // bytes
}

/**
 * Props for PlanDowngradeDialog.
 */
export interface PlanDowngradeDialogProps {
  /**
   * Whether the dialog is open.
   */
  open: boolean;

  /**
   * Current plan summary.
   */
  currentPlan: PlanSummary;

  /**
   * Target plan summary (the plan being downgraded to).
   */
  targetPlan: PlanSummary;

  /**
   * Plan comparison result showing differences.
   */
  comparison: PlanComparisonResult | null;

  /**
   * Result of downgrade validation (usage check).
   */
  validationResult: DowngradeValidationResult | null;

  /**
   * Current usage metrics for display.
   */
  currentUsage: CurrentUsage | null;

  /**
   * New plan limits for comparison.
   */
  newLimits: {
    readonly maxMembers: number | null;
    readonly maxOrgUnits: number | null;
    readonly maxStorageBytes: number | null;
  } | null;

  /**
   * Whether the downgrade is in progress.
   */
  isLoading?: boolean;

  /**
   * Whether validation is in progress.
   */
  isValidating?: boolean;

  /**
   * Callback when user confirms downgrade.
   */
  onConfirm: () => void;

  /**
   * Callback when user cancels.
   */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Format price with currency.
 */
function formatPrice(price: number, currency: string, locale: string = 'id-ID'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Format storage from bytes to human-readable format.
 */
function formatStorage(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${Math.round(gb * 100) / 100} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

/**
 * Format limit value with unlimited handling.
 */
function formatLimit(value: number | null): string {
  return value === null ? '∞' : value.toLocaleString();
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Lost feature item.
 */
function LostFeatureItem({ feature }: { feature: PlanFeatureItem }) {
  const { t } = useTranslation();

  return (
    <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      <svg
        className="h-4 w-4 flex-shrink-0 text-red-500"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
      <span className="line-through decoration-red-400">
        {t(feature.nameKey, feature.key.replace(/_/g, ' '))}
      </span>
    </li>
  );
}

/**
 * Usage comparison row for downgrade validation.
 */
function UsageComparisonRow({
  labelKey,
  currentValue,
  newLimit,
  unit,
  isExceeding,
}: {
  labelKey: string;
  currentValue: number;
  newLimit: number | null;
  unit: string;
  isExceeding: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={`flex items-center justify-between rounded-lg px-3 py-2 ${
        isExceeding
          ? 'bg-red-50 dark:bg-red-900/20'
          : 'bg-gray-50 dark:bg-gray-800'
      }`}
    >
      <span className="text-sm text-gray-700 dark:text-gray-300">
        {t(labelKey)}
      </span>
      <div className="flex items-center gap-2">
        <span
          className={`text-sm font-medium ${
            isExceeding
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-900 dark:text-white'
          }`}
        >
          {currentValue} {unit}
        </span>
        <span className="text-gray-400">/</span>
        <span
          className={`text-sm font-medium ${
            isExceeding
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {formatLimit(newLimit)} {unit}
        </span>
        {isExceeding && (
          <svg
            className="h-4 w-4 text-red-500"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

/**
 * Warning banner for downgrade.
 */
function DowngradeWarningBanner() {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex items-start gap-3">
        <svg
          className="h-5 w-5 flex-shrink-0 text-amber-500"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <h4 className="font-medium text-amber-800 dark:text-amber-200">
            {t('subscription.downgrade_warning_title', 'Important')}
          </h4>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            {t(
              'subscription.downgrade_warning_description',
              'Downgrading will reduce your available features and limits. This change takes effect at the end of your current billing period.'
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Blocking error for exceeded limits.
 */
function ExceededLimitsError({
  violations,
}: {
  violations: readonly DowngradeViolation[];
}) {
  const { t } = useTranslation();

  return (
    <div
      className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <svg
          className="h-5 w-5 flex-shrink-0 text-red-500"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <h4 className="font-medium text-red-800 dark:text-red-200">
            {t('subscription.downgrade_blocked_title', 'Downgrade Not Available')}
          </h4>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
            {t(
              'subscription.downgrade_blocked_description',
              'Your current usage exceeds the limits of the target plan. Please reduce usage before downgrading.'
            )}
          </p>
          <ul className="mt-2 space-y-1">
            {violations.map(violation => (
              <li
                key={violation.type}
                className="text-sm text-red-600 dark:text-red-400"
              >
                • {t(violation.messageKey, {
                  current: violation.currentValue,
                  limit: violation.newLimit,
                })}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Price comparison for downgrade (showing savings).
 */
function PriceSavings({
  currentPrice,
  targetPrice,
  currency,
  billingCycle,
  locale,
}: {
  currentPrice: number;
  targetPrice: number;
  currency: string;
  billingCycle: string;
  locale: string;
}) {
  const { t } = useTranslation();
  const savings = currentPrice - targetPrice;
  const cycleLabel = billingCycle === 'yearly' ? t('subscription.per_year', '/year') : t('subscription.per_month', '/month');

  return (
    <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('subscription.downgrade_new_price', 'New Price')}
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {formatPrice(targetPrice, currency, locale)}{cycleLabel}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('subscription.downgrade_savings', 'Savings')}
          </p>
          <p className="text-lg font-medium text-green-600 dark:text-green-400">
            -{formatPrice(savings, currency, locale)}{cycleLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * PlanDowngradeDialog — Confirmation dialog for plan downgrades.
 *
 * @example
 * ```tsx
 * <PlanDowngradeDialog
 *   open={isDowngradeDialogOpen}
 *   currentPlan={currentPlan}
 *   targetPlan={targetPlan}
 *   comparison={comparisonResult}
 *   validationResult={validationResult}
 *   currentUsage={usage}
 *   newLimits={targetPlan.limits}
 *   isLoading={isDowngrading}
 *   isValidating={isValidatingDowngrade}
 *   onConfirm={handleDowngrade}
 *   onCancel={() => setIsDowngradeDialogOpen(false)}
 * />
 * ```
 */
export function PlanDowngradeDialog({
  open,
  currentPlan,
  targetPlan,
  comparison,
  validationResult,
  currentUsage,
  newLimits,
  isLoading = false,
  isValidating = false,
  onConfirm,
  onCancel,
}: PlanDowngradeDialogProps) {
  const { t, i18n } = useTranslation();

  // Determine if downgrade is blocked
  const isBlocked = validationResult?.allowed === false;
  const violations = validationResult?.violations ?? [];

  // Calculate which limits are exceeded
  const exceedingMetrics = useMemo(() => {
    const exceeding = new Set<string>();
    violations.forEach(v => {
      if (v.type === 'MEMBERS_EXCEEDED') exceeding.add('members');
      if (v.type === 'ORGUNITS_EXCEEDED') exceeding.add('orgUnits');
      if (v.type === 'STORAGE_EXCEEDED') exceeding.add('storage');
    });
    return exceeding;
  }, [violations]);

  // Don't render if not open
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="downgrade-dialog-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-2xl dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <svg
                className="h-6 w-6 text-amber-600 dark:text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </div>
            <div>
              <h2
                id="downgrade-dialog-title"
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                {t('subscription.downgrade_title', 'Downgrade to {{plan}}', {
                  plan: targetPlan.name,
                })}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('subscription.downgrade_subtitle', 'Review changes before downgrading')}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-5 px-6 py-4">
          {/* Loading state for validation */}
          {isValidating && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t('subscription.validating_downgrade', 'Checking usage limits...')}
                </span>
              </div>
            </div>
          )}

          {!isValidating && (
            <>
              {/* Blocked Error */}
              {isBlocked && violations.length > 0 && (
                <ExceededLimitsError violations={violations} />
              )}

              {/* Warning Banner */}
              {!isBlocked && <DowngradeWarningBanner />}

              {/* Price Savings */}
              <PriceSavings
                currentPrice={currentPlan.price}
                targetPrice={targetPlan.price}
                currency={targetPlan.currency}
                billingCycle={targetPlan.billingCycle}
                locale={i18n.language}
              />

              {/* Usage vs New Limits */}
              {currentUsage && newLimits && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {t('subscription.downgrade_usage_comparison', 'Current Usage vs New Limits')}
                  </h3>
                  <div className="space-y-2">
                    <UsageComparisonRow
                      labelKey="subscription.limit_members"
                      currentValue={currentUsage.members}
                      newLimit={newLimits.maxMembers}
                      unit=""
                      isExceeding={exceedingMetrics.has('members')}
                    />
                    <UsageComparisonRow
                      labelKey="subscription.limit_org_units"
                      currentValue={currentUsage.orgUnits}
                      newLimit={newLimits.maxOrgUnits}
                      unit=""
                      isExceeding={exceedingMetrics.has('orgUnits')}
                    />
                    <UsageComparisonRow
                      labelKey="subscription.limit_storage"
                      currentValue={Math.round(currentUsage.storage / (1024 * 1024 * 1024) * 100) / 100}
                      newLimit={newLimits.maxStorageBytes ? Math.round(newLimits.maxStorageBytes / (1024 * 1024 * 1024) * 100) / 100 : null}
                      unit="GB"
                      isExceeding={exceedingMetrics.has('storage')}
                    />
                  </div>
                </div>
              )}

              {/* Lost Features */}
              {comparison && comparison.featuresLost.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                    {t('subscription.downgrade_lost_features', 'Features You Will Lose')}
                  </h3>
                  <ul className="space-y-2">
                    {comparison.featuresLost.map(feature => (
                      <LostFeatureItem key={feature.key} feature={feature} />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <Button
            variant="ghost"
            size="md"
            onClick={onCancel}
            disabled={isLoading}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant={isBlocked ? 'secondary' : 'danger'}
            size="md"
            onClick={onConfirm}
            loading={isLoading}
            disabled={isBlocked || isValidating}
          >
            {isBlocked
              ? t('subscription.downgrade_blocked', 'Cannot Downgrade')
              : t('subscription.confirm_downgrade', 'Confirm Downgrade')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PlanDowngradeDialog;
