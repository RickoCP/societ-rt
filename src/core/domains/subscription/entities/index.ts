/**
 * Subscription entities barrel export.
 *
 * @see Requirements 14, 15, 16, 17, 18
 */

// SubscriptionPlan
export type {
  SubscriptionPlan,
  CreateSubscriptionPlanInput,
  UpdateSubscriptionPlanInput,
  PlanChangeLog,
  PlanName,
  DefaultPlanName,
} from './SubscriptionPlan';

export {
  DEFAULT_PLAN_NAMES,
  isDefaultPlanName,
  isValidPlanName,
  isValidMaxUsers,
  isValidPrice,
} from './SubscriptionPlan';

// Subscription
export type {
  Subscription,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  StatusTransitionRequest,
} from './Subscription';

// SubscriptionStatusHistory
export type {
  SubscriptionStatusHistory,
  CreateStatusHistoryInput,
  StatusHistoryQueryOptions,
  StatusTransitionEvent,
} from './SubscriptionStatusHistory';

export { createStatusTransitionEvent } from './SubscriptionStatusHistory';

// BillingEntry (Admin UI billing history)
export type {
  BillingEntry,
  BillingHistoryQueryOptions,
  PaginatedBillingHistory,
} from './BillingEntry';

export {
  BillingStatus,
  ALL_BILLING_STATUSES,
  canRetryPayment as canRetryBillingPayment,
  canDownloadInvoice as hasInvoiceDownload,
  getBillingStatusColor,
  getBillingStatusKey,
  formatBillingAmount,
  generateInvoiceFilename,
  DEFAULT_BILLING_PAGE_SIZE,
} from './BillingEntry';

export type { BillingStatus as BillingStatusType } from './BillingEntry';

// AdminSubscriptionPlan (Admin UI plan display)
export type {
  AdminSubscriptionPlan,
  AdminSubscriptionPlanSummary,
  PlanComparisonResult,
  PlanFeatureItem,
  PlanFeatureCategory,
  PlanUsageLimits,
  PlanPricing,
  SubscriptionPlanTier,
  BillingCycle,
  CurrencyCode,
} from './AdminSubscriptionPlan';

export {
  TIER_ORDER,
  isUpgradeTier,
  isDowngradeTier,
  comparePlans,
} from './AdminSubscriptionPlan';

// AdminSubscriptionStatus (Admin UI subscription status display)
export type {
  AdminSubscriptionStatus,
  AdminSubscriptionStatusType,
  BillingPeriod,
  UsageMetrics,
  UsageMetricValue,
  CurrentPlanInfo,
  UsageWarning,
  UsageMetricKey,
} from './AdminSubscriptionStatus';

export {
  ALL_ADMIN_SUBSCRIPTION_STATUSES,
  USAGE_WARNING_THRESHOLD,
  isUsageWarning,
  calculateUsagePercent,
  createUsageMetric,
  generateUsageWarnings,
  requiresStatusWarning,
  isTrialStatus,
  canChangePlan,
  getStatusBadgeKey,
  getStatusBadgeVariant,
} from './AdminSubscriptionStatus';
