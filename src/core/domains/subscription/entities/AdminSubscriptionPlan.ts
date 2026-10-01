/**
 * AdminSubscriptionPlan — Domain entity for Admin UI subscription plan display.
 *
 * This entity is designed for the Subscription Management screens in the Admin UI,
 * providing plan details with pricing, features, and usage limits for comparison
 * and upgrade/downgrade flows.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 14.3 (Plan overview with features)
 * @see Requirements 15.3 (Plan comparison card)
 * @see Design Components > 9. Subscription Management
 */

// ---------------------------------------------------------------------------
// Value Types
// ---------------------------------------------------------------------------

/**
 * Subscription plan tier levels.
 * Maps to pricing and feature tiers.
 */
export type SubscriptionPlanTier = 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE';

/**
 * Billing cycle options for subscriptions.
 */
export type BillingCycle = 'monthly' | 'yearly';

/**
 * Currency codes supported for pricing.
 */
export type CurrencyCode = 'IDR' | 'USD';

// ---------------------------------------------------------------------------
// Feature Representation
// ---------------------------------------------------------------------------

/**
 * Feature representation for plan comparison UI.
 *
 * Each feature shows whether it's included in the plan, with clear
 * visual indicators for the Plan Comparison Card.
 *
 * @see Requirements 14.4 (Feature list with availability indicators)
 * @see Requirements 15.3 (Plan comparison card feature list)
 */
export interface PlanFeatureItem {
  /** Unique feature key (e.g., 'resident_management') */
  readonly key: string;

  /** Human-readable feature name (i18n key for display) */
  readonly nameKey: string;

  /** Whether this feature is included in the plan */
  readonly included: boolean;

  /** Optional description for tooltip (i18n key) */
  readonly descriptionKey?: string;

  /** Feature category for grouping in UI */
  readonly category?: PlanFeatureCategory;
}

/**
 * Feature categories for UI grouping.
 */
export type PlanFeatureCategory =
  | 'CORE'
  | 'COMMUNICATION'
  | 'FINANCE'
  | 'SECURITY'
  | 'IOT'
  | 'ANALYTICS'
  | 'ENTERPRISE';

// ---------------------------------------------------------------------------
// Usage Limits
// ---------------------------------------------------------------------------

/**
 * Usage limits for a subscription plan.
 *
 * Defines the maximum resources allowed under the plan.
 * A null value indicates unlimited usage for that resource.
 *
 * @see Requirements 14.7 (Usage metrics against plan limits)
 * @see Requirements 15.6 (Check usage against new plan limits)
 */
export interface PlanUsageLimits {
  /** Maximum number of members allowed (null = unlimited) */
  readonly maxMembers: number | null;

  /** Maximum number of OrgUnits allowed (null = unlimited) */
  readonly maxOrgUnits: number | null;

  /** Maximum storage in bytes (null = unlimited) */
  readonly maxStorageBytes: number | null;

  /** Maximum number of CCTV integrations (null = unlimited) */
  readonly maxCctvStreams: number | null;

  /** Maximum number of IoT devices (null = unlimited) */
  readonly maxIotDevices: number | null;

  /** Maximum number of automation rules (null = unlimited) */
  readonly maxAutomationRules: number | null;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * Pricing information for a subscription plan.
 *
 * Supports monthly and yearly pricing with optional discount display.
 *
 * @see Requirements 15.3 (Plan comparison card with price)
 * @see Requirements 15.5 (Upgrade confirmation with price difference)
 */
export interface PlanPricing {
  /** Monthly price in smallest currency unit (e.g., cents/rupiah) */
  readonly monthlyPrice: number;

  /** Yearly price in smallest currency unit */
  readonly yearlyPrice: number;

  /** Currency code (ISO 4217) */
  readonly currency: CurrencyCode;

  /** Monthly savings percentage when billed yearly (e.g., 20 for 20% off) */
  readonly yearlySavingsPercent: number | null;
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * AdminSubscriptionPlan entity — full plan details for Admin UI display.
 *
 * This entity is optimized for the Plan Comparison Card component and
 * subscription management screens.
 *
 * INVARIANTS:
 * - Plan ID is unique across the platform
 * - Plan name is unique and display-friendly
 * - Pricing values are non-negative
 * - Feature list is non-empty for all plans
 *
 * @see Requirements 14.3, 15.3
 * @see Design > Plan Comparison Card
 */
export interface AdminSubscriptionPlan {
  /** Unique identifier for the plan */
  readonly id: string;

  /** Display name for the plan (e.g., 'Basic', 'Pro', 'Enterprise') */
  readonly name: string;

  /** Plan tier for ordering and comparison */
  readonly tier: SubscriptionPlanTier;

  /** Short description of the plan (i18n key) */
  readonly descriptionKey: string;

  /** Pricing information */
  readonly pricing: PlanPricing;

