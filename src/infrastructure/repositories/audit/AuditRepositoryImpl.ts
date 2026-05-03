/**
 * AuditRepositoryImpl — Infrastructure implementation of AuditRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on AuditLog model.
 * Append-only: only create and findByTenant are implemented.
 * No update or delete methods — audit logs are immutable.
 *
 * @see Requirements 18.2, 18.5, 18.6
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type {
  AuditRepository,
  AuditLogFilters,
} from '@core/domains/audit/repositories/AuditRepository';
import type { AuditLog, CreateAuditLogInput } from '@core/domains/audit/entities';
import type { PaginatedResult } from '@core/domains/resident/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mapper
// ---------------------------------------------------------------------------

interface PrismaAuditLog {
  id: string;
  tenantId: string;
  actorUserId: string;
  actionType: string;
  resourceType: string;
  resourceId: string;
  details: unknown;
  ipAddress: string | null;
  impersonatorId: string | null;
  timestamp: Date;
}

function mapPrismaAuditLogToDomain(p: PrismaAuditLog): AuditLog {
  return {
    id: p.id,
    tenantId: p.tenantId,
    actorUserId: p.actorUserId,
    actionType: p.actionType,
    resourceType: p.resourceType,
    resourceId: p.resourceId,
    details: (p.details as Record<string, unknown>) ?? {},
    ipAddress: p.ipAddress,
    impersonatorId: p.impersonatorId,
    timestamp: p.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const AuditRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): AuditRepository => {
  const auditRepo: TenantScopedRepository<PrismaAuditLog> =
    createTenantScopedRepository(
      prismaClient.auditLog as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // create (append-only)
    // -----------------------------------------------------------------------
    async create(
      tenantId: string,
      data: CreateAuditLogInput,
    ): Promise<DomainResult<AuditLog>> {
      try {
        const auditLog = await auditRepo.create(tenantId, {
          data: {
            actorUserId: data.actorUserId,
            actionType: data.actionType,
            resourceType: data.resourceType,
            resourceId: data.resourceId,
            details: data.details,
            ipAddress: data.ipAddress ?? null,
            impersonatorId: data.impersonatorId ?? null,
          },
        });

        return ok(mapPrismaAuditLogToDomain(auditLog));
      } catch (error) {
        return fail(
          technicalError(
            'AUDIT_LOG_CREATE_FAILED',
            'Failed to create audit log entry',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByTenant (paginated, filterable)
    // -----------------------------------------------------------------------
    async findByTenant(
      tenantId: string,
      filters: AuditLogFilters,
    ): Promise<DomainResult<PaginatedResult<AuditLog>>> {
      try {
        const page = filters.page ?? 1;
        const pageSize = filters.pageSize ?? 20;
        const skip = (page - 1) * pageSize;

        const where: Record<string, unknown> = {};

        if (filters.actionType) {
          where.actionType = filters.actionType;
        }

        if (filters.startDate || filters.endDate) {
          const timestampFilter: Record<string, Date> = {};
          if (filters.startDate) {
            timestampFilter.gte = filters.startDate;
          }
          if (filters.endDate) {
            timestampFilter.lte = filters.endDate;
          }
          where.timestamp = timestampFilter;
        }

        const [auditLogs, total] = await Promise.all([
          auditRepo.findMany(tenantId, {
            where,
            orderBy: { timestamp: 'desc' },
            skip,
            take: pageSize,
          }),
          auditRepo.count(tenantId, { where }),
        ]);

        return ok({
          data: auditLogs.map(mapPrismaAuditLogToDomain),
          total,
          page,
          pageSize,
        });
      } catch (error) {
        return fail(
          technicalError(
            'AUDIT_LOG_FIND_BY_TENANT_FAILED',
            'Failed to find audit logs for tenant',
            { cause: error },
          ),
        );
      }
    },
  };
};
