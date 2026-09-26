/**
 * OrgUnitManagementService — Domain service for OrgUnit lifecycle management.
 *
 * This service manages the complete lifecycle of OrgUnits:
 * - Create: New OrgUnit with automatic path/depth computation
 * - Update: Metadata changes (name, type)
 * - Move: Hierarchy reorganization with subtree path updates
 * - Delete: Single or cascade deletion with validation
 * - Path Repair: Fix inconsistent paths after migration/recovery
 *
 * **INVARIANTS ENFORCED:**
 * - INV-ORG-001: OrgUnit parent must belong to same tenant
 * - INV-ORG-002: OrgUnit hierarchy cannot contain cycles
 * - INV-ORG-003: depth = path.length - 1
 * - INV-ORG-004: Root OrgUnit has parentId=NULL, depth=0, path=[id]
 *
 * **SECURITY CONSIDERATIONS:**
 * - All operations validate tenant boundary
 * - Cycle detection prevents infinite loops
 * - Maximum depth prevents excessively deep hierarchies
 *
 * @see FASE 1.19 Task 57: OrgUnit Management Service
 * @see Requirements 21 (AC 1-9), Requirements 46 (AC 1-9)
 * @see Design OrgUnit Hierarchy Model
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { v4 as uuidv4 } from 'uuid';
import type { OrgUnit, CreateOrgUnitInput, UpdateOrgUnitInput } from '../entities';
import type { IOrgUnitRepository } from '../repositories';
import type {
  OrgUnitWriteRepository,
  SubtreePathUpdate,
} from '../repositories/OrgUnitWriteRepository';
import type { OrgUnitType } from '../types';
import { MAX_ORGUNIT_DEPTH, canBeParent, isValidOrgUnitType } from '../types';
import {
  orgUnitNotFound,
  orgUnitTenantMismatch,
  orgUnitCycleDetected,
  orgUnitParentTenantMismatch,
  orgUnitHasChildren,
  orgUnitHasMembers,
  orgUnitCannotMoveToDescendant,
  orgUnitMaxDepthExceeded,
  orgUnitInvalidTypeForPosition,
  orgUnitNameRequired,
  orgUnitTypeRequired,
  orgUnitPathRepairFailed,
} from '../errors';
import type { IOrgUnitHierarchyReader } from './OrgUnitHierarchyReader';
import type {
  IOrgUnitEventEmitter,
  OrgUnitLifecycleEvent,
} from './OrgUnitEventEmitter';
import {
  createOrgUnitCreatedEvent,
  createOrgUnitUpdatedEvent,
  createOrgUnitMovedEvent,
  createOrgUnitDeletedEvent,
  createOrgUnitSubtreeDeletedEvent,
  createOrgUnitPathRepairedEvent,
} from './OrgUnitEventEmitter';

// ---------------------------------------------------------------------------
// Command Types
// ---------------------------------------------------------------------------

/**
 * Input for creating a new OrgUnit.
 */
export interface CreateOrgUnitCommand {
  /** The tenant the OrgUnit belongs to */
  readonly tenantId: string;
  /** Parent OrgUnit ID (null for root) */
  readonly parentId: string | null;
  /** The OrgUnit type */
  readonly type: OrgUnitType;
  /** The OrgUnit name */
  readonly name: string;
  /** User performing the action (for audit) */
  readonly performedBy?: string;
}

/**
 * Input for updating OrgUnit metadata.
 */
export interface UpdateOrgUnitCommand {
  /** The OrgUnit ID to update */
  readonly orgUnitId: string;
  /** The tenant context (security boundary) */
  readonly tenantId: string;
  /** New name (optional) */
  readonly name?: string;
  /** New type (optional) */
  readonly type?: OrgUnitType;
  /** User performing the action (for audit) */
  readonly performedBy?: string;
}

/**
 * Input for moving an OrgUnit to a new parent.
 */
export interface MoveOrgUnitCommand {
  /** The OrgUnit ID to move */
  readonly orgUnitId: string;
  /** The tenant context (security boundary) */
  readonly tenantId: string;
  /** New parent ID (null for moving to root) */
  readonly newParentId: string | null;
  /** User performing the action (for audit) */
  readonly performedBy?: string;
}

/**
 * Input for deleting an OrgUnit.
 */
