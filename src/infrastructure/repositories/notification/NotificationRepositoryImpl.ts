/**
 * NotificationRepositoryImpl — Infrastructure implementation of
 * NotificationRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on Notification model.
 *
 * @see Requirements 17.3
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type {
  NotificationRepository,
  NotificationFilters,
} from '@core/domains/notification/repositories/NotificationRepository';
import type {
  Notification,
  CreateNotificationInput,
} from '@core/domains/notification/entities';
import type { PaginatedResult } from '@core/domains/resident/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mapper
// ---------------------------------------------------------------------------

interface PrismaNotification {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  channel: string;
  status: string;
  createdAt: Date;
}

function mapPrismaNotificationToDomain(
  p: PrismaNotification,
): Notification {
  return {
    id: p.id,
    tenantId: p.tenantId,
    userId: p.userId,
    type: p.type,
    title: p.title,
    body: p.body,
    channel: p.channel as Notification['channel'],
    status: p.status as Notification['status'],
    createdAt: p.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const NotificationRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): NotificationRepository => {
  const notificationRepo: TenantScopedRepository<PrismaNotification> =
    createTenantScopedRepository(
      prismaClient.notification as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // create
    // -----------------------------------------------------------------------
    async create(
      tenantId: string,
      data: CreateNotificationInput,
    ): Promise<DomainResult<Notification>> {
      try {
        const notification = await notificationRepo.create(tenantId, {
          data: {
            userId: data.userId,
            type: data.type,
            title: data.title,
            body: data.body,
            channel: data.channel,
            status: 'unread',
          },
        });

        return ok(mapPrismaNotificationToDomain(notification));
      } catch (error) {
        return fail(
          technicalError(
            'NOTIFICATION_CREATE_FAILED',
            'Failed to create notification',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // findByUser
    // -----------------------------------------------------------------------
    async findByUser(
      tenantId: string,
      userId: string,
      filters: NotificationFilters,
    ): Promise<DomainResult<PaginatedResult<Notification>>> {
      try {
        const page = filters.page ?? 1;
        const pageSize = filters.pageSize ?? 20;
        const skip = (page - 1) * pageSize;

        const where: Record<string, unknown> = { userId };
        if (filters.status) {
          where.status = filters.status;
        }

        const [notifications, total] = await Promise.all([
          notificationRepo.findMany(tenantId, {
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: pageSize,
          }),
          notificationRepo.count(tenantId, { where }),
        ]);

        return ok({
          data: notifications.map(mapPrismaNotificationToDomain),
          total,
          page,
          pageSize,
        });
      } catch (error) {
        return fail(
          technicalError(
            'NOTIFICATION_FIND_BY_USER_FAILED',
            'Failed to find notifications for user',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // markAsRead
    // -----------------------------------------------------------------------
    async markAsRead(
      tenantId: string,
      notificationId: string,
    ): Promise<DomainResult<Notification>> {
      try {
        const existing = await notificationRepo.findFirst(tenantId, {
          where: { id: notificationId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'NOTIFICATION_NOT_FOUND',
              `Notification ${notificationId} not found`,
            ),
          );
        }

        const updated = await notificationRepo.update(tenantId, {
          where: { id: notificationId },
          data: { status: 'read' },
        });

        return ok(mapPrismaNotificationToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'NOTIFICATION_MARK_READ_FAILED',
            'Failed to mark notification as read',
            { cause: error },
          ),
        );
      }
    },
  };
};
