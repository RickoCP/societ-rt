/**
 * HouseholdRepositoryImpl — Infrastructure implementation of IHouseholdRepository.
 *
 * Uses direct Prisma queries for household isolation queries.
 * All queries enforce tenant-scoped data isolation.
 *
 * CRITICAL SECURITY RULES:
 * - All queries MUST include tenantId for tenant isolation
 * - Household data MUST NOT be accessible across tenant boundaries
 *
 * @see Task 55: Household Isolation Enforcement
 * @see INV-HOUSEHOLD-001
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, authorizationError } from '@core/utils';
import type { IHouseholdRepository } from '@core/domains/household/repositories/IHouseholdRepository';
import type { Household, Resident } from '@core/domains/resident/entities';
import type { HouseholdMember, HouseholdWithHead } from '@core/domains/household/entities';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaHousehold {
  id: string;
  tenantId: string;
  householdNumber: string;
  address: string;
  block: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PrismaResident {
  id: string;
  tenantId: string;
  householdId: string;
  name: string;
  nik: string;
  dateOfBirth: Date;
  gender: string;
  phone: string | null;
  status: string;
  categories: string[];
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function mapPrismaHouseholdToDomain(p: PrismaHousehold): Household {
  return {
    id: p.id,
    tenantId: p.tenantId,
    householdNumber: p.householdNumber,
    address: p.address,
    block: p.block,
    latitude: p.latitude,
    longitude: p.longitude,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function mapPrismaResidentToDomain(p: PrismaResident): Resident {
  return {
    id: p.id,
    tenantId: p.tenantId,
    householdId: p.householdId,
    name: p.name,
    nik: p.nik,
    dateOfBirth: p.dateOfBirth,
    gender: p.gender as Resident['gender'],
    phone: p.phone,
    status: p.status as Resident['status'],
    categories: p.categories as Resident['categories'],
    emergencyContactName: p.emergencyContactName,
    emergencyContactPhone: p.emergencyContactPhone,
    emergencyContactRelationship: p.emergencyContactRelationship,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deletedAt: p.deletedAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const HouseholdRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): IHouseholdRepository => {
  return {
    // -------------------------------------------------------------------------
    // Household Lookup
    // -------------------------------------------------------------------------

    async findById(householdId: string, tenantId: string): Promise<Household | null> {
      try {
        const household = await prismaClient.household.findFirst({
          where: {
            id: householdId,
            tenantId,
          },
        });

        if (!household) {
          return null;
        }

        return mapPrismaHouseholdToDomain(household as unknown as PrismaHousehold);
      } catch (error) {
        console.error('[HouseholdRepository] findById error:', error);
        return null;
      }
    },

    async exists(householdId: string, tenantId: string): Promise<boolean> {
      try {
        const count = await prismaClient.household.count({
          where: {
            id: householdId,
            tenantId,
          },
        });

        return count > 0;
      } catch (error) {
        console.error('[HouseholdRepository] exists error:', error);
        return false;
      }
    },

    async findWithHead(householdId: string, tenantId: string): Promise<HouseholdWithHead | null> {
      try {
        const household = await prismaClient.household.findFirst({
          where: {
            id: householdId,
            tenantId,
          },
          include: {
            residents: {
              where: {
                deletedAt: null,
              },
              orderBy: {
                createdAt: 'asc',
              },
              take: 1,
            },
          },
        });

        if (!household) {
          return null;
        }

        // Get the first resident as the head (or null if no residents)
        const headResident = household.residents[0];

        return {
          household: {
            id: household.id,
            tenantId: household.tenantId,
            householdNumber: household.householdNumber,
            address: household.address,
            block: household.block,
            latitude: household.latitude,
            longitude: household.longitude,
            createdAt: household.createdAt,
            updatedAt: household.updatedAt,
          },
          headUserId: headResident?.id ?? null,
          orgUnitId: null, // OrgUnit relationship would need to be added if tracked
        };
      } catch (error) {
        console.error('[HouseholdRepository] findWithHead error:', error);
        return null;
      }
    },

    // -------------------------------------------------------------------------
    // Resident-Household Queries
    // -------------------------------------------------------------------------

    async getMembers(householdId: string, tenantId: string): Promise<HouseholdMember[]> {
      try {
        const residents = await prismaClient.resident.findMany({
          where: {
            householdId,
            tenantId,
            deletedAt: null,
          },
          orderBy: {
            createdAt: 'asc',
          },
        });

        return residents.map((resident: PrismaResident, index: number) => ({
          residentId: resident.id,
          userId: null, // User linkage would need additional schema/logic
          tenantId: resident.tenantId,
          householdId: resident.householdId,
          isHead: index === 0, // First resident is considered the head
        }));
      } catch (error) {
        console.error('[HouseholdRepository] getMembers error:', error);
        return [];
      }
    },

    async findHead(householdId: string, tenantId: string): Promise<HouseholdMember | null> {
      try {
        const resident = await prismaClient.resident.findFirst({
          where: {
            householdId,
            tenantId,
            deletedAt: null,
          },
          orderBy: {
            createdAt: 'asc',
          },
        });

        if (!resident) {
          return null;
        }

        return {
          residentId: resident.id,
          userId: null, // User linkage would need additional schema/logic
          tenantId: resident.tenantId,
          householdId: resident.householdId,
          isHead: true,
        };
      } catch (error) {
        console.error('[HouseholdRepository] findHead error:', error);
        return null;
      }
    },

    async isUserMember(userId: string, householdId: string, tenantId: string): Promise<boolean> {
      try {
        // Check if user has a membership linked to this household via Home model
        const home = await prismaClient.home.findFirst({
          where: {
            householdId,
            tenantId,
            ownerId: userId,
          },
        });

        return home !== null;
      } catch (error) {
        console.error('[HouseholdRepository] isUserMember error:', error);
        return false;
      }
    },

    async isUserHead(userId: string, householdId: string, tenantId: string): Promise<boolean> {
      try {
        // Check if user is the owner of the household via Home model
        const home = await prismaClient.home.findFirst({
          where: {
            householdId,
            tenantId,
            ownerId: userId,
          },
        });

        // If home exists and user is the owner, they are the head
        return home !== null;
      } catch (error) {
        console.error('[HouseholdRepository] isUserHead error:', error);
        return false;
      }
    },

    async findByUserId(userId: string, tenantId: string): Promise<Household[]> {
      try {
        // Find households where user is an owner via Home model
        const homes = await prismaClient.home.findMany({
          where: {
            tenantId,
            ownerId: userId,
          },
          include: {
            // We need to get household data
          },
        });

        if (homes.length === 0) {
          return [];
        }

        // Get the household IDs
        const householdIds = homes.map((h: { householdId: string }) => h.householdId);

        // Fetch the actual households
        const households = await prismaClient.household.findMany({
          where: {
            id: { in: householdIds },
            tenantId,
          },
        });

        return households.map((h: PrismaHousehold) =>
          mapPrismaHouseholdToDomain(h as unknown as PrismaHousehold),
        );
      } catch (error) {
        console.error('[HouseholdRepository] findByUserId error:', error);
        return [];
      }
    },

    // -------------------------------------------------------------------------
    // Resident Queries
    // -------------------------------------------------------------------------

    async findResidentById(residentId: string, tenantId: string): Promise<Resident | null> {
      try {
        const resident = await prismaClient.resident.findFirst({
          where: {
            id: residentId,
            tenantId,
            deletedAt: null,
          },
        });

        if (!resident) {
          return null;
        }

        return mapPrismaResidentToDomain(resident as unknown as PrismaResident);
      } catch (error) {
        console.error('[HouseholdRepository] findResidentById error:', error);
        return null;
      }
    },

    async getResidentHouseholdId(residentId: string, tenantId: string): Promise<string | null> {
      try {
        const resident = await prismaClient.resident.findFirst({
          where: {
            id: residentId,
            tenantId,
            deletedAt: null,
          },
          select: {
            householdId: true,
          },
        });

        return resident?.householdId ?? null;
      } catch (error) {
        console.error('[HouseholdRepository] getResidentHouseholdId error:', error);
        return null;
      }
    },

    // -------------------------------------------------------------------------
    // Validation Queries
    // -------------------------------------------------------------------------

    async validateTenantOwnership(
      householdId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      try {
        const household = await prismaClient.household.findFirst({
          where: {
            id: householdId,
            tenantId,
          },
        });

        if (!household) {
          return fail(
            authorizationError(
              'HOUSEHOLD_TENANT_MISMATCH',
              `Household ${householdId} does not belong to tenant ${tenantId}`,
            ),
          );
        }

        return ok(true);
      } catch (error) {
        return fail(
          technicalError(
            'HOUSEHOLD_VALIDATION_FAILED',
            'Failed to validate household tenant ownership',
            { cause: error },
          ),
        );
      }
    },

    async validateResidentHouseholdTenant(
      residentId: string,
      householdId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      try {
        // Verify resident exists and belongs to the household and tenant
        const resident = await prismaClient.resident.findFirst({
          where: {
            id: residentId,
            householdId,
            tenantId,
            deletedAt: null,
          },
        });

        if (!resident) {
          return fail(
            authorizationError(
              'RESIDENT_HOUSEHOLD_TENANT_MISMATCH',
              `Resident ${residentId} does not belong to household ${householdId} in tenant ${tenantId}`,
            ),
          );
        }

        // Verify household belongs to tenant
        const household = await prismaClient.household.findFirst({
          where: {
            id: householdId,
            tenantId,
          },
        });

        if (!household) {
          return fail(
            authorizationError(
              'HOUSEHOLD_TENANT_MISMATCH',
              `Household ${householdId} does not belong to tenant ${tenantId}`,
            ),
          );
        }

        return ok(true);
      } catch (error) {
        return fail(
          technicalError(
            'RESIDENT_HOUSEHOLD_VALIDATION_FAILED',
            'Failed to validate resident household tenant ownership',
            { cause: error },
          ),
        );
      }
    },
  };
};
