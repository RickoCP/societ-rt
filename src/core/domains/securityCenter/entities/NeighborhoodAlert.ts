/**
 * NeighborhoodAlert — Domain entity representing a security alert
 * broadcast to all residents within a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 31.4, 31.5
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface NeighborhoodAlert {
  readonly id: string;
  readonly tenantId: string;
  readonly severity: AlertSeverity;
  readonly message: string;
  readonly createdBy: string;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateNeighborhoodAlertInput {
  readonly severity: AlertSeverity;
  readonly message: string;
}
