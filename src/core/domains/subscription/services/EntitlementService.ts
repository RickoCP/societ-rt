/**
 * EntitlementService — Domain service for subscription entitlement enforcement.
 *
 * Implements the Entitlement Enforcer (Authorization Pipeline Step 8) to:
 * - Resolve tenant's subscription plan and status before checking entitlements
 * - Deny access to features not included in the tenant's plan
 * - Handle SUSPENDED tenant status (allow safety-critical and billing/recovery only)
 * - Never deny emergency/panic operations regardless of subscription status
 * - Log all entitlement denials for audit
 *
 * This is a factory function (DI-friendly) following Clean Architecture.
 *
 * @see Requirements 19 (AC 1-7)
 * @see Design Components > Three Authorization Axes > Entitlement Check
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { SubscriptionStatus } from '../types';
import {
  SubscriptionStatus as StatusEnum,
  isTerminalStatus,
} from '../types';
import {
  isSafetyCriticalFeature,
  isPlanFeatureIncluded,
} from '../types';
import type { PlanFeature } from '../types';
import type { ISubscriptionRepository } from '../repositories';
import type { ISubscriptionPlanRepository } from '../repositories';
import {
  subscriptionNotFound,
  planNotFound,
} from '../errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of an entitlement check operation.
 */
export interface EntitlementCheckResult {
  /** Whether the entitlement check passed */
  readonly allowed: boolean;
  /** The tenant's current subscription status */
  readonly subscriptionStatus: SubscriptionStatus;
  /** The tenant's current plan name */
  readonly planName: string;
  /** The checked feature */
  readonly feature: PlanFeature;
  /** Whether the operation was classified as safety-critical */
  readonly isSafetyCritical: boolean;
  /** Denial reason if not allowed */
  readonly denialReason?: string;
  /** Specific error code if denied */
  readonly errorCode?: string;
}

/**
 * Entitlement check options.
 */
export interface EntitlementCheckOptions {
  /** The tenant ID to check entitlements for */
  readonly tenantId: string;
  /** The required feature to check */
  readonly requiredFeature: PlanFeature;
  /** Whether this operation is safety-critical (bypasses subscription status check) */
  readonly isSafetyCritical?: boolean;
  /** Whether this is a billing/recovery flow (allowed during SUSPENDED) */
  readonly isBillingFlow?: boolean;
}

/**
 * Context for logging entitlement denials.
 */
export interface EntitlementDenialLogContext {
  readonly tenantId: string;
  readonly feature: PlanFeature;
  readonly planName: string;
  readonly subscriptionStatus: SubscriptionStatus;
  readonly denialReason: string;
  readonly errorCode: string;
  readonly timestamp: Date;
}

/**
 * Logger interface for entitlement denials (Req 19 AC 7).
 */
