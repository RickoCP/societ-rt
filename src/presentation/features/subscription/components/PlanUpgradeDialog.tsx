'use client';

/**
 * PlanUpgradeDialog — Confirmation dialog for subscription plan upgrades.
 *
 * Shows:
 * - Price difference between current and target plan
 * - New features that will become available
 * - Increased limits
 * - Confirmation button
 *
 * SECURITY CONSIDERATIONS:
 * - UI confirmation is for UX; server-side authorization enforced
 * - Plan changes validated against entitlement rules server-side
 *
 * @see Requirements 15.5 (Upgrade confirmation with price difference and new features)
 * @see Design Components > 9. Subscription Management
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import type { PlanComparisonResult, PlanFeatureItem } from '@core/domains/subscription/entities/AdminSubscriptionPlan';

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
 * Props for PlanUpgradeDialog.
 */
export interface PlanUpgradeDialogProps {
  /**
   * Whether the dialog is open.
   */
  open: boolean;

  /**
   * Current plan summary.
   */
  currentPlan: PlanSummary;

  /**
   * Target plan summary (the plan being upgraded to).
   */
  targetPlan: PlanSummary;

  /**
   * Plan comparison result showing differences.
   */
  comparison: PlanComparisonResult | null;

  /**
   * Whether the upgrade is in progress.
   */
  isLoading?: boolean;

  /**
   * Callback when user confirms upgrade.
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
 * Format storage limit change.
 */
function formatStorageChange(bytes: number | null): string | null {
  if (bytes === null) return null;
  const gb = Math.abs(bytes) / (1024 * 1024 * 1024);
  const prefix = bytes >= 0 ? '+' : '';
  if (gb >= 1) {
    return `${prefix}${Math.round(gb)} GB`;
  }
  const mb = Math.abs(bytes) / (1024 * 1024);
  return `${prefix}${Math.round(mb)} MB`;
}

/**
 * Format numeric limit change.
 */
function formatLimitChange(value: number | null): string | null {
  if (value === null) return null;
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toLocaleString()}`;
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Feature item in the "new features" list.
 */
function NewFeatureItem({ feature }: { feature: PlanFeatureItem }) {
  const { t } = useTranslation();

  return (
    <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      <svg
        className="h-4 w-4 flex-shrink-0 text-green-500"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
      <span>{t(feature.nameKey, feature.key.replace(/_/g, ' '))}</span>
    </li>
  );
}

/**
 * Limit increase item.
 */
function LimitIncreaseItem({
  labelKey,
  change,
}: {
  labelKey: string;
  change: string;
}) {
  const { t } = useTranslation();

  return (
    <li className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      <svg
        className="h-4 w-4 flex-shrink-0 text-blue-500"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-11.707a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414l-3-3z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        {t(labelKey)}: <span className="font-medium text-green-600 dark:text-green-400">{change}</span>
      </span>
    </li>
  );
}

/**
 * Price comparison display.
 */
function PriceComparison({
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
  const priceDiff = targetPrice - currentPrice;
  const cycleLabel = billingCycle === 'yearly' ? t('subscription.per_year', '/year') : t('subscription.per_month', '/month');

  return (
    <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('subscription.upgrade_current_price', 'Current')}
          </p>
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
            {formatPrice(currentPrice, currency, locale)}{cycleLabel}
          </p>
        </div>
        <svg
          className="h-6 w-6 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 8l4 4m0 0l-4 4m4-4H3"
          />
        </svg>
        <div className="text-right">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('subscription.upgrade_new_price', 'New')}
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {formatPrice(targetPrice, currency, locale)}{cycleLabel}
          </p>
        </div>
      </div>

      {/* Price difference */}
      <div className="mt-3 flex items-center justify-center gap-2 rounded-md bg-blue-50 px-3 py-2 dark:bg-blue-900/30">
        <svg
          className="h-5 w-5 text-blue-600 dark:text-blue-400"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
          {t('subscription.upgrade_price_difference', '+{{amount}} {{cycle}}', {
            amount: formatPrice(priceDiff, currency, locale),
            cycle: billingCycle === 'yearly' ? t('subscription.yearly', 'yearly') : t('subscription.monthly', 'monthly'),
          })}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * PlanUpgradeDialog — Confirmation dialog for plan upgrades.
 *
 * @example
 * ```tsx
 * <PlanUpgradeDialog
 *   open={isUpgradeDialogOpen}
 *   currentPlan={currentPlan}
 *   targetPlan={targetPlan}
 *   comparison={comparisonResult}
 *   isLoading={isUpgrading}
 *   onConfirm={handleUpgrade}
 *   onCancel={() => setIsUpgradeDialogOpen(false)}
 * />
 * ```
 */
export function PlanUpgradeDialog({
  open,
  currentPlan,
  targetPlan,
  comparison,
  isLoading = false,
  onConfirm,
  onCancel,
}: PlanUpgradeDialogProps) {
  const { t, i18n } = useTranslation();

  // Calculate limit changes for display
  const limitChanges = useMemo(() => {
    if (!comparison) return [];

    const changes: { labelKey: string; change: string }[] = [];

    if (comparison.limitChanges.members !== null && comparison.limitChanges.members > 0) {
      const formatted = formatLimitChange(comparison.limitChanges.members);
      if (formatted) {
        changes.push({
          labelKey: 'subscription.limit_members',
          change: formatted,
        });
      }
    }

    if (comparison.limitChanges.orgUnits !== null && comparison.limitChanges.orgUnits > 0) {
      const formatted = formatLimitChange(comparison.limitChanges.orgUnits);
      if (formatted) {
        changes.push({
          labelKey: 'subscription.limit_org_units',
          change: formatted,
        });
      }
    }

    if (comparison.limitChanges.storageBytes !== null && comparison.limitChanges.storageBytes > 0) {
      const formatted = formatStorageChange(comparison.limitChanges.storageBytes);
      if (formatted) {
        changes.push({
          labelKey: 'subscription.limit_storage',
          change: formatted,
        });
      }
    }

    return changes;
  }, [comparison]);

  // Don't render if not open
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-dialog-title"
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <svg
                className="h-6 w-6 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
            </div>
            <div>
              <h2
                id="upgrade-dialog-title"
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                {t('subscription.upgrade_title', 'Upgrade to {{plan}}', {
                  plan: targetPlan.name,
                })}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('subscription.upgrade_subtitle', 'Unlock more features and higher limits')}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 px-6 py-4">
          {/* Price Comparison */}
          <PriceComparison
            currentPrice={currentPlan.price}
            targetPrice={targetPlan.price}
            currency={targetPlan.currency}
            billingCycle={targetPlan.billingCycle}
            locale={i18n.language}
          />

          {/* New Features */}
          {comparison && comparison.featuresGained.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                {t('subscription.upgrade_new_features', 'New Features')}
              </h3>
              <ul className="space-y-2">
                {comparison.featuresGained.map(feature => (
                  <NewFeatureItem key={feature.key} feature={feature} />
                ))}
              </ul>
            </div>
          )}

          {/* Increased Limits */}
          {limitChanges.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                {t('subscription.upgrade_increased_limits', 'Increased Limits')}
              </h3>
              <ul className="space-y-2">
                {limitChanges.map(item => (
                  <LimitIncreaseItem
                    key={item.labelKey}
                    labelKey={item.labelKey}
                    change={item.change}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <Button
            variant="ghost"
            size="md"
            onClick={onCancel}
            disabled={isLoading}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={onConfirm}
            loading={isLoading}
          >
            {t('subscription.confirm_upgrade', 'Confirm Upgrade')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PlanUpgradeDialog;
