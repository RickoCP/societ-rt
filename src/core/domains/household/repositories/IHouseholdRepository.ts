/**
 * IHouseholdRepository — Repository contract for Household queries.
 *
 * This interface defines the contract for querying household data,
 * independent of database implementation (Clean Architecture).
 *
 * CRITICAL SECURITY RULES:
 * - All queries MUST include tenantId for tenant isolation
 * - Household data MUST NOT be accessible across tenant boundaries
 * - Cross-household access MUST be explicitly authorized
 *
 * INVARIANTS ENFORCED:
 * - INV-HOUSEHOLD-001: Household.tenantId == Resident.tenantId for all residents
 *
 * @see Task 55: Household Isolation Enforcement
 * @see INV-HOUSEHOLD-001
 */

import type { DomainResult } from '@core/utils';
import type { Household, Resident } from '@core/domains/resident/entities';
import type { HouseholdMember, HouseholdWithHead } from '../entities';

/**
 * Repository interface for Household queries.
 *
 * All methods REQUIRE tenantId to ensure tenant isolation.
 * This is the read-only interface for household isolation checks.
 */
export interface IHouseholdRepository {
  // ---------------------------------------------------------------------------
  // Household Lookup
  // ---------------------------------------------------------------------------

  /**
   * Find a household by ID within a tenant.
   *
   * SECURITY: Always requires tenantId to ensure tenant boundary.
   *
   * @param householdId - The household's ID
   * @param tenantId - The tenant's ID (security boundary)
   * @returns The household if found, null otherwise
   */
  findById(householdId: string, tenantId: string): Promise<Household | null>;

  /**
   * Check if a household exists within a tenant.
   *
   * Fast existence check without loading full data.
   *
   * @param householdId - The household's ID
   * @param tenantId - The tenant's ID
   * @returns true if household exists in tenant, false otherwise
   */
  exists(householdId: string, tenantId: string): Promise<boolean>;

  /**
   * Find a household with its head information.
   *
   * @param householdId - The household's ID
   * @param tenantId - The tenant's ID
   * @returns Household with head info if found, null otherwise
   */
  findWithHead(householdId: string, tenantId: string): Promise<HouseholdWithHead | null>;

  // ---------------------------------------------------------------------------
  // Resident-Household Queries
  // ---------------------------------------------------------------------------

  /**
   * Get all members of a household.
   *
   * @param householdId - The household's ID
   * @param tenantId - The tenant's ID
   * @returns Array of household members
   */
  getMembers(householdId: string, tenantId: string): Promise<HouseholdMember[]>;

  /**
   * Find the household head member.
   *
   * @param householdId - The household's ID
   * @param tenantId - The tenant's ID
   * @returns The household head member if found, null otherwise
   */
  findHead(householdId: string, tenantId: string): Promise<HouseholdMember | null>;

  /**
   * Check if a user is a member of a household.
   *
   * @param userId - The user's ID
   * @param householdId - The household's ID
   * @param tenantId - The tenant's ID
   * @returns true if user is a member, false otherwise
   */
  isUserMember(userId: string, householdId: string, tenantId: string): Promise<boolean>;

  /**
   * Check if a user is the head of a household.
   *
   * @param userId - The user's ID
   * @param householdId - The household's ID
   * @param tenantId - The tenant's ID
   * @returns true if user is the head, false otherwise
   */
  isUserHead(userId: string, householdId: string, tenantId: string): Promise<boolean>;

  /**
   * Get the household(s) a user belongs to within a tenant.
   *
   * A user may belong to multiple households in different tenants,
   * but typically only one within a single tenant.
   *
   * @param userId - The user's ID
   * @param tenantId - The tenant's ID
   * @returns Array of households the user belongs to
   */
  findByUserId(userId: string, tenantId: string): Promise<Household[]>;

  // ---------------------------------------------------------------------------
  // Resident Queries
  // ---------------------------------------------------------------------------

  /**
   * Find a resident by ID within a tenant.
   *
   * @param residentId - The resident's ID
   * @param tenantId - The tenant's ID
   * @returns The resident if found, null otherwise
   */
  findResidentById(residentId: string, tenantId: string): Promise<Resident | null>;

  /**
   * Get the household ID for a resident.
   *
   * @param residentId - The resident's ID
   * @param tenantId - The tenant's ID
   * @returns The household ID if found, null otherwise
   */
  getResidentHouseholdId(residentId: string, tenantId: string): Promise<string | null>;

  // ---------------------------------------------------------------------------
  // Validation Queries
  // ---------------------------------------------------------------------------

  /**
   * Validate that a household belongs to the specified tenant.
   *
   * INV-HOUSEHOLD-001 validation: Ensures tenant isolation.
   *
   * @param householdId - The household's ID
   * @param tenantId - The expected tenant's ID
   * @returns DomainResult with true if valid, error otherwise
   */
  validateTenantOwnership(
    householdId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;

  /**
   * Validate that a resident belongs to the same tenant as the household.
   *
   * INV-HOUSEHOLD-001 validation: Household.tenantId == Resident.tenantId
   *
   * @param residentId - The resident's ID
   * @param householdId - The household's ID
   * @param tenantId - The expected tenant's ID
   * @returns DomainResult with true if valid, error otherwise
   */
  validateResidentHouseholdTenant(
    residentId: string,
    householdId: string,
    tenantId: string,
  ): Promise<DomainResult<boolean>>;
}
