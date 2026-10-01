/**
 * VisitorRepositoryImpl — Infrastructure implementation of VisitorRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on VisitorLog
 * and PackageLog models.
 *
 * @see Requirements 15.1, 15.2, 15.3, 15.4
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type { VisitorRepository } from '@core/domains/visitor/repositories/VisitorRepository';
import type {
  VisitorLog,
  LogVisitorInput,
  PackageLog,
  LogPackageInput,
} from '@core/domains/visitor/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaVisitorLog {
  id: string;
  tenantId: string;
  visitorName: string;
  purpose: string;
  destinationHouseholdId: string;
  entryTimestamp: Date;
  exitTimestamp: Date | null;
  loggedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaVisitorLogToDomain(p: PrismaVisitorLog): VisitorLog {
  return {
    id: p.id,
    tenantId: p.tenantId,
    visitorName: p.visitorName,
    purpose: p.purpose,
    destinationHouseholdId: p.destinationHouseholdId,
    entryTimestamp: p.entryTimestamp,
    exitTimestamp: p.exitTimestamp,
    loggedBy: p.loggedBy,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

interface PrismaPackageLog {
  id: string;
  tenantId: string;
  recipientHouseholdId: string;
  courierName: string;
  description: string;
  arrivalTimestamp: Date;
  loggedBy: string;
  createdAt: Date;
}

function mapPrismaPackageLogToDomain(p: PrismaPackageLog): PackageLog {
  return {
    id: p.id,
    tenantId: p.tenantId,
    recipientHouseholdId: p.recipientHouseholdId,
    courierName: p.courierName,
    description: p.description,
    arrivalTimestamp: p.arrivalTimestamp,
    loggedBy: p.loggedBy,
    createdAt: p.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const VisitorRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): VisitorRepository => {
  const visitorLogRepo: TenantScopedRepository<PrismaVisitorLog> =
    createTenantScopedRepository(
      prismaClient.visitorLog as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  const _packageLogRepo: TenantScopedRepository<PrismaPackageLog> =
    createTenantScopedRepository(
      prismaClient.packageLog as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // logVisitor
    // -----------------------------------------------------------------------
    async logVisitor(
      tenantId: string,
      data: LogVisitorInput,
      loggedBy: string,
    ): Promise<DomainResult<VisitorLog>> {
      try {
        const visitorLog = await visitorLogRepo.create(tenantId, {
          data: {
            visitorName: data.visitorName,
            purpose: data.purpose,
            destinationHouseholdId: data.destinationHouseholdId,
            loggedBy,
          },
        });

        return ok(mapPrismaVisitorLogToDomain(visitorLog));
      } catch (error) {
        return fail(
          technicalError(
            'VISITOR_LOG_CREATE_FAILED',
            'Failed to log visitor entry',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // logPackage
    // -----------------------------------------------------------------------
    async logPackage(
      tenantId: string,
      data: LogPackageInput,
      loggedBy: string,
    ): Promise<DomainResult<PackageLog>> {
      try {
        const packageLog = await _packageLogRepo.create(tenantId, {
          data: {
            recipientHouseholdId: data.recipientHouseholdId,
            courierName: data.courierName,
            description: data.description,
            loggedBy,
          },
        });

        return ok(mapPrismaPackageLogToDomain(packageLog));
      } catch (error) {
        return fail(
          technicalError(
            'PACKAGE_LOG_CREATE_FAILED',
            'Failed to log package delivery',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // recordVisitorExit
    // -----------------------------------------------------------------------
    async recordVisitorExit(
      tenantId: string,
      visitorLogId: string,
    ): Promise<DomainResult<VisitorLog>> {
      try {
        const updated = await visitorLogRepo.update(tenantId, {
          where: { id: visitorLogId },
          data: { exitTimestamp: new Date() },
        });

        return ok(mapPrismaVisitorLogToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'VISITOR_EXIT_RECORD_FAILED',
            'Failed to record visitor exit',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByTenant
    // -----------------------------------------------------------------------
    async findByTenant(
      tenantId: string,
    ): Promise<DomainResult<VisitorLog[]>> {
      try {
        const logs = await visitorLogRepo.findMany(tenantId, {
          orderBy: { createdAt: 'desc' },
        });

        return ok(logs.map(mapPrismaVisitorLogToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'VISITOR_FIND_BY_TENANT_FAILED',
            'Failed to find visitor logs for tenant',
            { cause: error },
          ),
        );
      }
    },
  };
};
