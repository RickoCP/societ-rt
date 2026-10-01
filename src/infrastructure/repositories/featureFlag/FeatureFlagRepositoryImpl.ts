/**
 * FeatureFlagRepositoryImpl — Infrastructure implementation of FeatureFlagRepository.
 *
 * Uses Prisma for persistence and CacheProtocol (Redis) for caching
 * with a 10-minute TTL on feature flag lookups.
 *
 * @see Requirements 19.1, 19.2, 19.3, 19.4, 19.5
 */

import type { PrismaClient } from '@prisma/client';
import type { CacheProtocol } from '@core/protocols';
import type { DomainResult } from '@core/utils';
import { ok, fail, technicalError } from '@core/utils';
import type { FeatureFlagRepository } from '@core/domains/featureFlag/repositories/FeatureFlagRepository';
import type {
  FeatureFlag,
  FeatureFlagOverride,
} from '@core/domains/featureFlag/entities';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_SECONDS = 600; // 10 minutes

// ---------------------------------------------------------------------------
// Prisma → Domain mappers
// ---------------------------------------------------------------------------

interface PrismaFeatureFlag {
  id: string;
  featureName: string;
  planId: string;
  enabled: boolean;
}

function mapPrismaFlagToDomain(p: PrismaFeatureFlag): FeatureFlag {
  return {
    id: p.id,
    featureName: p.featureName,
    planId: p.planId,
    enabled: p.enabled,
  };
}

interface PrismaOverride {
  id: string;
  tenantId: string;
  featureName: string;
  enabled: boolean;
  overriddenBy: string;
  createdAt: Date;
}

function mapPrismaOverrideToDomain(p: PrismaOverride): FeatureFlagOverride {
  return {
    id: p.id,
    tenantId: p.tenantId,
    featureName: p.featureName,
    enabled: p.enabled,
    overriddenBy: p.overriddenBy,
    createdAt: p.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const FeatureFlagRepositoryImpl = ({
  prismaClient,
  cacheProtocol,
}: {
  prismaClient: PrismaClient;
  cacheProtocol: CacheProtocol;
}): FeatureFlagRepository => {
  return {
    async isEnabled(tenantId: string, featureName: string): Promise<DomainResult<boolean>> {
      try {
        const cacheKey = `feature_flags:${tenantId}:${featureName}`;
        const cached = await cacheProtocol.get<boolean>(cacheKey);
        if (cached !== null) {
          return ok(cached);
        }

        // Check for tenant-specific override
        const override = await prismaClient.featureFlagOverride.findUnique({
          where: { tenantId_featureName: { tenantId, featureName } },
        });
        if (override) {
          await cacheProtocol.set(cacheKey, override.enabled, CACHE_TTL_SECONDS);
          return ok(override.enabled);
        }

        // Check plan-level flag
        const tenant = await prismaClient.tenant.findUnique({
          where: { id: tenantId },
          select: { subscriptionPlanId: true },
        });
        if (!tenant) {
          await cacheProtocol.set(cacheKey, false, CACHE_TTL_SECONDS);
          return ok(false);
        }

        const flag = await prismaClient.featureFlag.findFirst({
          where: { featureName, planId: tenant.subscriptionPlanId },
        });
        const enabled = flag?.enabled ?? false;
        await cacheProtocol.set(cacheKey, enabled, CACHE_TTL_SECONDS);
        return ok(enabled);
      } catch (error) {
        return fail(technicalError('FEATURE_FLAG_CHECK_FAILED', 'Failed to check feature flag status', { cause: error }));
      }
    },

    async getByTenant(tenantId: string): Promise<DomainResult<FeatureFlag[]>> {
      try {
        const cacheKey = `feature_flags:${tenantId}:all`;
        const cached = await cacheProtocol.get<FeatureFlag[]>(cacheKey);
        if (cached !== null) {
          return ok(cached);
        }

        const tenant = await prismaClient.tenant.findUnique({
          where: { id: tenantId },
          select: { subscriptionPlanId: true },
        });
        if (!tenant) {
          return ok([]);
        }

        const flags = await prismaClient.featureFlag.findMany({
          where: { planId: tenant.subscriptionPlanId },
        });
        const domainFlags = flags.map((f) => mapPrismaFlagToDomain(f as unknown as PrismaFeatureFlag));
        await cacheProtocol.set(cacheKey, domainFlags, CACHE_TTL_SECONDS);
        return ok(domainFlags);
      } catch (error) {
        return fail(technicalError('FEATURE_FLAGS_FETCH_FAILED', 'Failed to fetch feature flags for tenant', { cause: error }));
      }
    },

    async createOverride(
      tenantId: string,
      featureName: string,
      enabled: boolean,
      overriddenBy: string,
    ): Promise<DomainResult<FeatureFlagOverride>> {
      try {
        const record = await prismaClient.featureFlagOverride.upsert({
          where: { tenantId_featureName: { tenantId, featureName } },
          update: { enabled, overriddenBy },
          create: { tenantId, featureName, enabled, overriddenBy },
        });

        // Invalidate cache
        await cacheProtocol.delete(`feature_flags:${tenantId}:${featureName}`);
        await cacheProtocol.delete(`feature_flags:${tenantId}:all`);

        return ok(mapPrismaOverrideToDomain(record as unknown as PrismaOverride));
      } catch (error) {
        return fail(technicalError('FEATURE_FLAG_OVERRIDE_FAILED', 'Failed to create feature flag override', { cause: error }));
      }
    },
  };
};
