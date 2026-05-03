/**
 * OperationalRepositoryImpl — Prisma implementation for operational management.
 *
 * Handles impersonation sessions and tenant health metrics.
 *
 * @see Requirements 30.3, 30.4, 30.5
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type {
  OperationalRepository,
  CreateImpersonationInput,
} from '@core/domains/operational/repositories/OperationalRepository';
import type {
  ImpersonationSession,
  TenantHealthMetrics,
} from '@core/domains/operational/entities';

export const OperationalRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): OperationalRepository => ({
  async createImpersonationSession(
    input: CreateImpersonationInput,
  ): Promise<DomainResult<ImpersonationSession>> {
    try {
      // Store session in audit log as a structured entry
      // (No dedicated impersonation table in schema — use audit log pattern)
      const auditEntry = await prismaClient.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorUserId: input.impersonatorId,
          actionType: 'impersonation_session_created',
          resourceType: 'impersonation_session',
          resourceId: input.impersonatedUserId,
          details: {
            impersonatedUserId: input.impersonatedUserId,
            token: input.token,
            expiresAt: input.expiresAt.toISOString(),
          },
          impersonatorId: input.impersonatorId,
        },
      });

      return ok({
        id: auditEntry.id,
        impersonatorId: input.impersonatorId,
        impersonatedUserId: input.impersonatedUserId,
        tenantId: input.tenantId,
        token: input.token,
        expiresAt: input.expiresAt,
        createdAt: auditEntry.timestamp,
        endedAt: null,
      });
    } catch (error) {
      return fail(
        technicalError(
          'IMPERSONATION_SESSION_CREATE_FAILED',
          'Failed to create impersonation session',
          { cause: error },
        ),
      );
    }
  },

  async endImpersonationSession(
    sessionId: string,
  ): Promise<DomainResult<ImpersonationSession>> {
    try {
      const entry = await prismaClient.auditLog.findUnique({
        where: { id: sessionId },
      });

      if (!entry) {
        return fail(
          notFoundError(
            'IMPERSONATION_SESSION_NOT_FOUND',
            'Impersonation session not found',
          ),
        );
      }

      const details = entry.details as Record<string, unknown>;

      // Log session end
      await prismaClient.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          actorUserId: entry.actorUserId,
          actionType: 'impersonation_session_ended',
          resourceType: 'impersonation_session',
          resourceId: sessionId,
          details: {
            originalSessionId: sessionId,
            endedAt: new Date().toISOString(),
          },
          impersonatorId: entry.impersonatorId,
        },
      });

      return ok({
        id: sessionId,
        impersonatorId: entry.actorUserId,
        impersonatedUserId: entry.resourceId,
        tenantId: entry.tenantId,
        token: (details.token as string) ?? '',
        expiresAt: new Date((details.expiresAt as string) ?? Date.now()),
        createdAt: entry.timestamp,
        endedAt: new Date(),
      });
    } catch (error) {
      return fail(
        technicalError(
          'IMPERSONATION_SESSION_END_FAILED',
          'Failed to end impersonation session',
          { cause: error },
        ),
      );
    }
  },

  async getTenantHealth(
    tenantId: string,
  ): Promise<DomainResult<TenantHealthMetrics>> {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [activeUsers30d, apiRequests30d, lastActivityEntry] =
        await Promise.all([
          prismaClient.user.count({
            where: {
              tenantId,
              deletedAt: null,
              updatedAt: { gte: thirtyDaysAgo },
            },
          }),
          prismaClient.auditLog.count({
            where: {
              tenantId,
              timestamp: { gte: thirtyDaysAgo },
            },
          }),
          prismaClient.auditLog.findFirst({
            where: { tenantId },
            orderBy: { timestamp: 'desc' },
            select: { timestamp: true },
          }),
        ]);

      return ok({
        activeUsers30d,
        storageUsageBytes: 0, // Placeholder — requires S3 integration
        apiRequests30d,
        lastActivity: lastActivityEntry?.timestamp ?? null,
      });
    } catch (error) {
      return fail(
        technicalError(
          'TENANT_HEALTH_FETCH_FAILED',
          'Failed to fetch tenant health metrics',
          { cause: error },
        ),
      );
    }
  },
});
