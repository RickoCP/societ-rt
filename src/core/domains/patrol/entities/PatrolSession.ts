/**
 * PatrolSession — Domain entity representing an active or completed
 * patrol session by a security guard.
 *
 * Tracks the guard's progress along a route including checkpoints
 * visited and distance traveled.
 *
 * @see Requirements 35.3, 35.5, 35.8
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type PatrolSessionStatus = 'active' | 'completed' | 'abandoned';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface PatrolSession {
  readonly id: string;
  readonly tenantId: string;
  readonly routeId: string;
  readonly guardId: string;
  readonly status: PatrolSessionStatus;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  /** Number of checkpoints visited so far. */
  readonly checkpointsVisited: number;
  /** Total distance traveled in meters. */
  readonly distanceTraveled: number;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to start a new patrol session. */
export interface StartPatrolSessionInput {
  readonly routeId: string;
}

/** Data required to complete a patrol session. */
export interface CompletePatrolSessionInput {
  readonly distanceTraveled: number;
}
