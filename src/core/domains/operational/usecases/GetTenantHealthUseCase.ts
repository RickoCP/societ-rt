/**
 * GetTenantHealthUseCase — Returns health metrics for a tenant.
 *
 * @see Requirements 30.5
 */

import type { DomainResult } from '@core/utils';
import type { TenantHealthMetrics } from '../entities';
import type { OperationalRepository } from '../repositories/OperationalRepository';

export interface GetTenantHealthUseCase {
  execute(params: { tenantId: string }): Promise<DomainResult<TenantHealthMetrics>>;
}

export const GetTenantHealthUseCaseImpl = ({
  operationalRepository,
}: {
  operationalRepository: OperationalRepository;
}): GetTenantHealthUseCase => ({
  execute: async ({ tenantId }) => {
    return operationalRepository.getTenantHealth(tenantId);
  },
});
