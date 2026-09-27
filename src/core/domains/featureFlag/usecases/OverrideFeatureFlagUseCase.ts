/**
 * OverrideFeatureFlagUseCase — Creates a per-tenant override for a feature flag.
 *
 * Logic:
 * 1. Create override via featureFlagRepository
 * 2. Enqueue audit log (fire-and-forget)
 * 3. Return ok(override)
 *
 * @see Requirements 19.4, 19.5
 */

import type { AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { FeatureFlagRepository } from '../repositories/FeatureFlagRepository';
import type { FeatureFlagOverride } from '../entities';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, getUserId } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface OverrideFeatureFlagUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    featureName: string;
    enabled: boolean;
  }): Promise<DomainResult<FeatureFlagOverride>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const OverrideFeatureFlagUseCaseImpl = ({
  featureFlagRepository,
  auditQueueProtocol,
}: {
  featureFlagRepository: FeatureFlagRepository;
  auditQueueProtocol: AuditQueueProtocol;
}): OverrideFeatureFlagUseCase => ({
  execute: async ({ authContext, featureName, enabled }) => {
    const tenantId = getTenantId(authContext);
    const userId = getUserId(authContext);

    // 1. Create override
    const result = await featureFlagRepository.createOverride(
      tenantId,
      featureName,
      enabled,
      userId,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const override = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId,
        actorUserId: userId,
        actionType: 'feature_flag_overridden',
        resourceType: 'feature_flag_override',
        resourceId: override.id,
        details: {
          featureName,
          enabled,
        },
      })
      .catch(() => {
        /* audit must not block the response */
      });

    // 3. Return success
    return ok(override);
  },
});
