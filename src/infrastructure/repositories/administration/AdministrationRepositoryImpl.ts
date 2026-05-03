/**
 * AdministrationRepositoryImpl — Infrastructure implementation of
 * AdministrationRepository.
 *
 * Uses TenantScopedRepository for LetterRequest model.
 *
 * @see Requirements 13.1, 13.2, 13.3, 13.4, 13.5
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type {
  AdministrationRepository,
  PaginatedLetterRequests,
} from '@core/domains/administration/repositories/AdministrationRepository';
import type {
  LetterRequest,
  SubmitLetterRequestInput,
  ApproveLetterRequestInput,
  RejectLetterRequestInput,
} from '@core/domains/administration/entities';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma → Domain mapper
// ---------------------------------------------------------------------------

interface PrismaLetterRequest {
  id: string;
  tenantId: string;
  userId: string;
  letterType: string;
  purpose: string;
  status: string;
  rejectionReason: string | null;
  documentUrl: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapToDomain(p: PrismaLetterRequest): LetterRequest {
  return {
    id: p.id,
    tenantId: p.tenantId,
    userId: p.userId,
    letterType: p.letterType as LetterRequest['letterType'],
    purpose: p.purpose,
    status: p.status as LetterRequest['status'],
    rejectionReason: p.rejectionReason,
    documentUrl: p.documentUrl,
    decidedBy: p.decidedBy,
    decidedAt: p.decidedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const AdministrationRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): AdministrationRepository => {
  const letterRepo: TenantScopedRepository<PrismaLetterRequest> =
    createTenantScopedRepository(
      prismaClient.letterRequest as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // createRequest
    // -----------------------------------------------------------------------
    async createRequest(
      tenantId: string,
      userId: string,
      data: SubmitLetterRequestInput,
    ): Promise<DomainResult<LetterRequest>> {
      try {
        const request = await letterRepo.create(tenantId, {
          data: {
            userId,
            letterType: data.letterType,
            purpose: data.purpose,
            status: 'pending',
          },
        });

        return ok(mapToDomain(request));
      } catch (error) {
        return fail(
          technicalError(
            'ADMIN_CREATE_REQUEST_FAILED',
            'Failed to create letter request',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // approve
    // -----------------------------------------------------------------------
    async approve(
      tenantId: string,
      requestId: string,
      decidedBy: string,
      data: ApproveLetterRequestInput,
    ): Promise<DomainResult<LetterRequest>> {
      try {
        // Verify the request exists within the tenant
        const existing = await letterRepo.findFirst(tenantId, {
          where: { id: requestId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'ADMIN_REQUEST_NOT_FOUND',
              'Letter request not found',
            ),
          );
        }

        const updated = await letterRepo.update(tenantId, {
          where: { id: requestId },
          data: {
            status: 'approved',
            documentUrl: data.documentUrl,
            decidedBy,
            decidedAt: new Date(),
          },
        });

        return ok(mapToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'ADMIN_APPROVE_FAILED',
            'Failed to approve letter request',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // reject
    // -----------------------------------------------------------------------
    async reject(
      tenantId: string,
      requestId: string,
      decidedBy: string,
      data: RejectLetterRequestInput,
    ): Promise<DomainResult<LetterRequest>> {
      try {
        // Verify the request exists within the tenant
        const existing = await letterRepo.findFirst(tenantId, {
          where: { id: requestId },
        });

        if (!existing) {
          return fail(
            notFoundError(
              'ADMIN_REQUEST_NOT_FOUND',
              'Letter request not found',
            ),
          );
        }

        const updated = await letterRepo.update(tenantId, {
          where: { id: requestId },
          data: {
            status: 'rejected',
            rejectionReason: data.rejectionReason,
            decidedBy,
            decidedAt: new Date(),
          },
        });

        return ok(mapToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'ADMIN_REJECT_FAILED',
            'Failed to reject letter request',
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
    ): Promise<DomainResult<PaginatedLetterRequests>> {
      try {
        const skip = (page - 1) * pageSize;

        const [items, total] = await Promise.all([
          letterRepo.findMany(tenantId, {
            orderBy: { createdAt: 'desc' },
            skip,
            take: pageSize,
          }),
          letterRepo.count(tenantId),
        ]);

        return ok({
          data: items.map(mapToDomain),
          total,
          page,
          pageSize,
        });
      } catch (error) {
        return fail(
          technicalError(
            'ADMIN_FIND_BY_TENANT_FAILED',
            'Failed to find letter requests',
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
    ): Promise<DomainResult<LetterRequest[]>> {
      try {
        const requests = await letterRepo.findMany(tenantId, {
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });

        return ok(requests.map(mapToDomain));
      } catch (error) {
        return fail(
          technicalError(
            'ADMIN_FIND_BY_USER_FAILED',
            'Failed to find letter requests for user',
            { cause: error },
          ),
        );
      }
    },
  };
};
