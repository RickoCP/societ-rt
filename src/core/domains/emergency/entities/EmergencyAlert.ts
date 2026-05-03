/**
 * EmergencyAlert — Domain entity representing an emergency alert
 * triggered by a Warga within a tenant.
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 10.1, 10.2, 10.3, 10.4
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type EmergencyAlertStatus = 'active' | 'responding' | 'resolved';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface EmergencyAlert {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly locationUnavailable: boolean;
  readonly status: EmergencyAlertStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data required to create a new emergency alert. */
export interface CreateEmergencyAlertInput {
  readonly latitude?: number;
  readonly longitude?: number;
}
