/**
 * AuthorizationWriteCompatibilityService — Dual-write service for authorization-affecting operations.
 *
 * This service ensures that all authorization-affecting writes synchronize
 * both legacy (User.role/tenantId) and new (Membership) state atomically.
 *
 * **PRE-CUTOVER REQUIREMENT (TPR-05-FINAL):**
 * All authorization-affecting writes MUST use this service (or equivalent
 * compatibility mechanism) to ensure:
 * - Atomic updates (transaction consistency)
 * - Membership synchronized before cutover
 * - Quarantine exclusion (PNA-01..PNA-05)
 * - No partial authorization state
 *
 * **TRANSACTION CONSISTENCY:**
 * - All dual-writes execute in a single database transaction
 * - Failure rolls back the complete authorization-affecting change
 * - No partial state allowed (either both succeed or both fail)
 *
 * **QUARANTINE PROTECTION:**
 * - PNA-01..PNA-05 remain excluded from Membership creation
 * - No compatibility mechanism creates Membership for quarantined identities
 *
 * @see Task 24: Pre-Cutover Authorization Write Compatibility
 * @see Requirements 8, 9, 45
 */

import type { PrismaClient } from '@/generated/prisma/client';
import type { MembershipRole as PrismaMembershipRole } from '@/generated/prisma/client';
import crypto from 'crypto';
import type {
  IAuthorizationWriteCompatibilityService,
  DualWriteResult,
  DualWriteContext,
  CreateUserWithMembershipParams,
  UpdateRoleWithMembershipParams,
  UserMembershipPair,
} from './types';
import { AuthWriteCategory } from './types';
import type { IQuarantineManifestService } from '@infrastructure/quarantine';
import { mapLegacyRole } from '@core/domains/membership/types';
import type { UserRole } from '@core/protocols';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Error codes for dual-write operations.
 */
export const DualWriteErrorCodes = {
  QUARANTINE_BLOCKED: 'DUAL_WRITE_QUARANTINE_BLOCKED',
  TRANSACTION_FAILED: 'DUAL_WRITE_TRANSACTION_FAILED',
  USER_NOT_FOUND: 'DUAL_WRITE_USER_NOT_FOUND',
  MEMBERSHIP_NOT_FOUND: 'DUAL_WRITE_MEMBERSHIP_NOT_FOUND',
  INVALID_ROLE_MAPPING: 'DUAL_WRITE_INVALID_ROLE_MAPPING',
  ATOMIC_FAILURE: 'DUAL_WRITE_ATOMIC_FAILURE',
} as const;

// ---------------------------------------------------------------------------
// Logging Helper
// ---------------------------------------------------------------------------

/**
 * Log a dual-write operation for audit purposes.
 */
function logDualWriteOperation(
  context: DualWriteContext,
  success: boolean,
  details?: Record<string, unknown>,
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'DUAL_WRITE_OPERATION',
    correlationId: context.correlationId,
    operation: context.operation,
    category: context.category,
    actorUserId: context.actorUserId,
    tenantId: context.tenantId,
    targetUserId: context.targetUserId,
    success,
    ...details,
  };

  if (success) {
    console.info('[DualWrite]', JSON.stringify(logEntry));
  } else {
    console.error('[DualWrite] FAILED', JSON.stringify(logEntry));
  }
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an AuthorizationWriteCompatibilityService instance.
 *
 * This service wraps authorization-affecting write operations to ensure
 * atomic dual-writes between legacy User fields and new Membership records.
 *
 * @param prismaClient - The Prisma client instance for database operations
 * @param quarantineService - The quarantine manifest service for PNA exclusion
 * @returns An implementation of IAuthorizationWriteCompatibilityService
 *
 * @example
 * ```typescript
 * const compatibilityService = createAuthorizationWriteCompatibilityService({
 *   prismaClient,
 *   quarantineService,
 * });
 *
 * // Create user with synchronized Membership
 * const result = await compatibilityService.createUserWithMembership({
 *   tenantId: 'tenant-123',
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   passwordHash: hashedPassword,
 *   role: 'Warga',
 *   orgUnitId: 'orgunit-456',
 *   actorUserId: 'admin-789',
 *   correlationId: crypto.randomUUID(),
 * });
 * ```
 */