export interface DeleteOrgUnitCommand {
  /** The OrgUnit ID to delete */
  readonly orgUnitId: string;
  /** The tenant context (security boundary) */
  readonly tenantId: string;
  /** Whether to cascade delete children */
  readonly cascade?: boolean;
  /** Reason for deletion */
  readonly reason?: string;
  /** User performing the action (for audit) */
  readonly performedBy?: string;
}

/**
 * Input for path repair operation.
 */
export interface RepairPathsCommand {
  /** The tenant ID to repair */
  readonly tenantId: string;
  /** Whether to actually apply repairs (false = dry run) */
  readonly apply: boolean;
  /** User performing the action (for audit) */
  readonly performedBy?: string;
}

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

/**
 * Result of OrgUnit creation.
 */
export interface CreateOrgUnitResult {
  /** The created OrgUnit */
  readonly orgUnit: OrgUnit;
  /** The event that was emitted */
  readonly event: OrgUnitLifecycleEvent;
}

/**
 * Result of OrgUnit update.
 */
export interface UpdateOrgUnitResult {
  /** The updated OrgUnit */
  readonly orgUnit: OrgUnit;
  /** The event that was emitted */
  readonly event: OrgUnitLifecycleEvent;
}

/**
 * Result of OrgUnit move.
 */
export interface MoveOrgUnitResult {
  /** The moved OrgUnit */
  readonly orgUnit: OrgUnit;
  /** Count of descendants also updated */
  readonly descendantsUpdated: number;
  /** The event that was emitted */
  readonly event: OrgUnitLifecycleEvent;
}

/**
 * Result of OrgUnit deletion.
 */
export interface DeleteOrgUnitResult {
  /** Count of OrgUnits deleted (1 for single, >1 for cascade) */
  readonly deletedCount: number;
  /** The event that was emitted */
  readonly event: OrgUnitLifecycleEvent;
}

/**
 * Result of path repair operation.
 */
export interface RepairPathsResult {
  /** Total OrgUnits scanned */
  readonly scanned: number;
  /** OrgUnits with inconsistent paths found */
  readonly inconsistentCount: number;
  /** OrgUnits repaired (0 if dry run) */
  readonly repairedCount: number;
  /** Details of repairs (or needed repairs if dry run) */
  readonly repairs: PathRepairDetail[];
}

/**
 * Detail of a single path repair.
 */
export interface PathRepairDetail {
  /** The OrgUnit ID */
  readonly orgUnitId: string;
  /** The OrgUnit name */
  readonly name: string;
  /** Old (incorrect) path */
  readonly oldPath: string[];
  /** New (correct) path */
  readonly newPath: string[];
  /** Old (incorrect) depth */
  readonly oldDepth: number;
  /** New (correct) depth */
  readonly newDepth: number;
  /** Whether repair was applied */
  readonly applied: boolean;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * OrgUnitManagementService interface.
 *
 * Provides operations for managing the complete lifecycle of OrgUnits
 * with proper validation, hierarchy enforcement, and event emission.
 */
export interface IOrgUnitManagementService {
  // ---------------------------------------------------------------------------
  // CRUD Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new OrgUnit.
   *
   * Validates:
   * - Parent exists and belongs to same tenant (INV-ORG-001)
   * - Type is valid for hierarchy position
   * - Maximum depth not exceeded
   *
   * Computes:
   * - path = parent.path + [id] (or [id] for root)
   * - depth = path.length - 1
   *
   * @param command - The creation command
   * @returns DomainResult with created OrgUnit or error
   */
  create(command: CreateOrgUnitCommand): Promise<DomainResult<CreateOrgUnitResult>>;

  /**
   * Update OrgUnit metadata (name, type).
   *
   * Does NOT change hierarchy — use move() for that.
   *
   * @param command - The update command
   * @returns DomainResult with updated OrgUnit or error
   */
  update(command: UpdateOrgUnitCommand): Promise<DomainResult<UpdateOrgUnitResult>>;

  /**
   * Move an OrgUnit to a new parent.
   *
   * Validates:
   * - New parent exists and belongs to same tenant (INV-ORG-001)
   * - No cycle would be created (INV-ORG-002)
   * - Maximum depth not exceeded for entire subtree
   *
   * Updates:
   * - Target OrgUnit's parentId, path, depth
   * - All descendants' paths and depths
   *
   * @param command - The move command
   * @returns DomainResult with moved OrgUnit and update count
   */
  move(command: MoveOrgUnitCommand): Promise<DomainResult<MoveOrgUnitResult>>;

