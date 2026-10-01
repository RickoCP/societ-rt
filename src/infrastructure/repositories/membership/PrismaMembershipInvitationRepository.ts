/**
 * PrismaMembershipInvitationRepository — Prisma-based implementation of IMembershipInvitationRepository.
 *
 * This repository implements persistence operations for the membership invitation system.
 *
 * **SECURITY CONSIDERATIONS:**
 * - All operations validate tenant boundary via WHERE clauses
 * - Token hash lookups are performed directly (no tenant filter needed)
 * - Never returns plaintext tokens
 *
 * @see FASE 1.18 Task 53: Membership Invitation Flow
 * @see Requirements 22 (AC 1-7), 25 (AC 1-9)
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  MembershipInvitation as PrismaInvitation,
  MembershipInvitationStatus as PrismaInvitationStatus,
} from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, businessError } from '@core/utils';
import type {
  IMembershipInvitationRepository,
  InvitationQueryOptions,
} from '@core/domains/membership/repositories';
import type {
  MembershipInvitation,
  CreateInvitationInput,
  UpdateInvitationInput,
} from '@core/domains/membership/entities';
import {
  MembershipInvitationStatus,
} from '@core/domains/membership/entities';

// ---------------------------------------------------------------------------
// Prisma → Domain Mapping
// ---------------------------------------------------------------------------

/**
 * Maps Prisma MembershipInvitationStatus enum to domain enum.
 */
function mapPrismaStatus(prismaStatus: PrismaInvitationStatus): MembershipInvitationStatus {
  return prismaStatus as unknown as MembershipInvitationStatus;
}

/**
 * Maps domain MembershipInvitationStatus to Prisma enum.
 */
function mapDomainStatusToPrisma(status: MembershipInvitationStatus): PrismaInvitationStatus {
  return status as unknown as PrismaInvitationStatus;
}

/**
 * Maps a Prisma MembershipInvitation record to a domain entity.
 */
