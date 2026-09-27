/**
 * GetSecurityMapDataUseCase — Aggregates all security-related map data
 * (incidents, CCTV positions, panic alerts, gates, patrol routes, guard
 * positions) with layer toggle support.
 *
 * Access restricted to Ketua_RT, Pengurus, and Security_Guard roles.
 *
 * @see Requirements 42.1, 42.2, 42.5, 42.8
 */

import { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, authorizationError } from '@core/utils';
import type { IncidentRepository } from '../../incident/repositories/IncidentRepository';
import type { CctvRepository } from '../../cctv/repositories/CctvRepository';
import type { GateRepository } from '../../gate/repositories/GateRepository';
import type { PatrolRepository } from '../../patrol/repositories/PatrolRepository';
import type { EmergencyRepository } from '../../emergency/repositories/EmergencyRepository';
import type {
  SecurityMapData,
  SecurityMapLayer,
  IncidentMarker,
  CctvMarker,
  PanicAlertMarker,
  GateMarker,
  PatrolRouteLayer,
  GuardPositionMarker,
} from '../entities/SecurityMapTypes';
import type { AuthContextCompat } from '@core/domains/authorization/types';
import { getTenantId, hasAllowedUserRole } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Allowed roles
// ---------------------------------------------------------------------------

const ALLOWED_ROLES_SET: ReadonlySet<UserRole> = new Set([
  UserRole.Ketua_RT,
  UserRole.Pengurus,
  UserRole.Security_Guard,
]);

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface GetSecurityMapDataUseCase {
  execute(params: {
    authContext: AuthContextCompat;
    layers?: SecurityMapLayer[];
  }): Promise<DomainResult<SecurityMapData>>;
}

// ---------------------------------------------------------------------------
// Factory implementation
// ---------------------------------------------------------------------------

export const GetSecurityMapDataUseCaseImpl = ({
  incidentRepository,
  cctvRepository,
  gateRepository,
  patrolRepository,
  emergencyRepository,
}: {
  incidentRepository: IncidentRepository;
  cctvRepository: CctvRepository;
  gateRepository: GateRepository;
  patrolRepository: PatrolRepository;
  emergencyRepository: EmergencyRepository;
}): GetSecurityMapDataUseCase => ({
  execute: async ({ authContext, layers }) => {
    // Role check
    if (!hasAllowedUserRole(authContext, ALLOWED_ROLES_SET)) {
      return fail(
        authorizationError(
          'SECURITY_MAP_ACCESS_DENIED',
          'User does not have permission to access security map data',
        ),
      );
    }

    const tenantId = getTenantId(authContext);

    // Determine which layers to fetch (default: all)
    const activeLayers: SecurityMapLayer[] = layers ?? [
      'incidents',
      'cctv',
      'panic_alerts',
      'gates',
      'patrol_routes',
      'guard_positions',
    ];

    // Fetch data for each active layer in parallel
    const [
      incidentsResult,
      cctvResult,
      gatesResult,
      patrolRoutesResult,
      activeSessionsResult,
      panicAlertsResult,
    ] = await Promise.all([
      activeLayers.includes('incidents')
        ? incidentRepository.findByTenant(tenantId, 1, 200)
        : Promise.resolve(null),
      activeLayers.includes('cctv')
        ? cctvRepository.findByTenant(tenantId)
        : Promise.resolve(null),
      activeLayers.includes('gates')
        ? gateRepository.findByTenant(tenantId)
        : Promise.resolve(null),
      activeLayers.includes('patrol_routes')
        ? patrolRepository.findRoutesByTenant(tenantId)
        : Promise.resolve(null),
      activeLayers.includes('guard_positions')
        ? patrolRepository.findActiveSessions(tenantId)
        : Promise.resolve(null),
      activeLayers.includes('panic_alerts')
        ? emergencyRepository.findActiveByTenant(tenantId)
        : Promise.resolve(null),
    ]);

    // Map incidents to markers (only those with coordinates)
    const incidents: IncidentMarker[] = [];
    if (incidentsResult && incidentsResult.success) {
      for (const incident of incidentsResult.data.data) {
        if (incident.latitude != null && incident.longitude != null) {
          incidents.push({
            id: incident.id,
            latitude: incident.latitude,
            longitude: incident.longitude,
            title: incident.title,
            severity: incident.severity,
            category: incident.category,
            status: incident.status,
            reportedAt: incident.createdAt,
          });
        }
      }
    }

    // Map CCTV cameras to markers
    const cctv: CctvMarker[] = [];
    if (cctvResult && cctvResult.success) {
      for (const camera of cctvResult.data) {
        cctv.push({
          id: camera.id,
          latitude: camera.latitude,
          longitude: camera.longitude,
          name: camera.name,
          location: camera.location,
          status: camera.status,
        });
      }
    }

    // Map panic alerts to markers (only those with coordinates)
    const panicAlerts: PanicAlertMarker[] = [];
    if (panicAlertsResult && panicAlertsResult.success) {
      for (const alert of panicAlertsResult.data) {
        if (alert.latitude != null && alert.longitude != null) {
          panicAlerts.push({
            id: alert.id,
            latitude: alert.latitude,
            longitude: alert.longitude,
            userId: alert.userId,
            status: alert.status,
            triggeredAt: alert.createdAt,
          });
        }
      }
    }

    // Map gates to markers
    const gates: GateMarker[] = [];
    if (gatesResult && gatesResult.success) {
      for (const gate of gatesResult.data) {
        gates.push({
          id: gate.id,
          latitude: gate.latitude,
          longitude: gate.longitude,
          name: gate.name,
          status: gate.status,
          lastStateChange: gate.lastStateChange,
        });
      }
    }

    // Map patrol routes to layers
    const patrolRoutes: PatrolRouteLayer[] = [];
    if (patrolRoutesResult && patrolRoutesResult.success) {
      for (const route of patrolRoutesResult.data) {
        patrolRoutes.push({
          id: route.id,
          name: route.name,
          checkpoints: route.checkpoints.map(cp => ({
            latitude: cp.latitude,
            longitude: cp.longitude,
          })),
          estimatedDuration: route.estimatedDuration,
        });
      }
    }

    // Map active patrol sessions to guard positions
    const guardPositions: GuardPositionMarker[] = [];
    if (activeSessionsResult && activeSessionsResult.success) {
      for (const session of activeSessionsResult.data) {
        // Find the route name for this session
        const route = patrolRoutesResult?.success
          ? patrolRoutesResult.data.find(r => r.id === session.routeId)
          : undefined;

        guardPositions.push({
          sessionId: session.id,
          guardId: session.guardId,
          routeId: session.routeId,
          routeName: route?.name ?? 'Unknown Route',
          status: session.status,
          startedAt: session.startedAt,
          checkpointsVisited: session.checkpointsVisited,
        });
      }
    }

    return ok<SecurityMapData>({
      incidents,
      cctv,
      panicAlerts,
      gates,
      patrolRoutes,
      guardPositions,
    });
  },
});
