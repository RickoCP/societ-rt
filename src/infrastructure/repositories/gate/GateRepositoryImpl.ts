/**
 * GateRepositoryImpl — Infrastructure implementation of GateRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on Gate model.
 * Handles gate registration, status updates, event recording, event listing,
 * and analytics aggregation.
 *
 * @see Requirements 33.1, 33.2, 33.6, 33.7, 33.8
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type {
  GateRepository,
  GateEventFilters,
  PaginatedGateEventResult,
} from '@core/domains/gate/repositories/GateRepository';
import type {
  Gate,
  GateStatus,
  RegisterGateInput,
  GateEvent,
  GateEventState,
  GateAnalytics,
} from '@core/domains/gate/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaGate {
  id: string;
  tenantId: string;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  deviceId: string;
  status: string;
  lastStateChange: Date;
  createdAt: Date;
}

interface PrismaGateEvent {
  id: string;
  gateId: string;
  tenantId: string;
  state: string;
  duration: number;
  timestamp: Date;
}

/**
 * Maps Prisma GateStatus enum values to domain GateStatus.
 * Prisma uses: 'open' | 'closed' | 'offline'
 */
function mapPrismaGateStatusToDomain(status: string): GateStatus {
  switch (status) {
    case 'open':
      return 'open';
    case 'closed':
      return 'closed';
    case 'offline':
      return 'offline';
    default:
      return 'offline';
  }
}

/**
 * Maps Prisma GateEventState enum values to domain GateEventState.
 * Prisma uses: 'gate_open' | 'gate_closed'
 * Domain uses: 'open' | 'closed'
 */
function mapPrismaEventStateToDomain(state: string): GateEventState {
  switch (state) {
    case 'gate_open':
      return 'open';
    case 'gate_closed':
      return 'closed';
    default:
      return 'closed';
  }
}

/**
 * Maps domain GateEventState to Prisma GateEventState enum.
 * Domain uses: 'open' | 'closed'
 * Prisma uses: 'gate_open' | 'gate_closed'
 */
function mapDomainEventStateToPrisma(state: GateEventState): string {
  switch (state) {
    case 'open':
      return 'gate_open';
    case 'closed':
      return 'gate_closed';
    default:
      return 'gate_closed';
  }
}

function mapPrismaGateToDomain(p: PrismaGate): Gate {
  return {
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    location: p.location,
    latitude: p.latitude,
    longitude: p.longitude,
    deviceId: p.deviceId,
    status: mapPrismaGateStatusToDomain(p.status),
    lastStateChange: p.lastStateChange,
    createdAt: p.createdAt,
  };
}

