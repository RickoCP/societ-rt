'use client';

/**
 * SubscriptionScreen — Admin screen for viewing subscription plan and usage.
 *
 * Displays comprehensive subscription information:
 * - Current plan details (name, tier, status, billing period)
 * - Feature list with included/excluded indicators
 * - Usage metrics with progress bars and warnings
 * - Trial countdown and past due warnings
 * - Plan comparison and upgrade/downgrade flow
 *
 * This screen follows the Clean Architecture pattern:
 * Screen → ViewModel → UseCase → Repository
 *
 * Features:
 * - Card-based responsive layout
 * - Color-coded status badges
 * - Progress bars with threshold warnings (green < 80%, amber >= 80%, red >= 100%)
 * - PAST_DUE warning banner
 * - Trial countdown badge
 * - View Plans and Manage Subscription buttons
 * - Mobile responsive design
 * - Permission guard requiring `tenant:manage`
 * - Upgrade confirmation with price difference and new features
 * - Downgrade confirmation with warnings and lost features
 * - Trial mode: "Start Subscription" instead of upgrade/downgrade
 *
 * @see Requirements 14.1-14.9 (Subscription Plan Overview)
 * @see Requirements 15.5-15.9 (Plan Upgrade/Downgrade Flow)
 * @see Design Components > 9. Subscription Management
 */

import { useTranslation } from 'react-i18next';
import { PermissionGuard } from '@presentation/components/atoms/PermissionGuard';
import { Button } from '@presentation/components/atoms/Button';
import {
  useSubscriptionViewModel,
  type UsageMetric,
  type PlanFeatureDisplay,
} from '../viewModel/useSubscriptionViewModel';
import {
  PlanComparisonCard,
  PlanUpgradeDialog,
  PlanDowngradeDialog,
  StartSubscriptionDialog,
  type SubscriptionPlanDisplay,
  type PlanTier,
} from '../components';
import type { AdminSubscriptionPlan } from '@core/domains/subscription/entities/AdminSubscriptionPlan';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Subscription status display configuration.
 */
const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; icon: string }
> = {
  TRIAL: {
    label: 'Trial',
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    icon: '🎁',
  },
  ACTIVE: {
    label: 'Active',
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    icon: '✅',
  },
  PAST_DUE: {
    label: 'Past Due',
    color: 'text-orange-700 dark:text-orange-300',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    icon: '⚠️',
  },
  SUSPENDED: {
    label: 'Suspended',
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    icon: '⏸️',
  },
  CLOSED: {
    label: 'Closed',
    color: 'text-gray-700 dark:text-gray-300',
    bgColor: 'bg-gray-100 dark:bg-gray-900/30',
    icon: '🔒',
  },
};

/**
 * Plan tier badge colors.
 */
const TIER_CONFIG: Record<
  string,
  { color: string; bgColor: string }
> = {
  Basic: {
    color: 'text-gray-700 dark:text-gray-200',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
  Standard: {
    color: 'text-blue-700 dark:text-blue-200',
    bgColor: 'bg-blue-100 dark:bg-blue-900/40',
  },
  Pro: {
    color: 'text-purple-700 dark:text-purple-200',
    bgColor: 'bg-purple-100 dark:bg-purple-900/40',
  },
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Breadcrumb navigation for subscription page.
 */
function SubscriptionBreadcrumb() {
  const { t } = useTranslation();

  return (
    <nav className="mb-4 flex items-center gap-2 text-sm" aria-label="Breadcrumb">
      <a
        href="/dashboard"
        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
        {t('navigation.dashboard', 'Dashboard')}
      </a>
      <svg
        className="h-4 w-4 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
      <a
        href="/dashboard/administration"
        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
        {t('navigation.administration', 'Administration')}
      </a>
      <svg
        className="h-4 w-4 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
      <span className="font-medium text-gray-900 dark:text-white">
        {t('subscription.title', 'Subscription')}
      </span>
    </nav>
  );
}

/**
 * Loading skeleton for the subscription screen.
 */
function SubscriptionSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-72 rounded bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* Plan card skeleton */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="h-6 w-32 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="h-8 w-20 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>

      {/* Features skeleton */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <div className="h-5 w-24 rounded bg-gray-200 dark:bg-gray-700 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      </div>

      {/* Usage skeleton */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
        <div className="h-5 w-20 rounded bg-gray-200 dark:bg-gray-700 mb-4" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-2 w-full rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Error state component with retry button.
 */
function SubscriptionError({
  error,
  onRetry,
}: {
  error: { code: string; message: string } | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 py-12 dark:border-red-900 dark:bg-red-900/20">
      <svg
        className="mb-4 h-12 w-12 text-red-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <h3 className="text-lg font-medium text-red-800 dark:text-red-200">
        {t('subscription.fetch_error', 'Failed to load subscription')}
      </h3>
      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
        {t(
          'subscription.generic_error',
          'An error occurred while fetching subscription data. Please try again.',
        )}
      </p>
      {error?.code && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-500">
          {t('common.error_code', 'Error code: {{code}}', { code: error.code })}
        </p>
      )}
      <Button variant="primary" size="sm" onClick={onRetry} className="mt-4">
        {t('subscription.retry', 'Retry')}
      </Button>
    </div>
  );
}

/**
 * Unauthorized message component.
 * @see Requirements 14.2
 */
function UnauthorizedMessage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <svg
        className="mb-4 h-12 w-12 text-gray-400"
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
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">
        {t('subscription.unauthorized', 'Access Denied')}
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t(
          'subscription.unauthorized_description',
          'You do not have permission to view subscription information.',
        )}
      </p>
    </div>
  );
}

