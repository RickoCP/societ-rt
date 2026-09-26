/**
 * PrismaMembershipRepository — Prisma-based implementation of IMembershipRepository.
 *
 * This repository implements the membership query contract for FASE 1.6,
 * providing both convenience (ACTIVE-only) and authoritative (status-aware)
 * reads against the existing M1/M2 schema.
 *
 * **READ-ONLY:** This implementation does not modify membership data.
 * Write operations will be added in FASE 1.18 (Membership Lifecycle Management).
 *
 * **SECURITY CONSIDERATIONS:**
 * - membershipId is NEVER accepted from external sources — always resolved server-side
 * - Queries exclude quarantined users by default (INV-QUARANTINE-001)
 * - All tenant-scoped queries filter by tenantId (no cross-tenant leakage)
 * - Membership status is preserved for authoritative reads (TPR-04)
 *
 * **INVARIANTS ENFORCED:**
 * - INV-MEM-001: Membership OrgUnit belongs to Membership tenant (validated in resolution)
 * - INV-MEM-002: Tenant-level membership has orgUnitId=NULL (validated in resolution)
 * - INV-MEM-003: Org-scoped roles require valid orgUnitId (validated in resolution)
 * - INV-QUARANTINE-001: Quarantined users excluded from authorization queries
 *
 * @see FASE 1.6 Task 4: Membership Repository Prisma Adapter
 * @see Requirements 1 (AC 1-7)
 * @see Design Components and Interfaces > 3. Membership Model
 * @see TPR-04: Status-Aware Membership Resolution
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type {
  Membership as PrismaMembership,
  MembershipRole as PrismaMembershipRole,
  MembershipStatus as PrismaMembershipStatus,
} from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type { IMembershipRepository } from '@core/domains/membership/repositories';
import type {
  MembershipQueryOptions,
  FindByUserIdOptions,
} from '@core/domains/membership/repositories';
import { resolveQueryOptions } from '@core/domains/membership/repositories';
import type { Membership } from '@core/domains/membership/entities';
import type { MembershipResolutionKey } from '@core/domains/membership/types';
import {
  MembershipRole,
  MembershipStatus,
  isTenantLevelRole,
} from '@core/domains/membership/types';
import {
  authNoMembership,
  authUserQuarantined,
  authMembershipContextInvalid,
  authInvalidScope,
} from '@core/domains/membership/errors';
import type { IQuarantineManifestService } from '@infrastructure/quarantine';

// ---------------------------------------------------------------------------
// Prisma → Domain Mapping
// ---------------------------------------------------------------------------

/**
 * Maps Prisma MembershipRole enum to domain MembershipRole enum.
 * Both enums should have identical values, but we map explicitly for type safety.
 */
function mapPrismaRole(prismaRole: PrismaMembershipRole): MembershipRole {
  return prismaRole as unknown as MembershipRole;
}

/**
 * Maps Prisma MembershipStatus enum to domain MembershipStatus enum.
 * Both enums should have identical values, but we map explicitly for type safety.
 */
function mapPrismaStatus(prismaStatus: PrismaMembershipStatus): MembershipStatus {
  return prismaStatus as unknown as MembershipStatus;
}

/**
 * Maps a Prisma Membership record to a domain Membership entity.
 *
 * All fields are mapped directly; Prisma provides the same field names
 * after mapping via @map directives in the schema.
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
// Status Filter Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the Prisma status filter based on query options.
 *
 * - If includeInactive is false (default), only ACTIVE memberships are returned.
 * - If includeInactive is true, all statuses are returned (authoritative read).
 */
