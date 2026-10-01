/**
 * OrgUnitRepositoryImpl — Infrastructure implementation of OrgUnitRepository for Admin UI.
 *
 * This repository implements the unified OrgUnitRepository interface used by the
 * Multi-Tenant Admin UI for OrgUnit tree management, CRUD operations, and member assignment.
 *
 * It wraps the existing low-level Prisma repositories (IOrgUnitRepository, OrgUnitWriteRepository)
 * and provides higher-level operations with built-in tree building and scope filtering.
 *
 * **SECURITY CONSIDERATIONS:**
 * - All queries include tenantId filter for tenant boundary
 * - Scope filtering is applied based on actorOrgUnitId
 * - Member counts are aggregated server-side to prevent data leakage
 *
 * @see Requirements 7.4-7.6 (OrgUnit Hierarchy Tree View)
 * @see Requirements 8.1-8.11 (OrgUnit CRUD Operations)
 * @see Requirements 9.1-9.10 (OrgUnit Member Assignment)
 * @see Requirements 10.1-10.11 (OrgUnit Reparenting)
 */

import type { PrismaClient, OrgUnit as PrismaOrgUnit, OrgUnitType as PrismaOrgUnitType } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, notFoundError, businessError, technicalError } from '@core/utils';
import type {
  OrgUnitRepository,
  TreeQueryOptions,
  OrgUnitFilters,
  MoveValidationResult,
  CreateOrgUnitRequest,
  UpdateOrgUnitRequest,
  MoveOrgUnitRequest,
} from '@core/domains/orgunit/repositories/OrgUnitRepository';
import type { OrgUnit } from '@core/domains/orgunit/entities/OrgUnit';
import type { OrgUnitNode, OrgUnitListItem, OrgUnitSummary } from '@core/domains/orgunit/entities/OrgUnitNode';
import type { OrgUnitType } from '@core/domains/orgunit/types';
import { canMoveToParent } from '@core/domains/orgunit/types';

// ---------------------------------------------------------------------------
// Prisma → Domain Mapper
// ---------------------------------------------------------------------------

function mapPrismaOrgUnitToDomain(prisma: PrismaOrgUnit): OrgUnit {
  return {
    id: prisma.id,
    tenantId: prisma.tenantId,
    parentId: prisma.parentId,
    type: prisma.type as OrgUnitType,
    name: prisma.name,
    path: prisma.path,
    depth: prisma.depth,
    createdAt: prisma.createdAt,
    updatedAt: prisma.updatedAt,
  };
}

/**
 * Maps a flat list of OrgUnits with member counts to an OrgUnitNode.
 */
function mapToOrgUnitNode(
  orgUnit: PrismaOrgUnit,
  memberCounts: Map<string, number>,
  childCounts: Map<string, number>,
): OrgUnitNode {
  return {
    id: orgUnit.id,
    tenantId: orgUnit.tenantId,
    name: orgUnit.name,
    type: orgUnit.type as OrgUnitType,
    memberCount: memberCounts.get(orgUnit.id) ?? 0,
    childCount: childCounts.get(orgUnit.id) ?? 0,
    path: orgUnit.path,
    depth: orgUnit.depth,
    parentId: orgUnit.parentId,
    children: [], // Will be populated by tree builder
    createdAt: orgUnit.createdAt,
    updatedAt: orgUnit.updatedAt,
  };
}

/**
 * Builds a hierarchical tree structure from a flat list of OrgUnitNodes.
 */
