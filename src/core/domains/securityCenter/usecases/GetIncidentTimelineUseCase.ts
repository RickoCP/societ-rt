/**
 * GetIncidentTimelineUseCase — Returns chronological security events
 * within a configurable time range (default: last 24 hours).
 *
 * Access restricted to Ketua_RT, Pengurus, Security_Guard roles.
 *
 * @see Requirements 31.3, 31.9
 */

import type { AuthContext } from '@core/protocols';
import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { fail, authorizationError } from '@core/utils';
import type { SecurityTimelineEvent } from '../entities';
import type { SecurityCenterRepository } from '../repositories/SecurityCenterRepository';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_HOURS = 24;
const ALLOWED_ROLES: readonly UserRole[] = [
  UserRole.Ketua_RT,
  UserRole.Pengurus,
  UserRole.Security_Guard,
];

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetIncidentTimelineParams {
  readonly authContext: AuthContext;
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
    if (!ALLOWED_ROLES.includes(authContext.role)) {
      return fail(
        authorizationError(
          'AUTH_INSUFFICIENT_ROLE',
          `Role ${authContext.role} is not allowed to access Security Center timeline`,
        ),
      );
    }

    const lookbackHours = hours ?? DEFAULT_HOURS;
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - lookbackHours * 60 * 60 * 1000);

    return securityCenterRepository.getIncidentTimeline({
      tenantId: authContext.tenantId,
      startTime,
      endTime,
    });
  },
});
