/**
 * GetSecurityDashboardUseCase — Returns aggregated security dashboard metrics.
 *
 * Aggregates: active incidents, emergency alerts, gate status, CCTV status,
 * patrol status, and recent security events (last 20).
 *
 * Uses CacheProtocol for Redis caching with 10s TTL.
 * Cache key: `security_dashboard:{tenantId}`
 *
 * Access restricted to Ketua_RT, Pengurus, Security_Guard roles.
 *
 * @see Requirements 31.1, 31.2, 31.9
 */

import type { AuthContext, CacheProtocol } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, authorizationError } from '@core/utils';
import type { SecurityDashboardMetrics } from '../entities';
import type { SecurityCenterRepository } from '../repositories/SecurityCenterRepository';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_SECONDS = 10;
const ALLOWED_ROLES: readonly UserRole[] = [
  UserRole.Ketua_RT,
  UserRole.Pengurus,
  UserRole.Security_Guard,
];

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetSecurityDashboardUseCase {
  execute(params: {
    authContext: AuthContext;
  }): Promise<DomainResult<SecurityDashboardMetrics>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetSecurityDashboardUseCaseImpl = ({
  securityCenterRepository,
  cacheProtocol,
}: {
  securityCenterRepository: SecurityCenterRepository;
  cacheProtocol: CacheProtocol;
}): GetSecurityDashboardUseCase => ({
  execute: async ({ authContext }) => {
    // Role check
    if (!ALLOWED_ROLES.includes(authContext.role)) {
      return fail(
        authorizationError(
          'AUTH_INSUFFICIENT_ROLE',
          `Role ${authContext.role} is not allowed to access Security Center dashboard`,
        ),
      );
    }

    const cacheKey = `security_dashboard:${authContext.tenantId}`;

    // Try cache first
    const cached = await cacheProtocol.get<SecurityDashboardMetrics>(cacheKey);
    if (cached) {
      return ok(cached);
    }

    // Fetch from repository
    const result = await securityCenterRepository.getDashboardMetrics(
      authContext.tenantId,
    );

    // Cache on success
    if (result.success) {
      await cacheProtocol.set(cacheKey, result.data, CACHE_TTL_SECONDS);
    }

    return result;
  },
});
