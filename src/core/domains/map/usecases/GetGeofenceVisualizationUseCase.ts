/**
 * GetGeofenceVisualizationUseCase — Returns alarm zones and patrol areas
 * as polygon coordinates for geofence visualization on the security map.
 *
 * Patrol areas are derived from patrol route checkpoints (forming a polygon).
 * Alarm zones are derived from alarm device groupings by zone name.
 *
 * Access restricted to Ketua_RT, Pengurus, and Security_Guard roles.
 *
 * @see Requirements 42.6, 42.8
 */

import type { AuthContext, UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, authorizationError } from '@core/utils';
import type { AlarmRepository } from '../../alarm/repositories/AlarmRepository';
import type { PatrolRepository } from '../../patrol/repositories/PatrolRepository';
import type {
  GeofenceVisualizationData,
  GeofenceZone,
  GeoCoordinate,
} from '../entities/SecurityMapTypes';

// ---------------------------------------------------------------------------
// Allowed roles
// ---------------------------------------------------------------------------

const ALLOWED_ROLES: readonly UserRole[] = [
  'Ketua_RT' as UserRole,
  'Pengurus' as UserRole,
  'Security_Guard' as UserRole,
];

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetGeofenceVisualizationUseCase {
  execute(params: {
    authContext: AuthContext;
  }): Promise<DomainResult<GeofenceVisualizationData>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetGeofenceVisualizationUseCaseImpl = ({
  alarmRepository,
  patrolRepository,
}: {
  alarmRepository: AlarmRepository;
  patrolRepository: PatrolRepository;
}): GetGeofenceVisualizationUseCase => ({
  execute: async ({ authContext }) => {
    // Role check
    if (!ALLOWED_ROLES.includes(authContext.role)) {
      return fail(
        authorizationError(
          'SECURITY_MAP_ACCESS_DENIED',
          'User does not have permission to access geofence data',
        ),
      );
    }

    const tenantId = authContext.tenantId;

    // Fetch patrol routes and alarm devices in parallel
    const [patrolRoutesResult, alarmDevicesResult] = await Promise.all([
      patrolRepository.findRoutesByTenant(tenantId),
      alarmRepository.findByTenant(tenantId),
    ]);

    const zones: GeofenceZone[] = [];

    // Convert patrol routes into patrol area polygons
    if (patrolRoutesResult.success) {
      for (const route of patrolRoutesResult.data) {
        if (route.checkpoints.length >= 3) {
          const polygon: GeoCoordinate[] = route.checkpoints.map(cp => ({
            latitude: cp.latitude,
            longitude: cp.longitude,
          }));

          zones.push({
            id: `patrol_${route.id}`,
            name: route.name,
            type: 'patrol_area',
            polygon,
          });
        }
      }
    }

    // Group alarm devices by zone and create alarm zone polygons
    // Note: Alarm devices have zone names but no individual coordinates.
    // We derive unique zone names from the alarm device registry.
    if (alarmDevicesResult.success) {
      const zoneMap = new Map<string, string[]>();

      for (const device of alarmDevicesResult.data) {
        for (const zoneName of device.zones) {
          if (!zoneMap.has(zoneName)) {
            zoneMap.set(zoneName, []);
          }
          zoneMap.get(zoneName)!.push(device.id);
        }
      }

      // Create a geofence zone entry for each unique alarm zone
      for (const [zoneName] of zoneMap) {
        zones.push({
          id: `alarm_${zoneName}`,
          name: zoneName,
          type: 'alarm_zone',
          // Alarm zone polygons are placeholder — coordinates should be
          // configured separately when zone boundaries are defined.
          // For now, we return the zone metadata with an empty polygon.
          polygon: [],
        });
      }
    }

    return ok<GeofenceVisualizationData>({ zones });
  },
});
