/**
 * GetIncidentHeatmapUseCase — Calculates incident density over a
 * configurable time period (7/30/90 days) for heatmap visualization.
 *
 * Access restricted to Ketua_RT, Pengurus, and Security_Guard roles.
 *
 * @see Requirements 42.7, 42.8
 */

import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, authorizationError } from '@core/utils';
import type { IncidentRepository } from '../../incident/repositories/IncidentRepository';
import type {
  IncidentHeatmapData,
  HeatmapPoint,
  HeatmapTimePeriod,
} from '../entities/SecurityMapTypes';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, hasAllowedUserRole } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Allowed roles
// ---------------------------------------------------------------------------

const ALLOWED_ROLES: ReadonlySet<UserRole> = new Set([
  'Ketua_RT' as UserRole,
  'Pengurus' as UserRole,
  'Security_Guard' as UserRole,
]);

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetIncidentHeatmapUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    timePeriodDays: HeatmapTimePeriod;
  }): Promise<DomainResult<IncidentHeatmapData>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetIncidentHeatmapUseCaseImpl = ({
  incidentRepository,
}: {
  incidentRepository: IncidentRepository;
}): GetIncidentHeatmapUseCase => ({
  execute: async ({ authContext, timePeriodDays }) => {
    // Role check
    if (!hasAllowedUserRole(authContext, ALLOWED_ROLES)) {
      return fail(
        authorizationError(
          'SECURITY_MAP_ACCESS_DENIED',
          'User does not have permission to access incident heatmap data',
        ),
      );
    }

    const tenantId = getTenantId(authContext);

    // Fetch incidents within the time period
    // We fetch a large page to get all incidents for heatmap calculation
    const result = await incidentRepository.findByTenant(
      tenantId,
      1,
      1000,
    );

    if (!result.success) {
      return fail(result.error);
    }

    // Filter incidents by time period and extract heatmap points
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timePeriodDays);

    const points: HeatmapPoint[] = [];
    let totalIncidents = 0;

    for (const incident of result.data.data) {
      if (incident.createdAt >= cutoffDate) {
        totalIncidents++;
        if (incident.latitude != null && incident.longitude != null) {
          // Weight based on severity
          const weight = getSeverityWeight(incident.severity);
          points.push({
            latitude: incident.latitude,
            longitude: incident.longitude,
            weight,
          });
        }
      }
    }

    return ok<IncidentHeatmapData>({
      points,
      timePeriodDays,
      totalIncidents,
    });
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map incident severity to a numeric weight for heatmap density. */
function getSeverityWeight(
  severity: 'low' | 'medium' | 'high' | 'critical',
): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
  }
}
