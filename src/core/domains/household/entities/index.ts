/**
 * Household entities barrel export.
 *
 * Re-exports Household entity from resident domain for domain-specific usage.
 * The Household entity lives in resident domain, but household-specific services
 * may reference it through this module.
 *
 * @see INV-HOUSEHOLD-001: Household.tenantId == Resident.tenantId
 */

// Re-export from resident domain for convenience
export type {
  Household,
  CreateHouseholdInput,
} from '@core/domains/resident/entities';

// Household-specific types for isolation service
export interface HouseholdWithHead {
  /** The household */
  readonly household: {
    readonly id: string;
    readonly tenantId: string;
    readonly householdNumber: string;
    readonly address: string;
    readonly block: string | null;
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  };
  /** The household head user ID (first resident or explicitly designated) */
  readonly headUserId: string | null;
  /** The OrgUnit this household belongs to (if tracked) */
  readonly orgUnitId: string | null;
}

/**
 * Household member information for access control.
 */
export interface HouseholdMember {
  /** The resident ID */
  readonly residentId: string;
  /** The user ID if resident has a linked user account */
  readonly userId: string | null;
  /** The tenant ID */
  readonly tenantId: string;
  /** The household ID */
  readonly householdId: string;
  /** Whether this member is the household head */
  readonly isHead: boolean;
}
