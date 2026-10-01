/**
 * Subscription feature module exports.
 *
 * @see Requirements 14.1-14.9, 15.1-15.10, 16.1-16.11
 */

export { SubscriptionScreen } from './screens/SubscriptionScreen';
export {
  useSubscriptionViewModel,
  SUBSCRIPTION_QUERY_KEY,
  USAGE_WARNING_THRESHOLD,
  type SubscriptionViewModel,
  type SubscriptionData,
  type SubscriptionPlanData,
  type UsageMetric,
  type PlanFeatureDisplay,
  type PlanTier,
} from './viewModel/useSubscriptionViewModel';

// Components
export {
  PlanComparisonCard,
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
  type PlanComparisonCardProps,
  type SubscriptionPlanDisplay,
  type PlanFeature,
  type PlanLimits,
  type PlanTier as ComponentPlanTier,
  // Billing History
  BillingHistoryTable,
  StatusBadge,
  InvoiceAction,
  DateRangeFilter,
  EmptyBillingState,
  DEFAULT_BILLING_PAGE_SIZE,
  type BillingHistoryTableProps,
  type DateFilter,
} from './components';