function buildTree(
  nodes: OrgUnitNode[],
  scopeOrgUnitId: string | null,
): OrgUnitNode[] {
  const nodeMap = new Map<string, OrgUnitNode>();
  
  // Create a mutable copy with children arrays
  const mutableNodes = nodes.map(node => ({
    ...node,
    children: [] as OrgUnitNode[],
  }));
  
  // Build lookup map
  for (const node of mutableNodes) {
    nodeMap.set(node.id, node);
  }
  
  const roots: OrgUnitNode[] = [];
  
  for (const node of mutableNodes) {
    if (scopeOrgUnitId !== null) {
      // Org-scoped: root is the scope OrgUnit itself
      if (node.id === scopeOrgUnitId) {
        roots.push(node);
      } else if (node.parentId && nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!;
        parent.children.push(node);
      }
    } else {
      // Tenant-level: root nodes have no parent or parent not in the list
      if (node.parentId === null) {
        roots.push(node);
      } else if (nodeMap.has(node.parentId)) {
        const parent = nodeMap.get(node.parentId)!;
        parent.children.push(node);
      } else {
        // Parent not in list (shouldn't happen with scope filtering, but handle gracefully)
        roots.push(node);
      }
    }
  }
  
  return roots;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

export interface OrgUnitRepositoryImplDeps {
  prismaClient: PrismaClient;
}

/**
 * Creates the Admin UI implementation of OrgUnitRepository.
 */
export const OrgUnitRepositoryImpl = ({
  prismaClient,
}: OrgUnitRepositoryImplDeps): OrgUnitRepository => {
  // -------------------------------------------------------------------------
  // Helper: Get member counts by OrgUnit
  // -------------------------------------------------------------------------
  async function getMemberCounts(
    tenantId: string,
    orgUnitIds: string[],
  ): Promise<Map<string, number>> {
    if (orgUnitIds.length === 0) {
      return new Map();
    }

    const counts = await prismaClient.membership.groupBy({
      by: ['orgUnitId'],
      where: {
        tenantId,
        orgUnitId: { in: orgUnitIds },
      },
      _count: { orgUnitId: true },
    });

    const map = new Map<string, number>();
    for (const c of counts) {
      if (c.orgUnitId) {
        map.set(c.orgUnitId, c._count.orgUnitId);
      }
    }
    return map;
  }

  // -------------------------------------------------------------------------
  // Helper: Get child counts by OrgUnit
  // -------------------------------------------------------------------------
  async function getChildCounts(
    tenantId: string,
    orgUnitIds: string[],
  ): Promise<Map<string, number>> {
    if (orgUnitIds.length === 0) {
      return new Map();
    }

    const counts = await prismaClient.orgUnit.groupBy({
      by: ['parentId'],
      where: {
        tenantId,
        parentId: { in: orgUnitIds },
      },
      _count: { parentId: true },
    });

    const map = new Map<string, number>();
    for (const c of counts) {
      if (c.parentId) {
        map.set(c.parentId, c._count.parentId);
      }
    }
    return map;
  }

  // -------------------------------------------------------------------------
  // Helper: Compute path for new OrgUnit
  // -------------------------------------------------------------------------
  async function computePath(
    parentId: string | null,
    newOrgUnitId: string,
    tenantId: string,
  ): Promise<{ path: string[]; depth: number }> {
    if (!parentId) {
      // Root OrgUnit
      return { path: [newOrgUnitId], depth: 0 };
    }

    const parent = await prismaClient.orgUnit.findFirst({
      where: { id: parentId, tenantId },
      select: { path: true, depth: true },
    });

    if (!parent) {
      // Parent not found, treat as root
      return { path: [newOrgUnitId], depth: 0 };
    }

    return {
      path: [...parent.path, newOrgUnitId],
      depth: parent.depth + 1,
    };
  }

  return {
    // -------------------------------------------------------------------------
    // Tree Hierarchy Queries
    // -------------------------------------------------------------------------

    async getHierarchyTree(
      tenantId: string,
      scopeOrgUnitId: string | null,
      options?: TreeQueryOptions,
    ): Promise<DomainResult<OrgUnitNode[]>> {
      try {
        let whereClause: Record<string, unknown> = { tenantId };

        // Apply scope filtering
        if (scopeOrgUnitId !== null) {
          // For org-scoped admins, fetch only their OrgUnit and descendants
          // Descendants have the scopeOrgUnitId in their path
          whereClause = {
            tenantId,
            OR: [
              { id: scopeOrgUnitId },
              { path: { has: scopeOrgUnitId } },
            ],
          };
        }

        // Apply max depth filter if specified
        if (options?.maxDepth !== undefined) {
          // Get the scope OrgUnit's depth to calculate relative depth
          if (scopeOrgUnitId) {
            const scopeUnit = await prismaClient.orgUnit.findFirst({
              where: { id: scopeOrgUnitId, tenantId },
              select: { depth: true },
            });
            if (scopeUnit) {
              whereClause = {
                ...whereClause,
                depth: { lte: scopeUnit.depth + options.maxDepth },
              };
            }
          } else {
            whereClause = {
              ...whereClause,
              depth: { lte: options.maxDepth },
            };
          }
        }

        // Fetch all OrgUnits in scope
        const orgUnits = await prismaClient.orgUnit.findMany({
          where: whereClause,
          orderBy: [{ depth: 'asc' }, { name: 'asc' }],
        });

        if (orgUnits.length === 0) {
          return ok([]);
        }

        const orgUnitIds = orgUnits.map(o => o.id);

        // Fetch member counts (if requested, default true)
        const includeMemberCounts = options?.includeMemberCounts ?? true;
        const memberCounts = includeMemberCounts
          ? await getMemberCounts(tenantId, orgUnitIds)
          : new Map<string, number>();

        // Fetch child counts (if requested, default true)
        const includeChildCounts = options?.includeChildCounts ?? true;
        const childCounts = includeChildCounts
          ? await getChildCounts(tenantId, orgUnitIds)
          : new Map<string, number>();

        // Map to OrgUnitNodes
        const nodes = orgUnits.map(o => mapToOrgUnitNode(o, memberCounts, childCounts));

        // Build hierarchical tree
        const tree = buildTree(nodes, scopeOrgUnitId);

        return ok(tree);
      } catch (error) {
        return fail(
          technicalError(
            'ORGUNIT_TREE_FETCH_FAILED',
            'Failed to fetch OrgUnit hierarchy tree',
            { cause: error },
          ),
        );
      }
    },

    async getNodeWithChildren(
      orgUnitId: string,
      tenantId: string,
      options?: TreeQueryOptions,
    ): Promise<DomainResult<OrgUnitNode>> {
      try {
        // Fetch the node itself
        const orgUnit = await prismaClient.orgUnit.findFirst({
          where: { id: orgUnitId, tenantId },
        });

        if (!orgUnit) {
          return fail(notFoundError('ORGUNIT_NOT_FOUND', `OrgUnit ${orgUnitId} not found`));
        }

        // Fetch direct children
        const children = await prismaClient.orgUnit.findMany({
          where: { tenantId, parentId: orgUnitId },
          orderBy: { name: 'asc' },
        });

        const allIds = [orgUnitId, ...children.map(c => c.id)];

        // Fetch counts
        const includeMemberCounts = options?.includeMemberCounts ?? true;
        const includeChildCounts = options?.includeChildCounts ?? true;

        const memberCounts = includeMemberCounts
          ? await getMemberCounts(tenantId, allIds)
          : new Map<string, number>();

        const childCounts = includeChildCounts
          ? await getChildCounts(tenantId, allIds)
          : new Map<string, number>();

        // Map children
        const childNodes = children.map(c => ({
          ...mapToOrgUnitNode(c, memberCounts, childCounts),
          children: [], // No grandchildren in lazy load
        }));

        // Build the node
        const node: OrgUnitNode = {
          ...mapToOrgUnitNode(orgUnit, memberCounts, childCounts),
          children: childNodes,
        };

        return ok(node);
      } catch (error) {
        return fail(
          technicalError(
            'ORGUNIT_NODE_FETCH_FAILED',
            'Failed to fetch OrgUnit node with children',
            { cause: error },
          ),
        );
      }
    },

    async searchOrgUnits(
      tenantId: string,
      searchQuery: string,
      scopeOrgUnitId: string | null,
    ): Promise<DomainResult<OrgUnitListItem[]>> {
      try {
        let whereClause: Record<string, unknown> = {
          tenantId,
          name: { contains: searchQuery, mode: 'insensitive' },
        };

        // Apply scope filtering
        if (scopeOrgUnitId !== null) {
          whereClause = {
            ...whereClause,
            OR: [
              { id: scopeOrgUnitId },
              { path: { has: scopeOrgUnitId } },
            ],
          };
        }

        const results = await prismaClient.orgUnit.findMany({
          where: whereClause,
          include: {
            parent: { select: { name: true } },
          },
          orderBy: [{ depth: 'asc' }, { name: 'asc' }],
          take: 100, // Limit search results
        });

        const orgUnitIds = results.map(o => o.id);
        const memberCounts = await getMemberCounts(tenantId, orgUnitIds);
        const childCounts = await getChildCounts(tenantId, orgUnitIds);

        const items: OrgUnitListItem[] = results.map(o => ({
          id: o.id,
          tenantId: o.tenantId,
          name: o.name,
          type: o.type as OrgUnitType,
          memberCount: memberCounts.get(o.id) ?? 0,
          childCount: childCounts.get(o.id) ?? 0,
          path: o.path,
          depth: o.depth,
          parentId: o.parentId,
          parentName: o.parent?.name ?? null,
        }));

        return ok(items);
      } catch (error) {
        return fail(
          technicalError(
            'ORGUNIT_SEARCH_FAILED',
            'Failed to search OrgUnits',
            { cause: error },
          ),
        );
      }
    },

    // -------------------------------------------------------------------------
    // Single OrgUnit Operations
    // -------------------------------------------------------------------------

    async getById(
      orgUnitId: string,
      tenantId: string,
    ): Promise<DomainResult<OrgUnit>> {
      try {
        const result = await prismaClient.orgUnit.findFirst({
          where: { id: orgUnitId, tenantId },
        });

        if (!result) {
          return fail(notFoundError('ORGUNIT_NOT_FOUND', `OrgUnit ${orgUnitId} not found`));
        }

        return ok(mapPrismaOrgUnitToDomain(result));
      } catch (error) {
        return fail(
          technicalError('ORGUNIT_FETCH_FAILED', 'Failed to fetch OrgUnit', { cause: error }),
        );
      }
    },

    async getDetails(
      orgUnitId: string,
      tenantId: string,
    ): Promise<DomainResult<OrgUnitNode>> {
      try {
        const orgUnit = await prismaClient.orgUnit.findFirst({
          where: { id: orgUnitId, tenantId },
        });

        if (!orgUnit) {
          return fail(notFoundError('ORGUNIT_NOT_FOUND', `OrgUnit ${orgUnitId} not found`));
        }

        const memberCounts = await getMemberCounts(tenantId, [orgUnitId]);
        const childCounts = await getChildCounts(tenantId, [orgUnitId]);

        const node: OrgUnitNode = {
          ...mapToOrgUnitNode(orgUnit, memberCounts, childCounts),
          children: [],
        };

        return ok(node);
      } catch (error) {
        return fail(
          technicalError('ORGUNIT_DETAILS_FETCH_FAILED', 'Failed to fetch OrgUnit details', { cause: error }),
        );
      }
    },

    // -------------------------------------------------------------------------
    // OrgUnit Dropdown Queries
    // -------------------------------------------------------------------------

    async getForDropdown(
      tenantId: string,
      scopeOrgUnitId: string | null,
      filters?: OrgUnitFilters,
    ): Promise<DomainResult<OrgUnitSummary[]>> {
      try {
        let whereClause: Record<string, unknown> = { tenantId };

        // Apply scope filtering
        if (scopeOrgUnitId !== null) {
          whereClause = {
            ...whereClause,
            OR: [
              { id: scopeOrgUnitId },
              { path: { has: scopeOrgUnitId } },
            ],
          };
        }

        // Apply type filter
        if (filters?.types && filters.types.length > 0) {
          whereClause.type = { in: filters.types };
        }

        // Apply search filter
        if (filters?.search) {
          whereClause.name = { contains: filters.search, mode: 'insensitive' };
        }

        // Apply parent filter
        if (filters?.parentId) {
          if (filters.directChildrenOnly) {
            whereClause.parentId = filters.parentId;
          } else {
            whereClause.path = { has: filters.parentId };
          }
        }

        const results = await prismaClient.orgUnit.findMany({
          where: whereClause,
          orderBy: [{ depth: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            type: true,
            path: true,
            depth: true,
          },
        });

        const summaries: OrgUnitSummary[] = results.map(o => ({
          id: o.id,
          name: o.name,
          type: o.type as OrgUnitType,
          path: o.path,
          depth: o.depth,
        }));

        return ok(summaries);
      } catch (error) {
        return fail(
          technicalError('ORGUNIT_DROPDOWN_FETCH_FAILED', 'Failed to fetch OrgUnits for dropdown', { cause: error }),
        );
      }
    },

    // -------------------------------------------------------------------------
    // CRUD Operations
    // -------------------------------------------------------------------------

    async create(
      tenantId: string,
      data: CreateOrgUnitRequest,
    ): Promise<DomainResult<OrgUnit>> {
      try {
        // Compute path and depth based on parent
        const { path, depth } = await computePath(data.parentId, crypto.randomUUID(), tenantId);

        const result = await prismaClient.orgUnit.create({
          data: {
            tenantId,
            parentId: data.parentId,
            type: data.type as PrismaOrgUnitType,
            name: data.name,
            path,
            depth,
          },
        });

        return ok(mapPrismaOrgUnitToDomain(result));
      } catch (error) {
        if (error instanceof Error && error.message.includes('Unique constraint')) {
          return fail(businessError('ORGUNIT_ALREADY_EXISTS', 'An OrgUnit with this ID already exists'));
        }
        return fail(
          technicalError('ORGUNIT_CREATE_FAILED', 'Failed to create OrgUnit', { cause: error }),
        );
      }
    },

    async update(
      orgUnitId: string,
      tenantId: string,
      data: UpdateOrgUnitRequest,
    ): Promise<DomainResult<OrgUnit>> {
      try {
        const updateData: Record<string, unknown> = {};
        if (data.name !== undefined) updateData.name = data.name;

        const result = await prismaClient.orgUnit.updateMany({
          where: { id: orgUnitId, tenantId },
          data: updateData,
        });

        if (result.count === 0) {
          return fail(notFoundError('ORGUNIT_NOT_FOUND', `OrgUnit ${orgUnitId} not found`));
        }

        const updated = await prismaClient.orgUnit.findFirst({
          where: { id: orgUnitId, tenantId },
        });

        if (!updated) {
          return fail(technicalError('ORGUNIT_UPDATE_INCONSISTENT', 'OrgUnit updated but not found on re-read'));
        }

        return ok(mapPrismaOrgUnitToDomain(updated));
      } catch (error) {
        return fail(
          technicalError('ORGUNIT_UPDATE_FAILED', 'Failed to update OrgUnit', { cause: error }),
        );
      }
    },

    async delete(
      orgUnitId: string,
      tenantId: string,
    ): Promise<DomainResult<void>> {
      try {
        // Check for children
        const childCount = await prismaClient.orgUnit.count({
          where: { tenantId, parentId: orgUnitId },
        });

        if (childCount > 0) {
          return fail(businessError('ORGUNIT_HAS_CHILDREN', 'Cannot delete OrgUnit with children'));
        }

        // Check for members
        const memberCount = await prismaClient.membership.count({
          where: { tenantId, orgUnitId },
        });

        if (memberCount > 0) {
          return fail(businessError('ORGUNIT_HAS_MEMBERS', 'Cannot delete OrgUnit with assigned members'));
        }

        const result = await prismaClient.orgUnit.deleteMany({
          where: { id: orgUnitId, tenantId },
        });

        if (result.count === 0) {
          return fail(notFoundError('ORGUNIT_NOT_FOUND', `OrgUnit ${orgUnitId} not found`));
        }

        return ok(undefined);
      } catch (error) {
        return fail(
          technicalError('ORGUNIT_DELETE_FAILED', 'Failed to delete OrgUnit', { cause: error }),
        );
      }
    },

    // -------------------------------------------------------------------------
    // Move/Reparent Operations
    // -------------------------------------------------------------------------

    async validateMove(
      orgUnitId: string,
      newParentId: string,
      tenantId: string,
    ): Promise<MoveValidationResult> {
      try {
        // Fetch source OrgUnit
        const source = await prismaClient.orgUnit.findFirst({
          where: { id: orgUnitId, tenantId },
        });

        if (!source) {
          return {
            valid: false,
            errorKey: 'orgunit.not_found',
            errorDetails: `Source OrgUnit ${orgUnitId} not found`,
          };
        }

        // Fetch target OrgUnit
        const target = await prismaClient.orgUnit.findFirst({
          where: { id: newParentId, tenantId },
        });

        if (!target) {
          return {
            valid: false,
            errorKey: 'orgunit.not_found',
            errorDetails: `Target OrgUnit ${newParentId} not found`,
          };
        }

        // Check 1: Cross-tenant
        if (source.tenantId !== target.tenantId) {
          return {
            valid: false,
            errorKey: 'orgunit.move_cross_tenant_error',
            errorDetails: 'Cannot move OrgUnit across tenants',
          };
        }

        // Check 2: Root OrgUnit
        if (source.parentId === null) {
          return {
            valid: false,
            errorKey: 'orgunit.move_root_error',
            errorDetails: 'Cannot move root OrgUnit',
          };
        }

        // Check 3: Type compatibility
        if (!canMoveToParent(source.type as OrgUnitType, target.type as OrgUnitType)) {
          return {
            valid: false,
            errorKey: 'orgunit.move_type_error',
            errorDetails: `Cannot move ${source.type} under ${target.type}`,
          };
        }

        // Check 4: Cycle detection (target is descendant of source)
        if (target.path.includes(orgUnitId)) {
          return {
            valid: false,
            errorKey: 'orgunit.move_cycle_error',
            errorDetails: 'Cannot move OrgUnit to its own descendant (cycle prevention)',
          };
        }

        // Count affected descendants
        const descendants = await prismaClient.orgUnit.count({
          where: {
            tenantId,
            path: { has: orgUnitId },
            id: { not: orgUnitId },
          },
        });

        return {
          valid: true,
          affectedDescendantCount: descendants,
        };
      } catch {
        return {
          valid: false,
          errorKey: 'orgunit.validation_error',
          errorDetails: 'Failed to validate move operation',
        };
      }
    },

    async move(
      request: MoveOrgUnitRequest,
      tenantId: string,
    ): Promise<DomainResult<OrgUnit>> {
      try {
        const { orgUnitId, newParentId } = request;

        // Validate first
        const validation = await this.validateMove(orgUnitId, newParentId, tenantId);
        if (!validation.valid) {
          return fail(
            businessError(
              'ORGUNIT_MOVE_VALIDATION_FAILED',
              validation.errorDetails || 'Move validation failed',
            ),
          );
        }

        // Get new parent's path
        const newParent = await prismaClient.orgUnit.findFirst({
          where: { id: newParentId, tenantId },
          select: { path: true, depth: true },
        });

        if (!newParent) {
          return fail(notFoundError('ORGUNIT_NOT_FOUND', `Target OrgUnit ${newParentId} not found`));
        }

        // Get current OrgUnit
        const current = await prismaClient.orgUnit.findFirst({
          where: { id: orgUnitId, tenantId },
        });

        if (!current) {
          return fail(notFoundError('ORGUNIT_NOT_FOUND', `OrgUnit ${orgUnitId} not found`));
        }

        const oldPath = current.path;
        const newPath = [...newParent.path, orgUnitId];
        const newDepth = newParent.depth + 1;
        const depthDiff = newDepth - current.depth;

        // Update in a transaction
        await prismaClient.$transaction(async tx => {
          // Update the OrgUnit itself
          await tx.orgUnit.update({
            where: { id: orgUnitId },
            data: {
              parentId: newParentId,
              path: newPath,
              depth: newDepth,
            },
          });

          // Update all descendants' paths
          const descendants = await tx.orgUnit.findMany({
            where: {
              tenantId,
              path: { has: orgUnitId },
              id: { not: orgUnitId },
            },
          });

          for (const desc of descendants) {
            // Replace the old path prefix with the new one
            const oldPrefixIndex = desc.path.indexOf(orgUnitId);
            if (oldPrefixIndex >= 0) {
              const suffix = desc.path.slice(oldPrefixIndex);
              const updatedPath = [...newParent.path, ...suffix];
              await tx.orgUnit.update({
                where: { id: desc.id },
                data: {
                  path: updatedPath,
                  depth: desc.depth + depthDiff,
                },
              });
            }
          }
        });

        // Fetch updated OrgUnit
        const updated = await prismaClient.orgUnit.findFirst({
          where: { id: orgUnitId, tenantId },
        });

        if (!updated) {
          return fail(technicalError('ORGUNIT_MOVE_INCONSISTENT', 'OrgUnit moved but not found on re-read'));
        }

        return ok(mapPrismaOrgUnitToDomain(updated));
      } catch (error) {
        return fail(
          technicalError('ORGUNIT_MOVE_FAILED', 'Failed to move OrgUnit', { cause: error }),
        );
      }
    },

    // -------------------------------------------------------------------------
    // Utility Methods
    // -------------------------------------------------------------------------

    async hasChildren(
      orgUnitId: string,
      tenantId: string,
    ): Promise<boolean> {
      const count = await prismaClient.orgUnit.count({
        where: { tenantId, parentId: orgUnitId },
      });
      return count > 0;
    },

    async hasMembers(
      orgUnitId: string,
      tenantId: string,
    ): Promise<boolean> {
      const count = await prismaClient.membership.count({
        where: { tenantId, orgUnitId },
      });
      return count > 0;
    },

    async getBreadcrumb(
      orgUnitId: string,
      tenantId: string,
    ): Promise<DomainResult<OrgUnitSummary[]>> {
      try {
        // Get the OrgUnit to read its path
        const orgUnit = await prismaClient.orgUnit.findFirst({
          where: { id: orgUnitId, tenantId },
          select: { path: true },
        });

        if (!orgUnit) {
          return fail(notFoundError('ORGUNIT_NOT_FOUND', `OrgUnit ${orgUnitId} not found`));
        }

        // Fetch all OrgUnits in the path
        const ancestors = await prismaClient.orgUnit.findMany({
          where: {
            tenantId,
            id: { in: orgUnit.path },
          },
          select: {
            id: true,
            name: true,
            type: true,
            path: true,
            depth: true,
          },
          orderBy: { depth: 'asc' },
        });

        const summaries: OrgUnitSummary[] = ancestors.map(o => ({
          id: o.id,
          name: o.name,
          type: o.type as OrgUnitType,
          path: o.path,
          depth: o.depth,
        }));

        return ok(summaries);
      } catch (error) {
        return fail(
          technicalError('ORGUNIT_BREADCRUMB_FETCH_FAILED', 'Failed to fetch OrgUnit breadcrumb', { cause: error }),
        );
      }
    },

    async isRoot(
      orgUnitId: string,
      tenantId: string,
    ): Promise<boolean> {
      const orgUnit = await prismaClient.orgUnit.findFirst({
        where: { id: orgUnitId, tenantId },
        select: { parentId: true },
      });
      return orgUnit?.parentId === null;
    },

    async isAncestor(
      ancestorId: string,
      descendantId: string,
      tenantId: string,
    ): Promise<boolean> {
      const descendant = await prismaClient.orgUnit.findFirst({
        where: { id: descendantId, tenantId },
        select: { path: true },
      });
      if (!descendant) {
        return false;
      }
      return descendant.path.includes(ancestorId) && ancestorId !== descendantId;
    },
  };
};
