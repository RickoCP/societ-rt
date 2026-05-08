/**
 * PatrolCheckpointVisit — Domain entity representing a single checkpoint
 * visit recorded during a patrol session.
 *
 * Captures the guard's GPS position and distance from the checkpoint
 * at the time of visit.
 *
 * @see Requirements 35.4, 35.5
 */

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface PatrolCheckpointVisit {
  readonly id: string;
  readonly sessionId: string;
  readonly checkpointIndex: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly visitedAt: Date;
  /** Distance from the checkpoint in meters. */
  readonly distanceFromCheckpoint: number;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to record a checkpoint visit. */
export interface RecordCheckpointVisitInput {
  readonly checkpointIndex: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly distanceFromCheckpoint: number;
}
