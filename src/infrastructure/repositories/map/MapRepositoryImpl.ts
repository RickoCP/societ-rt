/**
 * MapRepositoryImpl — Infrastructure implementation of MapRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on Household model.
 * Joins with Resident to get resident count and head of household name.
 *
 * @see Requirements 11.1, 11.2, 11.3, 11.4
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type { MapRepository } from '@core/domains/map/repositories/MapRepository';
import type {
  HouseholdMapMarker,
  MapFilters,
} from '@core/domains/map/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma result shape
// ---------------------------------------------------------------------------

interface PrismaHouseholdWithResidents {
  id: string;
  householdNumber: string;
  address: string;
  block: string | null;
  latitude: number | null;
  longitude: number | null;
  residents: Array<{
    name: string;
  }>;
  _count?: {
    residents: number;
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const MapRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): MapRepository => {
  const householdRepo: TenantScopedRepository<PrismaHouseholdWithResidents> =
    createTenantScopedRepository(
      prismaClient.household as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // getMarkersByTenant
    // -----------------------------------------------------------------------
    async getMarkersByTenant(
      tenantId: string,
      filters: MapFilters,
    ): Promise<DomainResult<HouseholdMapMarker[]>> {
      try {
        // Build dynamic where clause for filters
        const where: Record<string, unknown> = {
          latitude: { not: null },
          longitude: { not: null },
        };

        if (filters.block) {
          where['block'] = filters.block;
        }

        if (filters.status) {
          where['residents'] = {
            some: { status: filters.status, deletedAt: null },
          };
        }

        if (filters.categories && filters.categories.length > 0) {
          where['residents'] = {
            ...((where['residents'] as Record<string, unknown>) ?? {}),
            some: {
              ...((
                (where['residents'] as Record<string, unknown>)?.['some'] as
                  | Record<string, unknown>
                  | undefined
              ) ?? {}),
              categories: { hasSome: filters.categories },
              deletedAt: null,
            },
          };
        }

        const households = await householdRepo.findMany(tenantId, {
          where,
          include: {
            residents: {
              where: { deletedAt: null },
              select: { name: true },
              take: 1,
              orderBy: { createdAt: 'asc' },
            },
            _count: {
              select: { residents: { where: { deletedAt: null } } },
            },
          },
        });

        const markers: HouseholdMapMarker[] = households.map((h) => ({
          householdId: h.id,
          householdNumber: h.householdNumber,
          address: h.address,
          block: h.block,
          latitude: h.latitude,
          longitude: h.longitude,
          residentCount: h._count?.residents ?? 0,
          headOfHousehold:
            h.residents.length > 0 ? (h.residents[0]?.name ?? null) : null,
        }));

        return ok(markers);
      } catch (error) {
        return fail(
          technicalError(
            'MAP_GET_MARKERS_FAILED',
            'Failed to get map markers',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // updateCoordinates
    // -----------------------------------------------------------------------
    async updateCoordinates(
      tenantId: string,
      householdId: string,
      latitude: number,
      longitude: number,
    ): Promise<DomainResult<void>> {
      try {
        await householdRepo.update(tenantId, {
          where: { id: householdId },
          data: { latitude, longitude },
        });

        return ok(undefined);
      } catch (error) {
        return fail(
          technicalError(
            'MAP_UPDATE_COORDINATES_FAILED',
            'Failed to update household coordinates',
            { cause: error },
          ),
        );
      }
    },
  };
};
