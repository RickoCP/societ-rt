/**
 * SubscriptionPlan — Domain entity representing a subscription tier
 * that determines feature entitlements and user count limits per tenant.
 *
 * Enhanced from billing domain to support Req 17 (Subscription Plan Management).
 * Supports CRUD operations with validation.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 17 (AC 1-7)
 * @see Design Components > Subscription Plan Management
 */

import type { PlanFeature } from '../types';

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

/**
 * Default plan names that MUST be supported at minimum (Req 17 AC 4).
 */
export type DefaultPlanName = 'Basic' | 'Standard' | 'Pro';

/**
 * Plan name can be a default or custom name.
 */
export type PlanName = DefaultPlanName | string;

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * SubscriptionPlan entity — defines feature entitlements and limits for tenants.
 *
 * INVARIANTS:
 * - Plan names MUST be unique across the platform
 * - maxUsers: null = unlimited users
 * - features: array of PlanFeature strings
 * - price: decimal value in smallest currency unit
 */
export interface SubscriptionPlan {
  /** Unique identifier for the plan */
  readonly id: string;

  /** Unique display name for the plan */
  readonly name: PlanName;

  /** Maximum number of users allowed (null = unlimited) */
  readonly maxUsers: number | null;

  /** Array of feature identifiers included in this plan */
  readonly features: readonly string[];

  /** Price in smallest currency unit (e.g., cents) */
  readonly price: number;

  /** Plan description for display purposes */
  readonly description?: string;

  /** Whether this is a default system plan (cannot be deleted) */
  readonly isSystemPlan?: boolean;

  /** When the plan was created */
  readonly createdAt: Date;

  /** When the plan was last updated */
  readonly updatedAt: Date;
}

/**
 * Data required to create a new subscription plan.
 * Omits auto-generated fields (id, timestamps).
 */
export interface CreateSubscriptionPlanInput {
  readonly name: PlanName;
  readonly maxUsers: number | null;
  readonly features: readonly string[];
  readonly price: number;
  readonly description?: string;
  readonly isSystemPlan?: boolean;
}

/**
 * Partial update for subscription plan fields.
 * All fields are optional for partial updates.
 */
export interface UpdateSubscriptionPlanInput {
  readonly name?: PlanName;
  readonly maxUsers?: number | null;
  readonly features?: readonly string[];
  readonly price?: number;
  readonly description?: string;
}

/**
 * Plan change log entry for audit purposes (Req 17 AC 7).
 */
export interface PlanChangeLog {
  readonly id: string;
  readonly planId: string;
  readonly operatorUserId: string;
  readonly action: 'CREATE' | 'UPDATE' | 'DELETE';
  readonly beforeState: Partial<SubscriptionPlan> | null;
  readonly afterState: Partial<SubscriptionPlan> | null;
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Default plan names that must exist (Req 17 AC 4).
 */
export const DEFAULT_PLAN_NAMES: readonly DefaultPlanName[] = [
  'Basic',
  'Standard',
  'Pro',
] as const;

/**
 * Check if a plan name is a default system plan.
 */
export function isDefaultPlanName(name: string): name is DefaultPlanName {
  return DEFAULT_PLAN_NAMES.includes(name as DefaultPlanName);
}

/**
 * Validate plan name format.
 */
export function isValidPlanName(name: string): boolean {
  // Name must be 1-50 characters, alphanumeric with spaces/underscores/hyphens
  return /^[\w\s-]{1,50}$/u.test(name);
}

/**
 * Validate maxUsers value.
 */
export function isValidMaxUsers(maxUsers: number | null): boolean {
  // null = unlimited, or positive integer
  return maxUsers === null || (Number.isInteger(maxUsers) && maxUsers > 0);
}

/**
 * Validate price value.
 */
export function isValidPrice(price: number): boolean {
  // Price must be non-negative
  return Number.isFinite(price) && price >= 0;
}
