/**
 * Shadow Mode Feature Flag Types
 *
 * Types for controlling shadow authorization per route (FASE 1.9 - Task 22).
 * Provides global enable/disable flag and per-route override configuration.
 *
 * **Design Specification:**
 * - Global shadow mode enable/disable
 * - Per-route shadow mode override
 * - Environment-based default configuration
 * - Monitoring dashboard data for mismatch rate visualization
 *
 * @see Requirements 7 (AC 5) - Per-route opt-in for shadow validation
 * @see Design Shadow Authorization Validation section
 */

// ---------------------------------------------------------------------------
// Configuration Types
// ---------------------------------------------------------------------------

/**
 * Global shadow mode configuration.
 */
export interface ShadowModeGlobalConfig {
  /**
   * Whether shadow mode is globally enabled.
   * When false, no shadow authorization is executed regardless of route settings.
   */
  readonly enabled: boolean;

  /**
   * When global shadow mode was last updated.
   */
  readonly updatedAt: Date;

  /**
   * Who or what updated the global config (for audit).
   */
  readonly updatedBy?: string;

  /**
   * Environment from which the default was loaded.
   */
  readonly environmentDefault?: boolean;
}

/**
 * Per-route shadow mode configuration.
 *
 * Allows fine-grained control over which routes have shadow authorization.
 */
export interface RouteShadowModeConfig {
  /**
   * Route identifier (e.g., 'get-resident', 'create-announcement').
   */
  readonly routeId: string;

  /**
   * Whether shadow mode is enabled for this specific route.
   * - true: Shadow mode is enabled for this route
   * - false: Shadow mode is disabled for this route
   * - undefined: Follows global setting
   */
  readonly enabled: boolean;

  /**
   * Optional override for warning threshold for this route.
   * If not set, uses global threshold.
   */
  readonly warningThresholdOverride?: number;

  /**
   * Optional override for cutover threshold for this route.
   * If not set, uses global threshold.
   */
  readonly cutoverThresholdOverride?: number;

  /**
   * When this route config was created.
   */
  readonly createdAt: Date;

  /**
   * When this route config was last updated.
   */
  readonly updatedAt: Date;

  /**
   * Who or what updated this config (for audit).
   */
  readonly updatedBy?: string;

  /**
   * Optional description/reason for the override.
   */
  readonly reason?: string;
}

/**
 * Input for setting route shadow mode configuration.
 */
export interface SetRouteShadowModeInput {
  /**
   * Route identifier.
   */
  readonly routeId: string;

  /**
   * Whether to enable or disable shadow mode for this route.
   */
  readonly enabled: boolean;

  /**
   * Optional warning threshold override.
   */
  readonly warningThresholdOverride?: number;

  /**
   * Optional cutover threshold override.
   */
  readonly cutoverThresholdOverride?: number;

  /**
   * Who is making this change (for audit).
   */
  readonly updatedBy?: string;

  /**
   * Reason for the change.
   */
  readonly reason?: string;
}

/**
 * Complete shadow mode configuration.
 *
 * Combines global settings with all route-level overrides.
 */
export interface ShadowModeConfig {
  /**
   * Global shadow mode configuration.
   */
  readonly global: ShadowModeGlobalConfig;

  /**
   * Per-route override configurations.
   * Key is routeId, value is the route-specific config.
   */
  readonly routeOverrides: ReadonlyMap<string, RouteShadowModeConfig>;

  /**
   * Default behavior for routes without explicit config.
   * - 'follow_global': Route follows global setting (default)
   * - 'disabled': Routes without explicit config are disabled
   * - 'enabled': Routes without explicit config are enabled
   */
  readonly defaultBehavior: 'follow_global' | 'disabled' | 'enabled';
}

/**
 * Environment-based configuration for shadow mode.
 *
 * These values can be set via environment variables.
 */
