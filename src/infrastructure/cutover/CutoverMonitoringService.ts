/**
 * Cutover Monitoring Service — Stability monitoring for authorization cutover.
 *
 * This service monitors the stability of routes after cutover, tracking:
 * - Mismatch rates post-cutover (should remain < 0.1%)
 * - Error rates per route
 * - Stability window compliance
 * - Health status for observability/dashboards
 *
 * **Key Features:**
 * - Real-time stability metrics
 * - Per-route health tracking
 * - Stability window checking
 * - Automatic instability detection
 * - Dashboard-friendly metrics export
 *
 * @see Task 26: Cutover Execution and Monitoring
 * @see Requirements 8 (AC 1-7)
 */

import type { CutoverStatus } from './types';
import { CUTOVER_MISMATCH_THRESHOLD } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Health status for a route or the overall system.
 */
export enum HealthStatus {
  /** All metrics within acceptable thresholds */
  HEALTHY = 'HEALTHY',
  /** Some metrics approaching thresholds — warning state */
  DEGRADED = 'DEGRADED',
  /** Metrics exceeding thresholds — action required */
  UNHEALTHY = 'UNHEALTHY',
  /** No data available yet */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Stability criteria configuration.
 */
export interface StabilityCriteria {
  /** Maximum allowed mismatch rate (default: 0.001 = 0.1%) */
  readonly maxMismatchRate: number;

  /** Maximum allowed error rate (default: 0.01 = 1%) */
  readonly maxErrorRate: number;

  /** Minimum requests required for stability assessment */
  readonly minRequestCount: number;

  /** Stability window duration in minutes */
  readonly stabilityWindowMinutes: number;

  /** Consecutive stable checks required for stability confirmation */
  readonly consecutiveStableChecksRequired: number;
}

/**
 * Metrics for a single route.
 */
export interface RouteStabilityMetrics {
  /** Route identifier */
  readonly routeId: string;

  /** Current cutover status */
  readonly cutoverStatus: CutoverStatus;

  /** Time when cutover was initiated */
  readonly cutoverAt: Date | null;

  /** Total request count since cutover */
  readonly totalRequests: number;

  /** Successful request count */
  readonly successCount: number;

  /** Error count */
  readonly errorCount: number;

  /** Authorization mismatch count (new vs legacy, if still tracked) */
  readonly mismatchCount: number;

  /** Current error rate */
  readonly errorRate: number;

  /** Current mismatch rate */
  readonly mismatchRate: number;

  /** Health status */
  readonly healthStatus: HealthStatus;

  /** Minutes since cutover */
  readonly minutesSinceCutover: number | null;

  /** Whether stability window has passed */
  readonly stabilityWindowPassed: boolean;

  /** Number of consecutive stable checks */
  readonly consecutiveStableChecks: number;

  /** Whether route is confirmed stable */
  readonly isStable: boolean;

  /** Last check timestamp */
  readonly lastCheckedAt: Date;

  /** Issues detected (if any) */
  readonly issues: readonly string[];
}

/**
 * Overall system stability metrics.
 */
export interface SystemStabilityMetrics {
  /** Overall health status */
  readonly healthStatus: HealthStatus;

  /** Total routes being monitored */
  readonly totalRoutes: number;

  /** Routes that are cut over */
  readonly cutoverRoutes: number;

  /** Routes confirmed stable */
  readonly stableRoutes: number;

  /** Routes with issues */
  readonly unhealthyRoutes: number;

  /** Routes in degraded state */
  readonly degradedRoutes: number;

  /** System-wide mismatch rate */
  readonly systemMismatchRate: number;

  /** System-wide error rate */
  readonly systemErrorRate: number;

  /** Per-route metrics */
  readonly routeMetrics: ReadonlyMap<string, RouteStabilityMetrics>;

  /** Timestamp of last update */
  readonly lastUpdated: Date;

  /** Overall stability confirmation */
  readonly isSystemStable: boolean;

  /** Global issues */
  readonly globalIssues: readonly string[];
}

/**
 * Stability check result for a route.
 */
export interface StabilityCheckResult {
  /** Route identifier */
  readonly routeId: string;

