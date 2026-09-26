/**
 * Shadow Authorization Service
 *
 * Executes both legacy and new authorization for each request, logs mismatches,
 * and tracks metrics for cutover eligibility (FASE 1.9).
 *
 * **Design Specification:**
 * - Execute both legacy (User.tenantId + UserRole) and new (Membership-based)
 * - Log mismatches with full context
 * - Legacy result used for actual decision during shadow mode
 * - Metrics: mismatch rate, false positives, false negatives
 * - Per-route opt-in during phased rollout
 * - WARNING threshold (>1%) for operational alerts
 * - CUTOVER ELIGIBILITY threshold (<0.1%) for security gate
 * - Quarantined anomalies excluded from mismatch calculation
 *
 * **Security Considerations:**
 * - Legacy result is used for actual decision during shadow mode
 * - Quarantined anomalies are excluded from mismatch calculations
 * - Latency impact must be < 50ms p95
 *
 * @see Requirements 7 (AC 1-8)
 * @see Design Shadow Authorization Validation section
 * @see TPR-06: Warning vs Cutover threshold semantics
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { unexpectedError } from '@core/utils';
import { isQuarantined } from '@infrastructure/quarantine';
import type {
  AuthorizationDecision,
  ShadowAuthorizationResult,
  ShadowMismatch,
  ShadowAuthorizationMetrics,
  RouteMetrics,
  ShadowAuthorizationThresholds,
  ShadowAuthorizationRequest,
  CutoverEligibilityResult,
} from '../types';
import { DEFAULT_SHADOW_THRESHOLDS } from '../types';
import type { IAuthorizationContextResolver } from './AuthorizationContextResolver';
import type {
  ILegacyAuthorizationAdapter,
  LegacyUserData,
} from '@infrastructure/authorization';
import type { MembershipRole } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * Shadow Authorization Service interface.
 *
 * Provides methods for shadow authorization validation during migration.
 */
export interface IShadowAuthorizationService {
  /**
   * Execute shadow authorization — runs both legacy and new authorization.
   *
   * @param request - Shadow authorization request
   * @returns Shadow authorization result with comparison outcome
   *
   * @see Requirements 7 (AC 1-3)
   */
  executeShadowAuth(
    request: ShadowAuthorizationRequest,
  ): Promise<DomainResult<ShadowAuthorizationResult>>;

  /**
   * Log a mismatch with full context.
   *
   * Called automatically when a mismatch is detected, but can also be called
   * manually for additional logging.
   *
   * @param mismatch - The mismatch details to log
   *
   * @see Requirements 7 (AC 2)
   */
  logMismatch(mismatch: ShadowMismatch): void;

  /**
   * Get the current mismatch rate.
   *
   * @returns Current mismatch rate as a decimal (0.0 to 1.0)
   *
   * @see Requirements 7 (AC 4)
   */
  getMismatchRate(): number;

  /**
   * Get full metrics for shadow authorization.
   *
   * @returns Complete metrics including per-route breakdown
   */
  getMetrics(): ShadowAuthorizationMetrics;

  /**
   * Check if a route has shadow mode enabled.
   *
   * @param routeId - Route identifier
   * @returns true if shadow mode is enabled for this route
   *
   * @see Requirements 7 (AC 5)
   */
  isRouteEnabled(routeId: string): boolean;

  /**
   * Enable shadow mode for a route.
   *
   * @param routeId - Route identifier
   */
  enableRoute(routeId: string): void;

  /**
   * Disable shadow mode for a route.
   *
   * @param routeId - Route identifier
   */
  disableRoute(routeId: string): void;

  /**
   * Check if system is eligible for cutover.
   *
   * @returns Cutover eligibility result with recommendations
   *
   * @see Requirements 7 (AC 7-8), Requirements 8 (AC 5)
   */
  checkCutoverEligibility(): CutoverEligibilityResult;

  /**
   * Reset metrics (for testing or new measurement window).
   */
  resetMetrics(): void;

  /**
   * Get configured thresholds.
   */
  getThresholds(): ShadowAuthorizationThresholds;

  /**
   * Update thresholds.
   */
  setThresholds(thresholds: Partial<ShadowAuthorizationThresholds>): void;
}

