/**
 * TenantTransferRepositoryImpl — Infrastructure implementation of ITenantTransferRepository.
 *
 * Uses direct Prisma queries for tenant ownership transfer operations.
 * Implements atomic transaction for ownership swap using prismaClient.$transaction.
 *
 * CRITICAL SECURITY RULES:
 * - Transfer requests MUST be validated for proper ownership before mutation
 * - All mutations MUST support atomic transaction with membership updates
 * - Queries MUST be tenant-scoped to prevent cross-tenant leakage
 *
 * @see Requirements 54 (Ownership Transfer & Last-Admin Protection)
 * @see Task 52: Tenant Transfer Flow
 */

import type { PrismaClient } from '@prisma/client';

type PrismaTenantTransferStatus = 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
import type { DomainResult } from '@core/utils';
import { ok, fail, notFoundError, technicalError } from '@core/utils';
import type {
  ITenantTransferRepository,
  CreateTransferInput,
  UpdateTransferStatusInput,
  TransferQueryOptions,
} from '@core/domains/transfer/repositories/ITenantTransferRepository';
import type { TenantTransfer } from '@core/domains/transfer/entities';
import { TenantTransferStatus } from '@core/domains/transfer/types';

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaTenantTransfer {
  id: string;
  tenantId: string;
  initiatorUserId: string;
  targetUserId: string;
  status: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapPrismaTransferToDomain(p: PrismaTenantTransfer): TenantTransfer {
  return {
    id: p.id,
    tenantId: p.tenantId,
    initiatorUserId: p.initiatorUserId,
    targetUserId: p.targetUserId,
    status: p.status as TenantTransferStatus,
    expiresAt: p.expiresAt,
    acceptedAt: p.acceptedAt ?? undefined,
    completedAt: p.completedAt ?? undefined,
    cancelledAt: p.cancelledAt ?? undefined,
    cancellationReason: p.cancellationReason ?? undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function mapDomainStatusToPrisma(status: TenantTransferStatus): PrismaTenantTransferStatus {
  return status as PrismaTenantTransferStatus;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const TenantTransferRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): ITenantTransferRepository => {
  return {
    // -------------------------------------------------------------------------
    // Create Operations
    // -------------------------------------------------------------------------

    async create(input: CreateTransferInput): Promise<DomainResult<TenantTransfer>> {
      try {
        const transfer = await prismaClient.tenantTransfer.create({
          data: {
            tenantId: input.tenantId,
            initiatorUserId: input.initiatorUserId,
            targetUserId: input.targetUserId,
            status: 'PENDING' as PrismaTenantTransferStatus,
            expiresAt: input.expiresAt,
          },
        });

        return ok(mapPrismaTransferToDomain(transfer as unknown as PrismaTenantTransfer));
      } catch (error) {
        return fail(
          technicalError(
            'TRANSFER_CREATE_FAILED',
            'Failed to create tenant transfer request',
            { cause: error },
          ),
        );
      }
    },

    // -------------------------------------------------------------------------
    // Read Operations
    // -------------------------------------------------------------------------

    async findById(id: string): Promise<DomainResult<TenantTransfer>> {
      try {
        const transfer = await prismaClient.tenantTransfer.findUnique({
          where: { id },
        });

        if (!transfer) {
          return fail(
            notFoundError(
              'TRANSFER_NOT_FOUND',
              `Transfer request ${id} not found`,
            ),
          );
        }

        return ok(mapPrismaTransferToDomain(transfer as unknown as PrismaTenantTransfer));
      } catch (error) {
        return fail(
          technicalError(
            'TRANSFER_FIND_FAILED',
            'Failed to find transfer request',
            { cause: error },
          ),
        );
      }
    },

    async findPendingByTenant(tenantId: string): Promise<TenantTransfer[]> {
      try {
        const transfers = await prismaClient.tenantTransfer.findMany({
          where: {
            tenantId,
            status: 'PENDING' as PrismaTenantTransferStatus,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        return transfers.map((t: PrismaTenantTransfer) =>
          mapPrismaTransferToDomain(t as unknown as PrismaTenantTransfer),
        );
      } catch (error) {
        console.error('[TenantTransferRepository] findPendingByTenant error:', error);
        return [];
      }
    },

    async findPendingByTargetUser(
      targetUserId: string,
      tenantId: string,
    ): Promise<DomainResult<TenantTransfer>> {
      try {
        const transfer = await prismaClient.tenantTransfer.findFirst({
          where: {
            targetUserId,
            tenantId,
            status: 'PENDING' as PrismaTenantTransferStatus,
          },
        });

        if (!transfer) {
          return fail(
            notFoundError(
              'TRANSFER_NOT_FOUND',
              `No pending transfer found for target user ${targetUserId} in tenant ${tenantId}`,
            ),
          );
        }

        return ok(mapPrismaTransferToDomain(transfer as unknown as PrismaTenantTransfer));
      } catch (error) {
        return fail(
          technicalError(
            'TRANSFER_FIND_FAILED',
            'Failed to find pending transfer for target user',
            { cause: error },
          ),
        );
      }
    },

    async hasPendingTransfer(tenantId: string): Promise<boolean> {
      try {
        const count = await prismaClient.tenantTransfer.count({
          where: {
            tenantId,
            status: 'PENDING' as PrismaTenantTransferStatus,
          },
        });

        return count > 0;
      } catch (error) {
        console.error('[TenantTransferRepository] hasPendingTransfer error:', error);
        return false;
      }
    },

    async findByTenant(
      tenantId: string,
      options?: TransferQueryOptions,
    ): Promise<TenantTransfer[]> {
      try {
        const where: Record<string, unknown> = { tenantId };

        if (options?.status) {
          where.status = mapDomainStatusToPrisma(options.status);
        }

        if (!options?.includeTerminal) {
          // By default, exclude terminal statuses if not explicitly requested
          where.status = {
            in: ['PENDING', 'ACCEPTED'] as PrismaTenantTransferStatus[],
          };
        }

        const transfers = await prismaClient.tenantTransfer.findMany({
          where,
          orderBy: {
            createdAt: 'desc',
          },
          skip: options?.offset ?? 0,
          take: options?.limit ?? 50,
        });

        return transfers.map((t: PrismaTenantTransfer) =>
          mapPrismaTransferToDomain(t as unknown as PrismaTenantTransfer),
        );
      } catch (error) {
        console.error('[TenantTransferRepository] findByTenant error:', error);
        return [];
      }
    },

    async findExpiredPendingTransfers(): Promise<TenantTransfer[]> {
      try {
        const now = new Date();

        const transfers = await prismaClient.tenantTransfer.findMany({
          where: {
            status: 'PENDING' as PrismaTenantTransferStatus,
            expiresAt: {
              lt: now,
            },
          },
        });

        return transfers.map((t: PrismaTenantTransfer) =>
          mapPrismaTransferToDomain(t as unknown as PrismaTenantTransfer),
        );
      } catch (error) {
        console.error('[TenantTransferRepository] findExpiredPendingTransfers error:', error);
        return [];
      }
    },

    // -------------------------------------------------------------------------
    // Update Operations
    // -------------------------------------------------------------------------

    async updateStatus(
      input: UpdateTransferStatusInput,
    ): Promise<DomainResult<TenantTransfer>> {
      try {
        const data: Record<string, unknown> = {
          status: mapDomainStatusToPrisma(input.status),
        };

        if (input.acceptedAt !== undefined) {
          data.acceptedAt = input.acceptedAt;
        }
        if (input.completedAt !== undefined) {
          data.completedAt = input.completedAt;
        }
        if (input.cancelledAt !== undefined) {
          data.cancelledAt = input.cancelledAt;
        }
        if (input.cancellationReason !== undefined) {
          data.cancellationReason = input.cancellationReason;
        }

        const transfer = await prismaClient.tenantTransfer.update({
          where: { id: input.transferId },
          data,
        });

        return ok(mapPrismaTransferToDomain(transfer as unknown as PrismaTenantTransfer));
      } catch (error) {
        return fail(
          technicalError(
            'TRANSFER_STATUS_UPDATE_FAILED',
            'Failed to update transfer status',
            { cause: error },
          ),
        );
      }
    },

    // -------------------------------------------------------------------------
    // Atomic Operations (for transfer completion)
    // -------------------------------------------------------------------------

    async completeTransferAtomic(
      transferId: string,
      initiatorMembershipId: string,
      targetUserId: string,
      tenantId: string,
    ): Promise<DomainResult<TenantTransfer>> {
      try {
        const now = new Date();

        // Execute atomic transaction
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await prismaClient.$transaction(async (tx: any) => {
          // 1. Update transfer status to COMPLETED
          const transfer = await tx.tenantTransfer.update({
            where: { id: transferId },
            data: {
              status: 'COMPLETED' as PrismaTenantTransferStatus,
              completedAt: now,
            },
          });

          // 2. Revoke the initiator's TENANT_OWNER membership
          await tx.membership.update({
            where: { id: initiatorMembershipId },
            data: {
              status: 'REVOKED',
              revokedAt: now,
            },
          });

          // 3. Check if target already has a membership in this tenant
          const existingMembership = await tx.membership.findFirst({
            where: {
              userId: targetUserId,
              tenantId,
              orgUnitId: null, // Tenant-level membership
            },
          });

          if (existingMembership) {
            // Update existing membership to TENANT_OWNER
            await tx.membership.update({
              where: { id: existingMembership.id },
              data: {
                role: 'TENANT_OWNER',
                status: 'ACTIVE',
                revokedAt: null,
              },
            });
          } else {
            // Create new TENANT_OWNER membership for target user
            await tx.membership.create({
              data: {
                userId: targetUserId,
                tenantId,
                orgUnitId: null,
                role: 'TENANT_OWNER',
                status: 'ACTIVE',
              },
            });
          }

          return transfer;
        });

        return ok(mapPrismaTransferToDomain(result as unknown as PrismaTenantTransfer));
      } catch (error) {
        return fail(
          technicalError(
            'TRANSFER_COMPLETE_ATOMIC_FAILED',
            'Failed to complete transfer atomically',
            { cause: error },
          ),
        );
      }
    },
  };
};
