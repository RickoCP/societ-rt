'use client';

/**
 * PlanComparisonCard — Component for displaying subscription plan details
 * in a comparison view for upgrade/downgrade decisions.
 *
 * Displays:
 * - Plan name, price, and billing cycle
 * - Feature list with availability indicators
 * - Key limits (members, OrgUnits, storage)
 * - "Current Plan" badge for active subscription
 * - Upgrade/Downgrade buttons based on tier comparison
 * - Highlighted differences from current plan
 *
 * RESPONSIVE DESIGN:
 * - Cards stack vertically on mobile viewports
 * - Horizontal layout on larger screens
 * - Touch-friendly button sizes
 *
 * SECURITY CONSIDERATIONS:
 * - UI permission checks are for UX only; server-side authorization is enforced
 * - Plan changes validated against usage limits server-side
 *
 * @see Requirements 15.1-15.4, 15.10 (Plan Comparison and Upgrade)
 * @see Design Section 9. Subscription Management > 9.2 Plan Comparison Card
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import type { UsageMetric } from '../viewModel/useSubscriptionViewModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Plan tier type.
 */
export type PlanTier = 'Basic' | 'Standard' | 'Pro';

/**
 * Plan feature with availability indicator.
 * @see Requirements 15.3
 */
export interface PlanFeature {
  /** Feature key/identifier */
  readonly key: string;
  /** Feature display name (i18n key) */
  readonly name: string;
  /** Whether the feature is included in this plan */
  readonly included: boolean;
}

/**
 * Plan limits configuration.
 */
export interface PlanLimits {
  /** Maximum members allowed (null = unlimited) */
  readonly maxMembers: number | null;
  /** Maximum OrgUnits allowed (null = unlimited) */
  readonly maxOrgUnits: number | null;
  /** Maximum storage in bytes (null = unlimited) */
  readonly maxStorage: number | null;
}

/**
 * Subscription plan data for comparison card.
 */
export interface SubscriptionPlanDisplay {
  /** Plan unique identifier */
  readonly id: string;
  /** Plan display name */
  readonly name: string;
  /** Plan tier (Basic, Standard, Pro) */
  readonly tier: PlanTier;
  /** Price value */
  readonly price: number;
  /** Currency code (e.g., 'IDR', 'USD') */
  readonly currency: string;
  /** Billing cycle */
  readonly billingCycle: 'monthly' | 'yearly';
  /** Features included in this plan */
  readonly features: readonly PlanFeature[];
  /** Plan limits */
  readonly limits: PlanLimits;
  /** Optional plan description */
  readonly description?: string;
}

/**
 * Props for PlanComparisonCard component.
 */
export interface PlanComparisonCardProps {
  /**
   * Plan data to display.
   */
  plan: SubscriptionPlanDisplay;

  /**
   * Whether this is the currently active plan.
   * @see Requirements 15.3
   */
  isCurrentPlan: boolean;

  /**
   * Current usage metrics for comparison.
   * Used to determine if downgrade is possible.
   */
  currentUsage?: {
    readonly members: number;
    readonly orgUnits: number;
    readonly storage: number;
  };

  /**
   * Current plan tier for comparison.
   * Used to determine if this is an upgrade or downgrade.
   */
  currentTier?: PlanTier;

  /**
   * Whether the subscription is in trial mode.
   * @see Requirements 15.9
   */
  isTrialMode?: boolean;

  /**
   * Callback when upgrade button is clicked.
   * @see Requirements 15.5
   */
  onUpgrade?: () => void;

  /**
   * Callback when downgrade button is clicked.
   * @see Requirements 15.6
   */
  onDowngrade?: () => void;

  /**
   * Callback for starting subscription (trial mode).
   * @see Requirements 15.9
   */
  onStartSubscription?: () => void;

  /**
   * Whether actions are currently loading.
   */
  isLoading?: boolean;

  /**
   * Whether the user can manage subscriptions.
   */
  canManage?: boolean;

