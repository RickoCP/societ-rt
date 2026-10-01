/**
 * OrgUnitRepository — Unified repository interface for OrgUnit Admin UI operations.
 *
 * This interface consolidates read and hierarchy operations needed by the
 * Multi-Tenant Admin UI for OrgUnit tree management. It provides high-level
 * operations for tree rendering, CRUD, and member assignment.
 *
 * This is separate from IOrgUnitRepository (low-level queries) and
 * OrgUnitWriteRepository (write operations) to provide a clean contract
 * for the Admin UI use cases.
 *
 * **SECURITY CONSIDERATIONS:**
 * - All operations MUST be scoped to user's authorization context
 * - Tree hierarchy MUST be filtered by authorized OrgUnit scope
 * - Member counts MUST be aggregated server-side
 *
 * @see Requirements 7.3, 8.3 (OrgUnit Hierarchy Tree View, CRUD)
 * @see Requirements 9.1-9.10 (OrgUnit Member Assignment)
 * @see Requirements 10.1-10.11 (OrgUnit Reparenting)
 * @see Design Components and Interfaces > 6. OrgUnit Hierarchy Tree
 */

import type { DomainResult } from '@core/utils';
import type { OrgUnit, CreateOrgUnitInput, UpdateOrgUnitInput } from '../entities';
import type { OrgUnitNode, OrgUnitSummary, OrgUnitListItem } from '../entities/OrgUnitNode';

/**
 * Filters for querying OrgUnits.
 */
export interface OrgUnitFilters {
  /**
   * Filter by OrgUnit type(s).
   */
  readonly types?: readonly string[];

  /**
   * Search by name (partial match).
   */
  readonly search?: string;

  /**
   * Filter to OrgUnits within a specific parent's subtree.
   */
  readonly parentId?: string;

  /**
   * Include only direct children of the specified parent.
   */
  readonly directChildrenOnly?: boolean;
}

/**
 * Options for tree hierarchy queries.
 */
export interface TreeQueryOptions {
  /**
   * Maximum depth to fetch (default: unlimited).
   * Use for lazy loading deep hierarchies.
   */
  readonly maxDepth?: number;

  /**
   * Include member counts in each node (default: true).
   */
  readonly includeMemberCounts?: boolean;

  /**
   * Include child counts in each node (default: true).
   */
  readonly includeChildCounts?: boolean;

  /**
   * Expand all nodes up to specified depth (default: 1).
   */
  readonly expandDepth?: number;
}

/**
 * Result of a move validation check.
 */
export interface MoveValidationResult {
  /**
   * Whether the move is valid.
   */
  readonly valid: boolean;

  /**
   * Error key for i18n if move is invalid.
   */
  readonly errorKey?: string;

  /**
   * Error details for logging.
   */
  readonly errorDetails?: string;

  /**
   * Count of descendants that will be affected by the move.
   */
  readonly affectedDescendantCount?: number;
}

/**
 * Data for creating a new OrgUnit (input from Admin UI).
 */
export interface CreateOrgUnitRequest {
  /**
   * Parent OrgUnit ID (required for non-root creation).
   */
  readonly parentId: string;

  /**
   * Name for the new OrgUnit.
   */
  readonly name: string;

  /**
   * Type for the new OrgUnit (must be valid child type of parent).
   */
  readonly type: string;
}

/**
 * Data for updating an OrgUnit (input from Admin UI).
 */
export interface UpdateOrgUnitRequest {
  /**
   * New name for the OrgUnit.
   */
  readonly name?: string;
}

/**
 * Data for moving/reparenting an OrgUnit (input from Admin UI).
 */
export interface MoveOrgUnitRequest {
  /**
   * The OrgUnit ID to move.
   */
  readonly orgUnitId: string;

  /**
   * The new parent OrgUnit ID.
   */
  readonly newParentId: string;
}

/**
 * Unified repository interface for OrgUnit Admin UI operations.
 *
 * All methods are scoped to a specific tenant and authorization context.
 */
export interface OrgUnitRepository {
  // ---------------------------------------------------------------------------
  // Tree Hierarchy Queries
  // ---------------------------------------------------------------------------

  /**
   * Get the complete OrgUnit hierarchy tree for a tenant.
   *
   * Returns a tree structure with all OrgUnits as nodes, filtered by
   * the user's authorization scope.
   *
   * @param tenantId - The tenant ID (security boundary)
   * @param scopeOrgUnitId - Optional scope to filter hierarchy (user's authorized scope)
   * @param options - Tree query options
   * @returns DomainResult with array of root nodes
   *
   * @see Requirements 7.4-7.6 (Hierarchy Tree View)
   */
  getHierarchyTree(
    tenantId: string,
    scopeOrgUnitId: string | null,
    options?: TreeQueryOptions,
  ): Promise<DomainResult<OrgUnitNode[]>>;

  /**
   * Get a single OrgUnit node with children.
   *
   * Used for lazy loading subtrees when user expands a node.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID (security boundary)
   * @param options - Tree query options
   * @returns DomainResult with the OrgUnit node or not_found error
   */
  getNodeWithChildren(
    orgUnitId: string,
    tenantId: string,
    options?: TreeQueryOptions,
  ): Promise<DomainResult<OrgUnitNode>>;

  /**
   * Search OrgUnits by name within authorized scope.
   *
   * Used for the search/filter feature in OrgUnit Tree.
   *
   * @param tenantId - The tenant ID (security boundary)
   * @param searchQuery - The search string (partial match on name)
   * @param scopeOrgUnitId - Optional scope to filter results
   * @returns DomainResult with array of matching OrgUnits (flat list)
   *
   * @see Requirements 7.9 (Search/filter in tree)
   */
  searchOrgUnits(
    tenantId: string,
    searchQuery: string,
    scopeOrgUnitId: string | null,
  ): Promise<DomainResult<OrgUnitListItem[]>>;

