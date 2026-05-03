/**
 * CheckFeatureFlagUseCase — Checks if a feature is enabled for a tenant.
 *
 * Logic:
 * 1. Query featureFlagRepository.isEnabled
 * 2. If disabled, fail with featureDisabled()
 * 3. Return ok(void)
 *
 * @see Requirements 19.2, 19.3
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { FeatureFlagRepository } from '../repositories/FeatureFlagRepository';
import { featureDisabled } from '../errors/featureFlagErrors';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CheckFeatureFlagUseCase {
  execute(params: {
    tenantId: string;
    featureName: string;
  }): Promise<DomainResult<void>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const CheckFeatureFlagUseCaseImpl = ({
  featureFlagRepository,
}: {
  featureFlagRepository: FeatureFlagRepository;
}): CheckFeatureFlagUseCase => ({
  execute: async ({ tenantId, featureName }) => {
    const result = await featureFlagRepository.isEnabled(
      tenantId,
      featureName,
    );

    if (!result.success) {
      return fail(result.error);
    }

    if (!result.data) {
      return fail(featureDisabled());
    }

    return ok(undefined);
  },
});
