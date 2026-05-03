/**
 * VisitorLog — Domain entity representing a visitor entry log
 * within a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 15.1, 15.2
 */

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface VisitorLog {
  readonly id: string;
  readonly tenantId: string;
  readonly visitorName: string;
  readonly purpose: string;
  readonly destinationHouseholdId: string;
  readonly entryTimestamp: Date;
  readonly exitTimestamp: Date | null;
  readonly loggedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to log a new visitor entry. */
export interface LogVisitorInput {
  readonly visitorName: string;
  readonly purpose: string;
  readonly destinationHouseholdId: string;
}
