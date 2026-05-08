/**
 * GetSecurityAnalyticsUseCase — Returns security analytics data including
 * incident count by severity over time, average response time, incidents
 * by category, patrol coverage percentage, and device event frequency.
 *
 * Access restricted to Ketua_RT, Pengurus, Security_Guard roles.
 *
 * @see Requirements 31.6, 31.9
 */

import type { AuthContext } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, authorizationError } from '@core/utils';
import type { SecurityAnalytics } from '../entities';
import type { SecurityCenterRepository } from '../repositories/SecurityCenterRepository';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DAYS = 30;
const ALLOWED_ROLES: readonly UserRole[] = [
  UserRole.Ketua_RT,
  UserRole.Pengurus,
  UserRole.Security_Guard,
];

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetSecurityAnalyticsParams {
  readonly authContext: AuthContext;
  /** Number of days to look back. Defaults to 30. */
  readonly days?: number;
}

export interface GetSecurityAnalyticsUseCase {
  execute(params: GetSecurityAnalyticsParams): Promise<DomainResult<SecurityAnalytics>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetSecurityAnalyticsUseCaseImpl = ({
  securityCenterRepository,
}: {
  securityCenterRepository: SecurityCenterRepository;
}): GetSecurityAnalyticsUseCase => ({
  execute: async ({ authContext, days }) => {
    // Role check
    if (!ALLOWED_ROLES.includes(authContext.role)) {
      return fail(
        authorizationError(
          'AUTH_INSUFFICIENT_ROLE',
          `Role ${authContext.role} is not allowed to access Security Center analytics`,
        ),
      );
    }

    const lookbackDays = days ?? DEFAULT_DAYS;
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    return securityCenterRepository.getSecurityAnalytics({
      tenantId: authContext.tenantId,
      startTime,
      endTime,
    });
  },
});
