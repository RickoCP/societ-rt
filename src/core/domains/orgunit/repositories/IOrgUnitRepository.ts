/**
 * IOrgUnitRepository — Repository contract for OrgUnit queries.
 *
 * This interface defines the contract for querying OrgUnit data,
 * independent of database implementation (Clean Architecture).
 *
 * CRITICAL SECURITY RULES:
 * - Tenant boundary MUST be checked before OrgUnit reads
 * - OrgUnit path queries MUST filter by tenantId first
 * - Cross-tenant OrgUnit access MUST be prevented
 *
 * INVARIANTS (not enforced here, validated by OrgUnitHierarchyReader):
 * - INV-ORG-001: OrgUnit parent must belong to same tenant
 * - INV-ORG-002: OrgUnit hierarchy cannot contain cycles
 * - INV-ORG-003: depth = path.length - 1
 * - INV-ORG-004: Root OrgUnit has parentId=NULL, depth=0, path=[id]
 *
 * @see FASE 1.6 Task 6: OrgUnit Hierarchy Read Support
 * @see Requirements 1 (AC 6), 6 (AC 1-2, 5)
 * @see Design OrgUnit Hierarchy Model, INV-ORG-003, INV-ORG-004
 */

import type { OrgUnit } from '../entities';

/**
 * Options for OrgUnit queries.
 */
export interface OrgUnitQueryOptions {
  /**
   * Include children in the result.
   * When true, children array will be populated.
   */
  readonly includeChildren?: boolean;

  /**
   * Include parent in the result.
   * When true, parent will be populated if exists.
   */
  readonly includeParent?: boolean;
}

/**
 * Repository interface for OrgUnit queries.
 *
 * All methods REQUIRE tenantId to ensure tenant isolation.
 * This is a read-only interface for FASE 1.6 (policy-neutral).
 */
export interface IOrgUnitRepository {
  // ---------------------------------------------------------------------------
  // Single OrgUnit Queries
  // ---------------------------------------------------------------------------

  /**
   * Find an OrgUnit by ID within a tenant.
   *
   * SECURITY: Always requires tenantId to ensure tenant boundary.
   *
   * @param orgUnitId - The OrgUnit's ID
   * @param tenantId - The tenant's ID (security boundary)
   * @param options - Query options (include relations)
   * @returns The OrgUnit if found, null otherwise
   */
  findById(
    orgUnitId: string,
    tenantId: string,
    options?: OrgUnitQueryOptions,
  ): Promise<OrgUnit | null>;

  /**
   * Check if an OrgUnit exists within a tenant.
   *
   * Fast existence check without loading full data.
   *
   * @param orgUnitId - The OrgUnit's ID
   * @param tenantId - The tenant's ID
   * @returns true if OrgUnit exists in tenant, false otherwise
   */
  exists(orgUnitId: string, tenantId: string): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Multiple OrgUnit Queries
  // ---------------------------------------------------------------------------

  /**
   * Find all root OrgUnits in a tenant (parentId = NULL).
   *
   * @param tenantId - The tenant's ID
   * @returns Array of root OrgUnits
   */
  findRoots(tenantId: string): Promise<OrgUnit[]>;

  /**
   * Find all OrgUnits in a tenant.
   *
   * @param tenantId - The tenant's ID
   * @returns Array of all OrgUnits in the tenant
   */
  findAllInTenant(tenantId: string): Promise<OrgUnit[]>;

  /**
   * Find direct children of an OrgUnit.
   *
   * @param parentId - The parent OrgUnit's ID
   * @param tenantId - The tenant's ID
   * @returns Array of direct child OrgUnits
   */
  findChildren(parentId: string, tenantId: string): Promise<OrgUnit[]>;

  /**
   * Find all descendants of an OrgUnit (children, grandchildren, etc.).
   *
   * Uses path array for efficient descendant queries.
   *
   * @param ancestorId - The ancestor OrgUnit's ID
   * @param tenantId - The tenant's ID
   * @returns Array of all descendant OrgUnits
   */
  findDescendants(ancestorId: string, tenantId: string): Promise<OrgUnit[]>;

  /**
   * Find all ancestors of an OrgUnit (parent, grandparent, etc.).
   *
   * Uses path array for efficient ancestor queries.
   *
   * @param orgUnitId - The OrgUnit's ID
   * @param tenantId - The tenant's ID
   * @returns Array of ancestor OrgUnits from root to parent (ordered by depth)
   */
  findAncestors(orgUnitId: string, tenantId: string): Promise<OrgUnit[]>;

  // ---------------------------------------------------------------------------
  // Path-based Queries
  // ---------------------------------------------------------------------------

  /**
   * Get the path array for an OrgUnit.
   *
   * @param orgUnitId - The OrgUnit's ID
   * @param tenantId - The tenant's ID
   * @returns The path array if found, null otherwise
   */
  getPath(orgUnitId: string, tenantId: string): Promise<string[] | null>;

  /**
   * Get the depth of an OrgUnit.
   *
   * @param orgUnitId - The OrgUnit's ID
   * @param tenantId - The tenant's ID
   * @returns The depth if found, null otherwise
   */
  getDepth(orgUnitId: string, tenantId: string): Promise<number | null>;
}