  /**
   * Additional CSS classes.
   */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Plan tier hierarchy for upgrade/downgrade determination.
 */
const TIER_HIERARCHY: Record<PlanTier, number> = {
  Basic: 1,
  Standard: 2,
  Pro: 3,
};

/**
 * Tier badge color configuration.
 */
const TIER_CONFIG: Record<
  PlanTier,
  { color: string; bgColor: string; borderColor: string }
> = {
  Basic: {
    color: 'text-gray-700 dark:text-gray-200',
    bgColor: 'bg-gray-50 dark:bg-gray-800',
    borderColor: 'border-gray-200 dark:border-gray-700',
  },
  Standard: {
    color: 'text-blue-700 dark:text-blue-200',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
  },
  Pro: {
    color: 'text-purple-700 dark:text-purple-200',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-200 dark:border-purple-800',
  },
};

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
function formatStorage(bytes: number | null): string {
  if (bytes === null) return '∞';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${Math.round(gb)} GB`;
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

/**
 * Determine if this plan is an upgrade from current tier.
 */
function isUpgrade(currentTier: PlanTier, targetTier: PlanTier): boolean {
  return TIER_HIERARCHY[targetTier] > TIER_HIERARCHY[currentTier];
}

/**
 * Determine if this plan is a downgrade from current tier.
 */
function isDowngrade(currentTier: PlanTier, targetTier: PlanTier): boolean {
  return TIER_HIERARCHY[targetTier] < TIER_HIERARCHY[currentTier];
}

/**
 * Check if downgrade would exceed new plan limits.
 */
function wouldExceedLimits(
  usage: { members: number; orgUnits: number; storage: number },
  limits: PlanLimits,
): { exceeds: boolean; exceedingMetrics: string[] } {
  const exceedingMetrics: string[] = [];

  if (limits.maxMembers !== null && usage.members > limits.maxMembers) {
    exceedingMetrics.push('members');
  }
  if (limits.maxOrgUnits !== null && usage.orgUnits > limits.maxOrgUnits) {
    exceedingMetrics.push('orgUnits');
  }
  if (limits.maxStorage !== null && usage.storage > limits.maxStorage) {
    exceedingMetrics.push('storage');
  }

  return {
    exceeds: exceedingMetrics.length > 0,
    exceedingMetrics,
  };
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

/**
 * Tier badge component.
 */
function TierBadge({ tier }: { tier: PlanTier }) {
  const config = TIER_CONFIG[tier];

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${config.bgColor} ${config.color}`}
    >
      {tier}
    </span>
  );
}

/**
 * Current plan badge component.
 * @see Requirements 15.3
 */
function CurrentPlanBadge() {
  const { t } = useTranslation();

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300"
      role="status"
    >
      <svg
        className="h-3.5 w-3.5"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      {t('subscription.current_plan_badge', 'Current Plan')}
    </span>
  );
}

/**
 * Feature check/cross icon component.
 */
