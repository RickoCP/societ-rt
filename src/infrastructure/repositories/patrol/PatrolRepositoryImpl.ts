/**
 * PatrolRepositoryImpl — Infrastructure implementation of PatrolRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on PatrolRoute,
 * PatrolSession, and PatrolCheckpointVisit models.
 * Handles JSON checkpoints field and aggregation queries for analytics.
 *
 * @see Requirements 35.1, 35.3, 35.4, 35.7, 35.8
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type {
  PatrolRepository,
  PatrolAnalytics,
} from '@core/domains/patrol/repositories/PatrolRepository';
import type {
  PatrolRoute,
  PatrolCheckpoint,
  CreatePatrolRouteInput,
  PatrolSession,
  PatrolSessionStatus,
  StartPatrolSessionInput,
  CompletePatrolSessionInput,
  PatrolCheckpointVisit,
  RecordCheckpointVisitInput,
} from '@core/domains/patrol/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma row types
// ---------------------------------------------------------------------------

interface PrismaPatrolRoute {
  id: string;
  tenantId: string;
  name: string;
  checkpoints: unknown; // JSON field
  estimatedDuration: number;
  createdBy: string;
  createdAt: Date;
}

interface PrismaPatrolSession {
  id: string;
  tenantId: string;
  routeId: string;
  guardId: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  checkpointsVisited: number;
  distanceTraveled: number;
  createdAt: Date;
}

interface PrismaPatrolCheckpointVisit {
  id: string;
  sessionId: string;
  checkpointIndex: number;
  latitude: number;
  longitude: number;
  visitedAt: Date;
  distanceFromCheckpoint: number;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function parseCheckpoints(raw: unknown): PatrolCheckpoint[] {
  if (Array.isArray(raw)) {
    return raw.map((cp: Record<string, unknown>) => ({
      latitude: Number(cp.latitude ?? cp.lat ?? 0),
      longitude: Number(cp.longitude ?? cp.lng ?? 0),
      label: String(cp.label ?? ''),
    }));
  }
  return [];
}

function mapSessionStatusToDomain(status: string): PatrolSessionStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'completed':
      return 'completed';
    case 'abandoned':
      return 'abandoned';
    default:
      return 'active';
  }
}

function mapPrismaRouteToDomain(p: PrismaPatrolRoute): PatrolRoute {
  return {
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    checkpoints: parseCheckpoints(p.checkpoints),
    estimatedDuration: p.estimatedDuration,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
  };
}

function mapPrismaSessionToDomain(p: PrismaPatrolSession): PatrolSession {
  return {
    id: p.id,
    tenantId: p.tenantId,
    routeId: p.routeId,
    guardId: p.guardId,
    status: mapSessionStatusToDomain(p.status),
    startedAt: p.startedAt,
    completedAt: p.completedAt,
    checkpointsVisited: p.checkpointsVisited,
    distanceTraveled: p.distanceTraveled,
    createdAt: p.createdAt,
  };
}

function mapPrismaVisitToDomain(
  p: PrismaPatrolCheckpointVisit,
): PatrolCheckpointVisit {
  return {
    id: p.id,
    sessionId: p.sessionId,
    checkpointIndex: p.checkpointIndex,
    latitude: p.latitude,
    longitude: p.longitude,
    visitedAt: p.visitedAt,
    distanceFromCheckpoint: p.distanceFromCheckpoint,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const PatrolRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): PatrolRepository => {
  const routeRepo: TenantScopedRepository<PrismaPatrolRoute> =
    createTenantScopedRepository(
      prismaClient.patrolRoute as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  const sessionRepo: TenantScopedRepository<PrismaPatrolSession> =
    createTenantScopedRepository(
      prismaClient.patrolSession as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  const visitRepo: TenantScopedRepository<PrismaPatrolCheckpointVisit> =
    createTenantScopedRepository(
      prismaClient.patrolCheckpointVisit as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // createRoute
    // -----------------------------------------------------------------------
    async createRoute(
      tenantId: string,
      createdBy: string,
      data: CreatePatrolRouteInput,
    ): Promise<DomainResult<PatrolRoute>> {
      try {
        const route = await routeRepo.create(tenantId, {
          data: {
            name: data.name,
            checkpoints: data.checkpoints.map(cp => ({
              latitude: cp.latitude,
              longitude: cp.longitude,
              label: cp.label,
            })),
            estimatedDuration: data.estimatedDuration,
            createdBy,
          },
        });

        return ok(mapPrismaRouteToDomain(route));
      } catch (error) {
        return fail(
          technicalError(
            'PATROL_CREATE_ROUTE_FAILED',
            'Failed to create patrol route',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findRoutesByTenant
    // -----------------------------------------------------------------------
    async findRoutesByTenant(
      tenantId: string,
    ): Promise<DomainResult<PatrolRoute[]>> {
      try {
        const routes = await routeRepo.findMany(tenantId, {
          orderBy: { createdAt: 'desc' },
        });

        return ok(routes.map(mapPrismaRouteToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'PATROL_FIND_ROUTES_FAILED',
            'Failed to find patrol routes',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // startSession
    // -----------------------------------------------------------------------
    async startSession(
      tenantId: string,
      guardId: string,
      data: StartPatrolSessionInput,
    ): Promise<DomainResult<PatrolSession>> {
      try {
        // Verify route exists
        const route = await routeRepo.findFirst(tenantId, {
          where: { id: data.routeId },
        });

        if (!route) {
          return fail(
            notFoundError(
              'PATROL_ROUTE_NOT_FOUND',
              `Patrol route ${data.routeId} not found`,
            ),
          );
        }

        const session = await sessionRepo.create(tenantId, {
          data: {
            routeId: data.routeId,
            guardId,
            status: 'active',
            startedAt: new Date(),
            checkpointsVisited: 0,
            distanceTraveled: 0,
          },
        });

        return ok(mapPrismaSessionToDomain(session));
      } catch (error) {
        return fail(
          technicalError(
            'PATROL_START_SESSION_FAILED',
            'Failed to start patrol session',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // recordCheckpointVisit
    // -----------------------------------------------------------------------
    async recordCheckpointVisit(
      tenantId: string,
      sessionId: string,
      data: RecordCheckpointVisitInput,
    ): Promise<DomainResult<PatrolCheckpointVisit>> {
      try {
        // Verify session exists and is active
        const session = await sessionRepo.findFirst(tenantId, {
          where: { id: sessionId, status: 'active' },
        });

        if (!session) {
          return fail(
            notFoundError(
              'PATROL_SESSION_NOT_FOUND',
              `Active patrol session ${sessionId} not found`,
            ),
          );
        }

        // Create checkpoint visit
        const visit = await visitRepo.create(tenantId, {
          data: {
            sessionId,
            checkpointIndex: data.checkpointIndex,
            latitude: data.latitude,
            longitude: data.longitude,
            distanceFromCheckpoint: data.distanceFromCheckpoint,
            visitedAt: new Date(),
          },
        });

        // Update session checkpoints visited count
        await sessionRepo.update(tenantId, {
          where: { id: sessionId },
          data: { checkpointsVisited: session.checkpointsVisited + 1 },
        });

        return ok(mapPrismaVisitToDomain(visit));
      } catch (error) {
        return fail(
          technicalError(
            'PATROL_RECORD_CHECKPOINT_FAILED',
            'Failed to record checkpoint visit',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // completeSession
    // -----------------------------------------------------------------------
    async completeSession(
      tenantId: string,
      sessionId: string,
      data: CompletePatrolSessionInput,
    ): Promise<DomainResult<PatrolSession>> {
      try {
        const existing = await sessionRepo.findFirst(tenantId, {
          where: { id: sessionId, status: 'active' },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'PATROL_SESSION_NOT_FOUND',
              `Active patrol session ${sessionId} not found`,
            ),
          );
        }

        const updated = await sessionRepo.update(tenantId, {
          where: { id: sessionId },
          data: {
            status: 'completed',
            completedAt: new Date(),
            distanceTraveled: data.distanceTraveled,
          },
        });

        return ok(mapPrismaSessionToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'PATROL_COMPLETE_SESSION_FAILED',
            'Failed to complete patrol session',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getPatrolAnalytics
    // -----------------------------------------------------------------------
    async getPatrolAnalytics(
      tenantId: string,
      from: Date,
      to: Date,
    ): Promise<DomainResult<PatrolAnalytics>> {
      try {
        const baseWhere = {
          tenantId,
          startedAt: { gte: from, lte: to },
        };

        const [aggregation, completedCount, abandonedCount] =
          await Promise.all([
            prismaClient.patrolSession.aggregate({
              where: baseWhere,
              _count: { id: true },
              _avg: {
                checkpointsVisited: true,
                distanceTraveled: true,
              },
            }),
            prismaClient.patrolSession.count({
              where: { ...baseWhere, status: 'completed' },
            }),
            prismaClient.patrolSession.count({
              where: { ...baseWhere, status: 'abandoned' },
            }),
          ]);

        // Calculate average duration from completed sessions
        const completedSessions = await prismaClient.patrolSession.findMany({
          where: {
            ...baseWhere,
            status: 'completed',
            completedAt: { not: null },
          },
          select: { startedAt: true, completedAt: true },
        });

        let averageDuration = 0;
        if (completedSessions.length > 0) {
          const totalMinutes = completedSessions.reduce((sum, s) => {
            if (s.completedAt) {
              const durationMs =
                s.completedAt.getTime() - s.startedAt.getTime();
              return sum + durationMs / 60000;
            }
            return sum;
          }, 0);
          averageDuration = totalMinutes / completedSessions.length;
        }

        // Sum total distance from all sessions
        const distanceAgg = await prismaClient.patrolSession.aggregate({
          where: baseWhere,
          _sum: { distanceTraveled: true },
        });

        const analytics: PatrolAnalytics = {
          totalSessions: aggregation._count.id,
          completedSessions: completedCount,
          abandonedSessions: abandonedCount,
          averageDuration: Math.round(averageDuration),
          averageCheckpointsVisited: Math.round(
            aggregation._avg.checkpointsVisited ?? 0,
          ),
          totalDistanceTraveled: distanceAgg._sum.distanceTraveled ?? 0,
          timeRange: { from, to },
        };

        return ok(analytics);
      } catch (error) {
        return fail(
          technicalError(
            'PATROL_ANALYTICS_FAILED',
            'Failed to get patrol analytics',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findActiveSessions
    // -----------------------------------------------------------------------
    async findActiveSessions(
      tenantId: string,
    ): Promise<DomainResult<PatrolSession[]>> {
      try {
        const sessions = await sessionRepo.findMany(tenantId, {
          where: { status: 'active' },
          orderBy: { startedAt: 'desc' },
        });

        return ok(sessions.map(mapPrismaSessionToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'PATROL_FIND_ACTIVE_SESSIONS_FAILED',
            'Failed to find active patrol sessions',
            { cause: error },
          ),
        );
      }
    },
  };
};
