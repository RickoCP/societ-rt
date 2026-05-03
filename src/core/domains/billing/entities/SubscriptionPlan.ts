/**
 * SubscriptionPlan — Domain entity representing a subscription tier
 * that determines feature limits and user count limits per tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 16.1, 16.2
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type PlanName = 'Free' | 'Pro' | 'Enterprise';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface SubscriptionPlan {
  readonly id: string;
  readonly name: PlanName;
  readonly maxUsers: number | null; // null = unlimited
  readonly features: string[];
  readonly price: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
