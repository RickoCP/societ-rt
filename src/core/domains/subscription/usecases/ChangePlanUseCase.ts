/**
 * ChangePlanUseCase — Handles plan upgrades, downgrades, and trial-to-paid conversions.
 *
 * This use case orchestrates plan changes with validation of:
 * - Actor permission (tenant:manage required)
 * - Plan change rules (upgrade/downgrade)
 * - Usage limits for downgrade scenarios
 * - Trial to paid conversion
 *
 * **ORCHESTRATION FLOW:**
 * 1. Validate actor has tenant:manage permission
 * 2. Fetch current subscription and target plan
 * 3. Validate plan change is allowed (upgrade/downgrade rules)
 * 4. For downgrade: check usage limits against new plan
 * 5. Execute plan change
 * 6. Return updated subscription
 *
 * @see Requirements 15.5-15.9 (Plan Upgrade/Downgrade)
 * @see Design Components > 9. Subscription Management > 9.2 Plan Comparison
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { SubscriptionStatus } from '../types';
import type { SubscriptionPlan } from '../entities';
import type { ISubscriptionAdminRepository, PlanChangeResult } from '../repositories/ISubscriptionAdminRepository';
import { planNotFound, subscriptionNotFound } from '../errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Plan change type.
 */
export type PlanChangeType = 'UPGRADE' | 'DOWNGRADE' | 'TRIAL_CONVERSION';

/**
 * Usage limit check result.
 */
export interface UsageLimitCheck {
  /** Whether the check passed */
  readonly passed: boolean;
  /** List of exceeded limits (if any) */
  readonly exceededLimits: readonly ExceededLimit[];
}

/**
 * Exceeded limit detail.
 */
export interface ExceededLimit {
  /** Metric name (e.g., "members", "orgUnits", "storage") */
  readonly metric: string;
  /** Current usage value */
  readonly currentUsage: number;
  /** New plan's limit */
  readonly newLimit: number;
}

/**
 * Input parameters for changing subscription plan.
 */
export interface ChangePlanInput {
  /** The tenant to change plan for */
  readonly tenantId: string;

  /** Target plan ID */
  readonly targetPlanId: string;

  /** Whether the actor has tenant:manage permission */
  readonly hasManagePermission: boolean;

  /** Actor user ID (for audit) */
  readonly actorUserId: string;
}

/**
 * Result of a successful plan change.
 */
export interface ChangePlanResult {
  /** Updated subscription ID */
  readonly subscriptionId: string;

  /** Previous plan details */
  readonly previousPlan: SubscriptionPlan;

  /** New plan details */
  readonly newPlan: SubscriptionPlan;

  /** Type of change made */
  readonly changeType: PlanChangeType;

  /** New subscription status */
  readonly newStatus: SubscriptionStatus;

  /** Price difference (positive for upgrade, negative for downgrade) */
  readonly priceDifference: number;

  /** New billing period end date */
  readonly newPeriodEnd: Date | null;

  /** Features gained with the new plan */
  readonly featuresGained: readonly string[];

