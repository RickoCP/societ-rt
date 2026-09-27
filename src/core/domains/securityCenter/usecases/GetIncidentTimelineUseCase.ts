/**
 * GetIncidentTimelineUseCase — Returns chronological security events
 * within a configurable time range (default: last 24 hours).
 *
 * Access restricted to Ketua_RT, Pengurus, Security_Guard roles.
 *
 * @see Requirements 31.3, 31.9
 */

import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, authorizationError } from '@core/utils';
import type { SecurityTimelineEvent } from '../entities';
import type { SecurityCenterRepository } from '../repositories/SecurityCenterRepository';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, hasAllowedUserRole } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_HOURS = 24;
const ALLOWED_ROLES_SET: ReadonlySet<UserRole> = new Set([
  UserRole.Ketua_RT,
  UserRole.Pengurus,
  UserRole.Security_Guard,
]);

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetIncidentTimelineParams {
  readonly authContext: AuthContextCompat;
  /** Number of hours to look back. Defaults to 24. */
  readonly hours?: number;
}

export interface GetIncidentTimelineUseCase {
  execute(params: GetIncidentTimelineParams): Promise<DomainResult<SecurityTimelineEvent[]>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetIncidentTimelineUseCaseImpl = ({
  securityCenterRepository,
}: {
  securityCenterRepository: SecurityCenterRepository;
}): GetIncidentTimelineUseCase => ({
  execute: async ({ authContext, hours }) => {
    // Role check
    if (!hasAllowedUserRole(authContext, ALLOWED_ROLES_SET)) {
      return fail(
        authorizationError(
          'AUTH_INSUFFICIENT_ROLE',
          `User role is not allowed to access Security Center timeline`,
        ),
      );
    }

    const tenantId = getTenantId(authContext);
    const lookbackHours = hours ?? DEFAULT_HOURS;
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - lookbackHours * 60 * 60 * 1000);

    return securityCenterRepository.getIncidentTimeline({
      tenantId,
      startTime,
      endTime,
    });
  },
});
