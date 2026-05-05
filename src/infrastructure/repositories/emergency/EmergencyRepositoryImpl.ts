/**
 * EmergencyRepositoryImpl — Infrastructure implementation of
 * EmergencyRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on EmergencyAlert model.
 *
 * @see Requirements 10.1, 10.2, 10.3, 10.4
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import { emergencyAlertNotFound } from '@core/domains/emergency/errors/emergencyErrors';
import type { EmergencyRepository } from '@core/domains/emergency/repositories/EmergencyRepository';
import type {
  EmergencyAlert,
  CreateEmergencyAlertInput,
} from '@core/domains/emergency/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mapper
// ---------------------------------------------------------------------------

interface PrismaEmergencyAlert {
  id: string;
  tenantId: string;
  userId: string;
  latitude: number | null;
  longitude: number | null;
  locationUnavailable: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaAlertToDomain(p: PrismaEmergencyAlert): EmergencyAlert {
  return {
    id: p.id,
    tenantId: p.tenantId,
    userId: p.userId,
    latitude: p.latitude,
    longitude: p.longitude,
    locationUnavailable: p.locationUnavailable,
    status: p.status as EmergencyAlert['status'],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const EmergencyRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): EmergencyRepository => {
  const alertRepo: TenantScopedRepository<PrismaEmergencyAlert> =
    createTenantScopedRepository(
      prismaClient.emergencyAlert as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // createAlert
    // -----------------------------------------------------------------------
    async createAlert(
      tenantId: string,
      userId: string,
      data: CreateEmergencyAlertInput,
    ): Promise<DomainResult<EmergencyAlert>> {
      try {
        const hasCoords =
          data.latitude != null && data.longitude != null;

        const alert = await alertRepo.create(tenantId, {
          data: {
            userId,
            latitude: hasCoords ? data.latitude : null,
            longitude: hasCoords ? data.longitude : null,
            locationUnavailable: !hasCoords,
          },
        });

        return ok(mapPrismaAlertToDomain(alert));
      } catch (error) {
        return fail(
          technicalError(
            'EMERGENCY_CREATE_FAILED',
            'Failed to create emergency alert',
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
      alertId: string,
      status: EmergencyAlert['status'],
    ): Promise<DomainResult<EmergencyAlert>> {
      try {
        // Verify the alert exists within the tenant
        const existing = await alertRepo.findFirst(tenantId, {
          where: { id: alertId },
        });

        if (!existing) {
          return fail(emergencyAlertNotFound());
        }

        const updated = await alertRepo.update(tenantId, {
          where: { id: alertId },
          data: { status },
        });

        return ok(mapPrismaAlertToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'EMERGENCY_UPDATE_STATUS_FAILED',
            'Failed to update emergency alert status',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findActiveByTenant
    // -----------------------------------------------------------------------
    async findActiveByTenant(
      tenantId: string,
    ): Promise<DomainResult<EmergencyAlert[]>> {
      try {
        const alerts = await alertRepo.findMany(tenantId, {
          where: { status: { not: 'resolved' } },
          orderBy: { createdAt: 'desc' },
        });

        return ok(alerts.map(mapPrismaAlertToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'EMERGENCY_FIND_ACTIVE_FAILED',
            'Failed to find active emergency alerts',
            { cause: error },
          ),
        );
      }
    },
  };
};
