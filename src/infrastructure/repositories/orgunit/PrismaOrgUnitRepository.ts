/**
 * PrismaOrgUnitRepository — Infrastructure implementation of OrgUnit repositories.
 *
 * Implements both IOrgUnitRepository (read) and OrgUnitWriteRepository (write)
 * interfaces using Prisma ORM with tenant-scoped queries.
 *
 * **SECURITY CONSIDERATIONS:**
 * - All queries include tenantId filter for tenant boundary
 * - Path-based queries use tenantId as primary filter
 * - No cross-tenant data access possible
 *
 * @see FASE 1.19 Task 57-58: OrgUnit Management Service, OrgUnit CRUD Operations
 * @see Requirements 21, 46
 */

import type { PrismaClient, OrgUnit as PrismaOrgUnit, OrgUnitType as PrismaOrgUnitType } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError, businessError } from '@core/utils';
import type { IOrgUnitRepository, OrgUnitQueryOptions } from '@core/domains/orgunit/repositories/IOrgUnitRepository';
import type {
  OrgUnitWriteRepository,
  CreateOrgUnitData,
  MoveOrgUnitData,
  SubtreePathUpdate,
} from '@core/domains/orgunit/repositories/OrgUnitWriteRepository';
import type { OrgUnit, UpdateOrgUnitInput } from '@core/domains/orgunit/entities';
import type { OrgUnitType } from '@core/domains/orgunit/types';

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

// ---------------------------------------------------------------------------
// Factory: Combined Repository Implementation
// ---------------------------------------------------------------------------

export interface PrismaOrgUnitRepositoryDeps {
  prismaClient: PrismaClient;
}

/**
 * Creates the Prisma implementation of IOrgUnitRepository.
 * Read-only operations for OrgUnit queries.
 */
export const PrismaOrgUnitRepositoryImpl = ({
  prismaClient,
}: PrismaOrgUnitRepositoryDeps): IOrgUnitRepository => ({
  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------
  async findById(
    orgUnitId: string,
    tenantId: string,
    options?: OrgUnitQueryOptions,
  ): Promise<OrgUnit | null> {
    const result = await prismaClient.orgUnit.findFirst({
      where: {
        id: orgUnitId,
        tenantId,
      },
      include: {
        parent: options?.includeParent ?? false,
        children: options?.includeChildren ?? false,
      },
    });

    if (!result) {
      return null;
    }

    return mapPrismaOrgUnitToDomain(result);
  },

  // -------------------------------------------------------------------------
  // exists
  // -------------------------------------------------------------------------
  async exists(orgUnitId: string, tenantId: string): Promise<boolean> {
    const count = await prismaClient.orgUnit.count({
      where: {
        id: orgUnitId,
        tenantId,
      },
    });
    return count > 0;
  },

  // -------------------------------------------------------------------------
  // findRoots
  // -------------------------------------------------------------------------
  async findRoots(tenantId: string): Promise<OrgUnit[]> {
    const results = await prismaClient.orgUnit.findMany({
      where: {
        tenantId,
        parentId: null,
      },
      orderBy: { name: 'asc' },
    });

    return results.map(mapPrismaOrgUnitToDomain);
  },

  // -------------------------------------------------------------------------
  // findAllInTenant
  // -------------------------------------------------------------------------
  async findAllInTenant(tenantId: string): Promise<OrgUnit[]> {
    const results = await prismaClient.orgUnit.findMany({
      where: { tenantId },
      orderBy: [{ depth: 'asc' }, { name: 'asc' }],
    });

    return results.map(mapPrismaOrgUnitToDomain);
  },

  // -------------------------------------------------------------------------
  // findChildren
  // -------------------------------------------------------------------------
  async findChildren(parentId: string, tenantId: string): Promise<OrgUnit[]> {
    const results = await prismaClient.orgUnit.findMany({
      where: {
        tenantId,
        parentId,
      },
      orderBy: { name: 'asc' },
    });

    return results.map(mapPrismaOrgUnitToDomain);
  },

  // -------------------------------------------------------------------------
  // findDescendants
  // -------------------------------------------------------------------------
  async findDescendants(ancestorId: string, tenantId: string): Promise<OrgUnit[]> {
    // Use path array contains query to find descendants
    // PostgreSQL: path @> ARRAY[ancestorId]
    const results = await prismaClient.orgUnit.findMany({
      where: {
        tenantId,
        path: { has: ancestorId },
        id: { not: ancestorId }, // Exclude the ancestor itself
      },
      orderBy: [{ depth: 'asc' }, { name: 'asc' }],
    });

    return results.map(mapPrismaOrgUnitToDomain);
  },

  // -------------------------------------------------------------------------
  // findAncestors
  // -------------------------------------------------------------------------
  async findAncestors(orgUnitId: string, tenantId: string): Promise<OrgUnit[]> {
    // First, get the OrgUnit to read its path
    const orgUnit = await prismaClient.orgUnit.findFirst({
      where: { id: orgUnitId, tenantId },
      select: { path: true },
    });

    if (!orgUnit || orgUnit.path.length <= 1) {
      // No ancestors (root or not found)
      return [];
    }

    // Path contains [root, ..., parent, self], so ancestors = path[0..n-1]
    const ancestorIds = orgUnit.path.slice(0, -1);

    const results = await prismaClient.orgUnit.findMany({
      where: {
        tenantId,
        id: { in: ancestorIds },
      },
      orderBy: { depth: 'asc' },
    });

    return results.map(mapPrismaOrgUnitToDomain);
  },

  // -------------------------------------------------------------------------
  // getPath
  // -------------------------------------------------------------------------
  async getPath(orgUnitId: string, tenantId: string): Promise<string[] | null> {
    const result = await prismaClient.orgUnit.findFirst({
      where: { id: orgUnitId, tenantId },
      select: { path: true },
    });

    return result?.path ?? null;
  },

  // -------------------------------------------------------------------------
  // getDepth
  // -------------------------------------------------------------------------
  async getDepth(orgUnitId: string, tenantId: string): Promise<number | null> {
    const result = await prismaClient.orgUnit.findFirst({
      where: { id: orgUnitId, tenantId },
      select: { depth: true },
    });

    return result?.depth ?? null;
  },
});

