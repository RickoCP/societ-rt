/**
 * SecurityMapTypes — Domain entities representing security-related map
 * layer markers and data structures for the security map visualization.
 *
 * Plain TypeScript interfaces — no classes, no decorators, no external deps.
 *
 * @see Requirements 42.1, 42.2, 42.5, 42.6, 42.7
 */

// ---------------------------------------------------------------------------
// Common types
// ---------------------------------------------------------------------------

/** Geographic coordinate pair. */
export interface GeoCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

/** Polygon defined as an array of coordinate points. */
export type GeoPolygon = readonly GeoCoordinate[];

// ---------------------------------------------------------------------------
// Map layer toggle
// ---------------------------------------------------------------------------

/** Available security map layers that can be toggled on/off. */
export type SecurityMapLayer =
  | 'incidents'
  | 'cctv'
  | 'panic_alerts'
  | 'gates'
  | 'patrol_routes'
  | 'guard_positions';

// ---------------------------------------------------------------------------
// Marker types
// ---------------------------------------------------------------------------

/** Incident marker on the security map (color-coded by severity). */
export interface IncidentMarker {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly title: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly category: string;
  readonly status: string;
  readonly reportedAt: Date;
}

/** CCTV camera marker on the security map (with online/offline status). */
export interface CctvMarker {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly location: string;
  readonly status: 'online' | 'offline' | 'motion_detected';
}

/** Panic alert marker on the security map. */
export interface PanicAlertMarker {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly userId: string;
  readonly status: 'active' | 'responding' | 'resolved';
  readonly triggeredAt: Date;
}

/** Gate marker on the security map (with open/close status). */
export interface GateMarker {
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly status: 'open' | 'closed' | 'offline';
  readonly lastStateChange: Date;
}

/** Patrol route layer displayed as polyline on the map. */
export interface PatrolRouteLayer {
  readonly id: string;
  readonly name: string;
  readonly checkpoints: readonly GeoCoordinate[];
  readonly estimatedDuration: number;
}

/** Guard position marker showing active patrol guard location. */
export interface GuardPositionMarker {
  readonly sessionId: string;
  readonly guardId: string;
  readonly routeId: string;
  readonly routeName: string;
  readonly status: 'active' | 'completed' | 'abandoned';
  readonly startedAt: Date;
  readonly checkpointsVisited: number;
}

// ---------------------------------------------------------------------------
// Aggregated security map data
// ---------------------------------------------------------------------------

/** Complete security map data with all layers. */
export interface SecurityMapData {
  readonly incidents: readonly IncidentMarker[];
  readonly cctv: readonly CctvMarker[];
  readonly panicAlerts: readonly PanicAlertMarker[];
  readonly gates: readonly GateMarker[];
  readonly patrolRoutes: readonly PatrolRouteLayer[];
  readonly guardPositions: readonly GuardPositionMarker[];
}

// ---------------------------------------------------------------------------
// Heatmap types
// ---------------------------------------------------------------------------

/** A single heatmap data point with weight for density visualization. */
export interface HeatmapPoint {
  readonly latitude: number;
  readonly longitude: number;
  readonly weight: number;
}

/** Time period options for heatmap calculation. */
export type HeatmapTimePeriod = 7 | 30 | 90;

/** Heatmap result containing density points. */
export interface IncidentHeatmapData {
  readonly points: readonly HeatmapPoint[];
  readonly timePeriodDays: HeatmapTimePeriod;
  readonly totalIncidents: number;
}

// ---------------------------------------------------------------------------
// Geofence types
// ---------------------------------------------------------------------------

/** A named geofence zone with polygon coordinates. */
export interface GeofenceZone {
  readonly id: string;
  readonly name: string;
  readonly type: 'alarm_zone' | 'patrol_area';
  readonly polygon: GeoPolygon;
}

/** Geofence visualization data. */
export interface GeofenceVisualizationData {
  readonly zones: readonly GeofenceZone[];
}