function mapPrismaGateEventToDomain(p: PrismaGateEvent): GateEvent {
  return {
    id: p.id,
    gateId: p.gateId,
    tenantId: p.tenantId,
    state: mapPrismaEventStateToDomain(p.state),
    duration: p.duration,
    timestamp: p.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const GateRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): GateRepository => {
  const gateRepo: TenantScopedRepository<PrismaGate> =
    createTenantScopedRepository(
      prismaClient.gate as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  const gateEventRepo: TenantScopedRepository<PrismaGateEvent> =
    createTenantScopedRepository(
      prismaClient.gateEvent as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // registerGate
    // -----------------------------------------------------------------------
    async registerGate(
      tenantId: string,
      data: RegisterGateInput,
    ): Promise<DomainResult<Gate>> {
      try {
        const gate = await gateRepo.create(tenantId, {
          data: {
            name: data.name,
            location: data.location,
            latitude: data.latitude,
            longitude: data.longitude,
            deviceId: data.deviceId,
            status: 'closed',
            lastStateChange: new Date(),
          },
        });

        return ok(mapPrismaGateToDomain(gate));
      } catch (error) {
        return fail(
          technicalError(
            'GATE_REGISTER_FAILED',
            'Failed to register gate',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByTenant
    // -----------------------------------------------------------------------
    async findByTenant(tenantId: string): Promise<DomainResult<Gate[]>> {
      try {
        const gates = await gateRepo.findMany(tenantId, {
          orderBy: { createdAt: 'desc' },
        });

        return ok(gates.map(mapPrismaGateToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'GATE_FIND_BY_TENANT_FAILED',
            'Failed to find gates for tenant',
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
      gateId: string,
      status: GateStatus,
    ): Promise<DomainResult<Gate>> {
      try {
        const existing = await gateRepo.findFirst(tenantId, {
          where: { id: gateId },
        });

        if (!existing) {
          return fail(
            notFoundError('GATE_NOT_FOUND', `Gate ${gateId} not found`),
          );
        }

        const updated = await gateRepo.update(tenantId, {
          where: { id: gateId },
          data: { status, lastStateChange: new Date() },
        });

        return ok(mapPrismaGateToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'GATE_UPDATE_STATUS_FAILED',
            'Failed to update gate status',
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
      gateId: string,
      state: GateEventState,
      duration: number,
    ): Promise<DomainResult<GateEvent>> {
      try {
        // Verify gate belongs to tenant
        const existing = await gateRepo.findFirst(tenantId, {
          where: { id: gateId },
        });

        if (!existing) {
          return fail(
            notFoundError('GATE_NOT_FOUND', `Gate ${gateId} not found`),
          );
        }

        const prismaState = mapDomainEventStateToPrisma(state);

        const event = await gateEventRepo.create(tenantId, {
          data: {
            gateId,
            state: prismaState,
            duration,
            timestamp: new Date(),
          },
        });

        return ok(mapPrismaGateEventToDomain(event));
      } catch (error) {
        return fail(
          technicalError(
            'GATE_CREATE_EVENT_FAILED',
            'Failed to create gate event',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findEventsByGate
    // -----------------------------------------------------------------------
    async findEventsByGate(
      tenantId: string,
      gateId: string,
      page: number,
      pageSize: number,
      filters?: GateEventFilters,
    ): Promise<DomainResult<PaginatedGateEventResult>> {
      try {
        const where: Record<string, unknown> = { gateId };

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

        const [events, total] = await Promise.all([
          gateEventRepo.findMany(tenantId, {
            where,
            orderBy: { timestamp: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          gateEventRepo.count(tenantId, { where }),
        ]);

        return ok({
          data: events.map(mapPrismaGateEventToDomain),
          total,
          page,
          pageSize,
        });
      } catch (error) {
        return fail(
          technicalError(
            'GATE_FIND_EVENTS_FAILED',
            'Failed to find gate events',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getGateAnalytics
    // -----------------------------------------------------------------------
    async getGateAnalytics(
      tenantId: string,
      gateId: string,
      from: Date,
      to: Date,
    ): Promise<DomainResult<GateAnalytics>> {
      try {
        // Verify gate belongs to tenant
        const existing = await gateRepo.findFirst(tenantId, {
          where: { id: gateId },
        });

        if (!existing) {
          return fail(
            notFoundError('GATE_NOT_FOUND', `Gate ${gateId} not found`),
          );
        }

        // Use Prisma aggregation queries on GateEvent model
        const baseWhere = {
          gateId,
          tenantId,
          timestamp: { gte: from, lte: to },
        };

        const [aggregation, openCount, closedCount] = await Promise.all([
          prismaClient.gateEvent.aggregate({
            where: baseWhere,
            _count: { id: true },
            _avg: { duration: true },
            _max: { duration: true },
          }),
          prismaClient.gateEvent.count({
            where: { ...baseWhere, state: 'gate_open' },
          }),
          prismaClient.gateEvent.count({
            where: { ...baseWhere, state: 'gate_closed' },
          }),
        ]);

        const analytics: GateAnalytics = {
          totalEvents: aggregation._count.id,
          averageOpenDuration: aggregation._avg.duration ?? 0,
          longestOpenDuration: aggregation._max.duration ?? 0,
          openCount,
          closedCount,
          timeRange: { from, to },
        };

        return ok(analytics);
      } catch (error) {
        return fail(
          technicalError(
            'GATE_ANALYTICS_FAILED',
            'Failed to get gate analytics',
            { cause: error },
          ),
        );
      }
    },
  };
};
