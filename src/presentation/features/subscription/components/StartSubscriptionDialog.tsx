'use client';

/**
 * StartSubscriptionDialog — Dialog shown during trial to start a paid subscription.
 *
 * During trial mode, upgrade/downgrade buttons are hidden and replaced with
 * "Start Subscription" that opens this dialog. Users select a plan and billing
 * cycle to begin their paid subscription.
 *
 * SECURITY CONSIDERATIONS:
 * - UI selection is for UX; server-side authorization enforced
 * - Subscription start validated against trial status server-side
 *
 * @see Requirements 15.9 (Hide upgrade/downgrade during trial, show "Start Subscription")
 * @see Design Components > 9. Subscription Management
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import type { AdminSubscriptionPlan, BillingCycle } from '@core/domains/subscription/entities/AdminSubscriptionPlan';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for StartSubscriptionDialog.
 */
export interface StartSubscriptionDialogProps {
  /**
   * Whether the dialog is open.
   */
  open: boolean;

  /**
   * Available plans to choose from.
   */
  availablePlans: readonly AdminSubscriptionPlan[];

  /**
   * Days remaining in trial.
   */
  trialDaysRemaining: number;

  /**
   * Whether the subscription start is in progress.
   */
  isLoading?: boolean;

  /**
   * Callback when user confirms plan selection.
   */
  onConfirm: (planId: string, billingCycle: BillingCycle) => void;

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

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Billing cycle toggle.
 */
function BillingCycleToggle({
  value,
  onChange,
  yearlySavingsPercent,
}: {
  value: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
  yearlySavingsPercent: number | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center gap-2 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
      <button
        type="button"
        onClick={() => onChange('monthly')}
        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          value === 'monthly'
            ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
            : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
        }`}
      >
        {t('subscription.billing_monthly', 'Monthly')}
      </button>
      <button
        type="button"
        onClick={() => onChange('yearly')}
        className={`relative rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          value === 'yearly'
            ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
            : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
        }`}
      >
        {t('subscription.billing_yearly', 'Yearly')}
        {yearlySavingsPercent && yearlySavingsPercent > 0 && (
          <span className="absolute -right-2 -top-2 rounded-full bg-green-500 px-1.5 py-0.5 text-xs font-bold text-white">
            -{yearlySavingsPercent}%
          </span>
        )}
      </button>
    </div>
  );
}

/**
 * Plan selection card.
 */
function PlanSelectionCard({
  plan,
  isSelected,
  billingCycle,
  onSelect,
  locale,
}: {
  plan: AdminSubscriptionPlan;
  isSelected: boolean;
  billingCycle: BillingCycle;
  onSelect: () => void;
  locale: string;
}) {
  const { t } = useTranslation();

  const price = billingCycle === 'yearly' ? plan.pricing.yearlyPrice : plan.pricing.monthlyPrice;
  const cycleLabel = billingCycle === 'yearly' ? t('subscription.per_year', '/year') : t('subscription.per_month', '/month');

  // Tier badge colors
  const tierColors: Record<string, string> = {
    FREE: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    BASIC: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    PRO: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    ENTERPRISE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border-2 p-4 text-left transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:border-blue-400 dark:bg-blue-900/20'
          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-gray-900 dark:text-white">{plan.name}</h4>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tierColors[plan.tier] ?? tierColors.BASIC}`}>
              {plan.tier}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t(plan.descriptionKey, plan.name)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900 dark:text-white">
            {formatPrice(price, plan.pricing.currency, locale)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{cycleLabel}</p>
        </div>
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="mt-3 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
          <svg
            className="h-4 w-4"
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
          <span>{t('subscription.plan_selected', 'Selected')}</span>
        </div>
      )}
    </button>
  );
}

/**
 * Trial info banner.
 */