// ---------------------------------------------------------------------------
// Mismatch Logger Interface
// ---------------------------------------------------------------------------

/**
 * Interface for mismatch logging destination.
 *
 * Allows different logging strategies (console, file, observability platform).
 */
export interface IMismatchLogger {
  /**
   * Log a mismatch event.
   */
  log(mismatch: ShadowMismatch): void;

  /**
   * Log a warning when threshold is exceeded.
   */
  warn(message: string, context: Record<string, unknown>): void;
}

/**
 * Default console-based mismatch logger.
 */
export const ConsoleMismatchLogger: IMismatchLogger = {
  log(mismatch: ShadowMismatch): void {
    console.warn('[SHADOW_AUTH_MISMATCH]', JSON.stringify(mismatch, null, 2));
  },
  warn(message: string, context: Record<string, unknown>): void {
    console.warn('[SHADOW_AUTH_WARNING]', message, context);
  },
};

// ---------------------------------------------------------------------------
// Internal State Types
// ---------------------------------------------------------------------------

interface InternalMetrics {
  totalChecks: number;
  mismatchCount: number;
  falsePositives: number;
  falseNegatives: number;
  excludedCount: number;
  windowStart: Date;
  lastUpdated: Date;
  routeMetrics: Map<string, MutableRouteMetrics>;
}