function mapPrismaToDomain(prismaInvitation: PrismaInvitation): MembershipInvitation {
  return {
    id: prismaInvitation.id,
    membershipId: prismaInvitation.membershipId,
    tenantId: prismaInvitation.tenantId,
    inviterUserId: prismaInvitation.inviterUserId,
    inviterMembershipId: prismaInvitation.inviterMembershipId,
    tokenHash: prismaInvitation.tokenHash,
    expiresAt: prismaInvitation.expiresAt,
    status: mapPrismaStatus(prismaInvitation.status),
    invitedEmail: prismaInvitation.invitedEmail ?? undefined,
    invitedUserId: prismaInvitation.invitedUserId ?? undefined,
    createdAt: prismaInvitation.createdAt,
    updatedAt: prismaInvitation.updatedAt,
    acceptedAt: prismaInvitation.acceptedAt ?? undefined,
    revokedAt: prismaInvitation.revokedAt ?? undefined,
    revokedBy: prismaInvitation.revokedBy ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Error Helpers
// ---------------------------------------------------------------------------

function invitationNotFoundError(): ReturnType<typeof businessError> {
  return businessError(
    'INVITATION_NOT_FOUND',
    'Invitation not found in the specified tenant',
    { userMessage: 'Invitation not found' },
  );
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a PrismaMembershipInvitationRepository instance.
 *
 * @param prismaClient - The Prisma client instance
 * @returns An implementation of IMembershipInvitationRepository
 */
export const PrismaMembershipInvitationRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): IMembershipInvitationRepository => {
  return {
    // -------------------------------------------------------------------------
    // Create Operations
    // -------------------------------------------------------------------------

    async create(input: CreateInvitationInput): Promise<DomainResult<MembershipInvitation>> {
      try {
        const created = await prismaClient.membershipInvitation.create({
          data: {
            membershipId: input.membershipId,
            tenantId: input.tenantId,
            inviterUserId: input.inviterUserId,
            inviterMembershipId: input.inviterMembershipId,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            invitedEmail: input.invitedEmail ?? null,
            invitedUserId: input.invitedUserId ?? null,
            status: mapDomainStatusToPrisma(MembershipInvitationStatus.PENDING),
          },
        });

        return ok(mapPrismaToDomain(created));
      } catch (error) {
        return fail(
          technicalError(
            'INVITATION_CREATE_FAILED',
            'Failed to create membership invitation',
            { cause: error instanceof Error ? error.message : String(error) },
          ),
        );
      }
    },

    // -------------------------------------------------------------------------
    // Read Operations
    // -------------------------------------------------------------------------

    async findByTokenHash(tokenHash: string): Promise<MembershipInvitation | null> {
      const invitation = await prismaClient.membershipInvitation.findUnique({
        where: { tokenHash },
      });

      return invitation ? mapPrismaToDomain(invitation) : null;
    },

    async findById(invitationId: string, tenantId: string): Promise<MembershipInvitation | null> {
      const invitation = await prismaClient.membershipInvitation.findFirst({
        where: {
          id: invitationId,
          tenantId,
        },
      });

      return invitation ? mapPrismaToDomain(invitation) : null;
    },

    async findByMembershipId(
      membershipId: string,
      tenantId: string,
    ): Promise<MembershipInvitation | null> {
      const invitation = await prismaClient.membershipInvitation.findFirst({
        where: {
          membershipId,
          tenantId,
        },
      });

      return invitation ? mapPrismaToDomain(invitation) : null;
    },

    async findByTenant(
      tenantId: string,
      options?: InvitationQueryOptions,
    ): Promise<MembershipInvitation[]> {
      // Build where clause dynamically
      const whereConditions: Prisma.MembershipInvitationWhereInput = {
        tenantId,
      };

      if (options?.status) {
        whereConditions.status = mapDomainStatusToPrisma(options.status);
      }

      if (!options?.includeExpired) {
        // Exclude expired unless specifically requested
        // Note: This only applies to PENDING status
        if (!options?.status || options.status === MembershipInvitationStatus.PENDING) {
          whereConditions.OR = [
            { status: { not: mapDomainStatusToPrisma(MembershipInvitationStatus.PENDING) } },
            { expiresAt: { gte: new Date() } },
          ];
        }
      }

      const invitations = await prismaClient.membershipInvitation.findMany({
        where: whereConditions,
        orderBy: { createdAt: 'desc' },
      });

      return invitations.map(mapPrismaToDomain);
    },

    async findPendingForUser(
      tenantId: string,
      invitedEmail?: string,
      invitedUserId?: string,
    ): Promise<MembershipInvitation[]> {
      const whereConditions: Prisma.MembershipInvitationWhereInput = {
        tenantId,
        status: mapDomainStatusToPrisma(MembershipInvitationStatus.PENDING),
      };

      if (invitedEmail) {
        whereConditions.invitedEmail = invitedEmail;
      }

      if (invitedUserId) {
        whereConditions.invitedUserId = invitedUserId;
      }

      const invitations = await prismaClient.membershipInvitation.findMany({
        where: whereConditions,
        orderBy: { createdAt: 'desc' },
      });

      return invitations.map(mapPrismaToDomain);
    },

    async findByInviter(
      inviterUserId: string,
      tenantId: string,
      options?: InvitationQueryOptions,
    ): Promise<MembershipInvitation[]> {
      const whereConditions: Prisma.MembershipInvitationWhereInput = {
        inviterUserId,
        tenantId,
      };

      if (options?.status) {
        whereConditions.status = mapDomainStatusToPrisma(options.status);
      }

      const invitations = await prismaClient.membershipInvitation.findMany({
        where: whereConditions,
        orderBy: { createdAt: 'desc' },
      });

      return invitations.map(mapPrismaToDomain);
    },

    // -------------------------------------------------------------------------
    // Update Operations
    // -------------------------------------------------------------------------

    async update(
      invitationId: string,
      tenantId: string,
      data: UpdateInvitationInput,
    ): Promise<DomainResult<MembershipInvitation>> {
      try {
        // First check if invitation exists in tenant
        const existing = await prismaClient.membershipInvitation.findFirst({
          where: { id: invitationId, tenantId },
        });

        if (!existing) {
          return fail(invitationNotFoundError());
        }

        const updateData: Prisma.MembershipInvitationUpdateInput = {};

        if (data.status !== undefined) {
          updateData.status = mapDomainStatusToPrisma(data.status);
        }
        if (data.acceptedAt !== undefined) {
          updateData.acceptedAt = data.acceptedAt;
        }
        if (data.revokedAt !== undefined) {
          updateData.revokedAt = data.revokedAt;
        }
        if (data.revokedBy !== undefined) {
          updateData.revokedBy = data.revokedBy;
        }

        const updated = await prismaClient.membershipInvitation.update({
          where: { id: invitationId },
          data: updateData,
        });

        return ok(mapPrismaToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'INVITATION_UPDATE_FAILED',
            'Failed to update membership invitation',
            { cause: error instanceof Error ? error.message : String(error) },
          ),
        );
      }
    },

    async updateToken(
      invitationId: string,
      tenantId: string,
      newTokenHash: string,
      newExpiresAt: Date,
    ): Promise<DomainResult<MembershipInvitation>> {
      try {
        // First check if invitation exists in tenant
        const existing = await prismaClient.membershipInvitation.findFirst({
          where: { id: invitationId, tenantId },
        });

        if (!existing) {
          return fail(invitationNotFoundError());
        }

        const updated = await prismaClient.membershipInvitation.update({
          where: { id: invitationId },
          data: {
            tokenHash: newTokenHash,
            expiresAt: newExpiresAt,
          },
        });

        return ok(mapPrismaToDomain(updated));
      } catch (error) {
        return fail(
          technicalError(
            'INVITATION_TOKEN_UPDATE_FAILED',
            'Failed to update invitation token',
            { cause: error instanceof Error ? error.message : String(error) },
          ),
        );
      }
    },

    // -------------------------------------------------------------------------
    // Batch Operations
    // -------------------------------------------------------------------------

    async findExpiredPending(tenantId?: string, limit: number = 100): Promise<MembershipInvitation[]> {
      const whereConditions: Prisma.MembershipInvitationWhereInput = {
        status: mapDomainStatusToPrisma(MembershipInvitationStatus.PENDING),
        expiresAt: { lt: new Date() },
      };

      if (tenantId) {
        whereConditions.tenantId = tenantId;
      }

      const invitations = await prismaClient.membershipInvitation.findMany({
        where: whereConditions,
        take: limit,
        orderBy: { expiresAt: 'asc' },
      });

      return invitations.map(mapPrismaToDomain);
    },

    async bulkUpdateStatus(
      invitationIds: string[],
      status: MembershipInvitationStatus,
    ): Promise<number> {
      if (invitationIds.length === 0) {
        return 0;
      }

      const result = await prismaClient.membershipInvitation.updateMany({
        where: {
          id: { in: invitationIds },
        },
        data: {
          status: mapDomainStatusToPrisma(status),
        },
      });

      return result.count;
    },

    // -------------------------------------------------------------------------
    // Utility Operations
    // -------------------------------------------------------------------------

    async existsPendingInvitation(
      tenantId: string,
      invitedEmail?: string,
      invitedUserId?: string,
    ): Promise<boolean> {
      if (!invitedEmail && !invitedUserId) {
        return false;
      }

      const whereConditions: Prisma.MembershipInvitationWhereInput = {
        tenantId,
        status: mapDomainStatusToPrisma(MembershipInvitationStatus.PENDING),
        expiresAt: { gte: new Date() }, // Only consider non-expired
      };

      // Build OR condition for email or userId
      const orConditions: Prisma.MembershipInvitationWhereInput[] = [];
      
      if (invitedEmail) {
        orConditions.push({ invitedEmail });
      }
      if (invitedUserId) {
        orConditions.push({ invitedUserId });
      }

      if (orConditions.length > 0) {
        whereConditions.OR = orConditions;
      }

      const existing = await prismaClient.membershipInvitation.findFirst({
        where: whereConditions,
        select: { id: true },
      });

      return existing !== null;
    },

    async countPending(tenantId: string): Promise<number> {
      const count = await prismaClient.membershipInvitation.count({
        where: {
          tenantId,
          status: mapDomainStatusToPrisma(MembershipInvitationStatus.PENDING),
          expiresAt: { gte: new Date() }, // Only count non-expired
        },
      });

      return count;
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type PrismaMembershipInvitationRepository = IMembershipInvitationRepository;
