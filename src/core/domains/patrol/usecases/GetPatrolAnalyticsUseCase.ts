/**
 * GetPatrolAnalyticsUseCase — Returns aggregated patrol analytics
 * for a given time range.
 *
 * Logic:
 * 1. Fetch analytics from patrolRepository.getPatrolAnalytics
 * 2. Return ok(analytics)
 *
 * @see Requirements 35.7
 */

import type { DomainResult } from '@core/utils';
import { fail, ok } from '@core/utils';
import type {
  PatrolRepository,
  PatrolAnalytics,
} from '../repositories/PatrolRepository';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface GetPatrolAnalyticsParams {
  from: Date;
  to: Date;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetPatrolAnalyticsUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: GetPatrolAnalyticsParams;
  }): Promise<DomainResult<PatrolAnalytics>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetPatrolAnalyticsUseCaseImpl = ({
  patrolRepository,
}: {
  patrolRepository: PatrolRepository;
}): GetPatrolAnalyticsUseCase => ({
  execute: async ({ authContext, data }) => {
    const tenantId = getTenantId(authContext);

    // 1. Fetch analytics from repository
    const result = await patrolRepository.getPatrolAnalytics(
      tenantId,
      data.from,
      data.to,
    );

    if (!result.success) {
      return fail(result.error);
    }

    // 2. Return success
    return ok(result.data);
  },
});