  // ---------------------------------------------------------------------------
  // Single OrgUnit Operations
  // ---------------------------------------------------------------------------

  /**
   * Get a single OrgUnit by ID.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID (security boundary)
   * @returns DomainResult with OrgUnit or not_found error
   */
  getById(
    orgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<OrgUnit>>;

  /**
   * Get OrgUnit details with aggregate counts.
   *
   * Used for the OrgUnit details panel.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID (security boundary)
   * @returns DomainResult with OrgUnitNode (includes counts)
   *
   * @see Requirements 7.8 (Details panel)
   */
  getDetails(
    orgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<OrgUnitNode>>;

  // ---------------------------------------------------------------------------
  // OrgUnit Dropdown Queries
  // ---------------------------------------------------------------------------

  /**
   * Get OrgUnits for dropdown selection.
   *
   * Used for OrgUnit selection in forms (e.g., invitation, role change).
   * Returns flattened list suitable for dropdown display.
   *
   * @param tenantId - The tenant ID (security boundary)
   * @param scopeOrgUnitId - Optional scope to filter results
   * @param filters - Optional filters
   * @returns DomainResult with array of OrgUnit summaries
   *
   * @see Requirements 3.5, 5.6 (OrgUnit dropdowns in forms)
   */
  getForDropdown(
    tenantId: string,
    scopeOrgUnitId: string | null,
    filters?: OrgUnitFilters,
  ): Promise<DomainResult<OrgUnitSummary[]>>;

  // ---------------------------------------------------------------------------
  // CRUD Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new OrgUnit.
   *
   * @param tenantId - The tenant ID (security boundary)
   * @param data - The creation data
   * @returns DomainResult with created OrgUnit or error
   *
   * @see Requirements 8.4 (Create OrgUnit)
   */
  create(
    tenantId: string,
    data: CreateOrgUnitRequest,
  ): Promise<DomainResult<OrgUnit>>;

  /**
   * Update an OrgUnit's metadata.
   *
   * Only name can be updated (type is immutable).
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID (security boundary)
   * @param data - The update data
   * @returns DomainResult with updated OrgUnit or error
   *
   * @see Requirements 8.7 (Edit OrgUnit)
   */
  update(
    orgUnitId: string,
    tenantId: string,
    data: UpdateOrgUnitRequest,
  ): Promise<DomainResult<OrgUnit>>;

  /**
   * Delete an OrgUnit.
   *
   * Will fail if OrgUnit has children or members.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID (security boundary)
   * @returns DomainResult with void on success or error
   *
   * @see Requirements 8.9, 8.10 (Delete OrgUnit)
   */
  delete(
    orgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<void>>;

  // ---------------------------------------------------------------------------
  // Move/Reparent Operations
  // ---------------------------------------------------------------------------

  /**
   * Validate if an OrgUnit can be moved to a new parent.
   *
   * Checks:
   * - Cycle prevention (target not a descendant of source)
   * - Type compatibility (source type valid under target type)
   * - Cross-tenant prevention
   * - Root immovability
   *
   * @param orgUnitId - The OrgUnit ID to move
   * @param newParentId - The target parent OrgUnit ID
   * @param tenantId - The tenant ID (security boundary)
   * @returns MoveValidationResult with validation status and details
   *
   * @see Requirements 10.4 (Move validation)
   */
  validateMove(
    orgUnitId: string,
    newParentId: string,
    tenantId: string,
  ): Promise<MoveValidationResult>;

  /**
   * Move an OrgUnit to a new parent.
   *
   * This operation:
   * - Updates the OrgUnit's parentId
   * - Recomputes path and depth for the OrgUnit and all descendants
   * - Is atomic (all-or-nothing)
   *
   * Caller should first call validateMove() to check if move is valid.
   *
   * @param request - The move request data
   * @param tenantId - The tenant ID (security boundary)
   * @returns DomainResult with moved OrgUnit or error
   *
   * @see Requirements 10.7, 10.8 (Reparent operation)
   */
  move(
    request: MoveOrgUnitRequest,
    tenantId: string,
  ): Promise<DomainResult<OrgUnit>>;

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Check if an OrgUnit has children.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID (security boundary)
   * @returns true if has children
   */
  hasChildren(
    orgUnitId: string,
    tenantId: string,
  ): Promise<boolean>;

  /**
   * Check if an OrgUnit has members assigned.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID (security boundary)
   * @returns true if has members
   */
  hasMembers(
    orgUnitId: string,
    tenantId: string,
  ): Promise<boolean>;

  /**
   * Get the breadcrumb path for an OrgUnit.
   *
   * Returns array of OrgUnit summaries from root to the specified node.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID (security boundary)
   * @returns DomainResult with array of OrgUnit summaries
   */
  getBreadcrumb(
    orgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<OrgUnitSummary[]>>;

  /**
   * Check if an OrgUnit is a root unit (no parent).
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant ID (security boundary)
   * @returns true if root OrgUnit
   */
  isRoot(
    orgUnitId: string,
    tenantId: string,
  ): Promise<boolean>;

  /**
   * Check if an OrgUnit is an ancestor of another.
   *
   * @param ancestorId - The potential ancestor OrgUnit ID
   * @param descendantId - The potential descendant OrgUnit ID
   * @param tenantId - The tenant ID (security boundary)
   * @returns true if ancestorId is an ancestor of descendantId
   */
  isAncestor(
    ancestorId: string,
    descendantId: string,
    tenantId: string,
  ): Promise<boolean>;
}
