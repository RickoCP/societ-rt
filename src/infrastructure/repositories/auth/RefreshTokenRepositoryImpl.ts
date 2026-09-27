/**
 * RefreshTokenRepositoryImpl — Prisma implementation of RefreshTokenRepository.
 *
 * Implements all refresh token persistence operations using Prisma client.
 *
 * @see Requirements 14 (Refresh Token), 16 (Session Revocation)
 */

import { getPrismaClient } from '../prismaClient';
import type {
  RepoCreateRefreshTokenInput,
  RefreshTokenQueryOptions,
  RefreshTokenRepository,
  RevokeTokenInput,
} from '@core/domains/auth/repositories/RefreshTokenRepository';
import type { RefreshToken } from '@core/domains/auth/entities/RefreshToken';
import type { DomainResult } from '@core/utils';
import { fail, ok, technicalError } from '@core/utils';

// ---------------------------------------------------------------------------
// Mapper Functions
// ---------------------------------------------------------------------------

/**
 * Map Prisma RefreshToken to domain RefreshToken.
 */
function mapToDomain(
  prismaToken: {
    id: string;
    userId: string;
    tokenHash: string;
    familyId: string;
    generation: number;
    expiresAt: Date;
    revokedAt: Date | null;
    replacedBy: string | null;
    userAgent: string | null;
    ipAddress: string | null;
    tenantId: string | null;
    createdAt: Date;
  },
): RefreshToken {
  return {
    id: prismaToken.id,
    userId: prismaToken.userId,
    tokenHash: prismaToken.tokenHash,
    familyId: prismaToken.familyId,
    generation: prismaToken.generation,
    expiresAt: prismaToken.expiresAt,
    revokedAt: prismaToken.revokedAt,
    replacedBy: prismaToken.replacedBy,
    userAgent: prismaToken.userAgent,
    ipAddress: prismaToken.ipAddress,
    tenantId: prismaToken.tenantId,
    createdAt: prismaToken.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Repository Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for RefreshTokenRepository using Prisma.
 */
export function RefreshTokenRepositoryImpl(): RefreshTokenRepository {
  const prisma = getPrismaClient();

  async function create(
    input: RepoCreateRefreshTokenInput,
  ): Promise<DomainResult<RefreshToken>> {
    try {
      const token = await prisma.refreshToken.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          familyId: input.familyId,
          generation: input.generation,
          expiresAt: input.expiresAt,
          tenantId: input.tenantId ?? null,
          userAgent: input.userAgent ?? null,
          ipAddress: input.ipAddress ?? null,
        },
      });

      return ok(mapToDomain(token));
    } catch (error) {
      return fail(
        technicalError(
          'REFRESH_TOKEN_CREATE_FAILED',
          'Failed to create refresh token',
          { cause: error },
        ),
      );
    }
  }

  async function findByHash(
    tokenHash: string,
  ): Promise<DomainResult<RefreshToken | null>> {
    try {
      const token = await prisma.refreshToken.findUnique({
        where: { tokenHash },
      });

      return ok(token ? mapToDomain(token) : null);
    } catch (error) {
      return fail(
        technicalError(
          'REFRESH_TOKEN_FIND_FAILED',
          'Failed to find refresh token by hash',
          { cause: error },
        ),
      );
    }
  }

  async function findById(
    tokenId: string,
  ): Promise<DomainResult<RefreshToken | null>> {
    try {
      const token = await prisma.refreshToken.findUnique({
        where: { id: tokenId },
      });

      return ok(token ? mapToDomain(token) : null);
    } catch (error) {
      return fail(
        technicalError(
          'REFRESH_TOKEN_FIND_FAILED',
          'Failed to find refresh token by ID',
          { cause: error },
        ),
      );
    }
  }

  async function findByFamily(
    familyId: string,
    options?: RefreshTokenQueryOptions,
  ): Promise<DomainResult<RefreshToken[]>> {
    try {
      const whereClause: {
        familyId: string;
        revokedAt?: null | { not: null };
        expiresAt?: { gt: Date };
      } = { familyId };

      // If not including inactive, filter to only active tokens
      if (!options?.includeInactive) {
        whereClause.revokedAt = null;
        whereClause.expiresAt = { gt: new Date() };
      }

      const tokens = await prisma.refreshToken.findMany({
        where: whereClause,
        take: options?.limit,
        orderBy: { generation: 'desc' },
      });

      return ok(tokens.map(mapToDomain));
    } catch (error) {
      return fail(
        technicalError(
          'REFRESH_TOKEN_FIND_FAILED',
          'Failed to find refresh tokens by family',
          { cause: error },
        ),
      );
    }
  }

  async function findByUserId(
    userId: string,
    options?: RefreshTokenQueryOptions,
  ): Promise<DomainResult<RefreshToken[]>> {
    try {
      const whereClause: {
        userId: string;
        revokedAt?: null | { not: null };
        expiresAt?: { gt: Date };
      } = { userId };

      if (!options?.includeInactive) {
        whereClause.revokedAt = null;
        whereClause.expiresAt = { gt: new Date() };
      }

      const tokens = await prisma.refreshToken.findMany({
        where: whereClause,
        take: options?.limit,
        orderBy: { createdAt: 'desc' },
      });

      return ok(tokens.map(mapToDomain));
    } catch (error) {
      return fail(
        technicalError(
          'REFRESH_TOKEN_FIND_FAILED',
          'Failed to find refresh tokens by user ID',
          { cause: error },
        ),
      );
    }
  }

  async function findByUserAndTenant(
    userId: string,
    tenantId: string,
    options?: RefreshTokenQueryOptions,
  ): Promise<DomainResult<RefreshToken[]>> {
    try {
      const whereClause: {
        userId: string;
        tenantId: string;
        revokedAt?: null | { not: null };
        expiresAt?: { gt: Date };
      } = { userId, tenantId };

      if (!options?.includeInactive) {
        whereClause.revokedAt = null;
        whereClause.expiresAt = { gt: new Date() };
      }

      const tokens = await prisma.refreshToken.findMany({
        where: whereClause,
        take: options?.limit,
        orderBy: { createdAt: 'desc' },
      });

      return ok(tokens.map(mapToDomain));
    } catch (error) {
      return fail(
        technicalError(
          'REFRESH_TOKEN_FIND_FAILED',
          'Failed to find refresh tokens by user and tenant',
          { cause: error },
        ),
      );
    }
  }

  async function revokeById(input: RevokeTokenInput): Promise<DomainResult<void>> {
    try {
      await prisma.refreshToken.update({
        where: { id: input.tokenId },
        data: {
          revokedAt: input.revokedAt ?? new Date(),
          replacedBy: input.replacedBy ?? null,
        },
      });

      return ok(undefined);
    } catch (error) {
      return fail(
        technicalError(
          'REFRESH_TOKEN_REVOKE_FAILED',
          'Failed to revoke refresh token',
          { cause: error },
        ),
      );
    }
  }

  async function revokeByFamily(familyId: string): Promise<DomainResult<number>> {
    try {
      const result = await prisma.refreshToken.updateMany({
        where: {
          familyId,
          revokedAt: null, // Only revoke active tokens
        },
        data: {
          revokedAt: new Date(),
        },
      });

      return ok(result.count);
    } catch (error) {
      return fail(
        technicalError(
          'REFRESH_TOKEN_REVOKE_FAMILY_FAILED',
          'Failed to revoke refresh token family',
          { cause: error },
        ),
      );
    }
  }

  async function revokeByUserId(userId: string): Promise<DomainResult<number>> {
    try {
      const result = await prisma.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      return ok(result.count);
    } catch (error) {
      return fail(
        technicalError(
          'REFRESH_TOKEN_REVOKE_USER_FAILED',
          'Failed to revoke all refresh tokens for user',
          { cause: error },
        ),
      );
    }
  }

  async function revokeByUserAndTenant(
    userId: string,
    tenantId: string,
  ): Promise<DomainResult<number>> {
    try {
      const result = await prisma.refreshToken.updateMany({
        where: {
          userId,
          tenantId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      return ok(result.count);
    } catch (error) {
      return fail(
        technicalError(
          'REFRESH_TOKEN_REVOKE_TENANT_FAILED',
          'Failed to revoke refresh tokens for user in tenant',
          { cause: error },
        ),
      );
    }
  }

  async function getLatestGeneration(
    familyId: string,
  ): Promise<DomainResult<number | null>> {
    try {
      const token = await prisma.refreshToken.findFirst({
        where: { familyId },
        orderBy: { generation: 'desc' },
        select: { generation: true },
      });

      return ok(token?.generation ?? null);
    } catch (error) {
      return fail(
        technicalError(
          'REFRESH_TOKEN_GENERATION_FAILED',
          'Failed to get latest generation for family',
          { cause: error },
        ),
      );
    }
  }

  async function countActiveByUserId(userId: string): Promise<DomainResult<number>> {
    try {
      const count = await prisma.refreshToken.count({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      return ok(count);
    } catch (error) {
      return fail(
        technicalError(
          'REFRESH_TOKEN_COUNT_FAILED',
          'Failed to count active refresh tokens',
          { cause: error },
        ),
      );
    }
  }

  async function deleteExpiredBefore(date: Date): Promise<DomainResult<number>> {
    try {
      // Delete tokens that are:
      // - Expired before the given date
      // - Already revoked
      const result = await prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: date } },
            { revokedAt: { not: null, lt: date } },
          ],
        },
      });

      return ok(result.count);
    } catch (error) {
      return fail(
        technicalError(
          'REFRESH_TOKEN_CLEANUP_FAILED',
          'Failed to delete expired refresh tokens',
          { cause: error },
        ),
      );
    }
  }

  return {
    create,
    findByHash,
    findById,
    findByFamily,
    findByUserId,
    findByUserAndTenant,
    revokeById,
    revokeByFamily,
    revokeByUserId,
    revokeByUserAndTenant,
    getLatestGeneration,
    countActiveByUserId,
    deleteExpiredBefore,
  };
}
