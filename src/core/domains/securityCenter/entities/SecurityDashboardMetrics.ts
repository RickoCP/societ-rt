/**
 * SecurityDashboardMetrics — Domain entity representing aggregated
 * security dashboard data for a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 31.1, 31.2, 31.6
 */

import type { IncidentSeverity, IncidentCategory } from '@core/domains/incident/entities';

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export interface GateStatusSummary {
  readonly open: number;
  readonly closed: number;
  readonly offline: number;
}

export interface CctvStatusSummary {
  readonly online: number;
  readonly offline: number;
}

export interface PatrolStatusSummary {
  readonly activeSessions: number;
}

export interface SecurityEvent {
  readonly id: string;
  readonly type: 'incident' | 'alert' | 'device_event' | 'patrol_checkin' | 'gate_event';
  readonly title: string;
  readonly severity: IncidentSeverity | null;
  readonly category: IncidentCategory | null;
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// Main entity
// ---------------------------------------------------------------------------

export interface SecurityDashboardMetrics {
  readonly activeIncidents: number;
  readonly emergencyAlerts: number;
  readonly gateStatus: GateStatusSummary;
  readonly cctvStatus: CctvStatusSummary;
  readonly patrolStatus: PatrolStatusSummary;
  readonly recentEvents: SecurityEvent[];
}

// ---------------------------------------------------------------------------
// Analytics types
// ---------------------------------------------------------------------------

export interface IncidentCountBySeverity {
  readonly severity: IncidentSeverity;
  readonly count: number;
}

export interface IncidentCountByCategory {
  readonly category: IncidentCategory;
  readonly count: number;
}

export interface DeviceEventFrequency {
  readonly deviceType: string;
  readonly count: number;
}

export interface SecurityAnalytics {
  readonly incidentsBySeverity: IncidentCountBySeverity[];
  readonly averageResponseTime: number; // in minutes
  readonly incidentsByCategory: IncidentCountByCategory[];
  readonly patrolCoveragePercentage: number;
  readonly deviceEventFrequency: DeviceEventFrequency[];
  readonly timeRange: {
    readonly start: Date;
    readonly end: Date;
  };
}

// ---------------------------------------------------------------------------
// Timeline types
// ---------------------------------------------------------------------------

export interface SecurityTimelineEvent {
  readonly id: string;
  readonly type: 'incident' | 'alert' | 'device_event' | 'patrol_checkin' | 'gate_event';
  readonly title: string;
  readonly description: string | null;
  readonly severity: IncidentSeverity | null;
  readonly category: IncidentCategory | null;
  readonly location: string | null;
  readonly actorId: string | null;
  readonly timestamp: Date;
}
