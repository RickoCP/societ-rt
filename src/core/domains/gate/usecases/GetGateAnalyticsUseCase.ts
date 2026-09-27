/**
 * GetGateAnalyticsUseCase — Returns gate analytics for a given time range.
 *
 * Analytics include:
 * - Total events
 * - Average open duration
 * - Longest open duration
 * - Open/closed event counts
 *
 * @see Requirements 33.6, 33.8
 */

import type { DomainResult } from '@core/utils';
import { fail } from '@core/utils';
import type { GateRepository } from '../repositories/GateRepository';
import type { GateAnalytics } from '../entities';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetGateAnalyticsInput {
  readonly gateId: string;
  readonly from: Date;
  readonly to: Date;
}

export interface GetGateAnalyticsUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    data: GetGateAnalyticsInput;
  }): Promise<DomainResult<GateAnalytics>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetGateAnalyticsUseCaseImpl = ({
  gateRepository,
}: {
  gateRepository: GateRepository;
}): GetGateAnalyticsUseCase => ({
  execute: async ({ authContext, data }) => {
    const tenantId = getTenantId(authContext);

    const result = await gateRepository.getGateAnalytics(
      tenantId,
      data.gateId,
      data.from,
      data.to,
    );

    if (!result.success) {
      return fail(result.error);
    }

    return result;
  },
});