export const createAuthorizationWriteCompatibilityService = ({
  prismaClient,
  quarantineService,
}: {
  prismaClient: PrismaClient;
  quarantineService: IQuarantineManifestService;
}): IAuthorizationWriteCompatibilityService => {
  return {
    /**
     * Create a user with synchronized Membership (dual-write).
     *
     * This method creates both a User record (with legacy role/tenantId) and
     * a corresponding Membership record in a single atomic transaction.
     *
     * **QUARANTINE PROTECTION:**
     * This method does NOT check quarantine because it creates NEW users.
     * Quarantine applies to EXISTING users only (PNA-01..PNA-05).
     *
     * **TRANSACTION GUARANTEE:**
     * If either User or Membership creation fails, the entire transaction
     * is rolled back. No partial authorization state is possible.
     */
    async createUserWithMembership(
      params: CreateUserWithMembershipParams,
    ): Promise<DualWriteResult<UserMembershipPair>> {
      const {
        tenantId,
        name,
        email,
        passwordHash,
        role,
        orgUnitId,
        actorUserId,
        correlationId,
      } = params;

      const context: DualWriteContext = {
        operation: 'create',
        category: AuthWriteCategory.USER_CREATION,
        actorUserId,
        tenantId,
        correlationId,
      };

      try {
        // Map legacy role to MembershipRole
        const membershipRole = mapLegacyRole(role as UserRole);
        if (!membershipRole) {
          logDualWriteOperation(context, false, {
            error: 'Invalid role mapping',
            legacyRole: role,
          });
          return {
            success: false,
            error: {
              code: DualWriteErrorCodes.INVALID_ROLE_MAPPING,
              message: `Cannot map legacy role '${role}' to MembershipRole`,
            },
            rolledBack: false,
            correlationId,
          };
        }

        // Execute atomic transaction
        const result = await prismaClient.$transaction(async (tx) => {
          // Step 1: Create User with legacy fields
          const user = await tx.user.create({
            data: {
              tenantId,
              name,
              email,
              passwordHash,
              role: role as Parameters<typeof tx.user.create>[0]['data']['role'],
              status: 'active',
            },
          });

          // Step 2: Create corresponding Membership
          const membership = await tx.membership.create({
            data: {
              userId: user.id,
              tenantId,
              orgUnitId,
              role: membershipRole as unknown as PrismaMembershipRole,
              status: 'ACTIVE',
            },
          });

          return {
            userId: user.id,
            membershipId: membership.id,
          };
        });

        logDualWriteOperation(context, true, {
          userId: result.userId,
          membershipId: result.membershipId,
          role,
          membershipRole,
        });

        return {
          success: true,
          data: result,
          rolledBack: false,
          correlationId,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        logDualWriteOperation(context, false, {
          error: errorMessage,
        });

        return {
          success: false,
          error: {
            code: DualWriteErrorCodes.TRANSACTION_FAILED,
            message: `Failed to create user with membership: ${errorMessage}`,
            cause: error,
          },
          rolledBack: true,
          correlationId,
        };
      }
    },

    /**
     * Update a user's role with synchronized Membership (dual-write).
     *
     * This method updates both User.role and Membership.role in a single
     * atomic transaction.
     *
     * **QUARANTINE PROTECTION:**
     * Quarantined users (PNA-01..PNA-05) are blocked from role updates
     * to prevent creating Membership for anomaly users.
     *
     * **TRANSACTION GUARANTEE:**
     * If either User or Membership update fails, the entire transaction
     * is rolled back. No partial authorization state is possible.
     */
    async updateRoleWithMembership(
      params: UpdateRoleWithMembershipParams,
    ): Promise<DualWriteResult<void>> {
      const {
        tenantId,
        targetUserId,
        newRole,
        newOrgUnitId,
        actorUserId,
        correlationId,
      } = params;

      const context: DualWriteContext = {
        operation: 'update',
        category: AuthWriteCategory.ROLE_ASSIGNMENT,
        actorUserId,
        tenantId,
        targetUserId,
        correlationId,
      };

      // QUARANTINE CHECK: Block updates for quarantined users
      if (quarantineService.isQuarantined(targetUserId)) {
        logDualWriteOperation(context, false, {
          error: 'Quarantined user blocked',
          reason: 'INV-QUARANTINE-001',
        });

        return {
          success: false,
          error: {
            code: DualWriteErrorCodes.QUARANTINE_BLOCKED,
            message:
              'Cannot update role for quarantined user (PNA-01..PNA-05). ' +
              'Quarantined users must go through explicit remediation workflow.',
          },
          rolledBack: false,
          correlationId,
        };
      }

      try {
        // Map legacy role to MembershipRole
        const membershipRole = mapLegacyRole(newRole as UserRole);
        if (!membershipRole) {
          logDualWriteOperation(context, false, {
            error: 'Invalid role mapping',
            legacyRole: newRole,
          });
          return {
            success: false,
            error: {
              code: DualWriteErrorCodes.INVALID_ROLE_MAPPING,
              message: `Cannot map legacy role '${newRole}' to MembershipRole`,
            },
            rolledBack: false,
            correlationId,
          };
        }

        // Execute atomic transaction
        await prismaClient.$transaction(async (tx) => {
          // Step 1: Verify user exists
          const user = await tx.user.findFirst({
            where: {
              id: targetUserId,
              tenantId,
              deletedAt: null,
            },
          });

          if (!user) {
            throw new Error(`User ${targetUserId} not found in tenant ${tenantId}`);
          }

          // Step 2: Update User.role (legacy)
          await tx.user.update({
            where: { id: targetUserId },
            data: {
              role: newRole as Parameters<typeof tx.user.update>[0]['data']['role'],
            },
          });

          // Step 3: Find existing Membership
          const existingMembership = await tx.membership.findFirst({
            where: {
              userId: targetUserId,
              tenantId,
              status: 'ACTIVE',
            },
          });

          if (existingMembership) {
            // Step 4a: Update existing Membership
            const updateData: {
              role: PrismaMembershipRole;
              orgUnitId?: string | null;
            } = {
              role: membershipRole as unknown as PrismaMembershipRole,
            };

            // Update orgUnitId if provided
            if (newOrgUnitId !== undefined) {
              updateData.orgUnitId = newOrgUnitId;
            }

            await tx.membership.update({
              where: { id: existingMembership.id },
              data: updateData,
            });
          } else {
            // Step 4b: Create new Membership if none exists
            // (handles legacy users without Membership)
            await tx.membership.create({
              data: {
                userId: targetUserId,
                tenantId,
                orgUnitId: newOrgUnitId ?? null,
                role: membershipRole as unknown as PrismaMembershipRole,
                status: 'ACTIVE',
              },
            });
          }
        });

        logDualWriteOperation(context, true, {
          newRole,
          membershipRole,
          newOrgUnitId,
        });

        return {
          success: true,
          rolledBack: false,
          correlationId,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        logDualWriteOperation(context, false, {
          error: errorMessage,
        });

        return {
          success: false,
          error: {
            code: DualWriteErrorCodes.TRANSACTION_FAILED,
            message: `Failed to update role with membership: ${errorMessage}`,
            cause: error,
          },
          rolledBack: true,
          correlationId,
        };
      }
    },

    /**
     * Check if a user is quarantined (PNA-01..PNA-05).
     *
     * Delegates to the injected quarantine service.
     */
    isQuarantined(userId: string): boolean {
      return quarantineService.isQuarantined(userId);
    },
  };
};

// ---------------------------------------------------------------------------
// Convenience Exports
// ---------------------------------------------------------------------------

/**
 * Generate a correlation ID for tracking dual-write operations.
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}
