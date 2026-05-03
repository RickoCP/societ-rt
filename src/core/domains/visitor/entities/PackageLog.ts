/**
 * PackageLog — Domain entity representing a package delivery log
 * within a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 15.3, 15.4
 */

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface PackageLog {
  readonly id: string;
  readonly tenantId: string;
  readonly recipientHouseholdId: string;
  readonly courierName: string;
  readonly description: string;
  readonly arrivalTimestamp: Date;
  readonly loggedBy: string;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to log a new package delivery. */
export interface LogPackageInput {
  readonly recipientHouseholdId: string;
  readonly courierName: string;
  readonly description: string;
}
