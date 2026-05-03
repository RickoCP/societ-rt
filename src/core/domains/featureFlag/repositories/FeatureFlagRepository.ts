/**
 * FeatureFlagRepository — Core repository interface for feature flag operations.
 *
 * All methods return DomainResult to keep success/error paths explicit.
 * Infrastructure layer provides the concrete implementation with Redis caching.
 *
 * @see Requirements 19.1, 19.2, 19.3, 19.4, 19.5
 */

import type { DomainResult } from '@core/utils';
import type { FeatureFlag, FeatureFlagOverride } from '../entities';

export interface FeatureFlagRepository {
  /** Check if a feature is enabled for a specific tenant. */
  isEnabled(
    tenantId: string,
    featureName: string,
  ): Promise<DomainResult<boolean>>;

  /** Get all feature flags for a tenant (plan flags + overrides). */
  getByTenant(
    tenantId: string,
  ): Promise<DomainResult<FeatureFlag[]>>;

  /** Create a per-tenant override for a feature flag. */
  createOverride(
    tenantId: string,
    featureName: string,
    enabled: boolean,
    overriddenBy: string,
  ): Promise<DomainResult<FeatureFlagOverride>>;
}
