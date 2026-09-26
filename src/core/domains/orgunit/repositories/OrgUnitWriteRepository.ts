/**
 * OrgUnitWriteRepository — Write repository contract for OrgUnit operations.
 *
 * This interface provides write operations needed for OrgUnit management
 * (create, update, move, delete) following Clean Architecture principles.
 *
 * **SECURITY CONSIDERATIONS:**
 * - All write operations MUST validate tenant boundary (INV-ORG-001)
 * - Cycle detection MUST be performed before hierarchy changes (INV-ORG-002)
 * - Path/depth MUST be recomputed on hierarchy changes (INV-ORG-003)
 *
 * **INVARIANTS ENFORCED:**
 * - INV-ORG-001: OrgUnit parent must belong to same tenant
 * - INV-ORG-002: OrgUnit hierarchy cannot contain cycles
 * - INV-ORG-003: depth = path.length - 1
 * - INV-ORG-004: Root OrgUnit has parentId=NULL, depth=0, path=[id]
 *
 * @see FASE 1.19 Task 57: OrgUnit Management Service
 * @see Requirements 21 (AC 1-9), Requirements 46 (AC 1-9)
 * @see Design OrgUnit Hierarchy Model
 */

import type { DomainResult } from '@core/utils';
import type { OrgUnit, CreateOrgUnitInput, UpdateOrgUnitInput } from '../entities';

/**
 * Full OrgUnit creation data including computed fields.
 */
export interface CreateOrgUnitData extends CreateOrgUnitInput {
  /** The computed path (parent.path + [id]) */
  readonly path: string[];
  /** The computed depth (path.length - 1) */
  readonly depth: number;
}

/**
 * Update data for OrgUnit hierarchy move operations.
 */
export interface MoveOrgUnitData {
  /** New parent ID (null for moving to root) */
  readonly parentId: string | null;
  /** New computed path */
  readonly path: string[];
  /** New computed depth */
  readonly depth: number;
}

/**
 * Batch update for subtree path repair.
 */
export interface SubtreePathUpdate {
  /** OrgUnit ID to update */
  readonly orgUnitId: string;
  /** New path */
  readonly path: string[];
  /** New depth */
  readonly depth: number;
}

/**
 * Write repository interface for OrgUnit operations.
 *
 * All write operations are transactional and validate tenant boundaries.
 */
export interface OrgUnitWriteRepository {
  // ---------------------------------------------------------------------------
  // Create Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new OrgUnit record.
   *
   * IMPORTANT: This method does NOT validate:
   * - Parent existence (caller must check)
   * - Parent tenant consistency (caller must check)
   * - Cycle detection (caller must check)
   *
   * This method DOES enforce:
   * - Database-level constraints
   * - Tenant boundary (via FK constraints)
   *
   * @param data - The OrgUnit data including computed path/depth
   * @returns DomainResult with created OrgUnit or error
   *
   * Possible errors:
   * - ORGUNIT_ALREADY_EXISTS: Duplicate OrgUnit
   * - TECHNICAL_ERROR: Database operation failed
   */
  create(data: CreateOrgUnitData): Promise<DomainResult<OrgUnit>>;

  // ---------------------------------------------------------------------------
  // Update Operations
  // ---------------------------------------------------------------------------

  /**
   * Update an OrgUnit's metadata (name, type).
   *
   * Does NOT change hierarchy (use move for that).
   *
   * @param orgUnitId - The OrgUnit ID to update
   * @param tenantId - The tenant context (security boundary)
   * @param data - The update data
   * @returns DomainResult with updated OrgUnit or error
   *
   * Possible errors:
   * - ORGUNIT_NOT_FOUND: OrgUnit doesn't exist in tenant
   * - TECHNICAL_ERROR: Database operation failed
   */
  update(
    orgUnitId: string,
    tenantId: string,
    data: UpdateOrgUnitInput,
  ): Promise<DomainResult<OrgUnit>>;

