/**
 * GetKetuaDashboardUseCase — Returns aggregated dashboard metrics for Ketua_RT.
 *
 * Uses CacheProtocol for Redis caching with 5 min TTL.
 * Cache key: `dashboard:{tenantId}:ketua`
 *
 * @see Requirements 28.1
 */

import type { DomainResult } from '@core/utils';
import { ok } from '@core/utils';
import type { CacheProtocol } from '@core/protocols';
import type { KetuaDashboardMetrics } from '../entities';
import type { DashboardRepository } from '../repositories/DashboardRepository';

const CACHE_TTL_SECONDS = 300; // 5 minutes

export interface GetKetuaDashboardUseCase {
  execute(params: { tenantId: string }): Promise<DomainResult<KetuaDashboardMetrics>>;
}

export const GetKetuaDashboardUseCaseImpl = ({
  dashboardRepository,
  cacheProtocol,
}: {
  dashboardRepository: DashboardRepository;
  cacheProtocol: CacheProtocol;
}): GetKetuaDashboardUseCase => ({
  execute: async ({ tenantId }) => {
    const cacheKey = `dashboard:${tenantId}:ketua`;

    // Try cache first
    const cached = await cacheProtocol.get<KetuaDashboardMetrics>(cacheKey);
    if (cached) {
      return ok(cached);
    }

    // Fetch from repository
    const result = await dashboardRepository.getKetuaMetrics(tenantId);

    // Cache on success
    if (result.success) {
      await cacheProtocol.set(cacheKey, result.data, CACHE_TTL_SECONDS);
    }

    return result;
  },
});
