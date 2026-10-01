/**
 * AlarmRepositoryImpl — Infrastructure implementation of AlarmRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on AlarmDevice
 * and AlarmEvent models. Handles device registration, siren activation/
 * deactivation, event recording, and schedule retrieval.
 *
 * @see Requirements 36.1, 36.2, 36.4, 36.5, 36.6, 36.9
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type {
  AlarmRepository,
  AlarmSchedule,
} from '@core/domains/alarm/repositories/AlarmRepository';
import type {
  AlarmDevice,
  AlarmDeviceStatus,
  AlarmEvent,
  AlarmTriggerSource,
  RegisterAlarmDeviceInput,
  CreateAlarmEventInput,
} from '@core/domains/alarm/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaAlarmDevice {
  id: string;
  tenantId: string;
  name: string;
  location: string;
  deviceId: string;
  zones: string[];
  scheduleArm: string | null;
  scheduleDisarm: string | null;
  status: string;
  createdAt: Date;
}

interface PrismaAlarmEvent {
  id: string;
  alarmDeviceId: string;
  tenantId: string;
  triggerSource: string;
  triggerType: string;
  duration: number;
  activatedAt: Date;
  deactivatedAt: Date | null;
}

function mapPrismaDeviceStatusToDomain(status: string): AlarmDeviceStatus {
  switch (status) {
    case 'armed':
      return 'armed';
    case 'disarmed':
      return 'disarmed';
    case 'triggered':
      return 'triggered';
    case 'offline':
      return 'offline';
    default:
      return 'disarmed';
  }
}

function mapPrismaTriggerSourceToDomain(source: string): AlarmTriggerSource {
  switch (source) {
    case 'manual':
      return 'manual';
    case 'automation':
      return 'automation';
    case 'schedule':
      return 'schedule';
    default:
      return 'manual';
  }
}

function mapPrismaAlarmDeviceToDomain(p: PrismaAlarmDevice): AlarmDevice {
  return {
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    location: p.location,
    deviceId: p.deviceId,
    zones: p.zones,
    scheduleArm: p.scheduleArm,
    scheduleDisarm: p.scheduleDisarm,
    status: mapPrismaDeviceStatusToDomain(p.status),
    createdAt: p.createdAt,
  };
}

function mapPrismaAlarmEventToDomain(p: PrismaAlarmEvent): AlarmEvent {
  return {
    id: p.id,
    alarmDeviceId: p.alarmDeviceId,
    tenantId: p.tenantId,
    triggerSource: mapPrismaTriggerSourceToDomain(p.triggerSource),
    triggerType: p.triggerType,
    duration: p.duration,
    activatedAt: p.activatedAt,
    deactivatedAt: p.deactivatedAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const AlarmRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): AlarmRepository => {
  const deviceRepo: TenantScopedRepository<PrismaAlarmDevice> =
    createTenantScopedRepository(
      prismaClient.alarmDevice as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  const eventRepo: TenantScopedRepository<PrismaAlarmEvent> =
    createTenantScopedRepository(
      prismaClient.alarmEvent as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // registerDevice
    // -----------------------------------------------------------------------
    async registerDevice(
      tenantId: string,
      data: RegisterAlarmDeviceInput,
    ): Promise<DomainResult<AlarmDevice>> {
      try {
        const device = await deviceRepo.create(tenantId, {
          data: {
            name: data.name,
            location: data.location,
            deviceId: data.deviceId,
            zones: data.zones,
            scheduleArm: data.scheduleArm ?? null,
            scheduleDisarm: data.scheduleDisarm ?? null,
            status: 'disarmed',
          },
        });

        return ok(mapPrismaAlarmDeviceToDomain(device));
      } catch (error) {
        return fail(
          technicalError(
            'ALARM_REGISTER_DEVICE_FAILED',
            'Failed to register alarm device',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByTenant
    // -----------------------------------------------------------------------
    async findByTenant(tenantId: string): Promise<DomainResult<AlarmDevice[]>> {
      try {
        const devices = await deviceRepo.findMany(tenantId, {
          orderBy: { createdAt: 'desc' },
        });

        return ok(devices.map(mapPrismaAlarmDeviceToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'ALARM_FIND_BY_TENANT_FAILED',
            'Failed to find alarm devices for tenant',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByZone
    // -----------------------------------------------------------------------
    async findByZone(
      tenantId: string,
      zone: string,
    ): Promise<DomainResult<AlarmDevice[]>> {
      try {
        const devices = await deviceRepo.findMany(tenantId, {
          where: { zones: { has: zone } },
        });

        return ok(devices.map(mapPrismaAlarmDeviceToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'ALARM_FIND_BY_ZONE_FAILED',
            'Failed to find alarm devices by zone',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // activateSiren
    // -----------------------------------------------------------------------
    async activateSiren(
      tenantId: string,
      deviceId: string,
    ): Promise<DomainResult<AlarmDevice>> {
      try {
        const existing = await deviceRepo.findFirst(tenantId, {
          where: { deviceId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'ALARM_DEVICE_NOT_FOUND',
              `Alarm device ${deviceId} not found`,
            ),
          );
        }

        const updated = await deviceRepo.update(tenantId, {
          where: { id: existing.id },
          data: { status: 'triggered' },
        });

        return ok(mapPrismaAlarmDeviceToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'ALARM_ACTIVATE_SIREN_FAILED',
            'Failed to activate siren',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // deactivateSiren
    // -----------------------------------------------------------------------
    async deactivateSiren(
      tenantId: string,
      deviceId: string,
    ): Promise<DomainResult<AlarmDevice>> {
      try {
        const existing = await deviceRepo.findFirst(tenantId, {
          where: { deviceId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'ALARM_DEVICE_NOT_FOUND',
              `Alarm device ${deviceId} not found`,
            ),
          );
        }

        const updated = await deviceRepo.update(tenantId, {
          where: { id: existing.id },
          data: { status: 'armed' },
        });

        return ok(mapPrismaAlarmDeviceToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'ALARM_DEACTIVATE_SIREN_FAILED',
            'Failed to deactivate siren',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // createEvent
    // -----------------------------------------------------------------------
    async createEvent(
      tenantId: string,
      data: CreateAlarmEventInput,
    ): Promise<DomainResult<AlarmEvent>> {
      try {
        const event = await eventRepo.create(tenantId, {
          data: {
            alarmDeviceId: data.alarmDeviceId,
            triggerSource: data.triggerSource,
            triggerType: data.triggerType,
            duration: data.duration,
            activatedAt: new Date(),
          },
        });

        return ok(mapPrismaAlarmEventToDomain(event));
      } catch (error) {
        return fail(
          technicalError(
            'ALARM_CREATE_EVENT_FAILED',
            'Failed to create alarm event',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getSchedule
    // -----------------------------------------------------------------------
    async getSchedule(
      tenantId: string,
    ): Promise<DomainResult<AlarmSchedule[]>> {
      try {
        const devices = await deviceRepo.findMany(tenantId, {
          orderBy: { createdAt: 'asc' },
        });

        const schedules: AlarmSchedule[] = devices.map((d) => ({
          deviceId: d.deviceId,
          deviceName: d.name,
          scheduleArm: d.scheduleArm,
          scheduleDisarm: d.scheduleDisarm,
        }));

        return ok(schedules);
      } catch (error) {
        return fail(
          technicalError(
            'ALARM_GET_SCHEDULE_FAILED',
            'Failed to get alarm schedules',
            { cause: error },
          ),
        );
      }
    },
  };
};