  /**
   * Move an OrgUnit to a new parent.
   *
   * Updates parentId, path, and depth for the target OrgUnit.
   * Caller must separately update all descendants.
   *
   * @param orgUnitId - The OrgUnit ID to move
   * @param tenantId - The tenant context (security boundary)
   * @param moveData - The new hierarchy data
   * @returns DomainResult with moved OrgUnit or error
   *
   * Possible errors:
   * - ORGUNIT_NOT_FOUND: OrgUnit doesn't exist in tenant
   * - TECHNICAL_ERROR: Database operation failed
   */
  move(
    orgUnitId: string,
    tenantId: string,
    moveData: MoveOrgUnitData,
  ): Promise<DomainResult<OrgUnit>>;

  /**
   * Batch update paths for a subtree.
   *
   * Used after move operations to update all descendants.
   *
   * @param tenantId - The tenant context (security boundary)
   * @param updates - Array of path updates
   * @returns DomainResult with count of updated records
   *
   * Possible errors:
   * - TECHNICAL_ERROR: Database operation failed
   */
  batchUpdatePaths(
    tenantId: string,
    updates: SubtreePathUpdate[],
  ): Promise<DomainResult<number>>;

  // ---------------------------------------------------------------------------
  // Delete Operations
  // ---------------------------------------------------------------------------

  /**
   * Delete an OrgUnit (hard delete).
   *
   * IMPORTANT: Caller must verify:
   * - No children exist (or delete cascade policy)
   * - No members assigned to this OrgUnit (or reassign)
   *
   * @param orgUnitId - The OrgUnit ID to delete
   * @param tenantId - The tenant context (security boundary)
   * @returns DomainResult with void on success or error
   *
   * Possible errors:
   * - ORGUNIT_NOT_FOUND: OrgUnit doesn't exist in tenant
   * - ORGUNIT_HAS_CHILDREN: Cannot delete with children
   * - ORGUNIT_HAS_MEMBERS: Cannot delete with assigned members
   * - TECHNICAL_ERROR: Database operation failed
   */
  delete(orgUnitId: string, tenantId: string): Promise<DomainResult<void>>;

  /**
   * Delete an OrgUnit and all its descendants (cascade delete).
   *
   * WARNING: This is a destructive operation.
   *
   * @param orgUnitId - The root OrgUnit ID of the subtree to delete
   * @param tenantId - The tenant context (security boundary)
   * @returns DomainResult with count of deleted OrgUnits
   *
   * Possible errors:
   * - ORGUNIT_NOT_FOUND: OrgUnit doesn't exist in tenant
   * - ORGUNIT_HAS_MEMBERS: Cannot delete with assigned members in subtree
   * - TECHNICAL_ERROR: Database operation failed
   */
  deleteSubtree(
    orgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<number>>;

  // ---------------------------------------------------------------------------
  // Query Operations (needed for management)
  // ---------------------------------------------------------------------------

  /**
   * Find an OrgUnit by ID within a tenant.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant context (security boundary)
   * @returns The OrgUnit if found, null otherwise
   */
  findById(orgUnitId: string, tenantId: string): Promise<OrgUnit | null>;

  /**
   * Check if an OrgUnit has any children.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant context (security boundary)
   * @returns true if OrgUnit has children
   */
  hasChildren(orgUnitId: string, tenantId: string): Promise<boolean>;

  /**
   * Check if an OrgUnit has any members assigned.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant context (security boundary)
   * @returns true if OrgUnit has members
   */
  hasMembers(orgUnitId: string, tenantId: string): Promise<boolean>;

  /**
   * Find all OrgUnits in a tenant with inconsistent paths.
   *
   * Used by path repair utility to identify data integrity issues.
   *
   * @param tenantId - The tenant ID
   * @returns Array of OrgUnits with path inconsistencies
   */
  findInconsistentPaths(tenantId: string): Promise<OrgUnit[]>;

  /**
   * Count all OrgUnits in a tenant.
   *
   * @param tenantId - The tenant ID
   * @returns Count of OrgUnits
   */
  count(tenantId: string): Promise<number>;
}
