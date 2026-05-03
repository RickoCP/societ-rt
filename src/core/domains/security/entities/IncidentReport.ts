/**
 * IncidentReport — Domain entity representing a security incident report
 * within a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 12.3, 12.4
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface IncidentReport {
  readonly id: string;
  readonly tenantId: string;
  readonly date: Date;
  readonly time: string;
  readonly description: string;
  readonly location: string;
  readonly severityLevel: SeverityLevel;
  readonly reportedBy: string;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a new incident report. */
export interface CreateIncidentReportInput {
  readonly date: Date;
  readonly time: string;
  readonly description: string;
  readonly location: string;
  readonly severityLevel: SeverityLevel;
}