export interface ShadowModeEnvironmentConfig {
  /**
   * Environment variable: SHADOW_MODE_ENABLED (default: false)
   * Controls whether shadow mode is enabled globally by default.
   */
  readonly globalEnabled: boolean;

  /**
   * Environment variable: SHADOW_MODE_DEFAULT_BEHAVIOR (default: 'follow_global')
   * Default behavior for routes without explicit config.
   */
  readonly defaultBehavior: 'follow_global' | 'disabled' | 'enabled';

  /**
   * Environment variable: SHADOW_MODE_ROUTES_ENABLED (comma-separated)
   * Routes to enable by default.
   */
  readonly routesEnabled: readonly string[];

  /**
   * Environment variable: SHADOW_MODE_ROUTES_DISABLED (comma-separated)
   * Routes to disable by default.
   */
  readonly routesDisabled: readonly string[];
}

/**
 * Default environment configuration.
 */
export const DEFAULT_SHADOW_MODE_ENV_CONFIG: Readonly<ShadowModeEnvironmentConfig> =
  Object.freeze({
    globalEnabled: false,
    defaultBehavior: 'follow_global' as const,
    routesEnabled: [],
    routesDisabled: [],
  });

// ---------------------------------------------------------------------------
// Monitoring Dashboard Types
// ---------------------------------------------------------------------------

/**
 * Time-series data point for mismatch rate visualization.
 */
export interface MismatchRateDataPoint {
  /**
   * Timestamp of this data point.
   */
  readonly timestamp: Date;

  /**
   * Mismatch rate at this time (0.0 to 1.0).
   */
  readonly mismatchRate: number;

  /**
   * Total checks in this time window.
   */
  readonly totalChecks: number;

  /**
   * Mismatch count in this time window.
   */
  readonly mismatchCount: number;

  /**
   * False positive count in this time window.
   */
  readonly falsePositives: number;

  /**
   * False negative count in this time window.
   */
  readonly falseNegatives: number;
}

/**
 * Route-level mismatch summary for dashboard.
 */
export interface RouteMismatchSummary {
  /**
   * Route identifier.
   */
  readonly routeId: string;

  /**
   * Whether shadow mode is currently enabled for this route.
   */
  readonly shadowEnabled: boolean;

  /**
   * Current mismatch rate for this route.
   */
  readonly mismatchRate: number;

  /**
   * Total checks for this route.
   */
  readonly totalChecks: number;

  /**
   * Mismatch count for this route.
   */
  readonly mismatchCount: number;

  /**
   * Whether this route is eligible for cutover.
   */
  readonly cutoverEligible: boolean;

  /**
   * Whether warning threshold is exceeded for this route.
   */
  readonly warningThresholdExceeded: boolean;

  /**
   * Health status for visual indicator.
   */
  readonly status: 'healthy' | 'warning' | 'critical';
}

/**
 * Alert configuration for shadow mode monitoring.
 */
export interface ShadowModeAlertConfig {
  /**
   * Alert ID.
   */
  readonly id: string;

  /**
   * Alert name for display.
   */
  readonly name: string;

  /**
   * Alert type.
   */
  readonly type: 'warning_threshold' | 'cutover_blocked' | 'high_false_positive' | 'high_false_negative';

  /**
   * Whether this alert is enabled.
   */
  readonly enabled: boolean;

  /**
   * Threshold that triggers this alert (if applicable).
   */
  readonly threshold?: number;

  /**
   * Routes this alert applies to (empty = all routes).
   */
  readonly routes: readonly string[];

  /**
   * Notification channels for this alert.
   */
  readonly notificationChannels: readonly string[];
}

/**
 * Active alert instance.
 */
export interface ShadowModeAlert {
  /**
   * Alert configuration that triggered this.
   */
  readonly config: ShadowModeAlertConfig;

  /**
   * When this alert was triggered.
   */
  readonly triggeredAt: Date;

  /**
   * Current value that triggered the alert.
   */
  readonly currentValue: number;

  /**
   * Threshold that was exceeded.
   */
  readonly threshold: number;

