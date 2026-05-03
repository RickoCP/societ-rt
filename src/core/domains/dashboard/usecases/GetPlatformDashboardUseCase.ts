/**
 * GetPlatformDashboardUseCase — Returns aggregated platform metrics for Super_Admin.
 *
 * Uses CacheProtocol for Redis caching with 5 min TTL.
 * Cache key: `dashboard:platform:admin`
 *
 * @see Requirements 28.2
 */

import type { DomainResult } from '@core/utils';
import { ok } from '@core/utils';
import type { CacheProtocol } from '@core/protocols';
import type { PlatformDashboardMetrics } from '../entities';
import type { DashboardRepository } from '../repositories/DashboardRepository';

const CACHE_TTL_SECONDS = 300; // 5 minutes

export interface GetPlatformDashboardUseCase {
  execute(): Promise<DomainResult<PlatformDashboardMetrics>>;
}

export const GetPlatformDashboardUseCaseImpl = ({
  dashboardRepository,
  cacheProtocol,
}: {
  dashboardRepository: DashboardRepository;
  cacheProtocol: CacheProtocol;
}): GetPlatformDashboardUseCase => ({
  execute: async () => {
    const cacheKey = 'dashboard:platform:admin';

    // Try cache first
    const cached = await cacheProtocol.get<PlatformDashboardMetrics>(cacheKey);
    if (cached) {
      return ok(cached);
    }

    // Fetch from repository
    const result = await dashboardRepository.getPlatformMetrics();

    // Cache on success
    if (result.success) {
      await cacheProtocol.set(cacheKey, result.data, CACHE_TTL_SECONDS);
    }

    return result;
  },
});
