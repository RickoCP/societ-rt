/**
 * Shadow Mode Feature Flag Service
 *
 * Controls shadow authorization per route (FASE 1.9 - Task 22).
 * Provides global enable/disable, per-route overrides, and monitoring dashboard data.
 *
 * **Design Specification:**
 * - Global shadow mode enable/disable
 * - Per-route shadow mode override
 * - Environment-based default configuration
 * - Monitoring dashboard for mismatch rate visualization
 * - Integration with ShadowAuthorizationService
 *
 * @see Requirements 7 (AC 5) - Per-route opt-in for shadow validation
 * @see Design Shadow Authorization Validation section
 */

import type {
  ShadowModeGlobalConfig,
  RouteShadowModeConfig,
  ShadowModeConfig,
  SetRouteShadowModeInput,
  ShadowModeEnvironmentConfig,
  RouteMismatchSummary,
  ShadowModeDashboardData,
  DashboardDataOptions,
  ShadowModeAlert,
  ShadowModeAlertConfig,
  MismatchRateDataPoint,
  RouteInShadowModeResult,
  ShadowModeFeatureFlagSummary,
} from '../types/ShadowModeFeatureFlag';
import {
  DEFAULT_SHADOW_MODE_ENV_CONFIG,
  DEFAULT_DASHBOARD_OPTIONS,
} from '../types/ShadowModeFeatureFlag';
import {
  DEFAULT_SHADOW_THRESHOLDS,
  type ShadowAuthorizationThresholds,
  type ShadowAuthorizationMetrics,
} from '../types';

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * Shadow Mode Feature Flag Service interface.
 *
 * Provides methods for controlling shadow authorization per route.
 */
export interface IShadowModeFeatureFlagService {
  /**
   * Check if global shadow mode is enabled.
   *
   * @returns true if global shadow mode is enabled
   */
  isGlobalShadowModeEnabled(): boolean;

  /**
   * Enable or disable global shadow mode.
   *
   * @param enabled - Whether to enable or disable
   * @param updatedBy - Who is making this change (for audit)
   */
  setGlobalShadowMode(enabled: boolean, updatedBy?: string): void;

  /**
   * Check if a specific route is in shadow mode.
   *
   * Considers global setting, route override, and default behavior.
   *
   * @param routeId - Route identifier
   * @returns Detailed result of whether route is in shadow mode
   */
  isRouteInShadowMode(routeId: string): RouteInShadowModeResult;

  /**
   * Configure shadow mode for a specific route.
   *
   * @param input - Route shadow mode configuration input
   */
  setRouteShadowMode(input: SetRouteShadowModeInput): void;

  /**
   * Remove route-specific shadow mode configuration.
   *
   * Route will revert to default behavior.
   *
   * @param routeId - Route identifier
   */
  removeRouteShadowMode(routeId: string): void;

  /**
   * Get all route-level overrides.
   *
   * @returns Map of route ID to route configuration
   */
  getRouteOverrides(): ReadonlyMap<string, RouteShadowModeConfig>;

  /**
   * Get complete shadow mode configuration.
   *
   * @returns Complete configuration including global and all route overrides
   */
  getConfig(): ShadowModeConfig;

  /**
   * Get feature flag summary.
   *
   * @returns Summary of shadow mode feature flag state
   */
  getSummary(): ShadowModeFeatureFlagSummary;

  /**
   * Get effective thresholds for a route.
   *
   * Considers route override and global defaults.
   *
   * @param routeId - Route identifier
   * @returns Effective warning and cutover thresholds
   */
  getEffectiveThresholds(routeId: string): ShadowAuthorizationThresholds;

  /**
   * Generate dashboard data for monitoring.
   *
   * @param metrics - Current shadow authorization metrics
   * @param options - Dashboard generation options
   * @returns Dashboard data for visualization
   */
  generateDashboardData(
    metrics: ShadowAuthorizationMetrics,
    options?: DashboardDataOptions,
  ): ShadowModeDashboardData;

  /**
   * Configure an alert.
   *
   * @param config - Alert configuration
   */
  configureAlert(config: ShadowModeAlertConfig): void;

  /**
   * Remove an alert configuration.
   *
   * @param alertId - Alert ID to remove
   */
  removeAlert(alertId: string): void;