export interface IEntitlementLogger {
  logDenial(context: EntitlementDenialLogContext): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface IEntitlementService {
  /**
   * Check if a tenant has entitlement to use a specific feature.
   * 
   * This implements the full entitlement check flow:
   * 1. Resolve tenant's subscription plan and status (Req 19 AC 1)
   * 2. If status is CLOSED → deny all operations (Req 18 AC 3)
   * 3. If status is SUSPENDED → allow only safety-critical/billing ops (Req 19 AC 4-5)
   * 4. Check if feature is safety-critical → always allow (Req 19 AC 6)
   * 5. Check if feature is in plan's features array (Req 19 AC 2)
   * 6. Log denial if applicable (Req 19 AC 7)
   *
   * @param options - Entitlement check options
   * @returns DomainResult with EntitlementCheckResult or error
   */
  checkEntitlement(
    options: EntitlementCheckOptions,
  ): Promise<DomainResult<EntitlementCheckResult>>;

  /**
   * Check if a feature is available in a specific plan.
   * Does NOT check subscription status - use checkEntitlement for full check.
   *
   * @param planId - The plan ID to check
   * @param feature - The feature to check
   * @returns DomainResult<boolean>
   */
  isFeatureInPlan(
    planId: string,
    feature: PlanFeature,
  ): Promise<DomainResult<boolean>>;

  /**
   * Get all features available to a tenant based on their subscription plan.
   *
   * @param tenantId - The tenant ID
   * @returns DomainResult with array of available features
   */
  getTenantFeatures(tenantId: string): Promise<DomainResult<readonly PlanFeature[]>>;

  /**
   * Check if a feature is classified as safety-critical.
   * Safety-critical features bypass subscription/entitlement checks.
   *
   * @param feature - The feature to check
   * @returns true if safety-critical
   */
  isSafetyCritical(feature: PlanFeature): boolean;
}

// ---------------------------------------------------------------------------
// Safety-Critical Operations (Req 20 AC 1)
// ---------------------------------------------------------------------------

/**
 * Re-export from centralized safety-critical types for backward compatibility.
 * The authoritative list is in @core/domains/emergency/types.
 */
export { isSafetyCriticalOperationCode as isSafetyCriticalOperation } from '@core/domains/emergency/types';

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

export interface EntitlementServiceDeps {
  subscriptionRepository: ISubscriptionRepository;
  subscriptionPlanRepository: ISubscriptionPlanRepository;
  logger?: IEntitlementLogger;
}

export function createEntitlementService(
  deps: EntitlementServiceDeps,
): IEntitlementService {
  const { subscriptionRepository, subscriptionPlanRepository, logger } = deps;

  /**
   * Helper to log entitlement denials.
   */
  async function logDenial(
    tenantId: string,
    feature: PlanFeature,
    planName: string,
    subscriptionStatus: SubscriptionStatus,
    denialReason: string,
    errorCode: string,
  ): Promise<void> {
    if (logger) {
      await logger.logDenial({
        tenantId,
        feature,
        planName,
        subscriptionStatus,
        denialReason,
        errorCode,
        timestamp: new Date(),
      });
    }
  }

  return {
    /**
     * Check if a tenant has entitlement to use a specific feature.
     *
     * Implements Requirements 19 AC 1-7.
     */
    async checkEntitlement(
      options: EntitlementCheckOptions,
    ): Promise<DomainResult<EntitlementCheckResult>> {
      const {
        tenantId,
        requiredFeature,
        isSafetyCritical = false,
        isBillingFlow = false,
      } = options;

      // Step 1: Resolve tenant's subscription (Req 19 AC 1)
      const subscriptionResult = await subscriptionRepository.findByTenantId(tenantId);
      if (!subscriptionResult.success) {
        return subscriptionResult;
      }
      if (!subscriptionResult.data) {
        return fail(subscriptionNotFound(`tenant:${tenantId}`));
      }

      const subscription = subscriptionResult.data;
      const subscriptionStatus = subscription.status;

      // Step 2: Resolve the plan (Req 19 AC 1)
      const planResult = await subscriptionPlanRepository.findById(subscription.planId);
      if (!planResult.success) {
        return planResult;
      }
      if (!planResult.data) {
        return fail(planNotFound(subscription.planId));
      }

      const plan = planResult.data;
      const planName = plan.name;

      // Check if the feature itself is safety-critical (Req 19 AC 6)
      const featureIsSafetyCritical = isSafetyCriticalFeature(requiredFeature) || isSafetyCritical;

      // Step 3: Handle CLOSED status (Req 18 AC 3)
      // Even safety-critical operations are denied for CLOSED tenants
      // (tenant has been terminated)
      if (isTerminalStatus(subscriptionStatus)) {
        const denialReason = 'Tenant subscription is closed';
        const errorCode = 'TENANT_CLOSED';

        await logDenial(tenantId, requiredFeature, planName, subscriptionStatus, denialReason, errorCode);

        return ok({
          allowed: false,
          subscriptionStatus,
          planName,
          feature: requiredFeature,
          isSafetyCritical: featureIsSafetyCritical,
          denialReason,
          errorCode,
        });
      }

      // Step 4: Handle SUSPENDED status (Req 19 AC 4-5)
      // Allow only safety-critical operations and billing/recovery flows
      if (subscriptionStatus === StatusEnum.SUSPENDED) {
        // Safety-critical operations are ALWAYS allowed (Req 19 AC 6, Req 20)
        if (featureIsSafetyCritical) {
          return ok({
            allowed: true,
            subscriptionStatus,
            planName,
            feature: requiredFeature,
            isSafetyCritical: true,
          });
        }

        // Billing/recovery flows are allowed during SUSPENDED
        if (isBillingFlow) {
          // Still need to check if feature is in plan
          const featureInPlan = isPlanFeatureIncluded(plan.features, requiredFeature);
          if (!featureInPlan) {
            const denialReason = `Feature '${requiredFeature}' is not available in the '${planName}' plan`;
            const errorCode = 'ENTITLEMENT_NOT_AVAILABLE';

            await logDenial(tenantId, requiredFeature, planName, subscriptionStatus, denialReason, errorCode);

            return ok({
              allowed: false,
              subscriptionStatus,
              planName,
              feature: requiredFeature,
              isSafetyCritical: false,
              denialReason,
              errorCode,
            });
          }

          return ok({
            allowed: true,
            subscriptionStatus,
            planName,
            feature: requiredFeature,
            isSafetyCritical: false,
          });
        }

        // Normal operations are DENIED during SUSPENDED (Req 19 AC 5)
        const denialReason = 'Tenant subscription is suspended - normal operations are restricted';
        const errorCode = 'TENANT_SUSPENDED';

        await logDenial(tenantId, requiredFeature, planName, subscriptionStatus, denialReason, errorCode);

        return ok({
          allowed: false,
          subscriptionStatus,
          planName,
          feature: requiredFeature,
          isSafetyCritical: false,
          denialReason,
          errorCode,
        });
      }

      // Step 5: Safety-critical features always allowed (Req 19 AC 6)
      if (featureIsSafetyCritical) {
        return ok({
          allowed: true,
          subscriptionStatus,
          planName,
          feature: requiredFeature,
          isSafetyCritical: true,
        });
      }

      // Step 6: Check if feature is in the plan's features array (Req 19 AC 2)
      const featureInPlan = isPlanFeatureIncluded(plan.features, requiredFeature);

      if (!featureInPlan) {
        const denialReason = `Feature '${requiredFeature}' is not available in the '${planName}' plan`;
        const errorCode = 'ENTITLEMENT_NOT_AVAILABLE';

        await logDenial(tenantId, requiredFeature, planName, subscriptionStatus, denialReason, errorCode);

        return ok({
          allowed: false,
          subscriptionStatus,
          planName,
          feature: requiredFeature,
          isSafetyCritical: false,
          denialReason,
          errorCode,
        });
      }

      // All checks passed - entitlement granted
      return ok({
        allowed: true,
        subscriptionStatus,
        planName,
        feature: requiredFeature,
        isSafetyCritical: false,
      });
    },

    /**
     * Check if a feature is available in a specific plan.
     */
    async isFeatureInPlan(
      planId: string,
      feature: PlanFeature,
    ): Promise<DomainResult<boolean>> {
      const planResult = await subscriptionPlanRepository.findById(planId);
      if (!planResult.success) {
        return planResult;
      }
      if (!planResult.data) {
        return fail(planNotFound(planId));
      }

      return ok(isPlanFeatureIncluded(planResult.data.features, feature));
    },

    /**
     * Get all features available to a tenant based on their subscription plan.
     */
    async getTenantFeatures(
      tenantId: string,
    ): Promise<DomainResult<readonly PlanFeature[]>> {
      // Get subscription
      const subscriptionResult = await subscriptionRepository.findByTenantId(tenantId);
      if (!subscriptionResult.success) {
        return subscriptionResult;
      }
      if (!subscriptionResult.data) {
        return fail(subscriptionNotFound(`tenant:${tenantId}`));
      }

      // Get plan
      const planResult = await subscriptionPlanRepository.findById(
        subscriptionResult.data.planId,
      );
      if (!planResult.success) {
        return planResult;
      }
      if (!planResult.data) {
        return fail(planNotFound(subscriptionResult.data.planId));
      }

      return ok(planResult.data.features as readonly PlanFeature[]);
    },

    /**
     * Check if a feature is classified as safety-critical.
     */
    isSafetyCritical(feature: PlanFeature): boolean {
      return isSafetyCriticalFeature(feature);
    },
  };
}
