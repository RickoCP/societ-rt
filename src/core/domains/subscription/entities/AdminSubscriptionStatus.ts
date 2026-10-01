/**
 * AdminSubscriptionStatus — Domain entity for Admin UI subscription status display.
 *
 * This entity represents the current subscription state for a tenant,
 * designed for the Subscription Overview screen in the Admin UI.
 * It combines subscription details with billing period and trial information.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 14.3 (Subscription overview with status, billing period, trial)
 * @see Requirements 14.5-14.6 (PAST_DUE warning, trial countdown)
 * @see Design Components > 9. Subscription Management
 */

import type { SubscriptionPlanTier, BillingCycle, CurrencyCode } from './AdminSubscriptionPlan';

// ---------------------------------------------------------------------------
// Value Types
// ---------------------------------------------------------------------------

/**
 * Subscription status for Admin UI display.
 *
 * These statuses map to different UI treatments and warning banners.
 *
 * @see Requirements 14.3 (Status display)
 * @see Requirements 14.5 (PAST_DUE warning)
 */
export type AdminSubscriptionStatusType =
  | 'ACTIVE'      // Subscription is current and paid
  | 'TRIAL'       // Trial period active
  | 'PAST_DUE'    // Payment overdue but service continues
  | 'CANCELLED'   // User cancelled but period still active
  | 'EXPIRED';    // Subscription has ended

/**
 * All valid subscription status types.
 */
export const ALL_ADMIN_SUBSCRIPTION_STATUSES: readonly AdminSubscriptionStatusType[] = [
  'ACTIVE',
  'TRIAL',
  'PAST_DUE',
  'CANCELLED',
  'EXPIRED',
] as const;

// ---------------------------------------------------------------------------
// Billing Period
// ---------------------------------------------------------------------------

/**
 * Billing period information for the subscription.
 *
 * @see Requirements 14.3 (Billing period start and end dates)
 */
export interface BillingPeriod {
  /** Start date of the current billing period */
  readonly startDate: Date;

  /** End date of the current billing period */
  readonly endDate: Date;

  /** Whether the subscription auto-renews */
  readonly autoRenew: boolean;

  /** Next billing date (null if not auto-renewing) */
  readonly nextBillingDate: Date | null;
}

// ---------------------------------------------------------------------------
// Usage Metrics
// ---------------------------------------------------------------------------

/**
 * Current usage metrics against plan limits.
 *
 * @see Requirements 14.7 (Usage metrics display)
 * @see Requirements 14.8 (80% threshold warning)
 */
export interface UsageMetrics {
  /** Current member count */
  readonly members: UsageMetricValue;

  /** Current OrgUnit count */
  readonly orgUnits: UsageMetricValue;

  /** Current storage usage in bytes */
  readonly storage: UsageMetricValue;
}

/**
 * Individual usage metric with current value and limit.
 */
export interface UsageMetricValue {
  /** Current usage value */
  readonly current: number;

  /** Maximum allowed value (null = unlimited) */
  readonly max: number | null;

  /** Usage percentage (0-100, null if unlimited) */
  readonly percentUsed: number | null;

  /** Whether usage is at or above 80% warning threshold */
  readonly isWarning: boolean;
}

// ---------------------------------------------------------------------------
// Plan Summary (embedded in status)
// ---------------------------------------------------------------------------

/**
 * Current plan summary embedded in subscription status.
 */
export interface CurrentPlanInfo {
  /** Plan ID reference */
  readonly planId: string;

  /** Plan display name */
  readonly planName: string;

  /** Plan tier */
  readonly tier: SubscriptionPlanTier;

  /** Current billing cycle */
  readonly billingCycle: BillingCycle;

  /** Current price for the billing cycle */
  readonly currentPrice: number;

  /** Currency code */
  readonly currency: CurrencyCode;
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * AdminSubscriptionStatus entity — current subscription state for Admin UI.
 *
 * Provides all information needed for the Subscription Overview screen,
 * including current plan, status, billing period, trial info, and usage.
 *
 * INVARIANTS:
 * - Each tenant has exactly one subscription status
 * - trialDaysRemaining is only non-null when status is TRIAL
 * - Usage percentages are calculated server-side for accuracy
 *
 * @see Requirements 14.1-14.9
 * @see Design > SubscriptionViewModel
 */
export interface AdminSubscriptionStatus {
  /** Subscription record ID */
  readonly id: string;