  /** Whether stability check passed */
  readonly passed: boolean;

  /** Health status */
  readonly healthStatus: HealthStatus;

  /** Detailed check results */
  readonly checks: readonly StabilityCheckItem[];

  /** Timestamp of check */
  readonly checkedAt: Date;

  /** Recommendation for next action */
  readonly recommendation: string;
}

/**
 * Individual stability check item.
 */
export interface StabilityCheckItem {
  /** Check name */
  readonly name: string;

  /** Whether check passed */
  readonly passed: boolean;

  /** Current value */
  readonly currentValue: number | string;

  /** Threshold/required value */
  readonly threshold: number | string;

  /** Check message */
  readonly message: string;
}

/**
 * Event emitted when stability changes.
 */
export interface StabilityChangeEvent {
  /** Event type */
  readonly type: 'BECAME_STABLE' | 'BECAME_UNSTABLE' | 'DEGRADED' | 'RECOVERED';

  /** Route identifier */
  readonly routeId: string;

  /** Previous health status */
  readonly previousStatus: HealthStatus;

  /** New health status */
  readonly newStatus: HealthStatus;

  /** Timestamp */
  readonly timestamp: Date;

  /** Reason/details */
  readonly reason: string;
}

/**
 * Callback for stability change events.
 */
export type StabilityChangeCallback = (event: StabilityChangeEvent) => void;

/**
 * Interface for the Cutover Monitoring Service.
 */
export interface ICutoverMonitoringService {
  /**
   * Register a route for monitoring.
   */
  registerRoute(routeId: string, cutoverStatus: CutoverStatus): void;

  /**
   * Update route cutover status.
   */
  updateRouteCutoverStatus(routeId: string, status: CutoverStatus, cutoverAt?: Date): void;

  /**
   * Record a request for a route.
   */
  recordRequest(routeId: string, success: boolean, hasMismatch: boolean): void;

  /**
   * Check stability for a specific route.
   */
  checkRouteStability(routeId: string): StabilityCheckResult;

  /**
   * Check stability for all routes.
   */
  checkSystemStability(): SystemStabilityMetrics;

  /**
   * Get metrics for a specific route.
   */
  getRouteMetrics(routeId: string): RouteStabilityMetrics | undefined;

  /**
   * Get all route metrics.
   */
  getAllRouteMetrics(): ReadonlyMap<string, RouteStabilityMetrics>;

  /**
   * Get system-wide metrics.
   */
  getSystemMetrics(): SystemStabilityMetrics;

  /**
   * Check if a route is stable (passed stability window with good metrics).
   */
  isRouteStable(routeId: string): boolean;

  /**
   * Check if the system is stable (all cut over routes stable).
   */
  isSystemStable(): boolean;

  /**
   * Get routes that are ready for next cutover phase.
   */
  getStableRoutes(): readonly string[];

  /**
   * Get routes that need attention (unhealthy or degraded).
   */
  getUnstableRoutes(): readonly string[];

  /**
   * Register callback for stability change events.
   */
  onStabilityChange(callback: StabilityChangeCallback): void;

  /**
   * Get current stability criteria.
   */
  getCriteria(): StabilityCriteria;

  /**
   * Update stability criteria.
   */
  setCriteria(criteria: Partial<StabilityCriteria>): void;

  /**
   * Reset metrics for a route (e.g., after rollback).
   */
  resetRouteMetrics(routeId: string): void;

  /**
   * Reset all metrics.
   */
  resetAllMetrics(): void;