  /** Features lost with the new plan (for downgrades) */
  readonly featuresLost: readonly string[];
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * ChangePlanUseCase interface — handles subscription plan changes.
 */
export interface ChangePlanUseCase {
  /**
   * Execute the plan change operation.
   *
   * @param input - The input parameters
   * @returns DomainResult with plan change result or error
   */
  execute(input: ChangePlanInput): Promise<DomainResult<ChangePlanResult>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a ChangePlanUseCase instance.
 *
 * @param dependencies - The use case dependencies
 * @returns An implementation of ChangePlanUseCase
 */
export const ChangePlanUseCaseImpl = ({
  subscriptionAdminRepository,
}: {
  subscriptionAdminRepository: ISubscriptionAdminRepository;
}): ChangePlanUseCase => ({
  execute: async (input: ChangePlanInput): Promise<DomainResult<ChangePlanResult>> => {
    const { tenantId, targetPlanId, hasManagePermission, actorUserId } = input;

    // Step 1: Validate actor has tenant:manage permission
    if (!hasManagePermission) {
      return fail({
        type: 'authorization',
        code: 'AUTH_INSUFFICIENT_PERMISSION',
        message: 'tenant:manage permission required to change subscription plan',
        retryable: false,
      });
    }

    // Step 2: Validate input
    if (!tenantId) {
      return fail({
        type: 'validation',
        code: 'VALIDATION_MISSING_TENANT_ID',
        message: 'Tenant ID is required',
        retryable: false,
      });
    }

    if (!targetPlanId) {
      return fail({
        type: 'validation',
        code: 'VALIDATION_MISSING_PLAN_ID',
        message: 'Target plan ID is required',
        retryable: false,
      });
    }

    // Step 3: Fetch current subscription
    const subscriptionResult = await subscriptionAdminRepository.getSubscriptionOverview(tenantId);
    if (!subscriptionResult.success) {
      return subscriptionResult;
    }
    if (!subscriptionResult.data) {
      return fail(subscriptionNotFound(tenantId));
    }
    const currentSubscription = subscriptionResult.data;

    // Step 4: Fetch target plan
    const targetPlanResult = await subscriptionAdminRepository.getPlan(targetPlanId);
    if (!targetPlanResult.success) {
      return targetPlanResult;
    }
    if (!targetPlanResult.data) {
      return fail(planNotFound(targetPlanId));
    }
    const targetPlan = targetPlanResult.data;

    // Step 5: Determine change type and validate
    const changeType = determineChangeType(
      currentSubscription.status,
      currentSubscription.currentPlan.price,
      targetPlan.price,
    );

    // Step 6: Validate same plan is not selected
    if (currentSubscription.currentPlan.id === targetPlanId) {
      return fail({
        type: 'business',
        code: 'PLAN_CHANGE_SAME_PLAN',
        message: 'Target plan is the same as current plan',
        retryable: false,
      });
    }

    // Step 7: For downgrade, check usage limits
    if (changeType === 'DOWNGRADE') {
      const usageCheckResult = await subscriptionAdminRepository.checkUsageLimits(
        tenantId,
        targetPlanId,
      );
      if (!usageCheckResult.success) {
        return usageCheckResult;
      }
      if (!usageCheckResult.data.passed) {
        const exceededLimits = usageCheckResult.data.exceededLimits;
        return fail({
          type: 'business',
          code: 'PLAN_DOWNGRADE_USAGE_EXCEEDED',
          message: `Cannot downgrade: current usage exceeds new plan limits for: ${exceededLimits.map(l => l.metric).join(', ')}`,
          userMessage: 'Your current usage exceeds the limits of the selected plan. Please reduce usage before downgrading.',
          retryable: false,
        });
      }
    }

    // Step 8: Execute plan change via repository
    const changePlanResult = await subscriptionAdminRepository.changePlan(
      tenantId,
      targetPlanId,
      actorUserId,
    );

    if (!changePlanResult.success) {
      return changePlanResult;
    }

    const planChangeData = changePlanResult.data;

    // Step 9: Calculate feature differences
    const currentFeatures = new Set(currentSubscription.currentPlan.features);
    const newFeatures = new Set(targetPlan.features);

    const featuresGained = targetPlan.features.filter(f => !currentFeatures.has(f));
    const featuresLost = currentSubscription.currentPlan.features.filter(
      f => !newFeatures.has(f),
    );

    // Step 10: Return result
    return ok({
      subscriptionId: planChangeData.subscriptionId,
      previousPlan: currentSubscription.currentPlan,
      newPlan: targetPlan,
      changeType,
      newStatus: planChangeData.newStatus,
      priceDifference: targetPlan.price - currentSubscription.currentPlan.price,
      newPeriodEnd: planChangeData.newPeriodEnd,
      featuresGained,
      featuresLost,
    });
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the type of plan change.
 */
function determineChangeType(
  currentStatus: SubscriptionStatus,
  currentPrice: number,
  targetPrice: number,
): PlanChangeType {
  // Trial conversion takes precedence
  if (currentStatus === 'TRIAL') {
    return 'TRIAL_CONVERSION';
  }

  // Price comparison determines upgrade vs downgrade
  if (targetPrice > currentPrice) {
    return 'UPGRADE';
  }

  return 'DOWNGRADE';
}

/**
 * Type alias for cleaner DI registration.
 */
export type ChangePlanUseCaseType = ChangePlanUseCase;