function TrialInfoBanner({ daysRemaining }: { daysRemaining: number }) {
  const { t } = useTranslation();
  const isUrgent = daysRemaining <= 3;

  return (
    <div
      className={`rounded-lg p-4 ${
        isUrgent
          ? 'border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
          : 'border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl" role="img" aria-hidden="true">
          {isUrgent ? '⏰' : '🎁'}
        </span>
        <div>
          <p
            className={`font-medium ${
              isUrgent
                ? 'text-red-800 dark:text-red-200'
                : 'text-blue-800 dark:text-blue-200'
            }`}
          >
            {t('subscription.trial_active', 'Trial Active')}
          </p>
          <p
            className={`text-sm ${
              isUrgent
                ? 'text-red-600 dark:text-red-400'
                : 'text-blue-600 dark:text-blue-400'
            }`}
          >
            {t('subscription.trial_days_remaining_detail', '{{count}} days remaining in your free trial', {
              count: daysRemaining,
            })}
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
 * StartSubscriptionDialog — Dialog for starting a paid subscription during trial.
 *
 * @example
 * ```tsx
 * <StartSubscriptionDialog
 *   open={isStartDialogOpen}
 *   availablePlans={plans}
 *   trialDaysRemaining={14}
 *   isLoading={isStarting}
 *   onConfirm={(planId, cycle) => handleStartSubscription(planId, cycle)}
 *   onCancel={() => setIsStartDialogOpen(false)}
 * />
 * ```
 */
export function StartSubscriptionDialog({
  open,
  availablePlans,
  trialDaysRemaining,
  isLoading = false,
  onConfirm,
  onCancel,
}: StartSubscriptionDialogProps) {
  const { t, i18n } = useTranslation();

  // Local state
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  // Get selected plan
  const selectedPlan = useMemo(
    () => availablePlans.find(p => p.id === selectedPlanId) ?? null,
    [availablePlans, selectedPlanId]
  );

  // Get maximum yearly savings percent
  const maxYearlySavings = useMemo(() => {
    const savings = availablePlans
      .map(p => p.pricing.yearlySavingsPercent)
      .filter((s): s is number => s !== null);
    return savings.length > 0 ? Math.max(...savings) : null;
  }, [availablePlans]);

  // Handler for confirm
  const handleConfirm = () => {
    if (selectedPlanId) {
      onConfirm(selectedPlanId, billingCycle);
    }
  };

  // Don't render if not open
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-subscription-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <svg
                className="h-6 w-6 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            </div>
            <div>
              <h2
                id="start-subscription-title"
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                {t('subscription.start_subscription_title', 'Start Your Subscription')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('subscription.start_subscription_subtitle', 'Choose a plan that works for you')}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-5 px-6 py-4">
          {/* Trial Info */}
          <TrialInfoBanner daysRemaining={trialDaysRemaining} />

          {/* Billing Cycle Toggle */}
          <div className="flex justify-center">
            <BillingCycleToggle
              value={billingCycle}
              onChange={setBillingCycle}
              yearlySavingsPercent={maxYearlySavings}
            />
          </div>

          {/* Plan Selection */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
              {t('subscription.select_plan', 'Select a Plan')}
            </h3>
            <div className="space-y-3">
              {availablePlans
                .filter(plan => plan.isAvailable && plan.tier !== 'FREE')
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map(plan => (
                  <PlanSelectionCard
                    key={plan.id}
                    plan={plan}
                    isSelected={selectedPlanId === plan.id}
                    billingCycle={billingCycle}
                    onSelect={() => setSelectedPlanId(plan.id)}
                    locale={i18n.language}
                  />
                ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <Button
            variant="ghost"
            size="md"
            onClick={onCancel}
            disabled={isLoading}
          >
            {t('subscription.continue_trial', 'Continue Trial')}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleConfirm}
            loading={isLoading}
            disabled={!selectedPlanId}
          >
            {t('subscription.start_subscription_button', 'Start Subscription')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default StartSubscriptionDialog;
