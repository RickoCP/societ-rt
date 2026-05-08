/**
 * PatrolRoute — Domain entity representing a predefined patrol route
 * with ordered checkpoints within a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 35.1, 35.2
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

/** A single checkpoint on a patrol route. */
export interface PatrolCheckpoint {
  readonly latitude: number;
  readonly longitude: number;
  readonly label: string;
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface PatrolRoute {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  /** Ordered list of checkpoint GPS coordinates. */
  readonly checkpoints: PatrolCheckpoint[];
  /** Estimated patrol duration in minutes. */
  readonly estimatedDuration: number;
  readonly createdBy: string;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a new patrol route. */
export interface CreatePatrolRouteInput {
  readonly name: string;
  readonly checkpoints: PatrolCheckpoint[];
  /** Estimated patrol duration in minutes. */
  readonly estimatedDuration: number;
}