  /**
   * Delete an OrgUnit.
   *
   * Validates:
   * - No children (unless cascade=true)
   * - No assigned members
   *
   * @param command - The delete command
   * @returns DomainResult with delete count
   */
  delete(command: DeleteOrgUnitCommand): Promise<DomainResult<DeleteOrgUnitResult>>;

  // ---------------------------------------------------------------------------
  // Query Operations
  // ---------------------------------------------------------------------------

  /**
   * Get an OrgUnit by ID within a tenant.
   *
   * @param orgUnitId - The OrgUnit ID
   * @param tenantId - The tenant context (security boundary)
   * @returns The OrgUnit if found, null otherwise
   */
  getById(orgUnitId: string, tenantId: string): Promise<OrgUnit | null>;

  // ---------------------------------------------------------------------------
  // Path Utilities
  // ---------------------------------------------------------------------------

  /**
   * Compute the path for a new/moved OrgUnit.
   *
   * @param orgUnitId - The OrgUnit ID (to include in path)
   * @param parentId - The parent ID (null for root)
   * @param tenantId - The tenant context
   * @returns DomainResult with computed path array
   */
  computePath(
    orgUnitId: string,
    parentId: string | null,
    tenantId: string,
  ): Promise<DomainResult<string[]>>;

  /**
   * Compute the depth from a path.
   * depth = path.length - 1 (INV-ORG-003)
   *
   * @param path - The path array
   * @returns The computed depth
   */
  computeDepth(path: string[]): number;

  /**
   * Repair inconsistent paths in a tenant.
   *
   * Scans all OrgUnits and fixes any where computed path
   * doesn't match stored path.
   *
   * @param command - The repair command
   * @returns DomainResult with repair results
   */
  repairPaths(command: RepairPathsCommand): Promise<DomainResult<RepairPathsResult>>;

  // ---------------------------------------------------------------------------
  // Validation Operations
  // ---------------------------------------------------------------------------

  /**
   * Check if moving an OrgUnit would create a cycle.
   *
   * A cycle would occur if the new parent is a descendant of the OrgUnit.
   *
   * @param orgUnitId - The OrgUnit being moved
   * @param newParentId - The proposed new parent
   * @param tenantId - The tenant context
   * @returns true if move would create a cycle
   */
  wouldCreateCycle(
    orgUnitId: string,
    newParentId: string,
    tenantId: string,
  ): Promise<boolean>;

