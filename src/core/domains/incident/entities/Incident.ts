/**
 * Incident — Domain entity representing a security incident reported
 * within a tenant community.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 32.1, 32.2, 32.3, 32.6
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentCategory =
  | 'theft'
  | 'vandalism'
  | 'trespassing'
  | 'fire'
  | 'flood'
  | 'suspicious_activity'
  | 'noise_complaint'
  | 'device_alert'
  | 'other';

export type IncidentStatus =
  | 'open'
  | 'acknowledged'
  | 'in_progress'
  | 'escalated'
  | 'resolved'
  | 'closed';

// ---------------------------------------------------------------------------
// Status transition map
// ---------------------------------------------------------------------------

/**
 * Allowed status transitions for an incident.
 * Key = current status, Value = set of valid next statuses.
 */
export const INCIDENT_STATUS_TRANSITIONS: Record<
  IncidentStatus,
  readonly IncidentStatus[]
> = {
  open: ['acknowledged', 'in_progress', 'escalated'],
  acknowledged: ['in_progress', 'escalated'],
  in_progress: ['escalated', 'resolved'],
  escalated: ['in_progress', 'resolved'],
  resolved: ['closed'],
  closed: [],
} as const;

/**
 * Check whether a status transition is valid.
 */
export function isValidIncidentTransition(
  from: IncidentStatus,
  to: IncidentStatus,
): boolean {
  return (
    INCIDENT_STATUS_TRANSITIONS[from] as readonly IncidentStatus[]
  ).includes(to);
}

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface Incident {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly description: string;
  readonly location: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly severity: IncidentSeverity;
  readonly category: IncidentCategory;
  readonly status: IncidentStatus;
  readonly reportedBy: string;
  readonly assignedTo: string | null;
  readonly escalatedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly evidenceUrls: string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a new incident record. */
export interface CreateIncidentInput {
  readonly title: string;
  readonly description: string;
  readonly location: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly severity: IncidentSeverity;
  readonly category: IncidentCategory;
  readonly reportedBy: string;
  readonly assignedTo?: string | null;
}

/** Maximum number of evidence files allowed per incident. */
export const INCIDENT_MAX_EVIDENCE_FILES = 5;
