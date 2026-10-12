/**
 * GetTenantSubscriptionUseCase — Fetch the current tenant's subscription
 * enriched with its plan details (name, user limit, features).
 *
 * This use case composes the subscription repository and the subscription
 * plan repository to produce a single, UI-friendly view of the tenant's
 * active subscription. All business rules (permission check, tenant
 * validation, "no subscription" handling) live here, keeping the route
 * handler a thin BFF boundary.
 *
 * @see Requirements 18 (Subscription Status Management)
 * @see Error Handling Guideline (Steering)
 * @see Clean Architecture — business logic belongs in use cases
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { SubscriptionStatus } from '../types';
import type { ISubscriptionRepository } from '../repositories/ISubscriptionRepository';
import type { ISubscriptionPlanRepository } from '../repositories/ISubscriptionPlanRepository';

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

/**
 * Input for fetching a tenant's subscription.
 */
export interface GetTenantSubscriptionInput {
  /** The tenant whose subscription should be fetched (from AuthorizationContext). */
  readonly tenantId: string;
  /**
   * Whether the actor holds the permission required to view the subscription.
   * Resolved at the boundary from the AuthorizationContext.
   */
  readonly hasManagePermission: boolean;
}

/**
 * Plan-enriched view of a tenant's subscription.
 *
 * `null` when the tenant has no active (non-closed) subscription — this is a
 * valid state, not an error.
 */
export interface TenantSubscriptionView {
  readonly id: string;
  readonly tenantId: string;
  readonly planId: string;
  readonly planName: string;
  readonly status: SubscriptionStatus;
  readonly startedAt: Date;
  readonly currentPeriodEnd: Date | null;
  readonly trialEndsAt: Date | null;
  readonly maxUsers: number | null;
  readonly features: readonly string[];
}

export interface GetTenantSubscriptionUseCase {
  execute(
    input: GetTenantSubscriptionInput,
  ): Promise<DomainResult<TenantSubscriptionView | null>>;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a GetTenantSubscriptionUseCase instance.
 *
 * NOTE: Dependency keys (`subscriptionRepository`, `subscriptionPlanRepository`)
 * must match their DI registration keys under Awilix PROXY injection mode.
 */
export const GetTenantSubscriptionUseCaseImpl = ({
  subscriptionRepository,
  subscriptionPlanRepository,
}: {
  subscriptionRepository: ISubscriptionRepository;
  subscriptionPlanRepository: ISubscriptionPlanRepository;
}): GetTenantSubscriptionUseCase => ({
  execute: async (
    input: GetTenantSubscriptionInput,
  ): Promise<DomainResult<TenantSubscriptionView | null>> => {
    const { tenantId, hasManagePermission } = input;

    // Business rule 1: actor must hold the manage permission.
    if (!hasManagePermission) {
      return fail({
        type: 'authorization',
        code: 'AUTH_INSUFFICIENT_PERMISSION',
        message: 'tenant:manage permission required to view subscription',
        retryable: false,
      });
    }

    // Business rule 2: tenantId must be present.
    if (!tenantId) {
      return fail({
        type: 'validation',
        code: 'VALIDATION_MISSING_TENANT_ID',
        message: 'Tenant ID is required',
        retryable: false,
      });
    }

    // Fetch the tenant's subscription (infrastructure handles DB + error mapping).
    const subscriptionResult =
      await subscriptionRepository.findByTenantId(tenantId);
    if (!subscriptionResult.success) {
      return subscriptionResult;
    }

    const subscription = subscriptionResult.data;

    // No subscription is a valid state — return null, not an error.
    if (!subscription || subscription.status === 'CLOSED') {
      return ok(null);
    }

    // Enrich with plan details. A missing plan is tolerated (plan may have
    // been removed) — fall back to safe defaults rather than failing the view.
    const planResult = await subscriptionPlanRepository.findById(
      subscription.planId,
    );
    if (!planResult.success) {
      return planResult;
    }

    const plan = planResult.data;

    const view: TenantSubscriptionView = {
      id: subscription.id,
      tenantId: subscription.tenantId,
      planId: subscription.planId,
      planName: plan?.name ?? 'Unknown',
      status: subscription.status,
      startedAt: subscription.startedAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEndsAt: subscription.trialEndsAt,
      maxUsers: plan?.maxUsers ?? null,
      features: plan?.features ?? [],
    };

    return ok(view);
  },
});

/**
 * Type alias for cleaner DI registration.
 */
export type GetTenantSubscriptionUseCaseType = GetTenantSubscriptionUseCase;
