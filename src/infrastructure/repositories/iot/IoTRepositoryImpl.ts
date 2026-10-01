/**
 * IoTRepositoryImpl — Infrastructure implementation of IoTRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on IoTDevice model.
 * The `findByTuyaId` method is a cross-tenant lookup (used by webhook processing)
 * and queries directly via Prisma without tenant scoping.
 *
 * @see Requirements 37.1, 37.4, 38.4, 38.8
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type { IoTRepository } from '@core/domains/iot/repositories/IoTRepository';
import type {
  IoTDevice,
  IoTDeviceOnlineStatus,
  RegisterIoTDeviceInput,
  DeviceEvent,
  CreateDeviceEventInput,
} from '@core/domains/iot/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

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

interface PrismaDeviceEvent {
  id: string;
  deviceId: string;
  tenantId: string;
  eventType: string;
  payload: unknown;
  isSharedSecurity: boolean;
  processedAt: Date | null;
  createdAt: Date;
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

function mapPrismaEventToDomain(p: PrismaDeviceEvent): DeviceEvent {
  return {
    id: p.id,
    deviceId: p.deviceId,
    tenantId: p.tenantId,
    eventType: p.eventType as DeviceEvent['eventType'],
    payload: (p.payload as Record<string, unknown>) ?? {},
    isSharedSecurity: p.isSharedSecurity,
    processedAt: p.processedAt,
    createdAt: p.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const IoTRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): IoTRepository => {
  const deviceRepo: TenantScopedRepository<PrismaIoTDevice> =
    createTenantScopedRepository(
      prismaClient.ioTDevice as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  const eventRepo: TenantScopedRepository<PrismaDeviceEvent> =
    createTenantScopedRepository(
      prismaClient.deviceEvent as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // registerDevice
    // -----------------------------------------------------------------------
    async registerDevice(
      tenantId: string,
      data: RegisterIoTDeviceInput,
    ): Promise<DomainResult<IoTDevice>> {
      try {
        const device = await deviceRepo.create(tenantId, {
          data: {
            householdId: data.householdId,
            tuyaDeviceId: data.tuyaDeviceId,
            deviceType: data.deviceType,
            name: data.name,
            metadata: data.metadata ?? {},
          },
        });

        return ok(mapPrismaDeviceToDomain(device));
      } catch (error) {
        return fail(
          technicalError(
            'IOT_REGISTER_DEVICE_FAILED',
            'Failed to register IoT device',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByHousehold
    // -----------------------------------------------------------------------
    async findByHousehold(
      tenantId: string,
      householdId: string,
    ): Promise<DomainResult<IoTDevice[]>> {
      try {
        const devices = await deviceRepo.findMany(tenantId, {
          where: { householdId },
          orderBy: { createdAt: 'desc' },
        });

        return ok(devices.map(mapPrismaDeviceToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'IOT_FIND_DEVICES_FAILED',
            'Failed to find IoT devices for household',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByTuyaId (cross-tenant lookup for webhook processing)
    // -----------------------------------------------------------------------
    async findByTuyaId(
      tuyaDeviceId: string,
    ): Promise<DomainResult<IoTDevice | null>> {
      try {
        const device = await prismaClient.ioTDevice.findUnique({
          where: { tuyaDeviceId },
        });

        if (!device) {
          return ok(null);
        }

        return ok(
          mapPrismaDeviceToDomain(device as unknown as PrismaIoTDevice),
        );
      } catch (error) {
        return fail(
          technicalError(
            'IOT_FIND_BY_TUYA_ID_FAILED',
            'Failed to find device by Tuya ID',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // updateStatus
    // -----------------------------------------------------------------------
    async updateStatus(
      tenantId: string,
      deviceId: string,
      status: IoTDeviceOnlineStatus,
      batteryLevel: number | null,
      lastSeen: Date,
    ): Promise<DomainResult<IoTDevice>> {
      try {
        const existing = await deviceRepo.findFirst(tenantId, {
          where: { id: deviceId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'IOT_DEVICE_NOT_FOUND',
              `IoT device ${deviceId} not found`,
            ),
          );
        }

        const updated = await deviceRepo.update(tenantId, {
          where: { id: deviceId },
          data: {
            onlineStatus: status,
            batteryLevel,
            lastSeen,
          },
        });

        return ok(mapPrismaDeviceToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'IOT_UPDATE_STATUS_FAILED',
            'Failed to update device status',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // removeDevice
    // -----------------------------------------------------------------------
    async removeDevice(
      tenantId: string,
      deviceId: string,
    ): Promise<DomainResult<void>> {
      try {
        const existing = await deviceRepo.findFirst(tenantId, {
          where: { id: deviceId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'IOT_DEVICE_NOT_FOUND',
              `IoT device ${deviceId} not found`,
            ),
          );
        }

        await deviceRepo.delete(tenantId, {
          where: { id: deviceId },
        });

        return ok(undefined);
      } catch (error) {
        return fail(
          technicalError(
            'IOT_REMOVE_DEVICE_FAILED',
            'Failed to remove IoT device',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // createDeviceEvent
    // -----------------------------------------------------------------------
    async createDeviceEvent(
      tenantId: string,
      data: CreateDeviceEventInput,
    ): Promise<DomainResult<DeviceEvent>> {
      try {
        const event = await eventRepo.create(tenantId, {
          data: {
            deviceId: data.deviceId,
            eventType: data.eventType,
            payload: data.payload,
            isSharedSecurity: data.isSharedSecurity,
          },
        });

        return ok(mapPrismaEventToDomain(event));
      } catch (error) {
        return fail(
          technicalError(
            'IOT_CREATE_EVENT_FAILED',
            'Failed to create device event',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findEventsByDevice
    // -----------------------------------------------------------------------
    async findEventsByDevice(
      tenantId: string,
      deviceId: string,
      limit?: number,
    ): Promise<DomainResult<DeviceEvent[]>> {
      try {
        const events = await eventRepo.findMany(tenantId, {
          where: { deviceId },
          orderBy: { createdAt: 'desc' },
          take: limit ?? 50,
        });

        return ok(events.map(mapPrismaEventToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'IOT_FIND_EVENTS_FAILED',
            'Failed to find device events',
            { cause: error },
          ),
        );
      }
    },
  };
};
