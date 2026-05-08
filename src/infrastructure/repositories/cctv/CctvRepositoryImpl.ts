/**
 * CctvRepositoryImpl — Infrastructure implementation of CctvRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on CctvCamera
 * and CctvSnapshot models. Encrypts RTSP URLs at rest using AES-256.
 *
 * @see Requirements 34.1, 34.3, 34.9
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type {
  CctvRepository,
  CctvSnapshotFilters,
  PaginatedCctvSnapshotResult,
} from '@core/domains/cctv/repositories/CctvRepository';
import type {
  CctvCamera,
  CctvCameraStatus,
  CctvSnapshot,
  CctvSnapshotTriggerType,
  CctvStorageUsage,
  RegisterCctvCameraInput,
} from '@core/domains/cctv/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';
import { encryptAES256, decryptAES256 } from '@infrastructure/iot';

// ---------------------------------------------------------------------------
// Prisma row types
// ---------------------------------------------------------------------------

interface PrismaCctvCamera {
  id: string;
  tenantId: string;
  name: string;
  rtspUrl: string;
  location: string;
  latitude: number;
  longitude: number;
  resolution: string;
  status: string;
  lastOnline: Date;
  createdAt: Date;
}

interface PrismaCctvSnapshot {
  id: string;
  cameraId: string;
  tenantId: string;
  fileUrl: string;
  triggerType: string;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapCameraStatusToDomain(status: string): CctvCameraStatus {
  switch (status) {
    case 'online':
      return 'online';
    case 'offline':
      return 'offline';
    case 'motion_detected':
      return 'motion_detected';
    default:
      return 'offline';
  }
}

function mapSnapshotTriggerToDomain(trigger: string): CctvSnapshotTriggerType {
  switch (trigger) {
    case 'manual':
      return 'manual';
    case 'motion':
      return 'motion';
    case 'scheduled':
      return 'scheduled';
    default:
      return 'manual';
  }
}

function mapPrismaCameraToDomain(
  p: PrismaCctvCamera,
  encryptionKey: string,
): CctvCamera {
  let decryptedUrl: string;
  try {
    decryptedUrl = decryptAES256(p.rtspUrl, encryptionKey);
  } catch {
    // If decryption fails, return the raw value (may be unencrypted in dev)
    decryptedUrl = p.rtspUrl;
  }

  return {
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    rtspUrl: decryptedUrl,
    location: p.location,
    latitude: p.latitude,
    longitude: p.longitude,
    resolution: p.resolution,
    status: mapCameraStatusToDomain(p.status),
    lastOnline: p.lastOnline,
    createdAt: p.createdAt,
  };
}

function mapPrismaSnapshotToDomain(p: PrismaCctvSnapshot): CctvSnapshot {
  return {
    id: p.id,
    cameraId: p.cameraId,
    tenantId: p.tenantId,
    fileUrl: p.fileUrl,
    triggerType: mapSnapshotTriggerToDomain(p.triggerType),
    timestamp: p.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Encryption key resolution
// ---------------------------------------------------------------------------

function getEncryptionKey(): string {
  return process.env.CCTV_ENCRYPTION_KEY ?? process.env.TUYA_ENCRYPTION_KEY ?? 'default-dev-key';
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const CctvRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): CctvRepository => {
  const cameraRepo: TenantScopedRepository<PrismaCctvCamera> =
    createTenantScopedRepository(
      prismaClient.cctvCamera as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  const snapshotRepo: TenantScopedRepository<PrismaCctvSnapshot> =
    createTenantScopedRepository(
      prismaClient.cctvSnapshot as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  const encryptionKey = getEncryptionKey();

  return {
    // -----------------------------------------------------------------------
    // registerCamera
    // -----------------------------------------------------------------------
    async registerCamera(
      tenantId: string,
      data: RegisterCctvCameraInput,
    ): Promise<DomainResult<CctvCamera>> {
      try {
        // Encrypt RTSP URL before storing
        const encryptedRtspUrl = encryptAES256(data.rtspUrl, encryptionKey);

        const camera = await cameraRepo.create(tenantId, {
          data: {
            name: data.name,
            rtspUrl: encryptedRtspUrl,
            location: data.location,
            latitude: data.latitude,
            longitude: data.longitude,
            resolution: data.resolution,
            status: 'online',
            lastOnline: new Date(),
          },
        });

        return ok(mapPrismaCameraToDomain(camera, encryptionKey));
      } catch (error) {
        return fail(
          technicalError(
            'CCTV_REGISTER_FAILED',
            'Failed to register CCTV camera',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByTenant
    // -----------------------------------------------------------------------
    async findByTenant(tenantId: string): Promise<DomainResult<CctvCamera[]>> {
      try {
        const cameras = await cameraRepo.findMany(tenantId, {
          orderBy: { createdAt: 'desc' },
        });

        return ok(cameras.map(c => mapPrismaCameraToDomain(c, encryptionKey)));
      } catch (error) {
        return fail(
          technicalError(
            'CCTV_FIND_BY_TENANT_FAILED',
            'Failed to find cameras for tenant',
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
      cameraId: string,
      status: CctvCameraStatus,
    ): Promise<DomainResult<CctvCamera>> {
      try {
        const existing = await cameraRepo.findFirst(tenantId, {
          where: { id: cameraId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'CCTV_CAMERA_NOT_FOUND',
              `Camera ${cameraId} not found`,
            ),
          );
        }

        const updateData: Record<string, unknown> = { status };
        if (status === 'online' || status === 'motion_detected') {
          updateData.lastOnline = new Date();
        }

        const updated = await cameraRepo.update(tenantId, {
          where: { id: cameraId },
          data: updateData,
        });

        return ok(mapPrismaCameraToDomain(updated, encryptionKey));
      } catch (error) {
        return fail(
          technicalError(
            'CCTV_UPDATE_STATUS_FAILED',
            'Failed to update camera status',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // captureSnapshot
    // -----------------------------------------------------------------------
    async captureSnapshot(
      tenantId: string,
      cameraId: string,
      fileUrl: string,
      triggerType: CctvSnapshotTriggerType,
    ): Promise<DomainResult<CctvSnapshot>> {
      try {
        // Verify camera belongs to tenant
        const existing = await cameraRepo.findFirst(tenantId, {
          where: { id: cameraId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'CCTV_CAMERA_NOT_FOUND',
              `Camera ${cameraId} not found`,
            ),
          );
        }

        const snapshot = await snapshotRepo.create(tenantId, {
          data: {
            cameraId,
            fileUrl,
            triggerType,
            timestamp: new Date(),
          },
        });

        return ok(mapPrismaSnapshotToDomain(snapshot));
      } catch (error) {
        return fail(
          technicalError(
            'CCTV_CAPTURE_SNAPSHOT_FAILED',
            'Failed to capture snapshot',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findSnapshotsByCamera
    // -----------------------------------------------------------------------
    async findSnapshotsByCamera(
      tenantId: string,
      cameraId: string,
      page: number,
      pageSize: number,
      filters?: CctvSnapshotFilters,
    ): Promise<DomainResult<PaginatedCctvSnapshotResult>> {
      try {
        const where: Record<string, unknown> = { cameraId };

        if (filters?.triggerType) {
          where.triggerType = filters.triggerType;
        }

        if (filters?.from || filters?.to) {
          const timestampFilter: Record<string, Date> = {};
          if (filters.from) {
            timestampFilter.gte = filters.from;
          }
          if (filters.to) {
            timestampFilter.lte = filters.to;
          }
          where.timestamp = timestampFilter;
        }

        const [snapshots, total] = await Promise.all([
          snapshotRepo.findMany(tenantId, {
            where,
            orderBy: { timestamp: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          snapshotRepo.count(tenantId, { where }),
        ]);

        return ok({
          data: snapshots.map(mapPrismaSnapshotToDomain),
          total,
          page,
          pageSize,
        });
      } catch (error) {
        return fail(
          technicalError(
            'CCTV_FIND_SNAPSHOTS_FAILED',
            'Failed to find snapshots',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getStorageUsage
    // -----------------------------------------------------------------------
    async getStorageUsage(
      tenantId: string,
      cameraId: string,
    ): Promise<DomainResult<CctvStorageUsage>> {
      try {
        // Verify camera belongs to tenant
        const existing = await cameraRepo.findFirst(tenantId, {
          where: { id: cameraId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'CCTV_CAMERA_NOT_FOUND',
              `Camera ${cameraId} not found`,
            ),
          );
        }

        const totalSnapshots = await snapshotRepo.count(tenantId, {
          where: { cameraId },
        });

        // Estimate storage: average snapshot ~500KB
        const estimatedSizeBytes = totalSnapshots * 512000;

        return ok({
          cameraId,
          tenantId,
          totalSnapshots,
          totalSizeBytes: estimatedSizeBytes,
        });
      } catch (error) {
        return fail(
          technicalError(
            'CCTV_STORAGE_USAGE_FAILED',
            'Failed to get storage usage',
            { cause: error },
          ),
        );
      }
    },
  };
};
