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

import type { AuthContext, AuditQueueProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import type { FeatureFlagRepository } from '../repositories/FeatureFlagRepository';
import type { FeatureFlagOverride } from '../entities';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface OverrideFeatureFlagUseCase {
  execute(params: {
    authContext: AuthContext;
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
    // 1. Create override
    const result = await featureFlagRepository.createOverride(
      authContext.tenantId,
      featureName,
      enabled,
      authContext.userId,
    );

    if (!result.success) {
      return fail(result.error);
    }

    const override = result.data;

    // 2. Enqueue audit log (fire-and-forget)
    auditQueueProtocol
      .enqueueAudit({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
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
