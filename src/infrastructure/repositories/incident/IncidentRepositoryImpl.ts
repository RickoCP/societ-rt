/**
 * IncidentRepositoryImpl — Infrastructure implementation of IncidentRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on Incident model.
 * Handles full incident lifecycle: creation, status updates, log entries,
 * evidence attachment, and paginated listing.
 *
 * @see Requirements 32.1, 32.2, 32.4, 32.6
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type {
  IncidentRepository,
  IncidentFilters,
  PaginatedIncidentResult,
} from '@core/domains/incident/repositories/IncidentRepository';
import type {
  Incident,
  IncidentStatus,
  IncidentSeverity,
  IncidentCategory,
  CreateIncidentInput,
  IncidentLog,
  CreateIncidentLogInput,
} from '@core/domains/incident/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaIncident {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  severity: string;
  category: string;
  status: string;
  reportedBy: string;
  assignedTo: string | null;
  evidenceUrls: string[];
  escalatedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PrismaIncidentLog {
  id: string;
  incidentId: string;
  status: string;
  notes: string | null;
  actorId: string;
  timestamp: Date;
}

function mapPrismaIncidentToDomain(p: PrismaIncident): Incident {
  return {
    id: p.id,
    tenantId: p.tenantId,
    title: p.title,
    description: p.description,
    location: p.location,
    latitude: p.latitude,
    longitude: p.longitude,
    severity: p.severity as IncidentSeverity,
    category: p.category as IncidentCategory,
    status: p.status as IncidentStatus,
    reportedBy: p.reportedBy,
    assignedTo: p.assignedTo,
    evidenceUrls: p.evidenceUrls,
    escalatedAt: p.escalatedAt,
    resolvedAt: p.resolvedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function mapPrismaLogToDomain(p: PrismaIncidentLog): IncidentLog {
  return {
    id: p.id,
    incidentId: p.incidentId,
    status: p.status as IncidentStatus,
    notes: p.notes,
    actorId: p.actorId,
    timestamp: p.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const IncidentRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): IncidentRepository => {
  const incidentRepo: TenantScopedRepository<PrismaIncident> =
    createTenantScopedRepository(
      prismaClient.incident as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // createIncident
    // -----------------------------------------------------------------------
    async createIncident(
      tenantId: string,
      data: CreateIncidentInput,
    ): Promise<DomainResult<Incident>> {
      try {
        const incident = await incidentRepo.create(tenantId, {
          data: {
            title: data.title,
            description: data.description,
            location: data.location,
            latitude: data.latitude,
            longitude: data.longitude,
            severity: data.severity,
            category: data.category,
            reportedBy: data.reportedBy,
            assignedTo: data.assignedTo ?? null,
            evidenceUrls: [],
          },
        });

        return ok(mapPrismaIncidentToDomain(incident));
      } catch (error) {
        return fail(
          technicalError(
            'INCIDENT_CREATE_FAILED',
            'Failed to create incident',
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
      incidentId: string,
      status: IncidentStatus,
    ): Promise<DomainResult<Incident>> {
      try {
        const existing = await incidentRepo.findFirst(tenantId, {
          where: { id: incidentId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'INCIDENT_NOT_FOUND',
              `Incident ${incidentId} not found`,
            ),
          );
        }

        // Build update data with timestamp fields for specific transitions
        const updateData: Record<string, unknown> = { status };

        if (status === 'escalated') {
          updateData.escalatedAt = new Date();
        }

        if (status === 'resolved') {
          updateData.resolvedAt = new Date();
        }

        const updated = await incidentRepo.update(tenantId, {
          where: { id: incidentId },
          data: updateData,
        });

        return ok(mapPrismaIncidentToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'INCIDENT_UPDATE_STATUS_FAILED',
            'Failed to update incident status',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // addLog
    // -----------------------------------------------------------------------
    async addLog(
      tenantId: string,
      incidentId: string,
      data: CreateIncidentLogInput,
    ): Promise<DomainResult<IncidentLog>> {
      try {
        // Verify incident belongs to tenant
        const existing = await incidentRepo.findFirst(tenantId, {
          where: { id: incidentId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'INCIDENT_NOT_FOUND',
              `Incident ${incidentId} not found`,
            ),
          );
        }

        const log = await prismaClient.incidentLog.create({
          data: {
            incidentId,
            status: data.status,
            notes: data.notes ?? null,
            actorId: data.actorId,
          },
        });

        return ok(mapPrismaLogToDomain(log as unknown as PrismaIncidentLog));
      } catch (error) {
        return fail(
          technicalError(
            'INCIDENT_ADD_LOG_FAILED',
            'Failed to add incident log entry',
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
      page: number,
      pageSize: number,
      filters?: IncidentFilters,
    ): Promise<DomainResult<PaginatedIncidentResult>> {
      try {
        const where: Record<string, unknown> = {};

        if (filters?.status) {
          where.status = filters.status;
        }
        if (filters?.severity) {
          where.severity = filters.severity;
        }
        if (filters?.category) {
          where.category = filters.category;
        }

        const [incidents, total] = await Promise.all([
          incidentRepo.findMany(tenantId, {
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          incidentRepo.count(tenantId, { where }),
        ]);

        return ok({
          data: incidents.map(mapPrismaIncidentToDomain),
          total,
          page,
          pageSize,
        });
      } catch (error) {
        return fail(
          technicalError(
            'INCIDENT_FIND_BY_TENANT_FAILED',
            'Failed to find incidents for tenant',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findById
    // -----------------------------------------------------------------------
    async findById(
      tenantId: string,
      incidentId: string,
    ): Promise<DomainResult<Incident | null>> {
      try {
        const incident = await incidentRepo.findFirst(tenantId, {
          where: { id: incidentId },
        });

        if (!incident) {
          return ok(null);
        }

        return ok(mapPrismaIncidentToDomain(incident));
      } catch (error) {
        return fail(
          technicalError(
            'INCIDENT_FIND_BY_ID_FAILED',
            'Failed to find incident by ID',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // attachEvidence
    // -----------------------------------------------------------------------
    async attachEvidence(
      tenantId: string,
      incidentId: string,
      evidenceUrls: string[],
    ): Promise<DomainResult<Incident>> {
      try {
        const existing = await incidentRepo.findFirst(tenantId, {
          where: { id: incidentId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'INCIDENT_NOT_FOUND',
              `Incident ${incidentId} not found`,
            ),
          );
        }

        // Merge existing evidence URLs with new ones
        const mergedUrls = [...existing.evidenceUrls, ...evidenceUrls];

        const updated = await incidentRepo.update(tenantId, {
          where: { id: incidentId },
          data: { evidenceUrls: mergedUrls },
        });

        return ok(mapPrismaIncidentToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'INCIDENT_ATTACH_EVIDENCE_FAILED',
            'Failed to attach evidence to incident',
            { cause: error },
          ),
        );
      }
    },
  };
};