  /**
   * Route that triggered the alert (if route-specific).
   */
  readonly routeId?: string;

  /**
   * Whether this alert has been acknowledged.
   */
  readonly acknowledged: boolean;

  /**
   * When acknowledged (if applicable).
   */
  readonly acknowledgedAt?: Date;

  /**
   * Who acknowledged (if applicable).
   */
  readonly acknowledgedBy?: string;
}

/**
 * Complete dashboard data structure.
 */
export interface ShadowModeDashboardData {
  /**
   * Current global shadow mode status.
   */
  readonly globalStatus: {
    readonly enabled: boolean;
    readonly mismatchRate: number;
    readonly totalChecks: number;
    readonly cutoverEligible: boolean;
    readonly warningThresholdExceeded: boolean;
    readonly lastUpdated: Date;
  };

  /**
   * Time-series data for trend visualization.
   * Sorted by timestamp ascending.
   */
  readonly timeSeries: readonly MismatchRateDataPoint[];

  /**
   * Per-route summaries sorted by mismatch rate descending.
   */
  readonly routeSummaries: readonly RouteMismatchSummary[];

  /**
   * Active alerts.
   */
  readonly activeAlerts: readonly ShadowModeAlert[];

  /**
   * Count of routes by status.
   */
  readonly routeStatusCounts: {
    readonly healthy: number;
    readonly warning: number;
    readonly critical: number;
    readonly disabled: number;
  };

  /**
   * Recommendations for improving cutover eligibility.
   */
  readonly recommendations: readonly string[];

  /**
   * When this dashboard data was generated.
   */
  readonly generatedAt: Date;
}

/**
 * Options for generating dashboard data.
 */
export interface DashboardDataOptions {
  /**
   * Time range for time-series data.
   */
  readonly timeRange?: {
    readonly start: Date;
    readonly end: Date;
  };

  /**
   * Time granularity for time-series data.
   */
  readonly granularity?: 'minute' | 'hour' | 'day';

  /**
   * Maximum number of routes to include in summary.
   */
  readonly maxRoutes?: number;

  /**
   * Whether to include disabled routes in summary.
   */
  readonly includeDisabledRoutes?: boolean;
}

/**
 * Default dashboard data options.
 */
export const DEFAULT_DASHBOARD_OPTIONS: Readonly<DashboardDataOptions> = Object.freeze({
  granularity: 'hour' as const,
  maxRoutes: 50,
  includeDisabledRoutes: false,
});

// ---------------------------------------------------------------------------
// Feature Flag Service Result Types
// ---------------------------------------------------------------------------

/**
 * Result of checking if a route is in shadow mode.
 */
export interface RouteInShadowModeResult {
  /**
   * Whether shadow mode is active for this route.
   */
  readonly isActive: boolean;

  /**
   * Reason for the result.
   */
  readonly reason: 'global_disabled' | 'route_disabled' | 'route_enabled' | 'global_enabled' | 'default_behavior';

  /**
   * The effective warning threshold for this route.
   */
  readonly effectiveWarningThreshold: number;

  /**
   * The effective cutover threshold for this route.
   */
  readonly effectiveCutoverThreshold: number;
}

/**
 * Summary of shadow mode feature flag state.
 */
export interface ShadowModeFeatureFlagSummary {
  /**
   * Whether global shadow mode is enabled.
   */
  readonly globalEnabled: boolean;

  /**
   * Total number of route overrides.
   */
  readonly totalRouteOverrides: number;

  /**
   * Number of routes explicitly enabled.
   */
  readonly routesEnabled: number;

  /**
   * Number of routes explicitly disabled.
   */
  readonly routesDisabled: number;

  /**
   * Default behavior for unconfigured routes.
   */
  readonly defaultBehavior: 'follow_global' | 'disabled' | 'enabled';

  /**
   * Environment configuration source.
   */
  readonly environmentSource: boolean;
}