function buildStatusFilter(
  includeInactive: boolean,
): { status: PrismaMembershipStatus } | undefined {
  if (includeInactive) {
    // Return all statuses — no filter applied
    return undefined;
  }
  // Filter to ACTIVE only (convenience query)
  return { status: 'ACTIVE' as PrismaMembershipStatus };
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a PrismaMembershipRepository instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the repository testable and
 * decoupled from concrete implementations.
 *
 * @param prismaClient - The Prisma client instance
 * @param quarantineService - The quarantine manifest service for PNA exclusion
 * @returns An implementation of IMembershipRepository
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   membershipRepository: asFunction(PrismaMembershipRepositoryImpl).singleton(),
 * });
 *
 * // Direct usage (for testing)
 * const repo = PrismaMembershipRepositoryImpl({
 *   prismaClient: mockPrisma,
 *   quarantineService: mockQuarantineService,
 * });
 * ```
 */
export const PrismaMembershipRepositoryImpl = ({
  prismaClient,
  quarantineService,
}: {
  prismaClient: PrismaClient;
  quarantineService: IQuarantineManifestService;
}): IMembershipRepository => {
  // -------------------------------------------------------------------------
  // User-centric Queries
  // -------------------------------------------------------------------------

  return {
    /**
     * Find all memberships for a user, optionally filtered by tenant.
     *
     * @see IMembershipRepository.findByUserId
     */
    async findByUserId(
      userId: string,
      options?: FindByUserIdOptions,
    ): Promise<Membership[]> {
      const { includeInactive, excludeQuarantined } = resolveQueryOptions(options);

      // Quarantine check (per INV-QUARANTINE-001)
      if (excludeQuarantined && quarantineService.isQuarantined(userId)) {
        return [];
      }

      try {
        const statusFilter = buildStatusFilter(includeInactive);
        const tenantFilter = options?.tenantId
          ? { tenantId: options.tenantId }
          : {};

        const memberships = await prismaClient.membership.findMany({
          where: {
            userId,
            ...tenantFilter,
            ...statusFilter,
          },
          orderBy: { createdAt: 'desc' },
        });

        return memberships.map(mapPrismaToDomain);
      } catch (error) {
        // Log and return empty array — fail gracefully for read operations
        console.error('[MembershipRepository] findByUserId error:', error);
        return [];
      }
    },

    // -----------------------------------------------------------------------
    // Tenant-scoped Queries
    // -----------------------------------------------------------------------

    /**
     * Find all memberships for a user within a specific tenant.
     * Returns ALL statuses by default (for admin views).
     *
     * @see IMembershipRepository.findByUserAndTenant
     */
    async findByUserAndTenant(
      userId: string,
      tenantId: string,
      options?: MembershipQueryOptions,
    ): Promise<Membership[]> {
      const { excludeQuarantined } = resolveQueryOptions(options);

      // Quarantine check (per INV-QUARANTINE-001)
      if (excludeQuarantined && quarantineService.isQuarantined(userId)) {
        return [];
      }

      try {
        // This method returns ALL statuses by design (per Task 2 spec)
        // Use findActiveByUserAndTenant for ACTIVE-only queries
        const memberships = await prismaClient.membership.findMany({
          where: {
            userId,
            tenantId,
          },
          orderBy: { createdAt: 'desc' },
        });

        return memberships.map(mapPrismaToDomain);
      } catch (error) {
        console.error('[MembershipRepository] findByUserAndTenant error:', error);
        return [];
      }
    },

    /**
     * Find ACTIVE memberships for a user within a specific tenant.
     * Convenience query for typical authorization flows.
     *
     * @see IMembershipRepository.findActiveByUserAndTenant
     */
    async findActiveByUserAndTenant(
      userId: string,
      tenantId: string,
    ): Promise<Membership[]> {
      // Quarantine check (per INV-QUARANTINE-001) — always applied for convenience queries
      if (quarantineService.isQuarantined(userId)) {
        return [];
      }

      try {
        const memberships = await prismaClient.membership.findMany({
          where: {
            userId,
            tenantId,
            status: 'ACTIVE' as PrismaMembershipStatus,
          },
          orderBy: { createdAt: 'desc' },
        });

        return memberships.map(mapPrismaToDomain);
      } catch (error) {
        console.error('[MembershipRepository] findActiveByUserAndTenant error:', error);
        return [];
      }
    },

    // -----------------------------------------------------------------------
    // Authoritative Status-Aware Queries (TPR-04)
    // -----------------------------------------------------------------------

    /**
     * Find memberships with full status awareness (authoritative read).
     * Returns ALL statuses for downstream policy decisions.
     *
     * @see IMembershipRepository.findByUserAndTenantWithStatus
     */
    async findByUserAndTenantWithStatus(
      userId: string,
      tenantId: string,
    ): Promise<Membership[]> {
      // Quarantine check — applied by default for authorization paths
      if (quarantineService.isQuarantined(userId)) {
        return [];
      }

      try {
        // Return ALL statuses — status field preserved for downstream decisions
        const memberships = await prismaClient.membership.findMany({
          where: {
            userId,
            tenantId,
          },
          orderBy: { createdAt: 'desc' },
        });

        return memberships.map(mapPrismaToDomain);
      } catch (error) {
        console.error('[MembershipRepository] findByUserAndTenantWithStatus error:', error);
        return [];
      }
    },

    // -----------------------------------------------------------------------
    // Membership Resolution (Authorization Context)
    // -----------------------------------------------------------------------

    /**
     * Resolve a specific membership using the 3-part resolution key.
     *
     * This is the PRIMARY method for authorization context resolution.
     * The membershipId is NEVER accepted from JWT — it is always resolved
     * server-side using this method.
     *
     * Resolution rules per design:
     * - Single membership: Direct match on (userId, tenantId)
     * - Multiple memberships in tenant: activeOrgUnitId distinguishes
     * - Tenant-level membership: activeOrgUnitId = null, role ∈ {PLATFORM_ADMIN, TENANT_OWNER}
     * - Org-scoped membership: activeOrgUnitId must match membership.orgUnitId
     *
     * Per TPR-03: Resolution returns authoritative membership state INCLUDING
     * status. Resolution is SEPARATE from operation authorization.
     *
     * @see IMembershipRepository.resolveMembership
     */
    async resolveMembership(
      key: MembershipResolutionKey,
    ): Promise<DomainResult<Membership>> {
      const { userId, activeTenantId, activeOrgUnitId } = key;

      // Step 1: Quarantine check (per INV-QUARANTINE-001)
      if (quarantineService.isQuarantined(userId)) {
        return fail(authUserQuarantined());
      }

      try {
        // Step 2: Query ALL memberships for user in tenant (status-aware per TPR-04)
        // We include SUSPENDED memberships because emergency operations may be allowed
        const memberships = await prismaClient.membership.findMany({
          where: {
            userId,
            tenantId: activeTenantId,
            // Include ACTIVE and SUSPENDED for authoritative resolution (TPR-03)
            status: {
              in: ['ACTIVE', 'SUSPENDED'] as PrismaMembershipStatus[],
            },
          },
        });

        // Step 3: No membership found
        if (memberships.length === 0) {
          return fail(authNoMembership());
        }

        // Step 4: Single membership resolution
        const singleMembership = memberships[0];
        if (memberships.length === 1 && singleMembership) {
          const membership = mapPrismaToDomain(singleMembership);

          // Validate scope consistency
          if (activeOrgUnitId === null) {
            // Tenant-level context requested
            if (!isTenantLevelRole(membership.role)) {
              // Org-scoped role cannot have null orgUnitId context
              return fail(authInvalidScope());
            }
          } else {
            // Org-scoped context requested
            if (membership.orgUnitId !== activeOrgUnitId) {
              // Single membership but orgUnitId mismatch
              return fail(authMembershipContextInvalid());
            }
          }

          return ok(membership);
        }

        // Step 5: Multiple memberships — activeOrgUnitId MUST distinguish
        if (activeOrgUnitId === null) {
          // Tenant-level context requested — find tenant-level membership
          const tenantLevelMembership = memberships.find((m) => {
            const role = mapPrismaRole(m.role);
            return m.orgUnitId === null && isTenantLevelRole(role);
          });

          if (!tenantLevelMembership) {
            return fail(authMembershipContextInvalid());
          }

          return ok(mapPrismaToDomain(tenantLevelMembership));
        }

        // Org-scoped context — find membership matching activeOrgUnitId
        const matchingMembership = memberships.find(
          (m) => m.orgUnitId === activeOrgUnitId,
        );

        if (!matchingMembership) {
          return fail(authMembershipContextInvalid());
        }

        return ok(mapPrismaToDomain(matchingMembership));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[MembershipRepository] resolveMembership error:', error);
        return fail(
          technicalError(
            'MEMBERSHIP_RESOLUTION_FAILED',
            `Failed to resolve membership: ${errorMessage}`,
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // Quarantine Support
    // -----------------------------------------------------------------------

    /**
     * Check if a user is in the quarantine manifest.
     *
     * Delegates to the injected quarantine service for manifest lookup.
     *
     * @see IMembershipRepository.isQuarantined
     */
    async isQuarantined(userId: string): Promise<boolean> {
      return quarantineService.isQuarantined(userId);
    },

    // -----------------------------------------------------------------------
    // Count/Existence Queries (Optimization)
    // -----------------------------------------------------------------------

    /**
     * Check if a user has any active membership in a tenant.
     *
     * Optimized existence check without loading full membership data.
     *
     * @see IMembershipRepository.hasActiveMembershipInTenant
     */
    async hasActiveMembershipInTenant(
      userId: string,
      tenantId: string,
    ): Promise<boolean> {
      // Quarantine check — quarantined users have no active memberships
      if (quarantineService.isQuarantined(userId)) {
        return false;
      }

      try {
        const count = await prismaClient.membership.count({
          where: {
            userId,
            tenantId,
            status: 'ACTIVE' as PrismaMembershipStatus,
          },
        });

        return count > 0;
      } catch (error) {
        console.error('[MembershipRepository] hasActiveMembershipInTenant error:', error);
        return false;
      }
    },

    /**
     * Count memberships for a user in a tenant.
     *
     * Used for multi-membership detection and validation.
     *
     * @see IMembershipRepository.countByUserAndTenant
     */
    async countByUserAndTenant(
      userId: string,
      tenantId: string,
      options?: MembershipQueryOptions,
    ): Promise<number> {
      const { includeInactive, excludeQuarantined } = resolveQueryOptions(options);

      // Quarantine check
      if (excludeQuarantined && quarantineService.isQuarantined(userId)) {
        return 0;
      }

      try {
        const statusFilter = buildStatusFilter(includeInactive);

        return await prismaClient.membership.count({
          where: {
            userId,
            tenantId,
            ...statusFilter,
          },
        });
      } catch (error) {
        console.error('[MembershipRepository] countByUserAndTenant error:', error);
        return 0;
      }
    },
  };
};

