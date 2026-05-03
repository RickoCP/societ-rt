/**
 * RbacRepositoryImpl — Infrastructure implementation of RbacRepository.
 *
 * Uses Prisma via TenantScopedRepository for tenant-isolated queries.
 * All methods return DomainResult<T> and wrap Prisma errors in
 * technical/unexpected AppError types.
 *
 * @see Requirements 4.1, 4.2, 4.3
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { UserRole } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, notFoundError } from '@core/utils';
import type { RbacRepository } from '@core/domains/rbac/repositories/RbacRepository';
import {
  createTenantScopedRepository,
  type TenantScopedRepository,
} from '@infrastructure/repositories/TenantScopedRepository';

// ---------------------------------------------------------------------------
// Prisma user shape (minimal — only fields we need)
// ---------------------------------------------------------------------------

interface PrismaUserForRbac {
  id: string;
  tenantId: string;
  role: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const RbacRepositoryImpl = ({
  prismaClient,
}: {
  prismaClient: PrismaClient;
}): RbacRepository => {
  const userRepo: TenantScopedRepository<PrismaUserForRbac> =
    createTenantScopedRepository(
      prismaClient.user as unknown as Parameters<
        typeof createTenantScopedRepository
      >[0],
    );

  return {
    // -----------------------------------------------------------------------
    // assignRole
    // -----------------------------------------------------------------------
    async assignRole(
      tenantId: string,
      targetUserId: string,
      newRole: UserRole,
    ): Promise<DomainResult<void>> {
      try {
        await userRepo.update(tenantId, {
          where: { id: targetUserId },
          data: { role: newRole },
        });

        return ok(undefined);
      } catch (error) {
        return fail(
          technicalError(
            'RBAC_ASSIGN_ROLE_FAILED',
            'Failed to assign role to user',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getUserRole
    // -----------------------------------------------------------------------
    async getUserRole(
      tenantId: string,
      userId: string,
    ): Promise<DomainResult<UserRole>> {
      try {
        const user = await userRepo.findFirst(tenantId, {
          where: { id: userId, deletedAt: null },
        });

        if (!user) {
          return fail(
            notFoundError(
              'RBAC_USER_NOT_FOUND',
              `User ${userId} not found in tenant`,
            ),
          );
        }

        return ok(user.role as UserRole);
      } catch (error) {
        return fail(
          technicalError(
            'RBAC_GET_USER_ROLE_FAILED',
            'Failed to retrieve user role',
            { cause: error },
          ),
        );
      }
    },
  };
};