  /**
   * Get all alert configurations.
   *
   * @returns Array of alert configurations
   */
  getAlertConfigs(): readonly ShadowModeAlertConfig[];

  /**
   * Check alerts against current metrics.
   *
   * @param metrics - Current shadow authorization metrics
   * @returns Array of triggered alerts
   */
  checkAlerts(metrics: ShadowAuthorizationMetrics): readonly ShadowModeAlert[];

  /**
   * Load configuration from environment.
   *
   * @param envConfig - Environment configuration (or auto-detect from process.env)
   */
  loadFromEnvironment(envConfig?: ShadowModeEnvironmentConfig): void;

  /**
   * Reset to default configuration.
   */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Internal State Types
// ---------------------------------------------------------------------------

interface InternalState {
  globalConfig: ShadowModeGlobalConfig;
  routeOverrides: Map<string, RouteShadowModeConfig>;
  defaultBehavior: 'follow_global' | 'disabled' | 'enabled';
  alertConfigs: Map<string, ShadowModeAlertConfig>;
  environmentSource: boolean;
  thresholds: ShadowAuthorizationThresholds;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a Shadow Mode Feature Flag Service.
 *
 * Follows Clean Architecture DI pattern — dependencies are injected.
 *
 * @param thresholds - Default threshold configuration (optional)
 * @param envConfig - Environment configuration (optional, auto-detect if not provided)
 *
 * @returns Shadow Mode Feature Flag Service implementation
 *
 * @example
 * ```typescript
 * // DI Registration
 * container.register({
 *   shadowModeFeatureFlagService: asFunction(ShadowModeFeatureFlagServiceImpl).singleton(),
 * });
 *
 * // Usage in middleware
 * const routeStatus = featureFlagService.isRouteInShadowMode('get-resident');
 * if (routeStatus.isActive) {
 *   // Execute shadow authorization
 * }
 * ```
 */
export const ShadowModeFeatureFlagServiceImpl = ({
  thresholds = DEFAULT_SHADOW_THRESHOLDS,
  envConfig,
}: {
  thresholds?: ShadowAuthorizationThresholds;
  envConfig?: ShadowModeEnvironmentConfig;
} = {}): IShadowModeFeatureFlagService => {
  // Internal state
  const state: InternalState = {
    globalConfig: {
      enabled: false,
      updatedAt: new Date(),
      environmentDefault: true,
    },
    routeOverrides: new Map(),
    defaultBehavior: 'follow_global',
    alertConfigs: new Map(),
    environmentSource: false,
    thresholds: { ...thresholds },
  };

  // Initialize from environment if provided
  if (envConfig) {
    loadFromEnvConfig(envConfig);
  }

  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Load configuration from environment config object.
   */
  function loadFromEnvConfig(config: ShadowModeEnvironmentConfig): void {
    state.globalConfig = {
      enabled: config.globalEnabled,
      updatedAt: new Date(),
      environmentDefault: true,
    };
    state.defaultBehavior = config.defaultBehavior;
    state.environmentSource = true;

    // Set up routes enabled by default
    const now = new Date();
    for (const routeId of config.routesEnabled) {
      if (routeId.trim()) {
        state.routeOverrides.set(routeId.trim(), {
          routeId: routeId.trim(),
          enabled: true,
          createdAt: now,
          updatedAt: now,
          reason: 'Environment default',
        });
      }
    }

    // Set up routes disabled by default
    for (const routeId of config.routesDisabled) {
      if (routeId.trim()) {
        state.routeOverrides.set(routeId.trim(), {
          routeId: routeId.trim(),
          enabled: false,
          createdAt: now,
          updatedAt: now,
          reason: 'Environment default',
        });
      }
    }
  }

  /**
   * Parse environment variables into config.
   */
  function parseEnvironmentVariables(): ShadowModeEnvironmentConfig {
    const envEnabled = process.env.SHADOW_MODE_ENABLED;
    const envDefaultBehavior = process.env.SHADOW_MODE_DEFAULT_BEHAVIOR;
    const envRoutesEnabled = process.env.SHADOW_MODE_ROUTES_ENABLED;
    const envRoutesDisabled = process.env.SHADOW_MODE_ROUTES_DISABLED;

    const globalEnabled =
      envEnabled?.toLowerCase() === 'true' ||
      envEnabled === '1';

    let defaultBehavior: 'follow_global' | 'disabled' | 'enabled' = 'follow_global';
    if (envDefaultBehavior === 'disabled' || envDefaultBehavior === 'enabled') {
      defaultBehavior = envDefaultBehavior;
    }

    const routesEnabled = envRoutesEnabled
      ? envRoutesEnabled.split(',').map((r) => r.trim()).filter(Boolean)
      : [];

    const routesDisabled = envRoutesDisabled
      ? envRoutesDisabled.split(',').map((r) => r.trim()).filter(Boolean)
      : [];

    return {
      globalEnabled,
      defaultBehavior,
      routesEnabled,
      routesDisabled,
    };
  }

  /**
   * Determine route health status based on metrics.
   */
  function determineRouteStatus(
    mismatchRate: number,
    warningThreshold: number,
    cutoverThreshold: number,
  ): 'healthy' | 'warning' | 'critical' {
    if (mismatchRate >= warningThreshold) {
      return 'critical';
    }
    if (mismatchRate >= cutoverThreshold) {
      return 'warning';
    }
    return 'healthy';
  }

  /**
   * Generate recommendations based on metrics.
   */
  function generateRecommendations(
    metrics: ShadowAuthorizationMetrics,
    routeSummaries: readonly RouteMismatchSummary[],
  ): string[] {
    const recommendations: string[] = [];

    // Check sample size
    const MIN_SAMPLE_SIZE = 100;
    if (metrics.totalChecks < MIN_SAMPLE_SIZE) {
      recommendations.push(
        `Need more sample data: ${metrics.totalChecks}/${MIN_SAMPLE_SIZE} checks completed`,
      );
    }

    // Check mismatch rate
    if (metrics.mismatchRate >= state.thresholds.cutoverThreshold) {
      recommendations.push(
        `Reduce mismatch rate from ${(metrics.mismatchRate * 100).toFixed(3)}% to < ${(state.thresholds.cutoverThreshold * 100).toFixed(1)}%`,
      );
    }

    // Find problem routes
    const criticalRoutes = routeSummaries.filter((r) => r.status === 'critical');
    if (criticalRoutes.length > 0 && criticalRoutes[0]) {
      recommendations.push(
        `Investigate route "${criticalRoutes[0].routeId}" with ${(criticalRoutes[0].mismatchRate * 100).toFixed(2)}% mismatch rate`,
      );
    }

    // Check false positives (security concern)
    if (metrics.falsePositives > 0) {
      recommendations.push(
        `Address ${metrics.falsePositives} false positive(s) — these could allow unauthorized access after cutover`,
      );
    }

    // Check false negatives (availability concern)
    if (metrics.falseNegatives > 0) {
      recommendations.push(
        `Review ${metrics.falseNegatives} false negative(s) — these could block legitimate access after cutover`,
      );
    }

    return recommendations;
  }

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    isGlobalShadowModeEnabled(): boolean {
      return state.globalConfig.enabled;
    },

    setGlobalShadowMode(enabled: boolean, updatedBy?: string): void {
      state.globalConfig = {
        enabled,
        updatedAt: new Date(),
        updatedBy,
        environmentDefault: false,
      };
    },

    isRouteInShadowMode(routeId: string): RouteInShadowModeResult {
      const baseThresholds = this.getEffectiveThresholds(routeId);

      // If global is disabled, no route can be in shadow mode
      if (!state.globalConfig.enabled) {
        return {
          isActive: false,
          reason: 'global_disabled',
          effectiveWarningThreshold: baseThresholds.warningThreshold,
          effectiveCutoverThreshold: baseThresholds.cutoverThreshold,
        };
      }

      // Check for route-specific override
      const routeConfig = state.routeOverrides.get(routeId);
      if (routeConfig) {
        return {
          isActive: routeConfig.enabled,
          reason: routeConfig.enabled ? 'route_enabled' : 'route_disabled',
          effectiveWarningThreshold: baseThresholds.warningThreshold,
          effectiveCutoverThreshold: baseThresholds.cutoverThreshold,
        };
      }

      // Apply default behavior
      switch (state.defaultBehavior) {
        case 'disabled':
          return {
            isActive: false,
            reason: 'default_behavior',
            effectiveWarningThreshold: baseThresholds.warningThreshold,
            effectiveCutoverThreshold: baseThresholds.cutoverThreshold,
          };
        case 'enabled':
          return {
            isActive: true,
            reason: 'default_behavior',
            effectiveWarningThreshold: baseThresholds.warningThreshold,
            effectiveCutoverThreshold: baseThresholds.cutoverThreshold,
          };
        case 'follow_global':
        default:
          return {
            isActive: state.globalConfig.enabled,
            reason: 'global_enabled',
            effectiveWarningThreshold: baseThresholds.warningThreshold,
            effectiveCutoverThreshold: baseThresholds.cutoverThreshold,
          };
      }
    },

    setRouteShadowMode(input: SetRouteShadowModeInput): void {
      const now = new Date();
      const existing = state.routeOverrides.get(input.routeId);

      state.routeOverrides.set(input.routeId, {
        routeId: input.routeId,
        enabled: input.enabled,
        warningThresholdOverride: input.warningThresholdOverride,
        cutoverThresholdOverride: input.cutoverThresholdOverride,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        updatedBy: input.updatedBy,
        reason: input.reason,
      });
    },

    removeRouteShadowMode(routeId: string): void {
      state.routeOverrides.delete(routeId);
    },

    getRouteOverrides(): ReadonlyMap<string, RouteShadowModeConfig> {
      return new Map(state.routeOverrides);
    },

    getConfig(): ShadowModeConfig {
      return {
        global: { ...state.globalConfig },
        routeOverrides: new Map(state.routeOverrides),
        defaultBehavior: state.defaultBehavior,
      };
    },

    getSummary(): ShadowModeFeatureFlagSummary {
      let routesEnabled = 0;
      let routesDisabled = 0;

      for (const config of state.routeOverrides.values()) {
        if (config.enabled) {
          routesEnabled++;
        } else {
          routesDisabled++;
        }
      }

      return {
        globalEnabled: state.globalConfig.enabled,
        totalRouteOverrides: state.routeOverrides.size,
        routesEnabled,
        routesDisabled,
        defaultBehavior: state.defaultBehavior,
        environmentSource: state.environmentSource,
      };
    },

    getEffectiveThresholds(routeId: string): ShadowAuthorizationThresholds {
      const routeConfig = state.routeOverrides.get(routeId);

      return {
        warningThreshold:
          routeConfig?.warningThresholdOverride ?? state.thresholds.warningThreshold,
        cutoverThreshold:
          routeConfig?.cutoverThresholdOverride ?? state.thresholds.cutoverThreshold,
      };
    },

    generateDashboardData(
      metrics: ShadowAuthorizationMetrics,
      options?: DashboardDataOptions,
    ): ShadowModeDashboardData {
      const opts = { ...DEFAULT_DASHBOARD_OPTIONS, ...options };
      const now = new Date();

      // Generate route summaries
      const routeSummaries: RouteMismatchSummary[] = [];
      let healthyCount = 0;
      let warningCount = 0;
      let criticalCount = 0;
      let disabledCount = 0;

      for (const [routeId, routeMetrics] of metrics.perRouteMetrics) {
        const routeResult = this.isRouteInShadowMode(routeId);
        const effectiveThresholds = this.getEffectiveThresholds(routeId);

        if (!routeResult.isActive && !opts.includeDisabledRoutes) {
          disabledCount++;
          continue;
        }

        const status = determineRouteStatus(
          routeMetrics.mismatchRate,
          effectiveThresholds.warningThreshold,
          effectiveThresholds.cutoverThreshold,
        );

        if (status === 'healthy') healthyCount++;
        else if (status === 'warning') warningCount++;
        else criticalCount++;

        routeSummaries.push({
          routeId: routeMetrics.routeId,
          shadowEnabled: routeMetrics.shadowEnabled,
          mismatchRate: routeMetrics.mismatchRate,
          totalChecks: routeMetrics.totalChecks,
          mismatchCount: routeMetrics.mismatchCount,
          cutoverEligible: routeMetrics.mismatchRate < effectiveThresholds.cutoverThreshold,
          warningThresholdExceeded: routeMetrics.mismatchRate > effectiveThresholds.warningThreshold,
          status,
        });
      }

      // Sort by mismatch rate descending
      routeSummaries.sort((a, b) => b.mismatchRate - a.mismatchRate);

      // Limit routes
      const limitedRouteSummaries = routeSummaries.slice(0, opts.maxRoutes);

      // Generate recommendations
      const recommendations = generateRecommendations(metrics, limitedRouteSummaries);

      // Check alerts
      const activeAlerts = this.checkAlerts(metrics);

      // Generate time-series placeholder (actual implementation would need historical data)
      const timeSeries: MismatchRateDataPoint[] = [
        {
          timestamp: now,
          mismatchRate: metrics.mismatchRate,
          totalChecks: metrics.totalChecks,
          mismatchCount: metrics.mismatchCount,
          falsePositives: metrics.falsePositives,
          falseNegatives: metrics.falseNegatives,
        },
      ];

      return {
        globalStatus: {
          enabled: state.globalConfig.enabled,
          mismatchRate: metrics.mismatchRate,
          totalChecks: metrics.totalChecks,
          cutoverEligible: metrics.cutoverEligible,
          warningThresholdExceeded: metrics.warningThresholdExceeded,
          lastUpdated: metrics.lastUpdated,
        },
        timeSeries,
        routeSummaries: limitedRouteSummaries,
        activeAlerts,
        routeStatusCounts: {
          healthy: healthyCount,
          warning: warningCount,
          critical: criticalCount,
          disabled: disabledCount,
        },
        recommendations,
        generatedAt: now,
      };
    },

    configureAlert(config: ShadowModeAlertConfig): void {
      state.alertConfigs.set(config.id, config);
    },

    removeAlert(alertId: string): void {
      state.alertConfigs.delete(alertId);
    },

    getAlertConfigs(): readonly ShadowModeAlertConfig[] {
      return Array.from(state.alertConfigs.values());
    },

    checkAlerts(metrics: ShadowAuthorizationMetrics): readonly ShadowModeAlert[] {
      const alerts: ShadowModeAlert[] = [];
      const now = new Date();

      for (const config of state.alertConfigs.values()) {
        if (!config.enabled) continue;

        // Check if routes filter applies
        const checkRoutes =
          config.routes.length === 0
            ? Array.from(metrics.perRouteMetrics.keys())
            : config.routes;

        switch (config.type) {
          case 'warning_threshold': {
            // Check global warning threshold
            if (metrics.warningThresholdExceeded) {
              alerts.push({
                config,
                triggeredAt: now,
                currentValue: metrics.mismatchRate,
                threshold: state.thresholds.warningThreshold,
                acknowledged: false,
              });
            }
            break;
          }

          case 'cutover_blocked': {
            // Check if cutover is blocked
            if (!metrics.cutoverEligible && metrics.totalChecks >= 100) {
              alerts.push({
                config,
                triggeredAt: now,
                currentValue: metrics.mismatchRate,
                threshold: state.thresholds.cutoverThreshold,
                acknowledged: false,
              });
            }
            break;
          }

          case 'high_false_positive': {
            // Check for high false positive rate
            const fpRate = metrics.totalChecks > 0
              ? metrics.falsePositives / metrics.totalChecks
              : 0;
            const threshold = config.threshold ?? 0.001;
            if (fpRate > threshold) {
              alerts.push({
                config,
                triggeredAt: now,
                currentValue: fpRate,
                threshold,
                acknowledged: false,
              });
            }
            break;
          }

          case 'high_false_negative': {
            // Check for high false negative rate
            const fnRate = metrics.totalChecks > 0
              ? metrics.falseNegatives / metrics.totalChecks
              : 0;
            const threshold = config.threshold ?? 0.005;
            if (fnRate > threshold) {
              alerts.push({
                config,
                triggeredAt: now,
                currentValue: fnRate,
                threshold,
                acknowledged: false,
              });
            }
            break;
          }
        }
      }

      return alerts;
    },

    loadFromEnvironment(envConfig?: ShadowModeEnvironmentConfig): void {
      const config = envConfig ?? parseEnvironmentVariables();
      
      // Reset first
      this.reset();

      // Load from config
      loadFromEnvConfig(config);
    },

    reset(): void {
      state.globalConfig = {
        enabled: false,
        updatedAt: new Date(),
        environmentDefault: true,
      };
      state.routeOverrides.clear();
      state.defaultBehavior = 'follow_global';
      state.alertConfigs.clear();
      state.environmentSource = false;
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type ShadowModeFeatureFlagService = IShadowModeFeatureFlagService;
