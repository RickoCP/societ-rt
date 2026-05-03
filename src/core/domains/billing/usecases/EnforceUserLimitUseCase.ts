/**
 * EnforceUserLimitUseCase — Checks the tenant's subscription plan user limit
 * and rejects if the limit would be exceeded.
 *
 * Plan limits:
 * - Free: 50 users
 * - Pro: 500 users
 * - Enterprise: unlimited (null)
 *
 * Logic:
 * 1. Get active plan for tenant
 * 2. If maxUsers is null (unlimited), allow
 * 3. Count current active users
 * 4. If count >= maxUsers, fail with billingUserLimitExceeded()
 * 5. Return ok(void)
 *
 * @see Requirements 16.2, 16.3, 16.6
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { BillingRepository } from '../repositories/BillingRepository';
import { billingUserLimitExceeded } from '../errors/billingErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface EnforceUserLimitUseCase {
  execute(params: {
    tenantId: string;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const EnforceUserLimitUseCaseImpl = ({
  billingRepository,
}: {
  billingRepository: BillingRepository;
}): EnforceUserLimitUseCase => ({
  execute: async ({ tenantId }) => {
    // 1. Get active plan for tenant
    const planResult = await billingRepository.getActivePlan(tenantId);

    if (!planResult.success) {
      return fail(planResult.error);
    }

    const plan = planResult.data;

    // 2. If maxUsers is null (unlimited), allow
    if (plan.maxUsers === null) {
      return ok(undefined);
    }

    // 3. Count current active users
    const countResult = await billingRepository.countTenantUsers(tenantId);

    if (!countResult.success) {
      return fail(countResult.error);
    }

    // 4. If count >= maxUsers, fail
    if (countResult.data >= plan.maxUsers) {
      return fail(billingUserLimitExceeded());
    }

    // 5. Allow
    return ok(undefined);
  },
});
