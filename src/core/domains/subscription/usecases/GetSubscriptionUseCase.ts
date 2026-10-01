/**
 * GetSubscriptionUseCase — Retrieves current subscription with plan details and usage metrics.
 *
 * This use case orchestrates fetching the full subscription overview for the Admin UI,
 * including the current plan, usage metrics, and trial information.
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has tenant:manage permission
 * 2. Fetch subscription details with plan information
 * 3. Fetch current usage metrics
 * 4. Calculate trial days remaining (if applicable)
 * 5. Return complete subscription overview
 *
 * @see Requirements 14.1-14.9 (Subscription Overview)
 * @see Design Components > 9. Subscription Management
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { SubscriptionStatus } from '../types';
import type { SubscriptionPlan } from '../entities';
import type { ISubscriptionAdminRepository } from '../repositories/ISubscriptionAdminRepository';
import { subscriptionNotFound } from '../errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Usage metrics for a tenant's subscription.
 */
export interface UsageMetrics {
  /** Member usage - current and maximum allowed */
  readonly members: {
    readonly current: number;
    readonly max: number;
  };
  /** OrgUnit usage - current and maximum allowed */
  readonly orgUnits: {
    readonly current: number;
    readonly max: number;
  };
  /** Storage usage in bytes - current and maximum allowed */
  readonly storage: {
    readonly current: number;
    readonly max: number;
  };
}

/**
 * Complete subscription overview for Admin UI display.
 */
export interface SubscriptionOverview {
  /** Subscription unique identifier */
  readonly subscriptionId: string;

  /** Current plan details */
  readonly currentPlan: SubscriptionPlan;

  /** Subscription status */
  readonly status: SubscriptionStatus;

  /** Billing period dates */
  readonly billingPeriod: {
    readonly start: Date;
    readonly end: Date | null;
  };

  /** Trial days remaining (null if not in trial) */
  readonly trialDaysRemaining: number | null;

  /** Usage metrics */
  readonly usage: UsageMetrics;

  /** Usage warnings - metric names at >80% capacity */
  readonly usageWarnings: readonly string[];

  /** Feature list included in current plan */
  readonly features: readonly string[];
}

/**
 * Input parameters for getting subscription overview.
 */
export interface GetSubscriptionInput {
  /** The tenant to get subscription for */
  readonly tenantId: string;

  /** Whether the actor has tenant:manage permission */
  readonly hasManagePermission: boolean;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * GetSubscriptionUseCase interface — retrieves subscription overview for Admin UI.
 */
export interface GetSubscriptionUseCase {
  /**
   * Execute the get subscription operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with subscription overview or error
   */
  execute(input: GetSubscriptionInput): Promise<DomainResult<SubscriptionOverview>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a GetSubscriptionUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of GetSubscriptionUseCase
 */
export const GetSubscriptionUseCaseImpl = ({
  subscriptionAdminRepository,
}: {
  subscriptionAdminRepository: ISubscriptionAdminRepository;
}): GetSubscriptionUseCase => ({
  execute: async (input: GetSubscriptionInput): Promise<DomainResult<SubscriptionOverview>> => {
    const { tenantId, hasManagePermission } = input;

    // Step 1: Validate actor has tenant:manage permission
    if (!hasManagePermission) {
      return fail({
        type: 'authorization',
        code: 'AUTH_INSUFFICIENT_PERMISSION',
        message: 'tenant:manage permission required to view subscription',
        retryable: false,
      });
    }

    // Step 2: Validate tenantId is provided
    if (!tenantId) {
      return fail({
        type: 'validation',
        code: 'VALIDATION_MISSING_TENANT_ID',
        message: 'Tenant ID is required',
        retryable: false,
      });
    }

    // Step 3: Fetch subscription overview from repository
    // The repository handles fetching subscription, plan, and usage in a single call
    const overviewResult = await subscriptionAdminRepository.getSubscriptionOverview(tenantId);

    if (!overviewResult.success) {
      return overviewResult;
    }

    if (!overviewResult.data) {
      return fail(subscriptionNotFound(tenantId));
    }

    const overview = overviewResult.data;

    // Step 4: Calculate usage warnings (metrics at >80% capacity)
    const usageWarnings = calculateUsageWarnings(overview.usage);

    // Step 5: Return complete overview with warnings
    return ok({
      ...overview,
      usageWarnings,
    });
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate which usage metrics are at >80% capacity.
 */
function calculateUsageWarnings(usage: UsageMetrics): string[] {
  const warnings: string[] = [];
  const WARNING_THRESHOLD = 0.8;

  // Check member usage
  if (usage.members.max > 0) {
    const memberUsageRatio = usage.members.current / usage.members.max;
    if (memberUsageRatio >= WARNING_THRESHOLD) {
      warnings.push('members');
    }
  }

  // Check OrgUnit usage
  if (usage.orgUnits.max > 0) {
    const orgUnitUsageRatio = usage.orgUnits.current / usage.orgUnits.max;
    if (orgUnitUsageRatio >= WARNING_THRESHOLD) {
      warnings.push('orgUnits');
    }
  }

  // Check storage usage
  if (usage.storage.max > 0) {
    const storageUsageRatio = usage.storage.current / usage.storage.max;
    if (storageUsageRatio >= WARNING_THRESHOLD) {
      warnings.push('storage');
    }
  }

  return warnings;
}

/**
 * Type alias for cleaner DI registration.
 */
export type GetSubscriptionUseCaseType = GetSubscriptionUseCase;