interface MutableRouteMetrics {
  routeId: string;
  totalChecks: number;
  mismatchCount: number;
  shadowEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a Shadow Authorization Service.
 *
 * Follows Clean Architecture DI pattern — dependencies are injected.
 *
 * @param authorizationContextResolver - New Membership-based authorization
 * @param legacyAuthorizationAdapter - Legacy User.tenantId + UserRole authorization
 * @param mismatchLogger - Logger for mismatch events (defaults to console)
 * @param thresholds - Threshold configuration (defaults to TPR-06 values)
 *
 * @returns Shadow Authorization Service implementation
 *
 * @example
 * ```typescript
 * // DI Registration
 * container.register({
 *   shadowAuthorizationService: asFunction(ShadowAuthorizationServiceImpl).singleton(),
 * });
 *
 * // Usage in middleware
 * const shadowResult = await shadowService.executeShadowAuth({
 *   correlationId: 'req-123',
 *   userId: 'user-456',
 *   activeTenantId: 'tenant-789',
 *   activeOrgUnitId: 'orgunit-abc',
 *   tokenVersion: 1,
 *   routeId: 'get-resident',
 *   endpoint: '/api/residents/:id',
 *   method: 'GET',
 *   requiredPermissions: ['resident:read'],
 * });
 *
 * if (shadowResult.success) {
 *   // Use legacy result for actual decision
 *   const decision = shadowResult.data.finalDecision;
 * }
 * ```
 */
export const ShadowAuthorizationServiceImpl = ({
  authorizationContextResolver,
  legacyAuthorizationAdapter,
  mismatchLogger = ConsoleMismatchLogger,
  initialThresholds = DEFAULT_SHADOW_THRESHOLDS,
}: {
  authorizationContextResolver: IAuthorizationContextResolver;
  legacyAuthorizationAdapter: ILegacyAuthorizationAdapter;
  mismatchLogger?: IMismatchLogger;
  initialThresholds?: ShadowAuthorizationThresholds;
}): IShadowAuthorizationService => {
  // Internal state
  const metrics: InternalMetrics = {
    totalChecks: 0,
    mismatchCount: 0,
    falsePositives: 0,
    falseNegatives: 0,
    excludedCount: 0,
    windowStart: new Date(),
    lastUpdated: new Date(),
    routeMetrics: new Map(),
  };

  const enabledRoutes = new Set<string>();
  let thresholds = { ...initialThresholds };

  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Get or create route metrics.
   */
  const getRouteMetrics = (routeId: string): MutableRouteMetrics => {
    let routeMetric = metrics.routeMetrics.get(routeId);
    if (!routeMetric) {
      routeMetric = {
        routeId,
        totalChecks: 0,
        mismatchCount: 0,
        shadowEnabled: enabledRoutes.has(routeId),
      };
      metrics.routeMetrics.set(routeId, routeMetric);
    }
    return routeMetric;
  };

  /**
   * Calculate mismatch rate.
   */
  const calculateMismatchRate = (): number => {
    if (metrics.totalChecks === 0) {
      return 0;
    }
    return metrics.mismatchCount / metrics.totalChecks;
  };

  /**
   * Check if warning threshold is exceeded.
   */
  const isWarningThresholdExceeded = (): boolean => {
    return calculateMismatchRate() > thresholds.warningThreshold;
  };

  /**
   * Check if eligible for cutover.
   */
  const isCutoverEligible = (): boolean => {
    // Need minimum sample size for meaningful cutover decision
    const MIN_SAMPLE_SIZE = 100;
    if (metrics.totalChecks < MIN_SAMPLE_SIZE) {
      return false;
    }
    return calculateMismatchRate() < thresholds.cutoverThreshold;
  };

  /**
   * Determine mismatch type.
   */
  const determineMismatchType = (
    legacyAllowed: boolean,
    newAllowed: boolean,
  ): 'false_positive' | 'false_negative' | null => {
    if (legacyAllowed === newAllowed) {
      return null;
    }
    // false_positive: new allows when legacy denies
    // (potential security issue — could allow unauthorized access)
    if (!legacyAllowed && newAllowed) {
      return 'false_positive';
    }
    // false_negative: new denies when legacy allows
    // (potential availability issue — could block legitimate access)
    return 'false_negative';
  };

  /**
   * Execute new authorization (Membership-based).
   */
  const executeNewAuthorization = async (
    request: ShadowAuthorizationRequest,
    currentTokenVersion: number,
  ): Promise<AuthorizationDecision> => {
    try {
      const contextResult = await authorizationContextResolver.resolve({
        jwtClaims: {
          userId: request.userId,
          activeTenantId: request.activeTenantId,
          activeOrgUnitId: request.activeOrgUnitId,
          tokenVersion: request.tokenVersion,
        },
        currentTokenVersion,
      });

      if (!contextResult.success) {
        return {
          allowed: false,
          reason: contextResult.error.message,
          errorCode: contextResult.error.code,
          tenantId: request.activeTenantId,
          orgUnitId: request.activeOrgUnitId,
        };
      }

      const authContext = contextResult.data.context;

      // Check required permissions
      const missingPermissions: string[] = [];
      for (const permission of request.requiredPermissions) {
        if (!authContext.permissions.has(permission)) {
          missingPermissions.push(permission);
        }
      }

      if (missingPermissions.length > 0) {
        return {
          allowed: false,
          reason: `Missing permissions: ${missingPermissions.join(', ')}`,
          errorCode: 'AUTH_INSUFFICIENT_PERMISSION',
          role: authContext.role,
          tenantId: authContext.tenantId,
          orgUnitId: authContext.orgUnitId,
        };
      }

      return {
        allowed: true,
        reason: 'New authorization passed',
        role: authContext.role,
        tenantId: authContext.tenantId,
        orgUnitId: authContext.orgUnitId,
      };
    } catch (error) {
      return {
        allowed: false,
        reason: `New authorization error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        errorCode: 'AUTH_NEW_ERROR',
        tenantId: request.activeTenantId,
        orgUnitId: request.activeOrgUnitId,
      };
    }
  };

  /**
   * Build mismatch record for logging.
   */
  const buildMismatchRecord = (
    request: ShadowAuthorizationRequest,
    legacyResult: AuthorizationDecision,
    newResult: AuthorizationDecision,
    mismatchType: 'false_positive' | 'false_negative',
    legacyUserData: LegacyUserData | null,
  ): ShadowMismatch => {
    return {
      correlationId: request.correlationId,
      userId: request.userId,
      tenantId: request.activeTenantId,
      endpoint: request.endpoint,
      method: request.method,
      routeId: request.routeId,
      legacyResult,
      newResult,
      mismatchType,
      timestamp: new Date(),
      context: {
        legacyTenantId: legacyUserData?.tenantId ?? null,
        legacyRole: legacyUserData?.role ?? null,
        membershipRole: newResult.role as MembershipRole | undefined,
        membershipOrgUnitId: newResult.orgUnitId,
      },
    };
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    async executeShadowAuth(
      request: ShadowAuthorizationRequest,
    ): Promise<DomainResult<ShadowAuthorizationResult>> {
      const startTime = Date.now();

      try {
        // Check if user is quarantined — exclude from metrics
        const userQuarantined = isQuarantined(request.userId);

        // Get legacy user data for context
        const legacyUserData = await legacyAuthorizationAdapter.getLegacyUserData(
          request.userId,
        );

        // Execute legacy authorization
        const legacyResultDomain = await legacyAuthorizationAdapter.authorize({
          userId: request.userId,
          targetTenantId: request.activeTenantId,
          jwtTokenVersion: request.tokenVersion,
          requiredPermissions: request.requiredPermissions,
        });

        if (!legacyResultDomain.success) {
          // Legacy adapter failed — this is unexpected
          return fail(legacyResultDomain.error);
        }

        const legacyResult = legacyResultDomain.data;

        // Get current token version for new authorization
        const currentTokenVersion = legacyUserData?.tokenVersion ?? request.tokenVersion;

        // Execute new authorization
        const newResult = await executeNewAuthorization(request, currentTokenVersion);

        // Determine mismatch
        const mismatchType = determineMismatchType(
          legacyResult.allowed,
          newResult.allowed,
        );
        const hasMismatch = mismatchType !== null;

        const durationMs = Date.now() - startTime;
        const executedAt = new Date();

        // Update metrics (only if not quarantined)
        if (!userQuarantined) {
          metrics.totalChecks++;
          metrics.lastUpdated = executedAt;

          if (hasMismatch) {
            metrics.mismatchCount++;
            if (mismatchType === 'false_positive') {
              metrics.falsePositives++;
            } else {
              metrics.falseNegatives++;
            }

            // Log the mismatch
            const mismatchRecord = buildMismatchRecord(
              request,
              legacyResult,
              newResult,
              mismatchType,
              legacyUserData,
            );
            this.logMismatch(mismatchRecord);
          }

          // Update route metrics
          const routeMetric = getRouteMetrics(request.routeId);
          routeMetric.totalChecks++;
          if (hasMismatch) {
            routeMetric.mismatchCount++;
          }

          // Check if warning threshold exceeded
          if (isWarningThresholdExceeded()) {
            mismatchLogger.warn(
              'Shadow authorization mismatch rate exceeds WARNING threshold',
              {
                currentRate: calculateMismatchRate(),
                threshold: thresholds.warningThreshold,
                totalChecks: metrics.totalChecks,
                mismatchCount: metrics.mismatchCount,
              },
            );
          }
        } else {
          metrics.excludedCount++;
        }

        // Build result
        const result: ShadowAuthorizationResult = {
          correlationId: request.correlationId,
          legacyResult,
          newResult,
          hasMismatch,
          mismatchType,
          // CRITICAL: Legacy result used for actual decision in shadow mode
          finalDecision: legacyResult,
          excludedFromMetrics: userQuarantined,
          executedAt,
          durationMs,
        };

        return ok(result);
      } catch (error) {
        return fail(
          unexpectedError(
            'SHADOW_AUTH_FAILED',
            `Shadow authorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            { cause: error },
          ),
        );
      }
    },

