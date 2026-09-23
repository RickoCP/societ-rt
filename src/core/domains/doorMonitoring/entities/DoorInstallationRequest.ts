/**
 * DoorInstallationRequest — Domain entity for an RT-submitted request to have
 * a door sensor installed & registered for a household.
 *
 * Only a platform admin (Super_Admin) may approve and register the physical
 * device id. An RT (Ketua_RT/Pengurus) can only raise the request.
 *
 * Plain TypeScript — no external dependencies.
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type DoorInstallationStatus = 'pending' | 'approved' | 'rejected';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface DoorInstallationRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly householdId: string;
  /** userId of the RT who raised the request. */
  readonly requestedBy: string;
  readonly status: DoorInstallationStatus;
  readonly note: string | null;
  /** userId of the admin who approved/rejected, if resolved. */
  readonly resolvedBy: string | null;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

/**
 * A DoorInstallationRequest enriched with the target household's human-readable
 * identity, for listing screens where showing a raw householdId is unhelpful.
 */
export interface DoorInstallationRequestView extends DoorInstallationRequest {
  readonly householdNumber: string;
  readonly householdAddress: string;
  readonly householdBlock: string | null;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Data an RT provides to request door-sensor installation for a household. */
export interface CreateDoorInstallationRequestInput {
  readonly householdId: string;
  readonly note?: string;
}
