/**
 * EmergencyContact — Domain entity for a callable emergency phone number
 * configured per RT (tenant).
 *
 * Admins (Ketua_RT / Pengurus / Super_Admin) manage the list; residents view
 * it and tap to call. Plain TypeScript — no external dependencies.
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type EmergencyContactCategory =
  | 'police'
  | 'ambulance'
  | 'fire'
  | 'hospital'
  | 'security'
  | 'rt_officer'
  | 'other';

export const EMERGENCY_CONTACT_CATEGORIES: readonly EmergencyContactCategory[] =
  ['police', 'ambulance', 'fire', 'hospital', 'security', 'rt_officer', 'other'];

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface EmergencyContact {
  readonly id: string;
  readonly tenantId: string;
  /** Human-readable name, e.g. "Polisi Sektor", "Pos Satpam RT". */
  readonly label: string;
  /** Dialable phone number (kept as a string to preserve leading zeros / +). */
  readonly phone: string;
  readonly category: EmergencyContactCategory;
  readonly description: string | null;
  /** Lower sorts first in the resident list. */
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data to create a new emergency contact. */
export interface CreateEmergencyContactInput {
  readonly label: string;
  readonly phone: string;
  readonly category?: EmergencyContactCategory;
  readonly description?: string | null;
  readonly sortOrder?: number;
}

/** Partial update to an emergency contact. */
export interface UpdateEmergencyContactInput {
  readonly label?: string;
  readonly phone?: string;
  readonly category?: EmergencyContactCategory;
  readonly description?: string | null;
  readonly sortOrder?: number;
}
