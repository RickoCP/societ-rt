/**
 * PatrolAttendance — Domain entity representing a security guard's
 * check-in for a patrol schedule.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 12.2
 */

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface PatrolAttendance {
  readonly id: string;
  readonly scheduleId: string;
  readonly userId: string;
  readonly checkInTimestamp: Date;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to record patrol attendance. */
export interface RecordAttendanceInput {
  readonly scheduleId: string;
  readonly checkInTimestamp: Date;
}