/**
 * Past Due Warning Banner.
 * @see Requirements 14.5
 */
function PastDueWarningBanner() {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="rounded-lg border border-orange-300 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/30">
      <div className="flex items-start gap-3">
        <span className="text-2xl" role="img" aria-hidden="true">
          ⚠️
        </span>
        <div>
          <h3 className="font-medium text-orange-800 dark:text-orange-200">
            {t('subscription.past_due_warning', 'Payment Past Due')}
          </h3>
          <p className="mt-1 text-sm text-orange-700 dark:text-orange-300">
            {t(
              'subscription.past_due_description',
              'Your payment is overdue. Please update your payment method to avoid service interruption.',
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Trial Countdown Badge.
 * @see Requirements 14.6
 */
function TrialCountdownBadge({ daysRemaining }: { daysRemaining: number }) {
  const { t } = useTranslation();

  const isUrgent = daysRemaining <= 3;

  return (
    <div
      className={`
        inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium
        ${
          isUrgent
            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
        }
      `}>
      <span role="img" aria-hidden="true">
        ⏳
      </span>
      <span>
        {t('subscription.trial_days_remaining', '{{count}} days left in trial', {
          count: daysRemaining,
        })}
      </span>
    </div>
  );
}

/**
 * Status Badge Component.
 */
function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.ACTIVE;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${config.bgColor} ${config.color}`}>
      <span role="img" aria-hidden="true">
        {config.icon}
      </span>
      {t(`subscription.status_${status.toLowerCase()}`, config.label)}
    </span>
  );
}

/**
 * Tier Badge Component.
 */
function TierBadge({ tier }: { tier: string }) {
  const config = TIER_CONFIG[tier] ?? TIER_CONFIG.Basic;

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${config.bgColor} ${config.color}`}>
      {tier}
    </span>
  );
}

/**
 * Current Plan Card.
 * @see Requirements 14.3
 */
function CurrentPlanCard({
  plan,
  status,
  billingPeriod,
  trialDaysRemaining,
  isTrialActive,
}: {
  plan: {
    name: string;
    tier: string;
    price: number;
    currency: string;
    billingCycle: string;
  } | null;
  status: string | null;
  billingPeriod: {
    start: Date | null;
    end: Date | null;
    daysRemaining: number;
  };
  trialDaysRemaining: number | null;
  isTrialActive: boolean;
}) {
  const { t } = useTranslation();

  if (!plan) return null;

  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatPrice = (price: number, currency: string, cycle: string) => {
    const formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    });
    const cycleLabel = cycle === 'yearly' ? '/year' : '/month';
    return `${formatter.format(price)}${cycleLabel}`;
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Plan Info */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {plan.name}
            </h2>
            <TierBadge tier={plan.tier} />
            {status && <StatusBadge status={status} />}
          </div>

          {/* Price */}
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatPrice(plan.price, plan.currency, plan.billingCycle)}
          </p>

          {/* Billing Period */}
          {!isTrialActive && billingPeriod.start && billingPeriod.end && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('subscription.billing_period', 'Billing period: {{start}} - {{end}}', {
                start: formatDate(billingPeriod.start),
                end: formatDate(billingPeriod.end),
              })}
            </p>
          )}
        </div>

        {/* Trial Badge */}
        {isTrialActive && trialDaysRemaining !== null && (
          <TrialCountdownBadge daysRemaining={trialDaysRemaining} />
        )}
      </div>
    </div>
  );
}

