/**
 * PrismaMembershipWriteRepository — Prisma-based implementation of MembershipWriteRepository.
 *
 * This repository implements write operations for membership lifecycle management.
 * It complements the read-only PrismaMembershipRepository.
 *
 * **SECURITY CONSIDERATIONS:**
 * - All write operations validate tenant boundary via WHERE clauses
 * - Uniqueness constraints are enforced at database level
 * - revokedAt is set for REVOKED status transitions
 *
 * **INVARIANTS:**
 * - INV-MEM-001: Membership OrgUnit belongs to Membership tenant (via FK)
 * - INV-MEM-002: Tenant-level membership has orgUnitId=NULL (validated by caller)
 * - INV-MEM-003: Org-scoped roles require valid orgUnitId (validated by caller)
 *
 * @see FASE 1.18 Task 50: Membership Lifecycle Management
 * @see Requirements 22 (AC 1-7)
 */

import type { PrismaClient } from '@prisma/client';
import type {
  Membership as PrismaMembership,
  MembershipRole as PrismaMembershipRole,
  MembershipStatus as PrismaMembershipStatus,
} from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, businessError } from '@core/utils';
import type {
  MembershipWriteRepository,
  UpdateMembershipData,
} from '@core/domains/membership/repositories';
import type { Membership, CreateMembershipInput } from '@core/domains/membership/entities';
import {
  MembershipRole,
  MembershipStatus,
} from '@core/domains/membership/types';

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

/**
 * Maps domain MembershipRole to Prisma enum.
 */
function mapDomainRoleToPrisma(role: MembershipRole): PrismaMembershipRole {
  return role as unknown as PrismaMembershipRole;
}

/**
 * Maps domain MembershipStatus to Prisma enum.
 */
function mapDomainStatusToPrisma(status: MembershipStatus): PrismaMembershipStatus {
  return status as unknown as PrismaMembershipStatus;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a PrismaMembershipWriteRepository instance.
 *
 * @param prismaClient - The Prisma client instance
 * @returns An implementation of MembershipWriteRepository
 */
export const PrismaMembershipWriteRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): MembershipWriteRepository => {
  return {
    // -----------------------------------------------------------------------
    // Create Operations
    // -----------------------------------------------------------------------

    async create(input: CreateMembershipInput): Promise<DomainResult<Membership>> {
      try {
        const membership = await prismaClient.membership.create({
          data: {
            userId: input.userId,
            tenantId: input.tenantId,
            orgUnitId: input.orgUnitId,
            role: mapDomainRoleToPrisma(input.role),
            status: mapDomainStatusToPrisma(input.status),
          },
        });

        return ok(mapPrismaToDomain(membership));
      } catch (error) {
        // Check for unique constraint violation
        if (error instanceof Error && error.message.includes('Unique constraint')) {
          return fail(
            businessError(
              'MEMBERSHIP_ALREADY_EXISTS',
              'A membership already exists for this user, tenant, and scope combination',
              { userMessage: 'A membership already exists for this scope' },
            ),
          );
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[MembershipWriteRepository] create error:', error);
        return fail(
          technicalError(
            'MEMBERSHIP_CREATE_FAILED',
            `Failed to create membership: ${errorMessage}`,
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // Update Operations
    // -----------------------------------------------------------------------

    async update(
      membershipId: string,
      tenantId: string,
      data: UpdateMembershipData,
    ): Promise<DomainResult<Membership>> {
      try {
        // Build update data
        const updateData: {
          status?: PrismaMembershipStatus;
          revokedAt?: Date | null;
        } = {};

        if (data.status !== undefined) {
          updateData.status = mapDomainStatusToPrisma(data.status);
        }

        if (data.revokedAt !== undefined) {
          updateData.revokedAt = data.revokedAt;
        }

        // Update with tenant boundary check
        const membership = await prismaClient.membership.update({
          where: {
            id: membershipId,
            tenantId, // Security: ensure tenant boundary
          },
          data: updateData,
        });

        return ok(mapPrismaToDomain(membership));
      } catch (error) {
        // Check for record not found
        if (error instanceof Error && error.message.includes('Record to update not found')) {
          return fail(
            businessError(
              'MEMBERSHIP_NOT_FOUND',
              'Membership not found in the specified tenant',
              { userMessage: 'Membership not found' },
            ),
          );
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[MembershipWriteRepository] update error:', error);
        return fail(
          technicalError(
            'MEMBERSHIP_UPDATE_FAILED',
            `Failed to update membership: ${errorMessage}`,
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // Query Operations
    // -----------------------------------------------------------------------

    async findById(membershipId: string, tenantId: string): Promise<Membership | null> {
      try {
        const membership = await prismaClient.membership.findFirst({
          where: {
            id: membershipId,
            tenantId, // Security: ensure tenant boundary
          },
        });

        return membership ? mapPrismaToDomain(membership) : null;
      } catch (error) {
        console.error('[MembershipWriteRepository] findById error:', error);
        return null;
      }
    },

    async existsActiveMembership(
      userId: string,
      tenantId: string,
      orgUnitId: string | null,
    ): Promise<boolean> {
      try {
        const count = await prismaClient.membership.count({
          where: {
            userId,
            tenantId,
            orgUnitId, // null for tenant-level, specific ID for org-scoped
            status: 'ACTIVE' as PrismaMembershipStatus,
          },
        });

        return count > 0;
      } catch (error) {
        console.error('[MembershipWriteRepository] existsActiveMembership error:', error);
        return false;
      }
    },

    async countActiveMemberships(userId: string, tenantId: string): Promise<number> {
      try {
        return await prismaClient.membership.count({
          where: {
            userId,
            tenantId,
            status: 'ACTIVE' as PrismaMembershipStatus,
          },
        });
      } catch (error) {
        console.error('[MembershipWriteRepository] countActiveMemberships error:', error);
        return 0;
      }
    },

    // -----------------------------------------------------------------------
    // Delete Operations
    // -----------------------------------------------------------------------

    async delete(membershipId: string, tenantId: string): Promise<DomainResult<void>> {
      try {
        await prismaClient.membership.delete({
          where: {
            id: membershipId,
            tenantId, // Security: ensure tenant boundary
          },
        });

        return ok(undefined);
      } catch (error) {
        // Check for record not found
        if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
          return fail(
            businessError(
              'MEMBERSHIP_NOT_FOUND',
              'Membership not found in the specified tenant',
              { userMessage: 'Membership not found' },
            ),
          );
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[MembershipWriteRepository] delete error:', error);
        return fail(
          technicalError(
            'MEMBERSHIP_DELETE_FAILED',
            `Failed to delete membership: ${errorMessage}`,
            { cause: error },
          ),
        );
      }
    },
  };
};