    logMismatch(mismatch: ShadowMismatch): void {
      mismatchLogger.log(mismatch);
    },

    getMismatchRate(): number {
      return calculateMismatchRate();
    },

    getMetrics(): ShadowAuthorizationMetrics {
      const perRouteMetrics = new Map<string, RouteMetrics>();

      for (const [routeId, rm] of metrics.routeMetrics) {
        perRouteMetrics.set(routeId, {
          routeId: rm.routeId,
          totalChecks: rm.totalChecks,
          mismatchCount: rm.mismatchCount,
          mismatchRate: rm.totalChecks > 0 ? rm.mismatchCount / rm.totalChecks : 0,
          shadowEnabled: rm.shadowEnabled,
        });
      }

      return {
        totalChecks: metrics.totalChecks,
        mismatchCount: metrics.mismatchCount,
        falsePositives: metrics.falsePositives,
        falseNegatives: metrics.falseNegatives,
        mismatchRate: calculateMismatchRate(),
        excludedCount: metrics.excludedCount,
        warningThresholdExceeded: isWarningThresholdExceeded(),
        cutoverEligible: isCutoverEligible(),
        lastUpdated: metrics.lastUpdated,
        windowStart: metrics.windowStart,
        perRouteMetrics,
      };
    },

    isRouteEnabled(routeId: string): boolean {
      return enabledRoutes.has(routeId);
    },