  /**
   * Check if an OrgUnit type can be placed under a parent type.
   *
   * @param childType - The child OrgUnit type
   * @param parentType - The parent OrgUnit type (or null for root)
   * @returns true if placement is valid
   */
  isValidPlacement(
    childType: OrgUnitType,
    parentType: OrgUnitType | null,
  ): boolean;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an OrgUnitManagementService instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param dependencies - The service dependencies
 * @returns An implementation of IOrgUnitManagementService
 */
export const OrgUnitManagementServiceImpl = ({
  orgUnitRepository,
  orgUnitWriteRepository,
  hierarchyReader,
  eventEmitter,
}: {
  orgUnitRepository: IOrgUnitRepository;
  orgUnitWriteRepository: OrgUnitWriteRepository;
  hierarchyReader: IOrgUnitHierarchyReader;
  eventEmitter: IOrgUnitEventEmitter;
}): IOrgUnitManagementService => {
  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Validate that input has required name.
   */
  const validateName = (name: string | undefined): DomainResult<string> => {
    if (!name || name.trim().length === 0) {
      return fail(orgUnitNameRequired());
    }
    return ok(name.trim());
  };

  /**
   * Validate that input has valid type.
   */
  const validateType = (type: unknown): DomainResult<OrgUnitType> => {
    if (!type || !isValidOrgUnitType(type)) {
      return fail(orgUnitTypeRequired());
    }
    return ok(type);
  };

  /**
   * Get parent OrgUnit with validation.
   */
  const getValidatedParent = async (
    parentId: string,
    tenantId: string,
  ): Promise<DomainResult<OrgUnit>> => {
    const parent = await orgUnitRepository.findById(parentId, tenantId);
    if (!parent) {
      return fail(orgUnitNotFound(parentId));
    }
    if (parent.tenantId !== tenantId) {
      return fail(orgUnitParentTenantMismatch(parentId, parentId));
    }
    return ok(parent);
  };

  /**
   * Compute new paths for all descendants after a move.
   */
  const computeDescendantUpdates = async (
    orgUnitId: string,
    tenantId: string,
    newPath: string[],
    oldPath: string[],
  ): Promise<SubtreePathUpdate[]> => {
    const descendants = await orgUnitRepository.findDescendants(orgUnitId, tenantId);
    const updates: SubtreePathUpdate[] = [];

    for (const descendant of descendants) {
      // Replace the old prefix with the new prefix
      // Example: oldPath = [a, b], newPath = [c, b], descendant.path = [a, b, x, y]
      // Result: [c, b, x, y]
      const suffixStart = oldPath.length;
      const suffix = descendant.path.slice(suffixStart);
      const updatedPath = [...newPath, ...suffix];
      const updatedDepth = updatedPath.length - 1;

      updates.push({
        orgUnitId: descendant.id,
        path: updatedPath,
        depth: updatedDepth,
      });
    }

    return updates;
  };

  /**
   * Build correct path from parent chain (for repair).
   */
  const buildCorrectPath = async (
    orgUnit: OrgUnit,
    tenantId: string,
    cache: Map<string, string[]>,
  ): Promise<string[]> => {
    // Check cache first
    if (cache.has(orgUnit.id)) {
      return cache.get(orgUnit.id)!;
    }

    // Root node
    if (orgUnit.parentId === null) {
      const path = [orgUnit.id];
      cache.set(orgUnit.id, path);
      return path;
    }

    // Get parent
    const parent = await orgUnitRepository.findById(orgUnit.parentId, tenantId);
    if (!parent) {
      // Parent missing - treat as root (data inconsistency)
      const path = [orgUnit.id];
      cache.set(orgUnit.id, path);
      return path;
    }

    // Recursively get parent's correct path
    const parentPath = await buildCorrectPath(parent, tenantId, cache);
    const correctPath = [...parentPath, orgUnit.id];
    cache.set(orgUnit.id, correctPath);
    return correctPath;
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  const service: IOrgUnitManagementService = {
    // -------------------------------------------------------------------------
    // CRUD Operations
    // -------------------------------------------------------------------------

    async create(
      command: CreateOrgUnitCommand,
    ): Promise<DomainResult<CreateOrgUnitResult>> {
      const { tenantId, parentId, type, name, performedBy } = command;

      // Step 1: Validate name
      const nameResult = validateName(name);
      if (!nameResult.success) {
        return fail(nameResult.error);
      }
      const validatedName = nameResult.data;

      // Step 2: Validate type
      const typeResult = validateType(type);
      if (!typeResult.success) {
        return fail(typeResult.error);
      }
      const validatedType = typeResult.data;

      // Step 3: Validate parent if provided
      let parentOrgUnit: OrgUnit | null = null;
      if (parentId !== null) {
        const parentResult = await getValidatedParent(parentId, tenantId);
        if (!parentResult.success) {
          return fail(parentResult.error);
        }
        parentOrgUnit = parentResult.data;

        // Validate type hierarchy
        if (!service.isValidPlacement(validatedType, parentOrgUnit.type)) {
          return fail(orgUnitInvalidTypeForPosition(validatedType, parentOrgUnit.type));
        }
      }

      // Step 4: Generate ID and compute path/depth
      const orgUnitId = uuidv4();
      const pathResult = await service.computePath(orgUnitId, parentId, tenantId);
      if (!pathResult.success) {
        return fail(pathResult.error);
      }
      const path = pathResult.data;
      const depth = service.computeDepth(path);

      // Step 5: Check max depth
      if (depth >= MAX_ORGUNIT_DEPTH) {
        return fail(orgUnitMaxDepthExceeded(orgUnitId, depth, MAX_ORGUNIT_DEPTH));
      }

      // Step 6: Create the OrgUnit
      const createResult = await orgUnitWriteRepository.create({
        tenantId,
        parentId,
        type: validatedType,
        name: validatedName,
        path,
        depth,
      });

      if (!createResult.success) {
        return fail(createResult.error);
      }

      const orgUnit = createResult.data;

      // Step 7: Emit event
      const event = createOrgUnitCreatedEvent(
        orgUnit.id,
        tenantId,
        validatedName,
        validatedType,
        parentId,
        path,
        depth,
        performedBy,
      );
      await eventEmitter.emit(event);

      return ok({ orgUnit, event });
    },

    async update(
      command: UpdateOrgUnitCommand,
    ): Promise<DomainResult<UpdateOrgUnitResult>> {
      const { orgUnitId, tenantId, name, type, performedBy } = command;

      // Step 1: Get existing OrgUnit
      const existing = await orgUnitWriteRepository.findById(orgUnitId, tenantId);
      if (!existing) {
        return fail(orgUnitNotFound(orgUnitId));
      }

      // Step 2: Build update data
      const updateData: UpdateOrgUnitInput = {};
      const changes: {
        oldName?: string;
        newName?: string;
        oldType?: OrgUnitType;
        newType?: OrgUnitType;
      } = {};

      if (name !== undefined) {
        const nameResult = validateName(name);
        if (!nameResult.success) {
          return fail(nameResult.error);
        }
        if (nameResult.data !== existing.name) {
          updateData.name = nameResult.data;
          changes.oldName = existing.name;
          changes.newName = nameResult.data;
        }
      }

      if (type !== undefined) {
        const typeResult = validateType(type);
        if (!typeResult.success) {
          return fail(typeResult.error);
        }
        if (typeResult.data !== existing.type) {
          // Validate new type is valid for current position
          if (existing.parentId !== null) {
            const parent = await orgUnitRepository.findById(existing.parentId, tenantId);
            if (parent && !service.isValidPlacement(typeResult.data, parent.type)) {
              return fail(orgUnitInvalidTypeForPosition(typeResult.data, parent.type));
            }
          }
          updateData.type = typeResult.data;
          changes.oldType = existing.type;
          changes.newType = typeResult.data;
        }
      }

      // Step 3: If no changes, return existing
      if (Object.keys(updateData).length === 0) {
        const event = createOrgUnitUpdatedEvent(orgUnitId, tenantId, {}, performedBy);
        return ok({ orgUnit: existing, event });
      }

      // Step 4: Update
      const updateResult = await orgUnitWriteRepository.update(orgUnitId, tenantId, updateData);
      if (!updateResult.success) {
        return fail(updateResult.error);
      }

      const orgUnit = updateResult.data;

      // Step 5: Emit event
      const event = createOrgUnitUpdatedEvent(orgUnitId, tenantId, changes, performedBy);
      await eventEmitter.emit(event);

      return ok({ orgUnit, event });
    },

    async move(
      command: MoveOrgUnitCommand,
    ): Promise<DomainResult<MoveOrgUnitResult>> {
      const { orgUnitId, tenantId, newParentId, performedBy } = command;

      // Step 1: Get existing OrgUnit
      const existing = await orgUnitWriteRepository.findById(orgUnitId, tenantId);
      if (!existing) {
        return fail(orgUnitNotFound(orgUnitId));
      }

      const oldParentId = existing.parentId;
      const oldPath = existing.path;
      const oldDepth = existing.depth;

      // Step 2: If same parent, no-op
      if (oldParentId === newParentId) {
        const event = createOrgUnitMovedEvent(
          orgUnitId,
          tenantId,
          oldParentId,
          newParentId,
          oldPath,
          oldPath,
          oldDepth,
          oldDepth,
          0,
          performedBy,
        );
        return ok({ orgUnit: existing, descendantsUpdated: 0, event });
      }

      // Step 3: Validate new parent if provided
      let newParentOrgUnit: OrgUnit | null = null;
      if (newParentId !== null) {
        const parentResult = await getValidatedParent(newParentId, tenantId);
        if (!parentResult.success) {
          return fail(parentResult.error);
        }
        newParentOrgUnit = parentResult.data;

        // Check for cycle (INV-ORG-002)
        if (await service.wouldCreateCycle(orgUnitId, newParentId, tenantId)) {
          return fail(orgUnitCannotMoveToDescendant(orgUnitId, newParentId));
        }

        // Validate type hierarchy
        if (!service.isValidPlacement(existing.type, newParentOrgUnit.type)) {
          return fail(orgUnitInvalidTypeForPosition(existing.type, newParentOrgUnit.type));
        }
      }

      // Step 4: Compute new path/depth
      const pathResult = await service.computePath(orgUnitId, newParentId, tenantId);
      if (!pathResult.success) {
        return fail(pathResult.error);
      }
      const newPath = pathResult.data;
      const newDepth = service.computeDepth(newPath);

      // Step 5: Check max depth for subtree
      const descendants = await orgUnitRepository.findDescendants(orgUnitId, tenantId);
      const maxDescendantDepth = descendants.reduce(
        (max, d) => Math.max(max, d.depth - oldDepth),
        0,
      );
      const newMaxDepth = newDepth + maxDescendantDepth;
      if (newMaxDepth >= MAX_ORGUNIT_DEPTH) {
        return fail(orgUnitMaxDepthExceeded(orgUnitId, newMaxDepth, MAX_ORGUNIT_DEPTH));
      }

      // Step 6: Move the OrgUnit
      const moveResult = await orgUnitWriteRepository.move(orgUnitId, tenantId, {
        parentId: newParentId,
        path: newPath,
        depth: newDepth,
      });
      if (!moveResult.success) {
        return fail(moveResult.error);
      }

      // Step 7: Update descendants
      const descendantUpdates = await computeDescendantUpdates(
        orgUnitId,
        tenantId,
        newPath,
        oldPath,
      );

      let descendantsUpdated = 0;
      if (descendantUpdates.length > 0) {
        const batchResult = await orgUnitWriteRepository.batchUpdatePaths(
          tenantId,
          descendantUpdates,
        );
        if (batchResult.success) {
          descendantsUpdated = batchResult.data;
        }
      }

      const orgUnit = moveResult.data;

      // Step 8: Emit event
      const event = createOrgUnitMovedEvent(
        orgUnitId,
        tenantId,
        oldParentId,
        newParentId,
        oldPath,
        newPath,
        oldDepth,
        newDepth,
        descendantsUpdated,
        performedBy,
      );
      await eventEmitter.emit(event);

      return ok({ orgUnit, descendantsUpdated, event });
    },

    async delete(
      command: DeleteOrgUnitCommand,
    ): Promise<DomainResult<DeleteOrgUnitResult>> {
      const { orgUnitId, tenantId, cascade = false, reason, performedBy } = command;

      // Step 1: Get existing OrgUnit
      const existing = await orgUnitWriteRepository.findById(orgUnitId, tenantId);
      if (!existing) {
        return fail(orgUnitNotFound(orgUnitId));
      }

      // Step 2: Check for children (if not cascade)
      const hasChildren = await orgUnitWriteRepository.hasChildren(orgUnitId, tenantId);
      if (hasChildren && !cascade) {
        return fail(orgUnitHasChildren(orgUnitId));
      }

      // Step 3: Check for members
      const hasMembers = await orgUnitWriteRepository.hasMembers(orgUnitId, tenantId);
      if (hasMembers) {
        return fail(orgUnitHasMembers(orgUnitId));
      }

      // Step 4: Check descendants for members (if cascade)
      if (cascade && hasChildren) {
        const descendants = await orgUnitRepository.findDescendants(orgUnitId, tenantId);
        for (const descendant of descendants) {
          const descendantHasMembers = await orgUnitWriteRepository.hasMembers(
            descendant.id,
            tenantId,
          );
          if (descendantHasMembers) {
            return fail(orgUnitHasMembers(descendant.id));
          }
        }
      }

      // Step 5: Delete
      let deletedCount: number;
      let event: OrgUnitLifecycleEvent;

      if (cascade && hasChildren) {
        const deleteResult = await orgUnitWriteRepository.deleteSubtree(orgUnitId, tenantId);
        if (!deleteResult.success) {
          return fail(deleteResult.error);
        }
        deletedCount = deleteResult.data;
        event = createOrgUnitSubtreeDeletedEvent(
          orgUnitId,
          tenantId,
          existing.name,
          deletedCount,
          reason,
          performedBy,
        );
      } else {
        const deleteResult = await orgUnitWriteRepository.delete(orgUnitId, tenantId);
        if (!deleteResult.success) {
          return fail(deleteResult.error);
        }
        deletedCount = 1;
        event = createOrgUnitDeletedEvent(
          orgUnitId,
          tenantId,
          existing.name,
          existing.type,
          existing.parentId,
          reason,
          performedBy,
        );
      }

      await eventEmitter.emit(event);

      return ok({ deletedCount, event });
    },

    // -------------------------------------------------------------------------
    // Query Operations
    // -------------------------------------------------------------------------

    async getById(orgUnitId: string, tenantId: string): Promise<OrgUnit | null> {
      return orgUnitWriteRepository.findById(orgUnitId, tenantId);
    },

    // -------------------------------------------------------------------------
    // Path Utilities
    // -------------------------------------------------------------------------

    async computePath(
      orgUnitId: string,
      parentId: string | null,
      tenantId: string,
    ): Promise<DomainResult<string[]>> {
      // Root node: path = [id]
      if (parentId === null) {
        return ok([orgUnitId]);
      }

      // Get parent's path
      const parentPath = await orgUnitRepository.getPath(parentId, tenantId);
      if (parentPath === null) {
        return fail(orgUnitNotFound(parentId));
      }

      // Append own ID to parent's path
      return ok([...parentPath, orgUnitId]);
    },

    computeDepth(path: string[]): number {
      // INV-ORG-003: depth = path.length - 1
      return path.length - 1;
    },

    async repairPaths(
      command: RepairPathsCommand,
    ): Promise<DomainResult<RepairPathsResult>> {
      const { tenantId, apply, performedBy } = command;

      // Step 1: Get all OrgUnits
      const allOrgUnits = await orgUnitRepository.findAllInTenant(tenantId);
      const scanned = allOrgUnits.length;

      // Step 2: Build correct paths
      const cache = new Map<string, string[]>();
      const repairs: PathRepairDetail[] = [];

      for (const orgUnit of allOrgUnits) {
        const correctPath = await buildCorrectPath(orgUnit, tenantId, cache);
        const correctDepth = correctPath.length - 1;

        // Check if repair needed
        const pathMismatch =
          JSON.stringify(orgUnit.path) !== JSON.stringify(correctPath);
        const depthMismatch = orgUnit.depth !== correctDepth;

        if (pathMismatch || depthMismatch) {
          repairs.push({
            orgUnitId: orgUnit.id,
            name: orgUnit.name,
            oldPath: orgUnit.path,
            newPath: correctPath,
            oldDepth: orgUnit.depth,
            newDepth: correctDepth,
            applied: false,
          });
        }
      }

      // Step 3: Apply repairs if requested
      let repairedCount = 0;
      if (apply && repairs.length > 0) {
        const updates: SubtreePathUpdate[] = repairs.map(r => ({
          orgUnitId: r.orgUnitId,
          path: r.newPath,
          depth: r.newDepth,
        }));

        const batchResult = await orgUnitWriteRepository.batchUpdatePaths(tenantId, updates);
        if (!batchResult.success) {
          return fail(orgUnitPathRepairFailed('batch', batchResult.error.message));
        }

        repairedCount = batchResult.data;

        // Mark repairs as applied and emit events
        for (const repair of repairs) {
          repair.applied = true;
          const event = createOrgUnitPathRepairedEvent(
            repair.orgUnitId,
            tenantId,
            repair.oldPath,
            repair.newPath,
            repair.oldDepth,
            repair.newDepth,
            performedBy,
          );
          await eventEmitter.emit(event);
        }
      }

      return ok({
        scanned,
        inconsistentCount: repairs.length,
        repairedCount,
        repairs,
      });
    },

    // -------------------------------------------------------------------------
    // Validation Operations
    // -------------------------------------------------------------------------

    async wouldCreateCycle(
      orgUnitId: string,
      newParentId: string,
      tenantId: string,
    ): Promise<boolean> {
      // A cycle would occur if newParentId is a descendant of orgUnitId
      // (i.e., if orgUnitId is in newParentId's path)
      const result = await hierarchyReader.isDescendantOrEqual(
        newParentId,
        orgUnitId,
        tenantId,
      );
      // If newParentId is a descendant of (or equal to) orgUnitId, moving would create a cycle
      return result.success && result.data === true;
    },

    isValidPlacement(
      childType: OrgUnitType,
      parentType: OrgUnitType | null,
    ): boolean {
      // Root can be any type
      if (parentType === null) {
        return true;
      }
      // Use hierarchy rules
      return canBeParent(parentType, childType);
    },
  };

  return service;
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type OrgUnitManagementService = IOrgUnitManagementService;
