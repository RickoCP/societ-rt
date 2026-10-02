/**
 * IoTDeviceIsolationRepositoryImpl — Infrastructure implementation of IIoTDeviceIsolationRepository.
 *
 * Uses direct Prisma queries for IoT device isolation queries.
 * All queries enforce tenant-scoped data isolation.
 *
 * CRITICAL SECURITY RULES:
 * - All queries MUST include tenantId for tenant isolation
 * - IoT device data MUST NOT be accessible across tenant boundaries
 *
 * @see Task 60: IoT Device Isolation Enforcement
 * @see INV-IOT-001
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, authorizationError, technicalError } from '@core/utils';
import type {
  IIoTDeviceIsolationRepository,
  IoTDeviceWithContext,
} from '@core/domains/iot/repositories/IIoTDeviceIsolationRepository';
import type { IoTDevice, IoTDeviceOnlineStatus } from '@core/domains/iot/entities';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaIoTDevice {
  id: string;
  tenantId: string;
  householdId: string;
  tuyaDeviceId: string;
  deviceType: string;
  name: string;
  onlineStatus: string;
  batteryLevel: number | null;
  lastSeen: Date;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaDeviceToDomain(p: PrismaIoTDevice): IoTDevice {
  return {
    id: p.id,
    tenantId: p.tenantId,
    householdId: p.householdId,
    tuyaDeviceId: p.tuyaDeviceId,
    deviceType: p.deviceType as IoTDevice['deviceType'],
    name: p.name,
    onlineStatus: p.onlineStatus as IoTDeviceOnlineStatus,
    batteryLevel: p.batteryLevel,
    lastSeen: p.lastSeen,
    metadata: (p.metadata as Record<string, unknown>) ?? {},
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const IoTDeviceIsolationRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): IIoTDeviceIsolationRepository => {
  return {
    // -------------------------------------------------------------------------
    // Device Lookup
    // -------------------------------------------------------------------------

    async findById(deviceId: string, tenantId: string): Promise<IoTDevice | null> {
      try {
        const device = await prismaClient.ioTDevice.findFirst({
          where: {
            id: deviceId,
            tenantId,
          },
        });

        if (!device) {
          return null;
        }

        return mapPrismaDeviceToDomain(device as unknown as PrismaIoTDevice);
      } catch (error) {
        console.error('[IoTDeviceIsolationRepository] findById error:', error);
        return null;
      }
    },

    async exists(deviceId: string, tenantId: string): Promise<boolean> {
      try {
        const count = await prismaClient.ioTDevice.count({
          where: {
            id: deviceId,
            tenantId,
          },
        });

        return count > 0;
      } catch (error) {
        console.error('[IoTDeviceIsolationRepository] exists error:', error);
        return false;
      }
    },

    async findWithContext(
      deviceId: string,
      tenantId: string,
    ): Promise<IoTDeviceWithContext | null> {
      try {
        const device = await prismaClient.ioTDevice.findFirst({
          where: {
            id: deviceId,
            tenantId,
          },
          include: {
            household: true,
          },
        });

        if (!device) {
          return null;
        }

        return {
          device: mapPrismaDeviceToDomain(device as unknown as PrismaIoTDevice),
          householdId: device.householdId,
          orgUnitId: null, // OrgUnit relationship would need to be added if tracked
        };
      } catch (error) {
        console.error('[IoTDeviceIsolationRepository] findWithContext error:', error);
        return null;
      }
    },

    // -------------------------------------------------------------------------
    // Household-Device Queries
    // -------------------------------------------------------------------------

    async findByHousehold(householdId: string, tenantId: string): Promise<IoTDevice[]> {
      try {
        const devices = await prismaClient.ioTDevice.findMany({
          where: {
            householdId,
            tenantId,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        return devices.map((d: PrismaIoTDevice) => mapPrismaDeviceToDomain(d as unknown as PrismaIoTDevice));
      } catch (error) {
        console.error('[IoTDeviceIsolationRepository] findByHousehold error:', error);
        return [];
      }
    },

    async isUserHouseholdMember(
      userId: string,
      deviceId: string,
      tenantId: string,
    ): Promise<boolean> {
      try {
        // First, get the device to find its household
        const device = await prismaClient.ioTDevice.findFirst({
          where: {
            id: deviceId,
            tenantId,
          },
          select: {
            householdId: true,
          },
        });

        if (!device) {
          return false;
        }

        // Check if user is linked to this household via Home model
        const home = await prismaClient.home.findFirst({
          where: {
            householdId: device.householdId,
            tenantId,
            ownerId: userId,
          },
        });

        return home !== null;
      } catch (error) {
        console.error('[IoTDeviceIsolationRepository] isUserHouseholdMember error:', error);
        return false;
      }
    },

    async isUserHouseholdHead(
      userId: string,
      deviceId: string,
      tenantId: string,
    ): Promise<boolean> {
      try {
        // First, get the device to find its household
        const device = await prismaClient.ioTDevice.findFirst({
          where: {
            id: deviceId,
            tenantId,
          },
          select: {
            householdId: true,
          },
        });

        if (!device) {
          return false;
        }

        // Check if user is the owner of this household via Home model
        const home = await prismaClient.home.findFirst({
          where: {
            householdId: device.householdId,
            tenantId,
            ownerId: userId,
          },
        });

        // If home exists and user is the owner, they are the head
        return home !== null;
      } catch (error) {
        console.error('[IoTDeviceIsolationRepository] isUserHouseholdHead error:', error);
        return false;
      }
    },

    async findByUserId(userId: string, tenantId: string): Promise<IoTDevice[]> {
      try {
        // Find households where user is an owner via Home model
        const homes = await prismaClient.home.findMany({
          where: {
            tenantId,
            ownerId: userId,
          },
        });

        if (homes.length === 0) {
          return [];
        }

        // Get the household IDs
        const householdIds = homes.map((h: { householdId: string }) => h.householdId);

        // Fetch devices in those households
        const devices = await prismaClient.ioTDevice.findMany({
          where: {
            householdId: { in: householdIds },
            tenantId,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        return devices.map((d: PrismaIoTDevice) => mapPrismaDeviceToDomain(d as unknown as PrismaIoTDevice));
      } catch (error) {
        console.error('[IoTDeviceIsolationRepository] findByUserId error:', error);
        return [];
      }
    },

    // -------------------------------------------------------------------------
    // OrgUnit Scope Queries
    // -------------------------------------------------------------------------

    async getDeviceOrgUnitId(deviceId: string, tenantId: string): Promise<string | null> {
      try {
        // IoT devices don't have a direct orgUnit link in the current schema
        // This would need to be derived via household → orgUnit if tracked
        // For now, return null
        const device = await prismaClient.ioTDevice.findFirst({
          where: {
            id: deviceId,
            tenantId,
          },
        });

        if (!device) {
          return null;
        }

        // OrgUnit relationship would need to be added to household schema
        return null;
      } catch (error) {
        console.error('[IoTDeviceIsolationRepository] getDeviceOrgUnitId error:', error);
        return null;
      }
    },

    async findByOrgUnit(
      _orgUnitId: string,
      _tenantId: string,
      _includeDescendants?: boolean,
    ): Promise<IoTDevice[]> {
      try {
        // IoT devices don't have a direct orgUnit link in the current schema
        // This would need household → orgUnit relationship to be implemented
        // For now, return empty array
        console.warn(
          '[IoTDeviceIsolationRepository] findByOrgUnit: OrgUnit-Device relationship not implemented',
        );
        return [];
      } catch (error) {
        console.error('[IoTDeviceIsolationRepository] findByOrgUnit error:', error);
        return [];
      }
    },

    // -------------------------------------------------------------------------
    // Validation Queries
    // -------------------------------------------------------------------------

    async validateTenantOwnership(
      deviceId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      try {
        const device = await prismaClient.ioTDevice.findFirst({
          where: {
            id: deviceId,
            tenantId,
          },
        });

        if (!device) {
          return fail(
            authorizationError(
              'IOT_DEVICE_TENANT_MISMATCH',
              `IoT device ${deviceId} does not belong to tenant ${tenantId}`,
            ),
          );
        }

        return ok(true);
      } catch (error) {
        return fail(
          technicalError(
            'IOT_DEVICE_VALIDATION_FAILED',
            'Failed to validate IoT device tenant ownership',
            { cause: error },
          ),
        );
      }
    },

    async validateDeviceHouseholdTenant(
      deviceId: string,
      householdId: string,
      tenantId: string,
    ): Promise<DomainResult<boolean>> {
      try {
        // Verify device exists and belongs to the household and tenant
        const device = await prismaClient.ioTDevice.findFirst({
          where: {
            id: deviceId,
            householdId,
            tenantId,
          },
        });

        if (!device) {
          return fail(
            authorizationError(
              'IOT_DEVICE_HOUSEHOLD_TENANT_MISMATCH',
              `IoT device ${deviceId} does not belong to household ${householdId} in tenant ${tenantId}`,
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
            'IOT_DEVICE_HOUSEHOLD_VALIDATION_FAILED',
            'Failed to validate IoT device household tenant ownership',
            { cause: error },
          ),
        );
      }
    },

    async getDeviceHouseholdId(deviceId: string, tenantId: string): Promise<string | null> {
      try {
        const device = await prismaClient.ioTDevice.findFirst({
          where: {
            id: deviceId,
            tenantId,
          },
          select: {
            householdId: true,
          },
        });

        return device?.householdId ?? null;
      } catch (error) {
        console.error('[IoTDeviceIsolationRepository] getDeviceHouseholdId error:', error);
        return null;
      }
    },
  };
};
