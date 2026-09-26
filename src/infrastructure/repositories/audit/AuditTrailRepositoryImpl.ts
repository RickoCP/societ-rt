/**
 * AuditTrailRepositoryImpl — Infrastructure implementation of IAuditTrailRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on AuditLog model.
 * IMPORTANT: This is an APPEND-ONLY repository. No update or delete operations.
 * Audit logs are immutable after creation.
 *
 * @see Task 62: Audit Trail Implementation
 * @see Requirements 30, 55, 70 — Security Event Logging
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type {
  IAuditTrailRepository,
  AuditEvent,
  CreateAuditEventInput,
  AuditEventFilters,
  AuditPaginationOptions,
  AuditEventPage,
  AuditEventType,
} from '@core/domains/audit/services';
import { v4 as uuidv4 } from 'uuid';

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

function mapPrismaToAuditEvent(p: PrismaAuditLog): AuditEvent {
  const details = (p.details as Record<string, unknown>) ?? {};
  
  return {
    id: p.id,
    timestamp: p.timestamp,
    userId: p.actorUserId === 'SYSTEM' ? null : p.actorUserId,
    tenantId: p.tenantId,
    eventType: p.actionType as AuditEventType,
    resourceId: p.resourceId || null,
    resourceType: p.resourceType || null,
    details: {
      ...details,
      // Remove internal fields from details
      userAgent: undefined,
      correlationId: undefined,
      orgUnitId: undefined,
      success: undefined,
      errorCode: undefined,
    },
    ipAddress: p.ipAddress,
    userAgent: (details.userAgent as string) ?? null,
    correlationId: (details.correlationId as string) ?? null,
    impersonatorId: p.impersonatorId,
    orgUnitId: (details.orgUnitId as string) ?? null,
    success: (details.success as boolean) ?? true,
    errorCode: (details.errorCode as string) ?? null,
  };
}

function mapAuditEventToPrismaInput(event: CreateAuditEventInput): {
  id: string;
  actorUserId: string;
  actionType: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress: string | null;
  impersonatorId: string | null;
  timestamp: Date;
} {
  return {
    id: uuidv4(),
    actorUserId: event.userId ?? 'SYSTEM',
    actionType: String(event.eventType),
    resourceType: event.resourceType ?? '',
    resourceId: event.resourceId ?? '',
    details: {
      ...(event.details ?? {}),
      userAgent: event.userAgent,
      correlationId: event.correlationId,
      orgUnitId: event.orgUnitId,
      success: event.success ?? true,
      errorCode: event.errorCode,
    },
    ipAddress: event.ipAddress ?? null,
    impersonatorId: event.impersonatorId ?? null,
    timestamp: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const AuditTrailRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): IAuditTrailRepository => {
  // ---------------------------------------------------------------------------
  // Helper: Build where clause from filters
  // ---------------------------------------------------------------------------
  
  const buildWhereClause = (
    tenantId: string,
    filters?: AuditEventFilters,
  ): Record<string, unknown> => {
    const where: Record<string, unknown> = {
      tenantId, // Always enforce tenant scope
    };

    if (!filters) return where;

    // Event type filter
    if (filters.eventType) {
      if (Array.isArray(filters.eventType)) {
        where.actionType = { in: filters.eventType.map(String) };
      } else {
        where.actionType = String(filters.eventType);
      }
    }

    // User ID filter
    if (filters.userId) {
      where.actorUserId = filters.userId;
    }

    // Resource ID filter
    if (filters.resourceId) {
      where.resourceId = filters.resourceId;
    }

    // Resource type filter
    if (filters.resourceType) {
      where.resourceType = filters.resourceType;
    }

    // Date range filter
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

    // Success filter - requires checking details JSON
    // Note: This requires the details field to contain success value
    // For now, we can't directly filter on JSON fields in a portable way
    // This would need to be handled at the application level or via raw SQL

    // Correlation ID filter - requires checking details JSON
    // Same limitation as success filter

    // OrgUnit ID filter - requires checking details JSON
    // Same limitation

    return where;
  };

  // ---------------------------------------------------------------------------
  // Repository Implementation
  // ---------------------------------------------------------------------------

  return {
    async create(event: CreateAuditEventInput): Promise<DomainResult<AuditEvent>> {
      try {
        const prismaInput = mapAuditEventToPrismaInput(event);

        const created = await prismaClient.auditLog.create({
          data: {
            id: prismaInput.id,
            tenantId: event.tenantId,
            actorUserId: prismaInput.actorUserId,
            actionType: prismaInput.actionType,
            resourceType: prismaInput.resourceType,
            resourceId: prismaInput.resourceId,
            details: prismaInput.details,
            ipAddress: prismaInput.ipAddress,
            impersonatorId: prismaInput.impersonatorId,
            timestamp: prismaInput.timestamp,
          },
        });

        return ok(mapPrismaToAuditEvent(created as PrismaAuditLog));
      } catch (error) {
        console.error('[AuditTrailRepository] Create failed:', error);
        return fail(
          technicalError(
            'AUDIT_EVENT_CREATE_FAILED',
            'Failed to create audit event',
          ),
        );
      }
    },

    async findByTenant(
      tenantId: string,
      filters?: AuditEventFilters,
      pagination?: AuditPaginationOptions,
    ): Promise<DomainResult<AuditEventPage>> {
      try {
        const page = pagination?.page ?? 1;
        const pageSize = pagination?.pageSize ?? 50;
        const skip = (page - 1) * pageSize;

        const where = buildWhereClause(tenantId, filters);

        const [events, total] = await Promise.all([
          prismaClient.auditLog.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            skip,
            take: pageSize,
          }),
          prismaClient.auditLog.count({ where }),
        ]);

        return ok({
          events: (events as PrismaAuditLog[]).map(mapPrismaToAuditEvent),
          total,
          page,
          pageSize,
          hasMore: skip + events.length < total,
        });
      } catch (error) {
        console.error('[AuditTrailRepository] FindByTenant failed:', error);
        return fail(
          technicalError(
            'AUDIT_EVENT_QUERY_FAILED',
            'Failed to query audit events',
          ),
        );
      }
    },

    async findById(
      tenantId: string,
      eventId: string,
    ): Promise<DomainResult<AuditEvent | null>> {
      try {
        const event = await prismaClient.auditLog.findFirst({
          where: {
            id: eventId,
            tenantId, // Enforce tenant scope
          },
        });

        if (!event) {
          return ok(null);
        }

        return ok(mapPrismaToAuditEvent(event as PrismaAuditLog));
      } catch (error) {
        console.error('[AuditTrailRepository] FindById failed:', error);
        return fail(
          technicalError(
            'AUDIT_EVENT_FIND_FAILED',
            'Failed to find audit event',
          ),
        );
      }
    },

    async countByTenant(
      tenantId: string,
      filters?: AuditEventFilters,
    ): Promise<DomainResult<number>> {
      try {
        const where = buildWhereClause(tenantId, filters);

        const count = await prismaClient.auditLog.count({ where });

        return ok(count);
      } catch (error) {
        console.error('[AuditTrailRepository] CountByTenant failed:', error);
        return fail(
          technicalError(
            'AUDIT_EVENT_COUNT_FAILED',
            'Failed to count audit events',
          ),
        );
      }
    },

    async findByUser(
      tenantId: string,
      userId: string,
      pagination?: AuditPaginationOptions,
    ): Promise<DomainResult<AuditEventPage>> {
      return this.findByTenant(
        tenantId,
        { userId },
        pagination,
      );
    },

    async findByResource(
      tenantId: string,
      resourceType: string,
      resourceId: string,
      pagination?: AuditPaginationOptions,
    ): Promise<DomainResult<AuditEventPage>> {
      return this.findByTenant(
        tenantId,
        { resourceType, resourceId },
        pagination,
      );
    },
  };
};
