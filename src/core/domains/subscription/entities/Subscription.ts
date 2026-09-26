/**
 * Subscription — Domain entity representing a tenant's subscription state.
 *
 * Links a Tenant to a SubscriptionPlan with status tracking.
 * Subscription.status is SEPARATE from Tenant.lifecycleStatus (L8, L12).
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 18 (AC 1-7)
 * @see Design Components > Tenant Subscription Status Management
 */

import type { SubscriptionStatus } from '../types';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * Subscription entity — tracks tenant's subscription state and history.
 *
 * INVARIANTS:
 * - Each tenant has exactly one active subscription
 * - Status transitions follow the state machine rules
 * - Status history is append-only for audit trail
 */
export interface Subscription {
  /** Unique identifier for this subscription record */
  readonly id: string;

  /** Reference to the Tenant */
  readonly tenantId: string;

  /** Reference to the current SubscriptionPlan */
  readonly planId: string;

  /** Current subscription status */
  readonly status: SubscriptionStatus;

  /** When the subscription started (trial or paid) */
  readonly startedAt: Date;

  /** When the current billing period ends */
  readonly currentPeriodEnd: Date | null;

  /** When the trial period ends (if in TRIAL status) */
  readonly trialEndsAt: Date | null;

  /** When the subscription was suspended (if status is SUSPENDED) */
  readonly suspendedAt: Date | null;

  /** When the subscription was closed (if status is CLOSED) */
  readonly closedAt: Date | null;

  /** Reason for suspension/closure (for audit) */
  readonly statusReason: string | null;

  /** When the subscription was created */
  readonly createdAt: Date;

  /** When the subscription was last updated */
  readonly updatedAt: Date;
}

/**
 * Data required to create a new subscription.
 * Omits auto-generated fields (id, timestamps).
 */
export interface CreateSubscriptionInput {
  readonly tenantId: string;
  readonly planId: string;
  readonly status: SubscriptionStatus;
  readonly startedAt?: Date;
  readonly currentPeriodEnd?: Date | null;
  readonly trialEndsAt?: Date | null;
}

/**
 * Partial update for subscription fields.
 */
export interface UpdateSubscriptionInput {
  readonly planId?: string;
  readonly status?: SubscriptionStatus;
  readonly currentPeriodEnd?: Date | null;
  readonly trialEndsAt?: Date | null;
  readonly suspendedAt?: Date | null;
  readonly closedAt?: Date | null;
  readonly statusReason?: string | null;
}

/**
 * Status transition request for validation.
 */
export interface StatusTransitionRequest {
  readonly subscriptionId: string;
  readonly fromStatus: SubscriptionStatus;
  readonly toStatus: SubscriptionStatus;
  readonly reason?: string;
  readonly operatorUserId: string;
}
