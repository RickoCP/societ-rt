/**
 * ContextSwitchRepositoryImpl — Infrastructure implementation of ContextSwitchRepository.
 *
 * Handles token issuance and membership fetching for context switching operations.
 * Uses the existing ContextSwitchService for validation and jwtService for token generation.
 *
 * This repository:
 * - Issues new JWT tokens with updated activeTenantId and activeOrgUnitId claims
 * - Fetches user memberships with tenant/orgUnit names for the switcher UI
 * - Validates membership existence for context switch authorization
 *
 * @see Requirements 1.5-1.7 (Tenant Switcher context switch flow)
 * @see Design Components > 1. Tenant Switcher Component
 */

import type { PrismaClient } from '@prisma/client';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError, businessError } from '@core/utils';
import type {
  ContextSwitchRepository,
  ContextSwitchInput,
  ContextSwitchOutput,
  MembershipSummary,
} from '@core/domains/auth/repositories/ContextSwitchRepository';
import type { IContextSwitchService } from '@core/domains/context';
import type { IJWTService } from '@infrastructure/utils/jwtService';
import type { MembershipRole } from '@core/domains/membership';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Dependencies for ContextSwitchRepositoryImpl.
 */
export interface ContextSwitchRepositoryDependencies {
  /** Prisma client for database queries. */
  readonly prismaClient: PrismaClient;

  /** Context switch service for validation. */
  readonly contextSwitchService: IContextSwitchService;

  /** JWT service for token generation. */
  readonly jwtService: IJWTService;
}

/**
 * Factory function to create a ContextSwitchRepository instance.
 *
 * @param deps - The repository dependencies
 * @returns An implementation of ContextSwitchRepository
 *
 * @example
 * ```typescript
 * // DI Registration
 * container.register({
 *   contextSwitchRepository: asFunction(ContextSwitchRepositoryImpl).singleton(),
 * });
 * ```
 */
export const ContextSwitchRepositoryImpl = ({
  prismaClient,
  contextSwitchService,
  jwtService,
}: ContextSwitchRepositoryDependencies): ContextSwitchRepository => {
  return {
    // -----------------------------------------------------------------------
    // switchContext
    // -----------------------------------------------------------------------
    async switchContext(
      input: ContextSwitchInput,
    ): Promise<DomainResult<ContextSwitchOutput>> {
      try {
        // 1. Validate the context switch via the domain service
        const validationResult = await contextSwitchService.switchContext({
          userId: input.userId,
          targetTenantId: input.targetTenantId,
          targetOrgUnitId: input.targetOrgUnitId,
        });

        if (!validationResult.success) {
          return fail(validationResult.error);
        }

        const { newContext } = validationResult.data;

        // 2. Get the user's token version for forced invalidation support
        const user = await prismaClient.user.findUnique({
          where: { id: input.userId },
          select: { tokenVersion: true },
        });

        if (!user) {
          return fail(
            technicalError(
              'CONTEXT_SWITCH_USER_NOT_FOUND',
              'User not found for token generation',
            ),
          );
        }

        // 3. Issue a new access token with updated context claims
        const tokenResult = jwtService.createAccessToken({
          userId: input.userId,
          activeTenantId: input.targetTenantId,
          activeOrgUnitId: input.targetOrgUnitId,
          tokenVersion: user.tokenVersion,
        });

        if (!tokenResult.success) {
          return fail(tokenResult.error);
        }

        const { token, expiresAt } = tokenResult.data;

        // 4. Fetch tenant and orgUnit names for the response
        const tenant = await prismaClient.tenant.findUnique({
          where: { id: input.targetTenantId },
          select: { name: true },
        });

        let orgUnitName: string | null = null;
        if (input.targetOrgUnitId) {
          const orgUnit = await prismaClient.orgUnit.findUnique({
            where: { id: input.targetOrgUnitId },
            select: { name: true },
          });
          orgUnitName = orgUnit?.name ?? null;
        }

        return ok({
          accessToken: token,
          expiresAt: new Date(expiresAt * 1000),
          context: {
            tenantId: input.targetTenantId,
            tenantName: tenant?.name ?? 'Unknown',
            orgUnitId: input.targetOrgUnitId,
            orgUnitName,
            role: newContext.role,
          },
        });
      } catch (error) {
        return fail(
          technicalError(
            'CONTEXT_SWITCH_FAILED',
            'Failed to process context switch',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // validateMembership
    // -----------------------------------------------------------------------
    async validateMembership(
      userId: string,
      tenantId: string,
      orgUnitId: string | null,
    ): Promise<DomainResult<MembershipSummary>> {
      try {
        // 1. Query the membership with tenant and orgUnit info
        const membership = await prismaClient.membership.findFirst({
          where: {
            userId,
            tenantId,
            orgUnitId: orgUnitId ?? null,
            status: 'ACTIVE',
          },
          include: {
            tenant: {
              select: { name: true, logoUrl: true },
            },
            orgUnit: {
              select: { name: true },
            },
          },
        });

        if (!membership) {
          return fail(
            businessError(
              'CONTEXT_SWITCH_NO_MEMBERSHIP',
              'User does not have an active membership in the target context',
            ),
          );
        }

        return ok({
          membershipId: membership.id,
          tenantId: membership.tenantId,
          tenantName: membership.tenant.name,
          tenantLogoUrl: membership.tenant.logoUrl,
          orgUnitId: membership.orgUnitId,
          orgUnitName: membership.orgUnit?.name ?? null,
          role: membership.role as MembershipRole,
          status: membership.status as 'ACTIVE',
        });
      } catch (error) {
        return fail(
          technicalError(
            'CONTEXT_SWITCH_VALIDATE_FAILED',
            'Failed to validate membership',
            { cause: error },
          ),
        );
      }
    },

    // -----------------------------------------------------------------------
    // getMemberships
    // -----------------------------------------------------------------------
    async getMemberships(
      userId: string,
    ): Promise<DomainResult<MembershipSummary[]>> {
      try {
        // 1. Get available contexts using the domain service
        const contextsResult =
          await contextSwitchService.getAvailableContexts(userId);

        if (!contextsResult.success) {
          return fail(contextsResult.error);
        }

        const { tenants } = contextsResult.data;

        // 2. Fetch additional data (logos) for tenants
        const tenantIds = tenants.map(t => t.tenantId);
        const tenantsWithLogos = await prismaClient.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, logoUrl: true },
        });

        const logoMap = new Map<string, string | null>();
        for (const t of tenantsWithLogos) {
          logoMap.set(t.id, t.logoUrl);
        }

        // 3. Transform to MembershipSummary array
        const summaries: MembershipSummary[] = [];

        for (const tenant of tenants) {
          for (const membership of tenant.memberships) {
            summaries.push({
              membershipId: membership.membershipId,
              tenantId: tenant.tenantId,
              tenantName: tenant.tenantName,
              tenantLogoUrl: logoMap.get(tenant.tenantId) ?? null,
              orgUnitId: membership.orgUnitId,
              orgUnitName: membership.orgUnitName,
              role: membership.role,
              status: 'ACTIVE', // getAvailableContexts only returns ACTIVE memberships
            });
          }
        }

        return ok(summaries);
      } catch (error) {
        return fail(
          technicalError(
            'CONTEXT_SWITCH_GET_MEMBERSHIPS_FAILED',
            'Failed to fetch user memberships',
            { cause: error },
          ),
        );
      }
    },
  };
};