/**
 * Feature List Card.
 * @see Requirements 14.4
 */
function FeatureListCard({
  features,
}: {
  features: readonly PlanFeatureDisplay[];
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
        {t('subscription.features_title', 'Features')}
      </h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {features.map(feature => (
          <div
            key={feature.key}
            className={`flex items-center gap-2 ${
              feature.included
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-400 dark:text-gray-500'
            }`}>
            {/* Checkmark or X */}
            {feature.included ? (
              <svg
                className="h-5 w-5 flex-shrink-0 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5 flex-shrink-0 text-gray-300 dark:text-gray-600"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            )}

            {/* Feature Name */}
            <span className="text-sm">
              {t(feature.nameKey, feature.key.replace(/_/g, ' '))}
              {feature.safetyCritical && (
                <span
                  className="ml-1 text-xs text-blue-600 dark:text-blue-400"
                  title={t('subscription.safety_critical', 'Always available')}>
                  ★
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Usage Progress Bar Component.
 */
function UsageProgressBar({
  metric,
}: {
  metric: UsageMetric;
}) {
  const { t } = useTranslation();

  // Determine bar color based on percentage
  const getBarColor = () => {
    if (metric.isCritical) return 'bg-red-500';
    if (metric.isWarning) return 'bg-amber-500';
    return 'bg-green-500';
  };

  // Determine text color based on warning state
  const getTextColor = () => {
    if (metric.isCritical) return 'text-red-600 dark:text-red-400';
    if (metric.isWarning) return 'text-amber-600 dark:text-amber-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  const displayMax = metric.max !== null ? metric.max : '∞';
  const displayPercentage = metric.max !== null
    ? Math.min(100, Math.round(metric.percentage * 100))
    : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t(`subscription.usage_${metric.key}`, metric.key)}
        </span>
        <span className={`text-sm font-medium ${getTextColor()}`}>
          {metric.current} / {displayMax} {metric.unit}
        </span>
      </div>

      {/* Progress Bar */}
      {metric.max !== null && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={`h-full rounded-full transition-all duration-300 ${getBarColor()}`}
            style={{ width: `${Math.min(100, displayPercentage)}%` }}
            role="progressbar"
            aria-valuenow={metric.current}
            aria-valuemin={0}
            aria-valuemax={metric.max}
            aria-label={t(`subscription.usage_${metric.key}_progress`, {
              current: metric.current,
              max: metric.max,
            })}
          />
        </div>
      )}

      {/* Warning message */}
      {(metric.isWarning || metric.isCritical) && (
        <p className={`text-xs ${getTextColor()}`}>
          {metric.isCritical
            ? t('subscription.usage_critical', 'Limit reached! Consider upgrading your plan.')
            : t('subscription.usage_warning', 'Approaching limit ({{percent}}%)', {
                percent: displayPercentage,
              })}
        </p>
      )}
    </div>
  );
}

/**
 * Usage Metrics Card.
 * @see Requirements 14.7, 14.8
 */
function UsageMetricsCard({
  usageMetrics,
  hasWarnings,
}: {
  usageMetrics: readonly UsageMetric[];
  hasWarnings: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('subscription.usage_title', 'Usage')}
        </h3>
        {hasWarnings && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <span role="img" aria-hidden="true">
              ⚠️
            </span>
            {t('subscription.usage_high', 'High usage')}
          </span>
        )}
      </div>

      <div className="space-y-4">
        {usageMetrics.map(metric => (
          <UsageProgressBar key={metric.key} metric={metric} />
        ))}
      </div>
    </div>
  );
}

/**
 * Action Buttons Section.
 */
function ActionButtons({
  onViewPlans,
  canUpgrade,
  canDowngrade,
  isTrialActive,
}: {
  onViewPlans: () => void;
  canUpgrade: boolean;
  canDowngrade: boolean;
  isTrialActive: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary" onClick={onViewPlans}>
        {t('subscription.view_plans', 'View Plans')}
      </Button>

      {isTrialActive ? (
        <Button variant="outline" onClick={onViewPlans}>
          {t('subscription.start_subscription', 'Start Subscription')}
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={onViewPlans}
          disabled={!canUpgrade && !canDowngrade}>
          {t('subscription.manage_subscription', 'Manage Subscription')}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Content Component
// ---------------------------------------------------------------------------

/**
 * SubscriptionContent — The main content of the Subscription screen.
 */
function SubscriptionContent() {
  const { t } = useTranslation();
  const vm = useSubscriptionViewModel();

  // ---------------------------------------------------------------------------
  // Render States
  // ---------------------------------------------------------------------------

  // Loading state
  if (vm.isLoading) {
    return (
      <div className="space-y-6">
        <SubscriptionBreadcrumb />
        <SubscriptionSkeleton />
      </div>
    );
  }

  // Error state
  if (vm.isError) {
    return (
      <div className="space-y-6">
        <SubscriptionBreadcrumb />
        <SubscriptionError error={vm.error} onRetry={vm.refetch} />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <SubscriptionBreadcrumb />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {t('subscription.title', 'Subscription')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t(
              'subscription.description',
              'View and manage your subscription plan and usage.',
            )}
          </p>
        </div>

        {/* Action Buttons */}
        <ActionButtons
          onViewPlans={vm.openPlanComparison}
          canUpgrade={vm.canUpgrade}
          canDowngrade={vm.canDowngrade}
          isTrialActive={vm.isTrialActive}
        />
      </div>

      {/* Past Due Warning Banner */}
      {vm.isPastDue && <PastDueWarningBanner />}

      {/* Current Plan Card */}
      <CurrentPlanCard
        plan={vm.currentPlan}
        status={vm.status}
        billingPeriod={vm.billingPeriod}
        trialDaysRemaining={vm.trialDaysRemaining}
        isTrialActive={vm.isTrialActive}
      />

      {/* Two Column Layout for Features and Usage on larger screens */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Feature List */}
        <FeatureListCard features={vm.features} />

        {/* Usage Metrics */}
        <UsageMetricsCard
          usageMetrics={vm.usageMetrics}
          hasWarnings={vm.usageWarnings.length > 0}
        />
      </div>

      {/* Plan Comparison Modal */}
      {vm.isPlanComparisonOpen && (
        <PlanComparisonModal
          isOpen={vm.isPlanComparisonOpen}
          availablePlans={vm.availablePlans}
          currentPlanId={vm.currentPlan?.id ?? null}
          currentTier={(vm.currentPlan?.tier ?? 'Basic') as PlanTier}
          currentUsage={vm.currentUsage}
          isTrialMode={vm.isTrialActive}
          isLoading={vm.isPlansLoading}
          canManage={vm.canManage}
          onUpgrade={vm.handleUpgrade}
          onDowngrade={vm.handleDowngrade}
          onStartSubscription={vm.handleStartSubscription}
          onClose={vm.closePlanComparison}
        />
      )}

      {/* Upgrade Confirmation Dialog */}
      {vm.currentPlanSummary && vm.targetPlanSummary && (
        <PlanUpgradeDialog
          open={vm.isUpgradeDialogOpen}
          currentPlan={vm.currentPlanSummary}
          targetPlan={vm.targetPlanSummary}
          comparison={vm.planComparison}
          isLoading={vm.isChangingPlan}
          onConfirm={vm.confirmUpgrade}
          onCancel={vm.closeUpgradeDialog}
        />
      )}

      {/* Downgrade Confirmation Dialog */}
      {vm.currentPlanSummary && vm.targetPlanSummary && (
        <PlanDowngradeDialog
          open={vm.isDowngradeDialogOpen}
          currentPlan={vm.currentPlanSummary}
          targetPlan={vm.targetPlanSummary}
          comparison={vm.planComparison}
          validationResult={vm.downgradeValidation}
          currentUsage={vm.currentUsage}
          newLimits={vm.newPlanLimits}
          isLoading={vm.isChangingPlan}
          isValidating={vm.isValidatingDowngrade}
          onConfirm={vm.confirmDowngrade}
          onCancel={vm.closeDowngradeDialog}
        />
      )}

      {/* Start Subscription Dialog (Trial Mode) */}
      <StartSubscriptionDialog
        open={vm.isStartSubscriptionDialogOpen}
        availablePlans={vm.availablePlans}
        trialDaysRemaining={vm.trialDaysRemaining ?? 0}
        isLoading={vm.isChangingPlan}
        onConfirm={vm.confirmStartSubscription}
        onCancel={vm.closeStartSubscriptionDialog}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan Comparison Modal
// ---------------------------------------------------------------------------

/**
 * Plan Comparison Modal — Displays all available plans for comparison.
 *
 * @see Requirements 15.1-15.4, 15.9, 15.10
 */
function PlanComparisonModal({
  isOpen,
  availablePlans,
  currentPlanId,
  currentTier,
  currentUsage,
  isTrialMode,
  isLoading,
  canManage,
  onUpgrade,
  onDowngrade,
  onStartSubscription,
  onClose,
}: {
  isOpen: boolean;
  availablePlans: readonly AdminSubscriptionPlan[];
  currentPlanId: string | null;
  currentTier: PlanTier;
  currentUsage: { members: number; orgUnits: number; storage: number } | null;
  isTrialMode: boolean;
  isLoading: boolean;
  canManage: boolean;
  onUpgrade: (planId: string) => Promise<void>;
  onDowngrade: (planId: string) => Promise<void>;
  onStartSubscription: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  // Convert AdminSubscriptionPlan to SubscriptionPlanDisplay
  const plansForDisplay: SubscriptionPlanDisplay[] = availablePlans
    .filter(plan => plan.isAvailable)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(plan => ({
      id: plan.id,
      name: plan.name,
      tier: mapTierToDisplayTier(plan.tier),
      price: plan.pricing.monthlyPrice,
      currency: plan.pricing.currency,
      billingCycle: 'monthly' as const,
      features: plan.features.map(f => ({
        key: f.key,
        name: f.nameKey,
        included: f.included,
      })),
      limits: {
        maxMembers: plan.limits.maxMembers,
        maxOrgUnits: plan.limits.maxOrgUnits,
        maxStorage: plan.limits.maxStorageBytes,
      },
      description: t(plan.descriptionKey, plan.name),
    }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-comparison-title"
    >
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white shadow-2xl dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <div>
            <h2
              id="plan-comparison-title"
              className="text-xl font-semibold text-gray-900 dark:text-white"
            >
              {t('subscription.plan_comparison_title', 'Compare Plans')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {isTrialMode
                ? t('subscription.choose_plan_after_trial', 'Choose a plan to continue after your trial')
                : t('subscription.choose_plan_description', 'Choose the plan that best fits your needs')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label={t('common.close', 'Close')}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                <span className="text-gray-500 dark:text-gray-400">
                  {t('common.loading', 'Loading...')}
                </span>
              </div>
            </div>
          ) : plansForDisplay.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                {t('subscription.no_plans_available', 'No plans available')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {plansForDisplay.map(plan => (
                <PlanComparisonCard
                  key={plan.id}
                  plan={plan}
                  isCurrentPlan={plan.id === currentPlanId}
                  currentTier={currentTier}
                  currentUsage={currentUsage ?? undefined}
                  isTrialMode={isTrialMode}
                  onUpgrade={() => onUpgrade(plan.id)}
                  onDowngrade={() => onDowngrade(plan.id)}
                  onStartSubscription={onStartSubscription}
                  canManage={canManage}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Map backend tier to display tier.
 */
function mapTierToDisplayTier(tier: string): PlanTier {
  const tierMap: Record<string, PlanTier> = {
    FREE: 'Basic',
    BASIC: 'Basic',
    PRO: 'Pro',
    ENTERPRISE: 'Pro',
    Standard: 'Standard',
    Basic: 'Basic',
    Pro: 'Pro',
  };
  return tierMap[tier] ?? 'Basic';
}

// ---------------------------------------------------------------------------
// Exported Component
// ---------------------------------------------------------------------------

/**
 * SubscriptionScreen — The Subscription Management screen wrapped with PermissionGuard.
 *
 * Requires `tenant:manage` permission to access.
 * @see Requirements 14.2
 *
 * @example
 * ```tsx
 * // In app/dashboard/administration/subscription/page.tsx
 * import { SubscriptionScreen } from '@presentation/features/subscription/screens/SubscriptionScreen';
 *
 * export default function SubscriptionPage() {
 *   return <SubscriptionScreen />;
 * }
 * ```
 */
export function SubscriptionScreen() {
  return (
    <PermissionGuard
      permissions={['tenant:manage']}
      fallback={<UnauthorizedMessage />}>
      <SubscriptionContent />
    </PermissionGuard>
  );
}

export default SubscriptionScreen;
