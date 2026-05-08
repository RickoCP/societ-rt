/**
 * IncidentLog — Domain entity representing a status change or note
 * entry in an incident's lifecycle.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 32.4
 */

import type { IncidentStatus } from './Incident';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface IncidentLog {
  readonly id: string;
  readonly incidentId: string;
  readonly status: IncidentStatus;
  readonly notes: string | null;
  readonly actorId: string;
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to add a log entry to an incident. */
export interface CreateIncidentLogInput {
  readonly status: IncidentStatus;
  readonly notes?: string | null;
  readonly actorId: string;
}