    enableRoute(routeId: string): void {
      enabledRoutes.add(routeId);
      const routeMetric = getRouteMetrics(routeId);
      routeMetric.shadowEnabled = true;
    },

    disableRoute(routeId: string): void {
      enabledRoutes.delete(routeId);
      const routeMetric = metrics.routeMetrics.get(routeId);
      if (routeMetric) {
        routeMetric.shadowEnabled = false;
      }
    },

    checkCutoverEligibility(): CutoverEligibilityResult {
      const currentMismatchRate = calculateMismatchRate();
      const requiredThreshold = thresholds.cutoverThreshold;
      const MIN_SAMPLE_SIZE = 100;

      const recommendations: string[] = [];

      // Check sample size
      if (metrics.totalChecks < MIN_SAMPLE_SIZE) {
        recommendations.push(
          `Need more sample data: ${metrics.totalChecks}/${MIN_SAMPLE_SIZE} checks completed`,
        );
      }

      // Check mismatch rate
      if (currentMismatchRate >= requiredThreshold) {
        recommendations.push(
          `Reduce mismatch rate from ${(currentMismatchRate * 100).toFixed(3)}% to < ${(requiredThreshold * 100).toFixed(1)}%`,
        );
      }

      // Find problem routes (routes with high mismatch rates)
      const problemRoutes: Array<{
        routeId: string;
        mismatchRate: number;
        mismatchCount: number;
      }> = [];

      for (const [_, rm] of metrics.routeMetrics) {
        if (rm.mismatchCount > 0) {
          const rate = rm.totalChecks > 0 ? rm.mismatchCount / rm.totalChecks : 0;
          if (rate >= requiredThreshold || rm.mismatchCount > 0) {
            problemRoutes.push({
              routeId: rm.routeId,
              mismatchRate: rate,
              mismatchCount: rm.mismatchCount,
            });
          }
        }
      }

      // Sort by mismatch rate descending
      problemRoutes.sort((a, b) => b.mismatchRate - a.mismatchRate);

      // Add route-specific recommendations
      const topProblemRoute = problemRoutes[0];
      if (topProblemRoute !== undefined) {
        recommendations.push(
          `Investigate route "${topProblemRoute.routeId}" with ${topProblemRoute.mismatchCount} mismatches (${(topProblemRoute.mismatchRate * 100).toFixed(2)}%)`,
        );
      }

      const eligible = isCutoverEligible();

      let reason: string | undefined;
      if (!eligible) {
        if (metrics.totalChecks < MIN_SAMPLE_SIZE) {
          reason = `Insufficient sample size: ${metrics.totalChecks} checks (need ${MIN_SAMPLE_SIZE})`;
        } else {
          reason = `Mismatch rate ${(currentMismatchRate * 100).toFixed(3)}% exceeds threshold ${(requiredThreshold * 100).toFixed(1)}%`;
        }
      }

      return {
        eligible,
        currentMismatchRate,
        requiredThreshold,
        reason,
        recommendations,
        problemRoutes,
      };
    },

    resetMetrics(): void {
      metrics.totalChecks = 0;
      metrics.mismatchCount = 0;
      metrics.falsePositives = 0;
      metrics.falseNegatives = 0;
      metrics.excludedCount = 0;
      metrics.windowStart = new Date();
      metrics.lastUpdated = new Date();
      metrics.routeMetrics.clear();
    },

    getThresholds(): ShadowAuthorizationThresholds {
      return { ...thresholds };
    },

    setThresholds(newThresholds: Partial<ShadowAuthorizationThresholds>): void {
      thresholds = { ...thresholds, ...newThresholds };
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type ShadowAuthorizationService = IShadowAuthorizationService;