  /** Features with included/excluded indicators */
  readonly features: readonly PlanFeatureItem[];

  /** Usage limits for the plan */
  readonly limits: PlanUsageLimits;

  /** Whether this is a default system plan */
  readonly isSystemPlan: boolean;

  /** Whether this plan is currently available for selection */
  readonly isAvailable: boolean;

  /** Display order for plan comparison (lower = first) */
  readonly displayOrder: number;

  /** Highlight text for promotional display (i18n key, optional) */
  readonly highlightKey?: string;

  /** When the plan was created */
  readonly createdAt: Date;

  /** When the plan was last updated */
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Helper Types
// ---------------------------------------------------------------------------

/**
 * Summary version for dropdown/selection UI.
 */
export interface AdminSubscriptionPlanSummary {
  readonly id: string;
  readonly name: string;
  readonly tier: SubscriptionPlanTier;
  readonly monthlyPrice: number;
  readonly currency: CurrencyCode;
  readonly isAvailable: boolean;
}

/**
 * Comparison result between two plans.
 * Used for upgrade/downgrade confirmation dialogs.
 *
 * @see Requirements 15.4 (Highlight differences from current plan)
 * @see Requirements 15.5-15.6 (Upgrade/downgrade confirmation)
 */
export interface PlanComparisonResult {
  /** Features gained when switching to target plan */
  readonly featuresGained: readonly PlanFeatureItem[];

  /** Features lost when switching to target plan */
  readonly featuresLost: readonly PlanFeatureItem[];

  /** Limit increases (positive = increase, negative = decrease) */
  readonly limitChanges: {
    readonly members: number | null;
    readonly orgUnits: number | null;
    readonly storageBytes: number | null;
  };

  /** Monthly price difference (positive = more expensive) */
  readonly priceDifferenceMonthly: number;

  /** Whether this is an upgrade (true) or downgrade (false) */
  readonly isUpgrade: boolean;
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/**
 * Tier ordering for comparison (higher number = higher tier).
 */
export const TIER_ORDER: Record<SubscriptionPlanTier, number> = {
  FREE: 0,
  BASIC: 1,
  PRO: 2,
  ENTERPRISE: 3,
} as const;

/**
 * Check if target tier is higher than source tier.
 */
export function isUpgradeTier(
  sourceTier: SubscriptionPlanTier,
  targetTier: SubscriptionPlanTier,
): boolean {
  return TIER_ORDER[targetTier] > TIER_ORDER[sourceTier];
}

/**
 * Check if target tier is lower than source tier.
 */
export function isDowngradeTier(
  sourceTier: SubscriptionPlanTier,
  targetTier: SubscriptionPlanTier,
): boolean {
  return TIER_ORDER[targetTier] < TIER_ORDER[sourceTier];
}

/**
 * Compare two plans and return the differences.
 */
export function comparePlans(
  currentPlan: AdminSubscriptionPlan,
  targetPlan: AdminSubscriptionPlan,
): PlanComparisonResult {
  // Get feature keys for comparison
  const currentFeatureKeys = new Set(
    currentPlan.features.filter(f => f.included).map(f => f.key),
  );
  const targetFeatureKeys = new Set(
    targetPlan.features.filter(f => f.included).map(f => f.key),
  );

  // Find gained and lost features
  const featuresGained = targetPlan.features.filter(
    f => f.included && !currentFeatureKeys.has(f.key),
  );
  const featuresLost = currentPlan.features.filter(
    f => f.included && !targetFeatureKeys.has(f.key),
  );

  // Calculate limit changes (null handling: null = unlimited = Infinity for comparison)
  const limitChanges = {
    members: calculateLimitDifference(
      currentPlan.limits.maxMembers,
      targetPlan.limits.maxMembers,
    ),
    orgUnits: calculateLimitDifference(
      currentPlan.limits.maxOrgUnits,
      targetPlan.limits.maxOrgUnits,
    ),
    storageBytes: calculateLimitDifference(
      currentPlan.limits.maxStorageBytes,
      targetPlan.limits.maxStorageBytes,
    ),
  };

  return {
    featuresGained,
    featuresLost,
    limitChanges,
    priceDifferenceMonthly:
      targetPlan.pricing.monthlyPrice - currentPlan.pricing.monthlyPrice,
    isUpgrade: isUpgradeTier(currentPlan.tier, targetPlan.tier),
  };
}

/**
 * Calculate difference between two limits.
 * Returns null if both are unlimited or comparison not meaningful.
 */
function calculateLimitDifference(
  current: number | null,
  target: number | null,
): number | null {
  // Both unlimited → no change
  if (current === null && target === null) return null;

  // Going from limited to unlimited → large positive (use Infinity indicator)
  if (current !== null && target === null) return null;

  // Going from unlimited to limited → this is a decrease
  if (current === null && target !== null) return -target;

  // Both limited → calculate difference
  return target! - current!;
}