// ---------------------------------------------------------------------------
// Factory: Write Repository Implementation
// ---------------------------------------------------------------------------

/**
 * Creates the Prisma implementation of OrgUnitWriteRepository.
 * Write operations for OrgUnit management.
 */
export const PrismaOrgUnitWriteRepositoryImpl = ({
  prismaClient,
}: PrismaOrgUnitRepositoryDeps): OrgUnitWriteRepository => ({
  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  async create(data: CreateOrgUnitData): Promise<DomainResult<OrgUnit>> {
    try {
      const result = await prismaClient.orgUnit.create({
        data: {
          tenantId: data.tenantId,
          parentId: data.parentId,
          type: data.type as PrismaOrgUnitType,
          name: data.name,
          path: data.path,
          depth: data.depth,
        },
      });

      return ok(mapPrismaOrgUnitToDomain(result));
    } catch (error) {
      // Check for unique constraint violation
      if (
        error instanceof Error &&
        error.message.includes('Unique constraint')
      ) {
        return fail(
          businessError(
            'ORGUNIT_ALREADY_EXISTS',
            'An OrgUnit with this ID already exists',
          ),
        );
      }

      return fail(
        technicalError('ORGUNIT_CREATE_FAILED', 'Failed to create OrgUnit', {
          cause: error,
        }),
      );
    }
  },

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------
  async update(
    orgUnitId: string,
    tenantId: string,
    data: UpdateOrgUnitInput,
  ): Promise<DomainResult<OrgUnit>> {
    try {
      // Build update data
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.type !== undefined) updateData.type = data.type as PrismaOrgUnitType;

      const result = await prismaClient.orgUnit.updateMany({
        where: {
          id: orgUnitId,
          tenantId,
        },
        data: updateData,
      });

      if (result.count === 0) {
        return fail(
          notFoundError(
            'ORGUNIT_NOT_FOUND',
            `OrgUnit ${orgUnitId} not found in tenant`,
          ),
        );
      }

      // Fetch the updated record
      const updated = await prismaClient.orgUnit.findFirst({
        where: { id: orgUnitId, tenantId },
      });

      if (!updated) {
        return fail(
          technicalError(
            'ORGUNIT_UPDATE_INCONSISTENT',
            'OrgUnit updated but not found on re-read',
          ),
        );
      }

      return ok(mapPrismaOrgUnitToDomain(updated));
    } catch (error) {
      return fail(
        technicalError('ORGUNIT_UPDATE_FAILED', 'Failed to update OrgUnit', {
          cause: error,
        }),
      );
    }
  },

  // -------------------------------------------------------------------------
  // move
  // -------------------------------------------------------------------------
  async move(
    orgUnitId: string,
    tenantId: string,
    moveData: MoveOrgUnitData,
  ): Promise<DomainResult<OrgUnit>> {
    try {
      const result = await prismaClient.orgUnit.updateMany({
        where: {
          id: orgUnitId,
          tenantId,
        },
        data: {
          parentId: moveData.parentId,
          path: moveData.path,
          depth: moveData.depth,
        },
      });

      if (result.count === 0) {
        return fail(
          notFoundError(
            'ORGUNIT_NOT_FOUND',
            `OrgUnit ${orgUnitId} not found in tenant`,
          ),
        );
      }

      // Fetch the updated record
      const updated = await prismaClient.orgUnit.findFirst({
        where: { id: orgUnitId, tenantId },
      });

      if (!updated) {
        return fail(
          technicalError(
            'ORGUNIT_MOVE_INCONSISTENT',
            'OrgUnit moved but not found on re-read',
          ),
        );
      }

      return ok(mapPrismaOrgUnitToDomain(updated));
    } catch (error) {
      return fail(
        technicalError('ORGUNIT_MOVE_FAILED', 'Failed to move OrgUnit', {
          cause: error,
        }),
      );
    }
  },

  // -------------------------------------------------------------------------
  // batchUpdatePaths
  // -------------------------------------------------------------------------
  async batchUpdatePaths(
    tenantId: string,
    updates: SubtreePathUpdate[],
  ): Promise<DomainResult<number>> {
    try {
      // Use a transaction to batch update all paths
      let count = 0;

      await prismaClient.$transaction(async tx => {
        for (const update of updates) {
          const result = await tx.orgUnit.updateMany({
            where: {
              id: update.orgUnitId,
              tenantId,
            },
            data: {
              path: update.path,
              depth: update.depth,
            },
          });
          count += result.count;
        }
      });

      return ok(count);
    } catch (error) {
      return fail(
        technicalError(
          'ORGUNIT_BATCH_UPDATE_PATHS_FAILED',
          'Failed to batch update OrgUnit paths',
          { cause: error },
        ),
      );
    }
  },

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------
  async delete(orgUnitId: string, tenantId: string): Promise<DomainResult<void>> {
    try {
      // Check for children
      const childCount = await prismaClient.orgUnit.count({
        where: {
          tenantId,
          parentId: orgUnitId,
        },
      });

      if (childCount > 0) {
        return fail(
          businessError(
            'ORGUNIT_HAS_CHILDREN',
            'Cannot delete OrgUnit with children. Delete children first or use cascade delete.',
          ),
        );
      }

      // Check for members
      const memberCount = await prismaClient.membership.count({
        where: {
          tenantId,
          orgUnitId,
        },
      });

      if (memberCount > 0) {
        return fail(
          businessError(
            'ORGUNIT_HAS_MEMBERS',
            'Cannot delete OrgUnit with assigned members. Reassign or remove members first.',
          ),
        );
      }

      // Perform delete
      const result = await prismaClient.orgUnit.deleteMany({
        where: {
          id: orgUnitId,
          tenantId,
        },
      });

      if (result.count === 0) {
        return fail(
          notFoundError(
            'ORGUNIT_NOT_FOUND',
            `OrgUnit ${orgUnitId} not found in tenant`,
          ),
        );
      }

      return ok(undefined);
    } catch (error) {
      return fail(
        technicalError('ORGUNIT_DELETE_FAILED', 'Failed to delete OrgUnit', {
          cause: error,
        }),
      );
    }
  },

  // -------------------------------------------------------------------------
  // deleteSubtree
  // -------------------------------------------------------------------------
  async deleteSubtree(
    orgUnitId: string,
    tenantId: string,
  ): Promise<DomainResult<number>> {
    try {
      // Find all OrgUnits in the subtree
      const subtreeOrgUnits = await prismaClient.orgUnit.findMany({
        where: {
          tenantId,
          path: { has: orgUnitId },
        },
        select: { id: true },
      });

      const subtreeIds = subtreeOrgUnits.map(o => o.id);

      if (subtreeIds.length === 0) {
        return fail(
          notFoundError(
            'ORGUNIT_NOT_FOUND',
            `OrgUnit ${orgUnitId} not found in tenant`,
          ),
        );
      }

      // Check for members in the subtree
      const memberCount = await prismaClient.membership.count({
        where: {
          tenantId,
          orgUnitId: { in: subtreeIds },
        },
      });

      if (memberCount > 0) {
        return fail(
          businessError(
            'ORGUNIT_HAS_MEMBERS',
            'Cannot delete subtree with assigned members. Reassign or remove members first.',
          ),
        );
      }

      // Delete all OrgUnits in the subtree (deepest first to satisfy FK constraints)
      // Using deleteMany with path filter should work since we're deleting ALL
      const result = await prismaClient.orgUnit.deleteMany({
        where: {
          tenantId,
          path: { has: orgUnitId },
        },
      });

      return ok(result.count);
    } catch (error) {
      return fail(
        technicalError(
          'ORGUNIT_DELETE_SUBTREE_FAILED',
          'Failed to delete OrgUnit subtree',
          { cause: error },
        ),
      );
    }
  },

  // -------------------------------------------------------------------------
  // findById (for write operations)
  // -------------------------------------------------------------------------
  async findById(orgUnitId: string, tenantId: string): Promise<OrgUnit | null> {
    const result = await prismaClient.orgUnit.findFirst({
      where: {
        id: orgUnitId,
        tenantId,
      },
    });

    return result ? mapPrismaOrgUnitToDomain(result) : null;
  },

  // -------------------------------------------------------------------------
  // hasChildren
  // -------------------------------------------------------------------------
  async hasChildren(orgUnitId: string, tenantId: string): Promise<boolean> {
    const count = await prismaClient.orgUnit.count({
      where: {
        tenantId,
        parentId: orgUnitId,
      },
    });
    return count > 0;
  },

  // -------------------------------------------------------------------------
  // hasMembers
  // -------------------------------------------------------------------------
  async hasMembers(orgUnitId: string, tenantId: string): Promise<boolean> {
    const count = await prismaClient.membership.count({
      where: {
        tenantId,
        orgUnitId,
      },
    });
    return count > 0;
  },

  // -------------------------------------------------------------------------
  // findInconsistentPaths
  // -------------------------------------------------------------------------
  async findInconsistentPaths(tenantId: string): Promise<OrgUnit[]> {
    // Find OrgUnits where depth != path.length - 1
    // This requires a raw query or post-fetch filter
    const allOrgUnits = await prismaClient.orgUnit.findMany({
      where: { tenantId },
    });

    const inconsistent = allOrgUnits.filter(o => {
      // Check INV-ORG-003: depth = path.length - 1
      if (o.depth !== o.path.length - 1) {
        return true;
      }

      // Check INV-ORG-004: Root OrgUnit has parentId=NULL, depth=0, path=[id]
      if (o.parentId === null) {
        if (o.depth !== 0 || o.path.length !== 1 || o.path[0] !== o.id) {
          return true;
        }
      }

      // Check that path ends with own id
      if (o.path[o.path.length - 1] !== o.id) {
        return true;
      }

      return false;
    });

    return inconsistent.map(mapPrismaOrgUnitToDomain);
  },

  // -------------------------------------------------------------------------
  // count
  // -------------------------------------------------------------------------
  async count(tenantId: string): Promise<number> {
    return prismaClient.orgUnit.count({
      where: { tenantId },
    });
  },
});
