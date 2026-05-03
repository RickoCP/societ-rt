/**
 * FeatureFlag — Domain entities for feature flag management.
 *
 * FeatureFlag maps a feature to a subscription plan with an enabled/disabled state.
 * FeatureFlagOverride allows per-tenant overrides of feature flags.
 *
 * Plain TypeScript interfaces — no classes, no decorators, no external deps.
 *
 * @see Requirements 19.1, 19.2, 19.3, 19.4, 19.5
 */

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface FeatureFlag {
  readonly id: string;
  readonly featureName: string;
  readonly planId: string;
  readonly enabled: boolean;
}

export interface FeatureFlagOverride {
  readonly id: string;
  readonly tenantId: string;
  readonly featureName: string;
  readonly enabled: boolean;
  readonly overriddenBy: string;
  readonly createdAt: Date;
}
