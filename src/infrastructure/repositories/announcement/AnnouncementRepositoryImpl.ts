/**
 * AnnouncementRepositoryImpl — Infrastructure implementation of
 * AnnouncementRepository.
 *
 * Uses TenantScopedRepository for tenant-scoped queries on Announcement model.
 *
 * @see Requirements 9.1, 9.2, 9.3
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type { AnnouncementRepository, AnnouncementFilters } from '@core/domains/announcement/repositories/AnnouncementRepository';
import type {
  Announcement,
  AnnouncementAttachment,
  AttachmentInput,
  CreateAnnouncementInput,
} from '@core/domains/announcement/entities';
import type { PaginatedResult } from '@core/domains/resident/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaAnnouncement {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  category: string;
  createdBy: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaAnnouncementToDomain(p: PrismaAnnouncement): Announcement {
  return {
    id: p.id,
    tenantId: p.tenantId,
    title: p.title,
    content: p.content,
    category: p.category as Announcement['category'],
    createdBy: p.createdBy,
    publishedAt: p.publishedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

interface PrismaAnnouncementAttachment {
  id: string;
  announcementId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: Date;
}

function mapPrismaAttachmentToDomain(
  p: PrismaAnnouncementAttachment,
): AnnouncementAttachment {
  return {
    id: p.id,
    announcementId: p.announcementId,
    fileUrl: p.fileUrl,
    fileName: p.fileName,
    fileSize: p.fileSize,
    mimeType: p.mimeType,
    createdAt: p.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const AnnouncementRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): AnnouncementRepository => {
  const announcementRepo: TenantScopedRepository<PrismaAnnouncement> =
    createTenantScopedRepository(
      prismaClient.announcement as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // create
    // -----------------------------------------------------------------------
    async create(
      tenantId: string,
      data: CreateAnnouncementInput,
      createdBy: string,
    ): Promise<DomainResult<Announcement>> {
      try {
        const announcement = await announcementRepo.create(tenantId, {
          data: {
            title: data.title,
            content: data.content,
            category: data.category,
            createdBy,
            publishedAt: new Date(),
          },
        });

        return ok(mapPrismaAnnouncementToDomain(announcement));
      } catch (error) {
        return fail(
          technicalError(
            'ANNOUNCEMENT_CREATE_FAILED',
            'Failed to create announcement',
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
      filters: AnnouncementFilters,
    ): Promise<DomainResult<PaginatedResult<Announcement>>> {
      try {
        const page = filters.page ?? 1;
        const pageSize = filters.pageSize ?? 20;
        const skip = (page - 1) * pageSize;

        const where: Record<string, unknown> = {};
        if (filters.category) {
          where.category = filters.category;
        }

        const [announcements, total] = await Promise.all([
          announcementRepo.findMany(tenantId, {
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: pageSize,
          }),
          announcementRepo.count(tenantId, { where }),
        ]);

        return ok({
          data: announcements.map(mapPrismaAnnouncementToDomain),
          total,
          page,
          pageSize,
        });
      } catch (error) {
        return fail(
          technicalError(
            'ANNOUNCEMENT_FIND_BY_TENANT_FAILED',
            'Failed to find announcements for tenant',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // addAttachment
    // -----------------------------------------------------------------------
    async addAttachment(
      announcementId: string,
      data: AttachmentInput,
    ): Promise<DomainResult<AnnouncementAttachment>> {
      try {
        const attachment = await prismaClient.announcementAttachment.create({
          data: {
            announcementId,
            fileUrl: data.fileUrl,
            fileName: data.fileName,
            fileSize: data.fileSize,
            mimeType: data.mimeType,
          },
        });

        return ok(
          mapPrismaAttachmentToDomain(
            attachment as unknown as PrismaAnnouncementAttachment,
          ),
        );
      } catch (error) {
        return fail(
          technicalError(
            'ANNOUNCEMENT_ADD_ATTACHMENT_FAILED',
            'Failed to add attachment to announcement',
            { cause: error },
          ),
        );
      }
    },
  };
};
