/**
 * OrgUnit — Domain entity representing a node in a tenant's organizational hierarchy.
 *
 * The hierarchy follows: ORGANIZATION > CLUSTER > RW > RT
 *
 * OrgUnit represents a node in the tenant's organizational structure. Every org unit
 * belongs to exactly one tenant; a unit's parent (if any) must belong to the same tenant.
 *
 * **KEY DESIGN DECISIONS:**
 * - `parentId` is the CANONICAL source of truth for hierarchy
 * - `path` and `depth` are DERIVED fields for query optimization
 * - Tenant is the security boundary (tenant_id, NOT orgUnit path)
 *
 * Plain TypeScript interface — no classes, no decorators, no external deps.
 *
 * @see Requirements 6, 21, 46
 * @see Design OrgUnit Hierarchy Model
 * @see Locked Decisions L1, L4, L7
 */

import type { OrgUnitType } from '../types';

/**
 * OrgUnit entity — a node in the tenant's organizational hierarchy.
 *
 * INVARIANTS ENFORCED (validated by OrgUnitHierarchyReader):
 * - INV-ORG-001: OrgUnit parent must belong to same tenant
 * - INV-ORG-002: OrgUnit hierarchy cannot contain cycles
 * - INV-ORG-003: depth = path.length - 1
 * - INV-ORG-004: Root OrgUnit has parentId=NULL, depth=0, path=[id]
 *
 * SECURITY CONSIDERATIONS:
 * - Tenant boundary MUST be checked before any OrgUnit operations
 * - OrgUnit path queries MUST filter by tenantId first
 */
export interface OrgUnit {
  /**
   * Unique identifier for this OrgUnit (UUID).
   * M1/M2 OrgUnits use UUIDv5 deterministic IDs (L4).
   */
  readonly id: string;

  /**
   * Reference to the owning Tenant (security boundary).
   * This field is REQUIRED — an OrgUnit always belongs to exactly one tenant.
   */
  readonly tenantId: string;

  /**
   * Reference to the parent OrgUnit (self-referential FK).
   * - NULL for root OrgUnits
   * - When non-NULL, parent MUST belong to the same tenant (INV-ORG-001)
   *
   * CANONICAL: This is the authoritative source of truth for hierarchy.
   */
  readonly parentId: string | null;

  /**
   * Type of organizational unit in the hierarchy.
   * Hierarchy order: ORGANIZATION > CLUSTER > RW > RT
   */
  readonly type: OrgUnitType;

  /**
   * Human-readable name for this OrgUnit.
   */
  readonly name: string;

  /**
   * Materialized path for efficient descendant queries.
   * Contains array of OrgUnit IDs from root to this node (inclusive).
   *
   * DERIVED: Computed from parentId chain. For query optimization only.
   *
   * INVARIANT (INV-ORG-003): path.length = depth + 1
   * INVARIANT (INV-ORG-004): Root OrgUnits have path = [id]
   */
  readonly path: string[];

  /**
   * Depth level in the hierarchy tree.
   * Root = 0, children of root = 1, etc.
   *
   * DERIVED: depth = path.length - 1
   *
   * INVARIANT (INV-ORG-003): depth = path.length - 1
   * INVARIANT (INV-ORG-004): Root OrgUnits have depth = 0
   */
  readonly depth: number;

  /**
   * When the OrgUnit was created.
   */
  readonly createdAt: Date;

  /**
   * When the OrgUnit was last updated.
   */
  readonly updatedAt: Date;
}

/**
 * Data required to create a new OrgUnit.
 * Omits auto-generated fields (id, timestamps, derived fields).
 */
export interface CreateOrgUnitInput {
  readonly tenantId: string;
  readonly parentId: string | null;
  readonly type: OrgUnitType;
  readonly name: string;
}

/**
 * Partial update for OrgUnit fields.
 * Only name and type can be updated; hierarchy changes require move operation.
 */
export interface UpdateOrgUnitInput {
  name?: string;
  type?: OrgUnitType;
}

/**
 * Result of hierarchy path validation.
 */
export interface PathValidationResult {
  /** Whether the path is valid */
  readonly isValid: boolean;
  /** Specific invariant that failed, if any */
  readonly failedInvariant?: 'INV-ORG-003' | 'INV-ORG-004';
  /** Human-readable error message, if invalid */
  readonly errorMessage?: string;
}