  /**
   * Export metrics for dashboard/observability.
   */
  exportMetrics(): Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

/**
 * Default stability criteria.
 */
export const DEFAULT_STABILITY_CRITERIA: StabilityCriteria = {
  maxMismatchRate: CUTOVER_MISMATCH_THRESHOLD, // 0.1%
  maxErrorRate: 0.01, // 1%
  minRequestCount: 50,
  stabilityWindowMinutes: 30,
  consecutiveStableChecksRequired: 3,
};

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface MutableRouteMetrics {
  routeId: string;
  cutoverStatus: CutoverStatus;
  cutoverAt: Date | null;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  mismatchCount: number;
  consecutiveStableChecks: number;
  previousHealthStatus: HealthStatus;
  lastCheckedAt: Date;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a Cutover Monitoring Service.
 *
 * @param initialCriteria - Initial stability criteria configuration
 * @returns Cutover Monitoring Service implementation
 *
 * @example
 * ```typescript
 * const monitoringService = createCutoverMonitoringService();
 *
 * // Register routes
 * monitoringService.registerRoute('get-residents', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
 *
 * // Record requests
 * monitoringService.recordRequest('get-residents', true, false);
 *
 * // Check stability
 * const stability = monitoringService.checkRouteStability('get-residents');
 * if (stability.passed) {
 *   console.log('Route is stable');
 * }
 * ```
 */
export const createCutoverMonitoringService = (
  initialCriteria: StabilityCriteria = DEFAULT_STABILITY_CRITERIA,
): ICutoverMonitoringService => {
  // Internal state
  const routeMetrics = new Map<string, MutableRouteMetrics>();
  let criteria = { ...initialCriteria };
  const stabilityChangeCallbacks: StabilityChangeCallback[] = [];

  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Calculate error rate for a route.
   */
  const calculateErrorRate = (metrics: MutableRouteMetrics): number => {
    if (metrics.totalRequests === 0) return 0;
    return metrics.errorCount / metrics.totalRequests;
  };

  /**
   * Calculate mismatch rate for a route.
   */
  const calculateMismatchRate = (metrics: MutableRouteMetrics): number => {
    if (metrics.totalRequests === 0) return 0;
    return metrics.mismatchCount / metrics.totalRequests;
  };

  /**
   * Calculate minutes since cutover.
   */
  const getMinutesSinceCutover = (metrics: MutableRouteMetrics): number | null => {
    if (!metrics.cutoverAt) return null;
    return (Date.now() - metrics.cutoverAt.getTime()) / (1000 * 60);
  };

  /**
   * Determine health status for a route.
   */
  const determineHealthStatus = (metrics: MutableRouteMetrics): HealthStatus => {
    if (metrics.totalRequests < criteria.minRequestCount) {
      return HealthStatus.UNKNOWN;
    }

    const errorRate = calculateErrorRate(metrics);
    const mismatchRate = calculateMismatchRate(metrics);

    // Unhealthy if exceeding any threshold by > 50%
    if (
      errorRate > criteria.maxErrorRate * 1.5 ||
      mismatchRate > criteria.maxMismatchRate * 1.5
    ) {
      return HealthStatus.UNHEALTHY;
    }

    // Degraded if approaching thresholds
    if (
      errorRate > criteria.maxErrorRate * 0.8 ||
      mismatchRate > criteria.maxMismatchRate * 0.8
    ) {
      return HealthStatus.DEGRADED;
    }

    // Healthy if within thresholds
    if (
      errorRate <= criteria.maxErrorRate &&
      mismatchRate <= criteria.maxMismatchRate
    ) {
      return HealthStatus.HEALTHY;
    }

    return HealthStatus.DEGRADED;
  };

  /**
   * Check if stability window has passed.
   */
  const hasStabilityWindowPassed = (metrics: MutableRouteMetrics): boolean => {
    const minutes = getMinutesSinceCutover(metrics);
    return minutes !== null && minutes >= criteria.stabilityWindowMinutes;
  };

  /**
   * Check if route is stable.
   */
  const isRouteStableInternal = (metrics: MutableRouteMetrics): boolean => {
    const healthStatus = determineHealthStatus(metrics);
    const windowPassed = hasStabilityWindowPassed(metrics);
    const hasEnoughChecks =
      metrics.consecutiveStableChecks >= criteria.consecutiveStableChecksRequired;

    return (
      healthStatus === HealthStatus.HEALTHY && windowPassed && hasEnoughChecks
    );
  };

  /**
   * Build RouteStabilityMetrics from internal metrics.
   */
  const buildRouteMetrics = (
    metrics: MutableRouteMetrics,
  ): RouteStabilityMetrics => {
    const errorRate = calculateErrorRate(metrics);
    const mismatchRate = calculateMismatchRate(metrics);
    const healthStatus = determineHealthStatus(metrics);
    const minutesSinceCutover = getMinutesSinceCutover(metrics);
    const stabilityWindowPassed = hasStabilityWindowPassed(metrics);
    const isStable = isRouteStableInternal(metrics);

    // Collect issues
    const issues: string[] = [];

    if (mismatchRate > criteria.maxMismatchRate) {
      issues.push(
        `Mismatch rate ${(mismatchRate * 100).toFixed(3)}% exceeds threshold ${(criteria.maxMismatchRate * 100).toFixed(1)}%`,
      );
    }

    if (errorRate > criteria.maxErrorRate) {
      issues.push(
        `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(criteria.maxErrorRate * 100).toFixed(1)}%`,
      );
    }

    if (metrics.totalRequests < criteria.minRequestCount) {
      issues.push(
        `Insufficient requests: ${metrics.totalRequests}/${criteria.minRequestCount}`,
      );
    }

    return {
      routeId: metrics.routeId,
      cutoverStatus: metrics.cutoverStatus,
      cutoverAt: metrics.cutoverAt,
      totalRequests: metrics.totalRequests,
      successCount: metrics.successCount,
      errorCount: metrics.errorCount,
      mismatchCount: metrics.mismatchCount,
      errorRate,
      mismatchRate,
      healthStatus,
      minutesSinceCutover,
      stabilityWindowPassed,
      consecutiveStableChecks: metrics.consecutiveStableChecks,
      isStable,
      lastCheckedAt: metrics.lastCheckedAt,
      issues,
    };
  };

  /**
   * Emit stability change event.
   */
  const emitStabilityChange = (event: StabilityChangeEvent): void => {
    for (const callback of stabilityChangeCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('[CutoverMonitoring] Error in stability change callback:', error);
      }
    }
  };

  /**
   * Update consecutive stable checks and emit events if needed.
   */
  const updateStabilityTracking = (metrics: MutableRouteMetrics): void => {
    const currentHealthStatus = determineHealthStatus(metrics);
    const previousHealthStatus = metrics.previousHealthStatus;

    // Update consecutive stable checks
    if (currentHealthStatus === HealthStatus.HEALTHY) {
      metrics.consecutiveStableChecks++;
    } else {
      metrics.consecutiveStableChecks = 0;
    }

    // Emit event if health status changed
    if (currentHealthStatus !== previousHealthStatus) {
      let eventType: StabilityChangeEvent['type'];
      let reason: string;

      if (
        currentHealthStatus === HealthStatus.HEALTHY &&
        metrics.consecutiveStableChecks >= criteria.consecutiveStableChecksRequired
      ) {
        eventType = 'BECAME_STABLE';
        reason = 'Route achieved stability criteria';
      } else if (currentHealthStatus === HealthStatus.UNHEALTHY) {
        eventType = 'BECAME_UNSTABLE';
        reason = `Health degraded: ${buildRouteMetrics(metrics).issues.join('; ')}`;
      } else if (currentHealthStatus === HealthStatus.DEGRADED) {
        eventType = 'DEGRADED';
        reason = 'Metrics approaching thresholds';
      } else if (
        previousHealthStatus === HealthStatus.UNHEALTHY &&
        currentHealthStatus === HealthStatus.HEALTHY
      ) {
        eventType = 'RECOVERED';
        reason = 'Route recovered to healthy state';
      } else {
        // No significant change
        metrics.previousHealthStatus = currentHealthStatus;
        return;
      }

      emitStabilityChange({
        type: eventType,
        routeId: metrics.routeId,
        previousStatus: previousHealthStatus,
        newStatus: currentHealthStatus,
        timestamp: new Date(),
        reason,
      });

      metrics.previousHealthStatus = currentHealthStatus;
    }
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    registerRoute(routeId: string, cutoverStatus: CutoverStatus): void {
      if (!routeMetrics.has(routeId)) {
        routeMetrics.set(routeId, {
          routeId,
          cutoverStatus,
          cutoverAt: null,
          totalRequests: 0,
          successCount: 0,
          errorCount: 0,
          mismatchCount: 0,
          consecutiveStableChecks: 0,
          previousHealthStatus: HealthStatus.UNKNOWN,
          lastCheckedAt: new Date(),
        });
      }
    },

    updateRouteCutoverStatus(
      routeId: string,
      status: CutoverStatus,
      cutoverAt?: Date,
    ): void {
      let metrics = routeMetrics.get(routeId);
      if (!metrics) {
        this.registerRoute(routeId, status);
        metrics = routeMetrics.get(routeId)!;
      }

      metrics.cutoverStatus = status;
      if (cutoverAt) {
        metrics.cutoverAt = cutoverAt;
      }
      metrics.lastCheckedAt = new Date();
    },

    recordRequest(routeId: string, success: boolean, hasMismatch: boolean): void {
      let metrics = routeMetrics.get(routeId);
      if (!metrics) {
        this.registerRoute(routeId, 'LEGACY' as CutoverStatus);
        metrics = routeMetrics.get(routeId)!;
      }

      metrics.totalRequests++;
      if (success) {
        metrics.successCount++;
      } else {
        metrics.errorCount++;
      }
      if (hasMismatch) {
        metrics.mismatchCount++;
      }
      metrics.lastCheckedAt = new Date();

      // Update stability tracking
      updateStabilityTracking(metrics);
    },

    checkRouteStability(routeId: string): StabilityCheckResult {
      const metrics = routeMetrics.get(routeId);
      const checkedAt = new Date();

      if (!metrics) {
        return {
          routeId,
          passed: false,
          healthStatus: HealthStatus.UNKNOWN,
          checks: [],
          checkedAt,
          recommendation: 'Route not registered for monitoring',
        };
      }

      const checks: StabilityCheckItem[] = [];
      const errorRate = calculateErrorRate(metrics);
      const mismatchRate = calculateMismatchRate(metrics);
      const minutesSinceCutover = getMinutesSinceCutover(metrics);

      // Check 1: Minimum request count
      const requestCheckPassed = metrics.totalRequests >= criteria.minRequestCount;
      checks.push({
        name: 'Minimum Request Count',
        passed: requestCheckPassed,
        currentValue: metrics.totalRequests,
        threshold: criteria.minRequestCount,
        message: requestCheckPassed
          ? `Sufficient requests: ${metrics.totalRequests}`
          : `Need more requests: ${metrics.totalRequests}/${criteria.minRequestCount}`,
      });

      // Check 2: Mismatch rate
      const mismatchCheckPassed = mismatchRate <= criteria.maxMismatchRate;
      checks.push({
        name: 'Mismatch Rate',
        passed: mismatchCheckPassed,
        currentValue: `${(mismatchRate * 100).toFixed(3)}%`,
        threshold: `${(criteria.maxMismatchRate * 100).toFixed(1)}%`,
        message: mismatchCheckPassed
          ? 'Mismatch rate within threshold'
          : `Mismatch rate exceeds threshold`,
      });

      // Check 3: Error rate
      const errorCheckPassed = errorRate <= criteria.maxErrorRate;
      checks.push({
        name: 'Error Rate',
        passed: errorCheckPassed,
        currentValue: `${(errorRate * 100).toFixed(2)}%`,
        threshold: `${(criteria.maxErrorRate * 100).toFixed(1)}%`,
        message: errorCheckPassed
          ? 'Error rate within threshold'
          : 'Error rate exceeds threshold',
      });

      // Check 4: Stability window
      const windowCheckPassed =
        minutesSinceCutover !== null &&
        minutesSinceCutover >= criteria.stabilityWindowMinutes;
      checks.push({
        name: 'Stability Window',
        passed: windowCheckPassed,
        currentValue:
          minutesSinceCutover !== null
            ? `${minutesSinceCutover.toFixed(1)} minutes`
            : 'Not cut over',
        threshold: `${criteria.stabilityWindowMinutes} minutes`,
        message: windowCheckPassed
          ? 'Stability window passed'
          : minutesSinceCutover !== null
            ? `${(criteria.stabilityWindowMinutes - minutesSinceCutover).toFixed(1)} minutes remaining`
            : 'Route not yet cut over',
      });

      // Check 5: Consecutive stable checks
      const consecutiveCheckPassed =
        metrics.consecutiveStableChecks >= criteria.consecutiveStableChecksRequired;
      checks.push({
        name: 'Consecutive Stable Checks',
        passed: consecutiveCheckPassed,
        currentValue: metrics.consecutiveStableChecks,
        threshold: criteria.consecutiveStableChecksRequired,
        message: consecutiveCheckPassed
          ? 'Sufficient consecutive stable checks'
          : `Need ${criteria.consecutiveStableChecksRequired - metrics.consecutiveStableChecks} more stable checks`,
      });

      const allPassed = checks.every((c) => c.passed);
      const healthStatus = determineHealthStatus(metrics);

      // Build recommendation
      let recommendation: string;
      if (allPassed) {
        recommendation = 'Route is stable. Safe to proceed with next phase.';
      } else {
        const failedChecks = checks.filter((c) => !c.passed).map((c) => c.name);
        recommendation = `Address issues: ${failedChecks.join(', ')}`;
      }

      metrics.lastCheckedAt = checkedAt;

      return {
        routeId,
        passed: allPassed,
        healthStatus,
        checks,
        checkedAt,
        recommendation,
      };
    },

    checkSystemStability(): SystemStabilityMetrics {
      return this.getSystemMetrics();
    },

    getRouteMetrics(routeId: string): RouteStabilityMetrics | undefined {
      const metrics = routeMetrics.get(routeId);
      return metrics ? buildRouteMetrics(metrics) : undefined;
    },

    getAllRouteMetrics(): ReadonlyMap<string, RouteStabilityMetrics> {
      const result = new Map<string, RouteStabilityMetrics>();
      for (const [routeId, metrics] of routeMetrics) {
        result.set(routeId, buildRouteMetrics(metrics));
      }
      return result;
    },

    getSystemMetrics(): SystemStabilityMetrics {
      const allMetrics = this.getAllRouteMetrics();
      const lastUpdated = new Date();

      let totalRequests = 0;
      let totalErrors = 0;
      let totalMismatches = 0;
      let cutoverRoutes = 0;
      let stableRoutes = 0;
      let unhealthyRoutes = 0;
      let degradedRoutes = 0;
      const globalIssues: string[] = [];

      for (const metrics of allMetrics.values()) {
        totalRequests += metrics.totalRequests;
        totalErrors += metrics.errorCount;
        totalMismatches += metrics.mismatchCount;

        if (
          metrics.cutoverStatus === 'MEMBERSHIP_AUTHORITATIVE' ||
          metrics.cutoverStatus === 'TRANSITIONING'
        ) {
          cutoverRoutes++;
        }

        if (metrics.isStable) {
          stableRoutes++;
        }

        if (metrics.healthStatus === HealthStatus.UNHEALTHY) {
          unhealthyRoutes++;
          globalIssues.push(`Route "${metrics.routeId}" is unhealthy`);
        }

        if (metrics.healthStatus === HealthStatus.DEGRADED) {
          degradedRoutes++;
        }
      }

      const systemErrorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;
      const systemMismatchRate =
        totalRequests > 0 ? totalMismatches / totalRequests : 0;

      // Determine overall health
      let healthStatus: HealthStatus;
      if (unhealthyRoutes > 0) {
        healthStatus = HealthStatus.UNHEALTHY;
      } else if (degradedRoutes > 0) {
        healthStatus = HealthStatus.DEGRADED;
      } else if (allMetrics.size === 0) {
        healthStatus = HealthStatus.UNKNOWN;
      } else {
        healthStatus = HealthStatus.HEALTHY;
      }

      // System is stable if all cut over routes are stable
      const isSystemStable =
        cutoverRoutes > 0 && cutoverRoutes === stableRoutes;

      return {
        healthStatus,
        totalRoutes: allMetrics.size,
        cutoverRoutes,
        stableRoutes,
        unhealthyRoutes,
        degradedRoutes,
        systemMismatchRate,
        systemErrorRate,
        routeMetrics: allMetrics,
        lastUpdated,
        isSystemStable,
        globalIssues,
      };
    },

    isRouteStable(routeId: string): boolean {
      const metrics = routeMetrics.get(routeId);
      return metrics ? isRouteStableInternal(metrics) : false;
    },

    isSystemStable(): boolean {
      const systemMetrics = this.getSystemMetrics();
      return systemMetrics.isSystemStable;
    },

    getStableRoutes(): readonly string[] {
      const stable: string[] = [];
      for (const [routeId, metrics] of routeMetrics) {
        if (isRouteStableInternal(metrics)) {
          stable.push(routeId);
        }
      }
      return stable;
    },

    getUnstableRoutes(): readonly string[] {
      const unstable: string[] = [];
      for (const [routeId, metrics] of routeMetrics) {
        const healthStatus = determineHealthStatus(metrics);
        if (
          healthStatus === HealthStatus.UNHEALTHY ||
          healthStatus === HealthStatus.DEGRADED
        ) {
          unstable.push(routeId);
        }
      }
      return unstable;
    },

    onStabilityChange(callback: StabilityChangeCallback): void {
      stabilityChangeCallbacks.push(callback);
    },

    getCriteria(): StabilityCriteria {
      return { ...criteria };
    },

    setCriteria(newCriteria: Partial<StabilityCriteria>): void {
      criteria = { ...criteria, ...newCriteria };
    },

    resetRouteMetrics(routeId: string): void {
      const metrics = routeMetrics.get(routeId);
      if (metrics) {
        metrics.totalRequests = 0;
        metrics.successCount = 0;
        metrics.errorCount = 0;
        metrics.mismatchCount = 0;
        metrics.consecutiveStableChecks = 0;
        metrics.previousHealthStatus = HealthStatus.UNKNOWN;
        metrics.cutoverAt = null;
        metrics.lastCheckedAt = new Date();
      }
    },

    resetAllMetrics(): void {
      for (const routeId of routeMetrics.keys()) {
        this.resetRouteMetrics(routeId);
      }
    },

    exportMetrics(): Record<string, unknown> {
      const systemMetrics = this.getSystemMetrics();
      const routeMetricsExport: Record<string, unknown> = {};

      for (const [routeId, metrics] of systemMetrics.routeMetrics) {
        routeMetricsExport[routeId] = {
          cutoverStatus: metrics.cutoverStatus,
          healthStatus: metrics.healthStatus,
          totalRequests: metrics.totalRequests,
          errorRate: metrics.errorRate,
          mismatchRate: metrics.mismatchRate,
          isStable: metrics.isStable,
          minutesSinceCutover: metrics.minutesSinceCutover,
          issues: metrics.issues,
        };
      }

      return {
        timestamp: new Date().toISOString(),
        system: {
          healthStatus: systemMetrics.healthStatus,
          isSystemStable: systemMetrics.isSystemStable,
          totalRoutes: systemMetrics.totalRoutes,
          cutoverRoutes: systemMetrics.cutoverRoutes,
          stableRoutes: systemMetrics.stableRoutes,
          unhealthyRoutes: systemMetrics.unhealthyRoutes,
          systemErrorRate: systemMetrics.systemErrorRate,
          systemMismatchRate: systemMetrics.systemMismatchRate,
          globalIssues: systemMetrics.globalIssues,
        },
        criteria: {
          maxMismatchRate: criteria.maxMismatchRate,
          maxErrorRate: criteria.maxErrorRate,
          minRequestCount: criteria.minRequestCount,
          stabilityWindowMinutes: criteria.stabilityWindowMinutes,
        },
        routes: routeMetricsExport,
      };
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type CutoverMonitoringService = ICutoverMonitoringService;
