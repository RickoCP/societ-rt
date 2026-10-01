/**
 * PrismaAdminMembershipRepository — Prisma-based implementation of IAdminMembershipRepository.
 *
 * This repository implements admin-specific membership queries for FASE 1.18 Task 54,
 * supporting filtering, pagination, and scope-aware queries for admin operations.
 *
 * **SECURITY CONSIDERATIONS:**
 * - All queries are tenant-scoped (no cross-tenant leakage)
 * - Scope filtering applied via scopeOrgUnitIds parameter
 * - Excludes quarantined users from results
 *
 * @see FASE 1.18 Task 54: Admin Membership Management (Req 50)
 * @see Requirements 50 (Admin Membership Management)
 */

import type { PrismaClient } from '@prisma/client';
import type {
  Membership as PrismaMembership,
  MembershipRole as PrismaMembershipRole,
  MembershipStatus as PrismaMembershipStatus,
} from '@prisma/client';
import type { Membership } from '@core/domains/membership/entities';
import type { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import type {
  IAdminMembershipRepository,
  MembershipFilters,
  PaginationOptions,
  PaginatedResult,
} from '@core/domains/membership/services/AdminMembershipService';
import type { IQuarantineManifestService } from '@infrastructure/quarantine';

// ---------------------------------------------------------------------------
// Prisma → Domain Mapping
// ---------------------------------------------------------------------------

/**
 * Maps Prisma MembershipRole enum to domain MembershipRole enum.
 */
function mapPrismaRole(prismaRole: PrismaMembershipRole): MembershipRole {
  return prismaRole as unknown as MembershipRole;
}

/**
 * Maps Prisma MembershipStatus enum to domain MembershipStatus enum.
 */
function mapPrismaStatus(prismaStatus: PrismaMembershipStatus): MembershipStatus {
  return prismaStatus as unknown as MembershipStatus;
}

/**
 * Maps a Prisma Membership record to a domain Membership entity.
 */
function mapPrismaToDomain(prismaMembership: PrismaMembership): Membership {
  return {
    id: prismaMembership.id,
    userId: prismaMembership.userId,
    tenantId: prismaMembership.tenantId,
    orgUnitId: prismaMembership.orgUnitId,
    role: mapPrismaRole(prismaMembership.role),
    status: mapPrismaStatus(prismaMembership.status),
    createdAt: prismaMembership.createdAt,
    updatedAt: prismaMembership.updatedAt,
    revokedAt: prismaMembership.revokedAt ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Query Builder Helpers
// ---------------------------------------------------------------------------

type WhereClause = Record<string, unknown>;

/**
 * Build Prisma where clause from filters.
 */
function buildWhereClause(
  tenantId: string,
  filters: MembershipFilters,
  scopeOrgUnitIds: string[] | null,
): WhereClause {
  const where: WhereClause = {
    tenantId,
  };

  // Status filter
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      where['status'] = { in: filters.status as PrismaMembershipStatus[] };
    } else {
      where['status'] = filters.status as PrismaMembershipStatus;
    }
  }

  // Role filter
  if (filters.role) {
    if (Array.isArray(filters.role)) {
      where['role'] = { in: filters.role as PrismaMembershipRole[] };
    } else {
      where['role'] = filters.role as PrismaMembershipRole;
    }
  }

  // OrgUnit filter (must be within admin's scope)
  if (filters.orgUnitId) {
    const requestedOrgUnits = Array.isArray(filters.orgUnitId)
      ? filters.orgUnitId
      : [filters.orgUnitId];

    if (scopeOrgUnitIds !== null) {
      // Admin has limited scope - intersect requested with allowed
      const allowedOrgUnits = requestedOrgUnits.filter((id) =>
        scopeOrgUnitIds.includes(id),
      );
      where['orgUnitId'] = { in: allowedOrgUnits };
    } else {
      // Admin has tenant-wide scope
      where['orgUnitId'] = { in: requestedOrgUnits };
    }
  } else if (scopeOrgUnitIds !== null) {
    // No specific filter, but admin has limited scope
    // Include null orgUnitId only if admin is tenant-level (which they're not if scopeOrgUnitIds is set)
    where['orgUnitId'] = { in: scopeOrgUnitIds };
  }
  // If scopeOrgUnitIds is null (tenant-wide admin) and no filter, don't restrict

  // Created date range
  if (filters.createdAfter || filters.createdBefore) {
    const createdAtFilter: Record<string, Date> = {};
    if (filters.createdAfter) {
      createdAtFilter['gte'] = filters.createdAfter;
    }
    if (filters.createdBefore) {
      createdAtFilter['lte'] = filters.createdBefore;
    }
    where['createdAt'] = createdAtFilter;
  }

  // Updated date range
  if (filters.updatedAfter || filters.updatedBefore) {
    const updatedAtFilter: Record<string, Date> = {};
    if (filters.updatedAfter) {
      updatedAtFilter['gte'] = filters.updatedAfter;
    }
    if (filters.updatedBefore) {
      updatedAtFilter['lte'] = filters.updatedBefore;
    }
    where['updatedAt'] = updatedAtFilter;
  }

  // User search (requires join - handled separately)
  // Note: For now, userSearch is not implemented in the where clause
  // It would require a join to the users table

  return where;
}

/**
 * Build Prisma orderBy clause from pagination options.
 */
function buildOrderByClause(
  pagination: PaginationOptions,
): Record<string, 'asc' | 'desc'> {
  const sortBy = pagination.sortBy ?? 'createdAt';
  const sortOrder = pagination.sortOrder ?? 'desc';

  return { [sortBy]: sortOrder };
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a PrismaAdminMembershipRepository instance.
 *
 * @param prismaClient - The Prisma client instance
 * @param quarantineService - The quarantine manifest service for PNA exclusion
 * @returns An implementation of IAdminMembershipRepository
 */
export const PrismaAdminMembershipRepositoryImpl = ({
  prismaClient,
  quarantineService,
}: {
  prismaClient: PrismaClient;
  quarantineService: IQuarantineManifestService;
}): IAdminMembershipRepository => {
  return {
    /**
     * Find memberships with filters and pagination within a tenant.
     *
     * @see IAdminMembershipRepository.findWithFilters
     */
    async findWithFilters(
      tenantId: string,
      filters: MembershipFilters,
      pagination: PaginationOptions,
      scopeOrgUnitIds: string[] | null,
    ): Promise<PaginatedResult<Membership>> {
      try {
        const where = buildWhereClause(tenantId, filters, scopeOrgUnitIds);
        const orderBy = buildOrderByClause(pagination);
        const skip = (pagination.page - 1) * pagination.pageSize;
        const take = pagination.pageSize;

        // Execute count and find in parallel
        const [total, memberships] = await Promise.all([
          prismaClient.membership.count({ where }),
          prismaClient.membership.findMany({
            where,
            orderBy,
            skip,
            take,
          }),
        ]);

        // Filter out quarantined users
        const filteredMemberships = memberships.filter(
          (m) => !quarantineService.isQuarantined(m.userId),
        );

        const totalPages = Math.ceil(total / pagination.pageSize);

        return {
          data: filteredMemberships.map(mapPrismaToDomain),
          total,
          page: pagination.page,
          pageSize: pagination.pageSize,
          totalPages,
        };
      } catch (error) {
        console.error('[AdminMembershipRepository] findWithFilters error:', error);
        // Return empty result on error
        return {
          data: [],
          total: 0,
          page: pagination.page,
          pageSize: pagination.pageSize,
          totalPages: 0,
        };
      }
    },

    /**
     * Find a membership by ID within a tenant.
     *
     * @see IAdminMembershipRepository.findById
     */
    async findById(membershipId: string, tenantId: string): Promise<Membership | null> {
      try {
        const membership = await prismaClient.membership.findFirst({
          where: {
            id: membershipId,
            tenantId,
          },
        });

        if (!membership) {
          return null;
        }

        // Check quarantine
        if (quarantineService.isQuarantined(membership.userId)) {
          return null;
        }

        return mapPrismaToDomain(membership);
      } catch (error) {
        console.error('[AdminMembershipRepository] findById error:', error);
        return null;
      }
    },

    /**
     * Count memberships matching filters.
     *
     * @see IAdminMembershipRepository.countWithFilters
     */
    async countWithFilters(
      tenantId: string,
      filters: MembershipFilters,
      scopeOrgUnitIds: string[] | null,
    ): Promise<number> {
      try {
        const where = buildWhereClause(tenantId, filters, scopeOrgUnitIds);
        return await prismaClient.membership.count({ where });
      } catch (error) {
        console.error('[AdminMembershipRepository] countWithFilters error:', error);
        return 0;
      }
    },
  };
};