  /** Tenant ID this subscription belongs to */
  readonly tenantId: string;

  /** Current subscription status */
  readonly status: AdminSubscriptionStatusType;

  /** Current plan information */
  readonly currentPlan: CurrentPlanInfo;

  /** Current billing period */
  readonly billingPeriod: BillingPeriod;

  /** Days remaining in trial (null if not in trial) */
  readonly trialDaysRemaining: number | null;

  /** Trial end date (null if not in trial) */
  readonly trialEndsAt: Date | null;

  /** Current usage metrics against plan limits */
  readonly usage: UsageMetrics;

  /** Usage warnings - list of metrics exceeding 80% */
  readonly usageWarnings: readonly UsageWarning[];

  /** When the subscription was created */
  readonly createdAt: Date;

  /** When the subscription was last updated */
  readonly updatedAt: Date;
}

/**
 * Usage warning for display in UI.
 *
 * @see Requirements 14.8 (80% threshold warning)
 */
export interface UsageWarning {
  /** Metric key ('members', 'orgUnits', 'storage') */
  readonly metric: UsageMetricKey;

  /** i18n key for warning message */
  readonly warningKey: string;

  /** Current percentage used */
  readonly percentUsed: number;
}

/**
 * Usage metric keys for indexing.
 */
export type UsageMetricKey = 'members' | 'orgUnits' | 'storage';

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Warning threshold percentage for usage metrics.
 */
export const USAGE_WARNING_THRESHOLD = 80;

/**
 * Check if a usage metric should show a warning.
 */
export function isUsageWarning(percentUsed: number | null): boolean {
  return percentUsed !== null && percentUsed >= USAGE_WARNING_THRESHOLD;
}

/**
 * Calculate usage percentage safely.
 */
export function calculateUsagePercent(
  current: number,
  max: number | null,
): number | null {
  if (max === null || max === 0) return null;
  return Math.round((current / max) * 100);
}

/**
 * Create usage metric value from current and max.
 */
export function createUsageMetric(
  current: number,
  max: number | null,
): UsageMetricValue {
  const percentUsed = calculateUsagePercent(current, max);
  return {
    current,
    max,
    percentUsed,
    isWarning: isUsageWarning(percentUsed),
  };
}

/**
 * Generate usage warnings from metrics.
 */
export function generateUsageWarnings(usage: UsageMetrics): UsageWarning[] {
  const warnings: UsageWarning[] = [];

  const checkMetric = (key: UsageMetricKey, metric: UsageMetricValue) => {
    if (metric.isWarning && metric.percentUsed !== null) {
      warnings.push({
        metric: key,
        warningKey: `subscription.usage_warning.${key}`,
        percentUsed: metric.percentUsed,
      });
    }
  };

  checkMetric('members', usage.members);
  checkMetric('orgUnits', usage.orgUnits);
  checkMetric('storage', usage.storage);

  return warnings;
}

/**
 * Check if subscription status requires a warning banner.
 */
export function requiresStatusWarning(status: AdminSubscriptionStatusType): boolean {
  return status === 'PAST_DUE' || status === 'CANCELLED' || status === 'EXPIRED';
}

/**
 * Check if subscription is in trial mode.
 */
export function isTrialStatus(status: AdminSubscriptionStatusType): boolean {
  return status === 'TRIAL';
}

/**
 * Check if subscription allows plan changes.
 */
export function canChangePlan(status: AdminSubscriptionStatusType): boolean {
  // Only ACTIVE and PAST_DUE can change plans
  // TRIAL must start subscription first (per Requirement 15.9)
  return status === 'ACTIVE' || status === 'PAST_DUE';
}

/**
 * Get i18n key for status badge.
 */
export function getStatusBadgeKey(status: AdminSubscriptionStatusType): string {
  return `subscription.status.${status.toLowerCase()}`;
}

/**
 * Get CSS variant for status badge.
 */
export function getStatusBadgeVariant(
  status: AdminSubscriptionStatusType,
): 'default' | 'success' | 'warning' | 'destructive' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'TRIAL':
      return 'default';
    case 'PAST_DUE':
      return 'warning';
    case 'CANCELLED':
    case 'EXPIRED':
      return 'destructive';
    default:
      return 'default';
  }
}
