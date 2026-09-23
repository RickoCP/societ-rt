/**
 * DoorMonitoringRepositoryImpl — Infrastructure implementation of
 * DoorMonitoringRepository using Prisma.
 *
 * Tenant-scoped queries go through createTenantScopedRepository. The
 * `findByDeviceId` lookup is cross-tenant (used by the webhook trigger path),
 * mirroring IoTRepositoryImpl.findByTuyaId.
 */

import type { PrismaClient } from '@/generated/prisma/client';
import { ok, fail, technicalError } from '@core/utils';
import type {
  DoorMonitoringRepository,
  BindDoorSensorData,
  UpdateWindowData,
} from '@core/domains/doorMonitoring/repositories';
import type {
  DoorSensorConfig,
  DoorState,
  DoorInstallationRequest,
  DoorInstallationRequestView,
  DoorInstallationStatus,
  DoorStateMarker,
} from '@core/domains/doorMonitoring/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma row shapes
// ---------------------------------------------------------------------------

interface PrismaDoorSensorConfig {
  id: string;
  tenantId: string;
  householdId: string;
  iotDeviceId: string | null;
  sirenZone: string | null;
  monitorStart: string;
  monitorEnd: string;
  enabled: boolean;
  currentState: string;
  lastStateChange: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PrismaHousehold {
  householdNumber: string;
  address: string;
  block: string | null;
  latitude: number | null;
  longitude: number | null;
}

type PrismaDoorSensorConfigWithHousehold = PrismaDoorSensorConfig & {
  household: PrismaHousehold;
};

interface PrismaDoorInstallationRequest {
  id: string;
  tenantId: string;
  householdId: string;
  requestedBy: string;
  status: string;
  note: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapConfig(p: PrismaDoorSensorConfig): DoorSensorConfig {
  return {
    id: p.id,
    tenantId: p.tenantId,
    householdId: p.householdId,
    iotDeviceId: p.iotDeviceId,
    sirenZone: p.sirenZone,
    monitorStart: p.monitorStart,
    monitorEnd: p.monitorEnd,
    enabled: p.enabled,
    currentState: p.currentState as DoorState,
    lastStateChange: p.lastStateChange,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function mapRequest(
  p: PrismaDoorInstallationRequest,
): DoorInstallationRequest {
  return {
    id: p.id,
    tenantId: p.tenantId,
    householdId: p.householdId,
    requestedBy: p.requestedBy,
    status: p.status as DoorInstallationStatus,
    note: p.note,
    resolvedBy: p.resolvedBy,
    resolvedAt: p.resolvedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

type PrismaDoorInstallationRequestWithHousehold =
  PrismaDoorInstallationRequest & {
    household: {
      householdNumber: string;
      address: string;
      block: string | null;
    };
  };

function mapRequestView(
  p: PrismaDoorInstallationRequestWithHousehold,
): DoorInstallationRequestView {
  return {
    ...mapRequest(p),
    householdNumber: p.household.householdNumber,
    householdAddress: p.household.address,
    householdBlock: p.household.block,
  };
}

function mapMarker(
  p: PrismaDoorSensorConfigWithHousehold,
): DoorStateMarker {
  return {
    householdId: p.householdId,
    householdNumber: p.household.householdNumber,
    address: p.household.address,
    block: p.household.block,
    latitude: p.household.latitude,
    longitude: p.household.longitude,
    currentState: p.currentState as DoorState,
    monitoringEnabled: p.enabled,
    // withinWindow/alerting are recomputed by the use case against `now`.
    withinWindow: false,
    monitorStart: p.monitorStart,
    monitorEnd: p.monitorEnd,
    sirenZone: p.sirenZone,
    lastStateChange: p.lastStateChange,
    alerting: false,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const DoorMonitoringRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): DoorMonitoringRepository => {
  const configRepo: TenantScopedRepository<PrismaDoorSensorConfig> =
    createTenantScopedRepository(
      prismaClient.doorSensorConfig as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  const requestRepo: TenantScopedRepository<PrismaDoorInstallationRequest> =
    createTenantScopedRepository(
      prismaClient.doorInstallationRequest as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // --- DoorSensorConfig --------------------------------------------------

    async ensureConfig(tenantId, householdId) {
      try {
        const existing = await configRepo.findFirst(tenantId, {
          where: { householdId },
        });
        if (existing) {
          return ok(mapConfig(existing));
        }
        const created = await configRepo.create(tenantId, {
          data: { householdId },
        });
        return ok(mapConfig(created));
      } catch (error) {
        return fail(
          technicalError(
            'DOOR_ENSURE_CONFIG_FAILED',
            'Failed to ensure door sensor config',
            { cause: error },
          ),
        );
      }
    },

    async findByHousehold(tenantId, householdId) {
      try {
        const found = await configRepo.findFirst(tenantId, {
          where: { householdId },
        });
        return ok(found ? mapConfig(found) : null);
      } catch (error) {
        return fail(
          technicalError(
            'DOOR_FIND_CONFIG_FAILED',
            'Failed to find door sensor config',
            { cause: error },
          ),
        );
      }
    },

    async findByDeviceId(iotDeviceId) {
      try {
        // Cross-tenant lookup (webhook path) — query directly, no tenant scope.
        const found = (await prismaClient.doorSensorConfig.findUnique({
          where: { iotDeviceId },
        })) as PrismaDoorSensorConfig | null;
        return ok(found ? mapConfig(found) : null);
      } catch (error) {
        return fail(
          technicalError(
            'DOOR_FIND_CONFIG_BY_DEVICE_FAILED',
            'Failed to find door sensor config by device id',
            { cause: error },
          ),
        );
      }
    },

    async bindDevice(tenantId, householdId, data: BindDoorSensorData) {
      try {
        // Upsert-style: ensure a row exists, then set device + zone.
        const existing = await configRepo.findFirst(tenantId, {
          where: { householdId },
        });
        if (!existing) {
          const created = await configRepo.create(tenantId, {
            data: {
              householdId,
              iotDeviceId: data.iotDeviceId,
              sirenZone: data.sirenZone,
            },
          });
          return ok(mapConfig(created));
        }
        const updated = await configRepo.update(tenantId, {
          where: { id: existing.id },
          data: {
            iotDeviceId: data.iotDeviceId,
            sirenZone: data.sirenZone,
          },
        });
        return ok(mapConfig(updated));
      } catch (error) {
        return fail(
          technicalError(
            'DOOR_BIND_DEVICE_FAILED',
            'Failed to bind door sensor device',
            { cause: error },
          ),
        );
      }
    },

    async updateWindow(tenantId, householdId, data: UpdateWindowData) {
      try {
        const existing = await configRepo.findFirst(tenantId, {
          where: { householdId },
        });
        if (!existing) {
          const created = await configRepo.create(tenantId, {
            data: {
              householdId,
              monitorStart: data.monitorStart,
              monitorEnd: data.monitorEnd,
              enabled: data.enabled,
            },
          });
          return ok(mapConfig(created));
        }
        const updated = await configRepo.update(tenantId, {
          where: { id: existing.id },
          data: {
            monitorStart: data.monitorStart,
            monitorEnd: data.monitorEnd,
            enabled: data.enabled,
          },
        });
        return ok(mapConfig(updated));
      } catch (error) {
        return fail(
          technicalError(
            'DOOR_UPDATE_WINDOW_FAILED',
            'Failed to update monitoring window',
            { cause: error },
          ),
        );
      }
    },

    async updateDoorState(tenantId, householdId, state, changedAt) {
      try {
        const existing = await configRepo.findFirst(tenantId, {
          where: { householdId },
        });
        if (!existing) {
          const created = await configRepo.create(tenantId, {
            data: {
              householdId,
              currentState: state,
              lastStateChange: changedAt,
            },
          });
          return ok(mapConfig(created));
        }
        const updated = await configRepo.update(tenantId, {
          where: { id: existing.id },
          data: {
            currentState: state,
            lastStateChange: changedAt,
          },
        });
        return ok(mapConfig(updated));
      } catch (error) {
        return fail(
          technicalError(
            'DOOR_UPDATE_STATE_FAILED',
            'Failed to update door state',
            { cause: error },
          ),
        );
      }
    },

    async listDoorStateMarkers(tenantId) {
      try {
        const rows = (await prismaClient.doorSensorConfig.findMany({
          where: { tenantId },
          include: {
            household: {
              select: {
                householdNumber: true,
                address: true,
                block: true,
                latitude: true,
                longitude: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        })) as unknown as PrismaDoorSensorConfigWithHousehold[];

        return ok(rows.map(mapMarker));
      } catch (error) {
        return fail(
          technicalError(
            'DOOR_LIST_MARKERS_FAILED',
            'Failed to list door state markers',
            { cause: error },
          ),
        );
      }
    },

    // --- DoorInstallationRequest -------------------------------------------

    async createInstallationRequest(tenantId, householdId, requestedBy, note) {
      try {
        const created = await requestRepo.create(tenantId, {
          data: { householdId, requestedBy, note },
        });
        return ok(mapRequest(created));
      } catch (error) {
        return fail(
          technicalError(
            'DOOR_CREATE_REQUEST_FAILED',
            'Failed to create door installation request',
            { cause: error },
          ),
        );
      }
    },

    async findInstallationRequest(tenantId, id) {
      try {
        const found = await requestRepo.findFirst(tenantId, {
          where: { id },
        });
        return ok(found ? mapRequest(found) : null);
      } catch (error) {
        return fail(
          technicalError(
            'DOOR_FIND_REQUEST_FAILED',
            'Failed to find door installation request',
            { cause: error },
          ),
        );
      }
    },

    async listInstallationRequests(tenantId, status?: DoorInstallationStatus) {
      try {
        const rows = (await prismaClient.doorInstallationRequest.findMany({
          where: { tenantId, ...(status ? { status } : {}) },
          include: {
            household: {
              select: {
                householdNumber: true,
                address: true,
                block: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })) as unknown as PrismaDoorInstallationRequestWithHousehold[];

        return ok(rows.map(mapRequestView));
      } catch (error) {
        return fail(
          technicalError(
            'DOOR_LIST_REQUESTS_FAILED',
            'Failed to list door installation requests',
            { cause: error },
          ),
        );
      }
    },

    async resolveInstallationRequest(tenantId, id, status, resolvedBy) {
      try {
        const updated = await requestRepo.update(tenantId, {
          where: { id },
          data: {
            status,
            resolvedBy,
            resolvedAt: new Date(),
          },
        });
        return ok(mapRequest(updated));
      } catch (error) {
        return fail(
          technicalError(
            'DOOR_RESOLVE_REQUEST_FAILED',
            'Failed to resolve door installation request',
            { cause: error },
          ),
        );
      }
    },
  };
};
