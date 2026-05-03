/**
 * PatrolSchedule — Domain entity representing a security patrol schedule
 * within a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 12.1, 12.2
 */

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface PatrolSchedule {
  readonly id: string;
  readonly tenantId: string;
  readonly date: Date;
  readonly timeSlot: string;
  readonly assignedUserIds: string[];
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a new patrol schedule. */
export interface CreatePatrolScheduleInput {
  readonly date: Date;
  readonly timeSlot: string;
  readonly assignedUserIds: string[];
}
