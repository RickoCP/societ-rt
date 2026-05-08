/**
 * PatrolRepository — Core repository interface for patrol management
 * persistence operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation.
 *
 * @see Requirements 35.1, 35.2, 35.3, 35.4, 35.5, 35.7
 */

import type { DomainResult } from '@core/utils';
import type {
  PatrolRoute,
  CreatePatrolRouteInput,
  PatrolSession,
  StartPatrolSessionInput,
  CompletePatrolSessionInput,
  PatrolCheckpointVisit,
  RecordCheckpointVisitInput,
} from '../entities';

// ---------------------------------------------------------------------------
// Analytics type
// ---------------------------------------------------------------------------

/** Aggregated patrol analytics for a given time range. */
export interface PatrolAnalytics {
  readonly totalSessions: number;
  readonly completedSessions: number;
  readonly abandonedSessions: number;
  /** Average patrol duration in minutes. */
  readonly averageDuration: number;
  /** Average number of checkpoints visited per session. */
  readonly averageCheckpointsVisited: number;
  /** Total distance traveled across all sessions in meters. */
  readonly totalDistanceTraveled: number;
  readonly timeRange: {
    readonly from: Date;
    readonly to: Date;
  };
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface PatrolRepository {
  /** Create a new patrol route within a tenant. */
  createRoute(
    tenantId: string,
    createdBy: string,
    data: CreatePatrolRouteInput,
  ): Promise<DomainResult<PatrolRoute>>;

  /** Find all patrol routes for a tenant. */
  findRoutesByTenant(tenantId: string): Promise<DomainResult<PatrolRoute[]>>;

  /** Start a new patrol session for a guard. */
  startSession(
    tenantId: string,
    guardId: string,
    data: StartPatrolSessionInput,
  ): Promise<DomainResult<PatrolSession>>;

  /** Record a checkpoint visit during a patrol session. */
  recordCheckpointVisit(
    tenantId: string,
    sessionId: string,
    data: RecordCheckpointVisitInput,
  ): Promise<DomainResult<PatrolCheckpointVisit>>;

  /** Complete a patrol session. */
  completeSession(
    tenantId: string,
    sessionId: string,
    data: CompletePatrolSessionInput,
  ): Promise<DomainResult<PatrolSession>>;

  /** Get aggregated patrol analytics for a tenant within a time range. */
  getPatrolAnalytics(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<DomainResult<PatrolAnalytics>>;

  /** Find all active patrol sessions for a tenant. */
  findActiveSessions(
    tenantId: string,
  ): Promise<DomainResult<PatrolSession[]>>;
}