function FeatureIcon({ included, isHighlighted }: { included: boolean; isHighlighted?: boolean }) {
  if (included) {
    return (
      <svg
        className={`h-5 w-5 flex-shrink-0 ${
          isHighlighted
            ? 'text-green-600 dark:text-green-400'
            : 'text-green-500 dark:text-green-400'
        }`}
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg
      className="h-5 w-5 flex-shrink-0 text-gray-300 dark:text-gray-600"
      fill="currentColor"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Feature list item component.
 * @see Requirements 15.4
 */
function FeatureItem({
  feature,
  isHighlighted,
}: {
  feature: PlanFeature;
  isHighlighted?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <li
      className={`flex items-center gap-2 ${
        feature.included
          ? isHighlighted
            ? 'text-green-700 dark:text-green-300 font-medium'
            : 'text-gray-900 dark:text-white'
          : 'text-gray-400 dark:text-gray-500'
      }`}
    >
      <FeatureIcon included={feature.included} isHighlighted={isHighlighted} />
      <span className="text-sm">
        {t(feature.name, feature.key.replace(/_/g, ' '))}
      </span>
      {isHighlighted && feature.included && (
        <span className="ml-auto text-xs text-green-600 dark:text-green-400">
          {t('subscription.new_feature', 'New')}
        </span>
      )}
    </li>
  );
}

/**
 * Limit item component.
 */
function LimitItem({
  labelKey,
  value,
  isHighlighted,
  isDegraded,
}: {
  labelKey: string;
  value: number | null;
  isHighlighted?: boolean;
  isDegraded?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={`flex items-center justify-between py-1 ${
        isDegraded
          ? 'text-amber-600 dark:text-amber-400'
          : isHighlighted
            ? 'text-green-700 dark:text-green-300 font-medium'
            : 'text-gray-700 dark:text-gray-300'
      }`}
    >
      <span className="text-sm">{t(labelKey)}</span>
      <span className="text-sm font-semibold">
        {formatLimit(value)}
        {isHighlighted && (
          <span className="ml-1 text-xs text-green-600 dark:text-green-400">↑</span>
        )}
        {isDegraded && (
          <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">↓</span>
        )}
      </span>
    </div>
  );
}

/**
 * Downgrade warning component.
 * @see Requirements 15.6
 */
function DowngradeWarning({ exceedingMetrics }: { exceedingMetrics: string[] }) {
  const { t } = useTranslation();

  return (
    <div
      className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <svg
          className="h-5 w-5 flex-shrink-0 text-red-500"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <div className="text-sm text-red-700 dark:text-red-300">
          <p className="font-medium">
            {t('subscription.downgrade_exceeds_limits', 'Downgrade not available')}
          </p>
          <p className="mt-1">
            {t(
              'subscription.downgrade_exceeds_limits_detail',
              'Current usage exceeds this plan\'s limits for: {{metrics}}',
              { metrics: exceedingMetrics.join(', ') },
            )}
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
 * PlanComparisonCard — Displays a subscription plan for comparison.
 *
 * @example
 * ```tsx
 * <PlanComparisonCard
 *   plan={standardPlan}
 *   isCurrentPlan={false}
 *   currentTier="Basic"
 *   currentUsage={{ members: 10, orgUnits: 5, storage: 1024000 }}
 *   onUpgrade={() => handleUpgrade(standardPlan.id)}
 *   canManage={true}
 * />
 * ```
 */
export function PlanComparisonCard({
  plan,
  isCurrentPlan,
  currentUsage,
  currentTier,
  isTrialMode = false,
  onUpgrade,
  onDowngrade,
  onStartSubscription,
  isLoading = false,
  canManage = true,
  className = '',
}: PlanComparisonCardProps) {
  const { t, i18n } = useTranslation();

  // ---------------------------------------------------------------------------
  // Computed State
  // ---------------------------------------------------------------------------

  // Determine upgrade/downgrade status
  const upgradeStatus = useMemo(() => {
    if (isCurrentPlan || !currentTier) {
      return { isUpgrade: false, isDowngrade: false };
    }
    return {
      isUpgrade: isUpgrade(currentTier, plan.tier),
      isDowngrade: isDowngrade(currentTier, plan.tier),
    };
  }, [isCurrentPlan, currentTier, plan.tier]);

  // Check if downgrade would exceed limits
  const limitCheck = useMemo(() => {
    if (!upgradeStatus.isDowngrade || !currentUsage) {
      return { exceeds: false, exceedingMetrics: [] };
    }
    return wouldExceedLimits(currentUsage, plan.limits);
  }, [upgradeStatus.isDowngrade, currentUsage, plan.limits]);

  // Get tier configuration for styling
  const tierConfig = TIER_CONFIG[plan.tier];

  // Format price for display
  const formattedPrice = formatPrice(plan.price, plan.currency, i18n.language);

  // Billing cycle label
  const billingCycleLabel =
    plan.billingCycle === 'yearly'
      ? t('subscription.per_year', '/year')
      : t('subscription.per_month', '/month');

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={`
        relative flex flex-col rounded-xl border-2 transition-shadow
        ${
          isCurrentPlan
            ? 'border-green-500 dark:border-green-400 shadow-md'
            : tierConfig.borderColor
        }
        ${tierConfig.bgColor}
        hover:shadow-lg
        ${className}
      `}
      data-testid={`plan-card-${plan.id}`}
    >
      {/* Header */}
      <div className="p-6 pb-4">
        {/* Badges Row */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <TierBadge tier={plan.tier} />
          {isCurrentPlan && <CurrentPlanBadge />}
        </div>

        {/* Plan Name */}
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
          {plan.name}
        </h3>

        {/* Description */}
        {plan.description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {plan.description}
          </p>
        )}

        {/* Price */}
        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-3xl font-bold text-gray-900 dark:text-white">
            {formattedPrice}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {billingCycleLabel}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-6 border-t border-gray-200 dark:border-gray-700" />

      {/* Limits Section */}
      <div className="p-6 pt-4">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t('subscription.limits_title', 'Limits')}
        </h4>
        <div className="space-y-1">
          <LimitItem
            labelKey="subscription.limit_members"
            value={plan.limits.maxMembers}
            isHighlighted={
              upgradeStatus.isUpgrade &&
              currentTier &&
              (plan.limits.maxMembers === null ||
                (plan.limits.maxMembers ?? 0) >
                  (TIER_CONFIG[currentTier] ? 0 : 0))
            }
            isDegraded={
              upgradeStatus.isDowngrade &&
              limitCheck.exceedingMetrics.includes('members')
            }
          />
          <LimitItem
            labelKey="subscription.limit_org_units"
            value={plan.limits.maxOrgUnits}
            isHighlighted={upgradeStatus.isUpgrade}
            isDegraded={
              upgradeStatus.isDowngrade &&
              limitCheck.exceedingMetrics.includes('orgUnits')
            }
          />
          <LimitItem
            labelKey="subscription.limit_storage"
            value={plan.limits.maxStorage ? plan.limits.maxStorage / (1024 * 1024 * 1024) : null}
            isHighlighted={upgradeStatus.isUpgrade}
            isDegraded={
              upgradeStatus.isDowngrade &&
              limitCheck.exceedingMetrics.includes('storage')
            }
          />
        </div>
      </div>

      {/* Divider */}
      <div className="mx-6 border-t border-gray-200 dark:border-gray-700" />

      {/* Features Section */}
      <div className="flex-1 p-6 pt-4">
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {t('subscription.features_title', 'Features')}
        </h4>
        <ul className="space-y-2" role="list">
          {plan.features.map(feature => (
            <FeatureItem
              key={feature.key}
              feature={feature}
              isHighlighted={
                upgradeStatus.isUpgrade &&
                feature.included &&
                !isCurrentPlan
              }
            />
          ))}
        </ul>
      </div>

      {/* Downgrade Warning */}
      {upgradeStatus.isDowngrade && limitCheck.exceeds && (
        <div className="px-6">
          <DowngradeWarning exceedingMetrics={limitCheck.exceedingMetrics} />
        </div>
      )}

      {/* Action Button Section */}
      <div className="p-6 pt-4">
        {isCurrentPlan ? (
          // Current plan - no action needed
          <div
            className="w-full rounded-lg bg-gray-100 py-3 text-center text-sm font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            aria-label={t('subscription.your_current_plan', 'Your current plan')}
          >
            {t('subscription.your_current_plan', 'Your current plan')}
          </div>
        ) : isTrialMode ? (
          // Trial mode - show "Start Subscription"
          <Button
            variant="primary"
            size="lg"
            onClick={onStartSubscription}
            disabled={!canManage || isLoading}
            loading={isLoading}
            className="w-full"
          >
            {t('subscription.start_subscription', 'Start Subscription')}
          </Button>
        ) : upgradeStatus.isUpgrade ? (
          // Upgrade button
          <Button
            variant="primary"
            size="lg"
            onClick={onUpgrade}
            disabled={!canManage || isLoading}
            loading={isLoading}
            className="w-full"
          >
            {t('subscription.upgrade_to', 'Upgrade to {{plan}}', {
              plan: plan.name,
            })}
          </Button>
        ) : upgradeStatus.isDowngrade ? (
          // Downgrade button (disabled if exceeds limits)
          <Button
            variant="secondary"
            size="lg"
            onClick={onDowngrade}
            disabled={!canManage || isLoading || limitCheck.exceeds}
            loading={isLoading}
            className="w-full"
          >
            {t('subscription.downgrade_to', 'Downgrade to {{plan}}', {
              plan: plan.name,
            })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  TierBadge,
  CurrentPlanBadge,
  FeatureIcon,
  FeatureItem,
  LimitItem,
  DowngradeWarning,
  formatPrice,
  formatStorage,
  formatLimit,
  isUpgrade,
  isDowngrade,
  wouldExceedLimits,
  TIER_HIERARCHY,
  TIER_CONFIG,
};

export default PlanComparisonCard;
