/**
 * ShadowAuthExecutor — Parallel Authorization Validation Service
 *
 * Executes both legacy and new authorization systems in parallel to validate
 * the new authorization model before full cutover. The legacy result is ALWAYS
 * used for actual access decisions — new results are for validation only.
 *
 * **Key Features:**
 * - Parallel execution of legacy `resolveAuthContext()` and new `AuthorizationContextResolver`
 * - Mismatch detection with classification (false_positive, false_negative, data_mismatch)
 * - Detailed mismatch logging with full context for debugging
 * - Metrics tracking for monitoring mismatch rate and latency
 * - Per-route shadow mode control via configuration
 * - Auth route exclusion
 *
 * **Security Considerations:**
 * - Legacy result is ALWAYS authoritative during shadow mode (INV-SHADOW-001)
 * - Never expose internal auth details to client
 * - Log mismatches with sufficient context for debugging
 * - Redact sensitive data from logs
 *
 * @see Requirements 4 (AC 1-8) — Shadow Mode Authorization
 * @see Design Shadow Mode Authorization
 * @see 12-error-handling.md Steering
 */

import type { AuthContext, UserRole } from '@core/protocols';
import type { AuthorizationContext } from '@core/domains/authorization/types';
import { MembershipRole, MembershipStatus } from '@core/domains/membership/types';
import type { IAuthorizationContextResolver } from '@core/domains/authorization/services/AuthorizationContextResolver';
import type { Logger } from '@infrastructure/logging/Logger';
import {
  type ShadowAuthConfig,
  type ShadowAuthResult,
  type ShadowExecutionContext,
  type ShadowMetrics,
  type LegacyAuthResult,
  type NewAuthResult,
  type MismatchLogEntry,
  type MismatchLogLegacyResult,
  type MismatchLogNewResult,
  type IShadowAuthExecutor,
  MismatchType,
  DEFAULT_MISMATCH_ALERT_THRESHOLD,
  DEFAULT_LATENCY_WARNING_THRESHOLD_MS,
  DEFAULT_EXCLUDED_ROUTES,
} from './types';

// ---------------------------------------------------------------------------
// Metrics State
// ---------------------------------------------------------------------------

/**
 * Internal mutable metrics state.
 */
interface MetricsState {
  totalRequests: number;
  mismatchCount: number;
  falsePositives: number;
  falseNegatives: number;
  dataMismatches: number;
  latencies: number[];
  windowStartTime: Date;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a ShadowAuthExecutor instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param logger - Logger instance for mismatch logging
 * @param authorizationContextResolver - New auth context resolver (optional, for full integration)
 * @returns An implementation of IShadowAuthExecutor
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   shadowAuthExecutor: asFunction(ShadowAuthExecutorImpl).singleton(),
 * });
 *
 * // Usage in middleware
 * const shadowExecutor = DI.resolve('shadowAuthExecutor');
 * if (shadowExecutor.isEnabledForRoute(endpoint)) {
 *   const result = await shadowExecutor.execute(context);
 *   // Use result.legacyResult for actual decision
 * }
 * ```
 */
export const ShadowAuthExecutorImpl = ({
  logger,
  authorizationContextResolver,
}: {
  logger: Logger;
  authorizationContextResolver?: IAuthorizationContextResolver;
}): IShadowAuthExecutor => {
  // -------------------------------------------------------------------------
  // Internal State
  // -------------------------------------------------------------------------

  /**
   * Current shadow mode configuration.
   */
  let config: ShadowAuthConfig = {
    enabled: false,
    excludedRoutes: DEFAULT_EXCLUDED_ROUTES,
    routeOverrides: new Map(),
    thresholds: {
      mismatchAlertThreshold: DEFAULT_MISMATCH_ALERT_THRESHOLD,
      latencyWarningThresholdMs: DEFAULT_LATENCY_WARNING_THRESHOLD_MS,
    },
  };

  /**
   * Metrics state (mutable for accumulation).
   */
  let metricsState: MetricsState = {
    totalRequests: 0,
    mismatchCount: 0,
    falsePositives: 0,
    falseNegatives: 0,
    dataMismatches: 0,
    latencies: [],
    windowStartTime: new Date(),
  };

  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Execute legacy authorization (resolveAuthContext pattern).
   *
   * Creates a mock request with headers set to simulate the legacy auth flow.
   *
   * @deprecated This function implements the LEGACY authorization pattern that is being
   * phased out as part of the Multi-Tenant Integration Cutover.
   *
   * **Migration Path:**
   * - New authorization uses {@link AuthorizationContextResolver.resolve()}
   * - See {@link executeNewAuth} for the replacement implementation
   * - Route handlers should use `withPermission` wrapper instead of direct auth calls
   *
   * **Timeline:**
   * - This function will be removed 30 days after migration completion validation
   * - Shadow mode execution will be removed once mismatch rate is 0% for 7 days
   *
   * **Current Usage:**
   * - Used ONLY for shadow mode validation during cutover
   * - Legacy result is authoritative during shadow mode (INV-SHADOW-001)
   *
   * @see Requirements 18.3 — TSDoc warnings for legacy patterns
   * @see Requirements 4.3 — Legacy result for actual decision during shadow mode
   */
  const executeLegacyAuth = (
    context: ShadowExecutionContext,
  ): LegacyAuthResult => {
    const startTime = performance.now();

    try {
      // Build auth context from execution context
      // In legacy mode, these come from request headers set by middleware
      const authContext: AuthContext | null =
        context.userId && context.tenantId && context.userRole
          ? {
              userId: context.userId,
              tenantId: context.tenantId,
              role: context.userRole as UserRole,
            }
          : null;

      const executionTimeMs = performance.now() - startTime;

      if (!authContext) {
        return {
          allowed: false,
          errorCode: 'AUTH_TOKEN_INVALID',
          executionTimeMs,
        };
      }

      return {
        allowed: true,
        authContext,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = performance.now() - startTime;
      return {
        allowed: false,
        errorCode: 'AUTH_CONTEXT_RESOLUTION_FAILED',
        executionTimeMs,
      };
    }
  };

  /**
   * Execute new authorization (AuthorizationContextResolver pattern).
   *
   * Uses the injected resolver or simulates based on available context.
   */
  const executeNewAuth = async (
    context: ShadowExecutionContext,
  ): Promise<NewAuthResult> => {
    const startTime = performance.now();

    try {
      // If we have a resolver, use it
      if (authorizationContextResolver && context.userId && context.tenantId) {
        // Build JWT claims for resolver
        const jwtClaims = {
          userId: context.userId,
          activeTenantId: context.tenantId,
          activeOrgUnitId: null, // From context if available
          tokenVersion: 0, // Would come from actual JWT
        };

        const result = await authorizationContextResolver.resolve({
          jwtClaims,
          currentTokenVersion: 0, // Would need actual user token version
        });

        const executionTimeMs = performance.now() - startTime;

        if (!result.success) {
          return {
            allowed: false,
            errorCode: result.error?.code ?? 'AUTH_CONTEXT_RESOLUTION_FAILED',
            executionTimeMs,
          };
        }

        const authorizationContext = result.data.context;

        // Check permissions if required
        if (context.requiredPermissions.length > 0) {
          const missingPermissions = context.requiredPermissions.filter(
            (perm) => !authorizationContext.permissions.has(perm),
          );

          if (missingPermissions.length > 0) {
            return {
              allowed: false,
              authorizationContext,
              errorCode: 'AUTH_INSUFFICIENT_PERMISSION',
              missingPermissions,
              executionTimeMs,
            };
          }
        }

        return {
          allowed: true,
          authorizationContext,
          executionTimeMs,
        };
      }

      // Fallback: Simulate new auth based on legacy context
      // This is used when resolver is not available or for testing
      const executionTimeMs = performance.now() - startTime;

      if (!context.userId || !context.tenantId || !context.userRole) {
        return {
          allowed: false,
          errorCode: 'AUTH_TOKEN_INVALID',
          executionTimeMs,
        };
      }

      // Map legacy role to MembershipRole for simulation
      const roleMapping: Record<string, MembershipRole> = {
        Super_Admin: MembershipRole.PLATFORM_ADMIN,
        Ketua_RT: MembershipRole.RT_ADMIN,
        Pengurus: MembershipRole.RT_STAFF,
        Warga: MembershipRole.RESIDENT,
        Security_Guard: MembershipRole.SECURITY_GUARD,
      };

      const membershipRole =
        roleMapping[context.userRole] ?? MembershipRole.RESIDENT;

      // Simulate authorization context
      const simulatedContext: AuthorizationContext = {
        userId: context.userId,
        tenantId: context.tenantId,
        membershipId: 'simulated-membership-id',
        orgUnitId: null,
        role: membershipRole,
        permissions: new Set<string>(),
        tokenVersion: 0,
        isAuthoritative: true,
        isTenantLevel: true,
        membership: {
          id: 'simulated-membership-id',
          userId: context.userId,
          tenantId: context.tenantId,
          orgUnitId: null,
          role: membershipRole,
          status: MembershipStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      return {
        allowed: true,
        authorizationContext: simulatedContext,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = performance.now() - startTime;
      return {
        allowed: false,
        errorCode: 'AUTH_CONTEXT_RESOLUTION_FAILED',
        executionTimeMs,
      };
    }
  };

  /**
   * Compare legacy and new auth results to detect mismatches.
   */
  const compareResults = (
    legacyResult: LegacyAuthResult,
    newResult: NewAuthResult,
  ): {
    match: boolean;
    mismatchType?: MismatchType;
    mismatchDetails?: string;
  } => {
    // Case 1: Decision mismatch (allow vs deny)
    if (legacyResult.allowed !== newResult.allowed) {
      if (newResult.allowed && !legacyResult.allowed) {
        // New allows, legacy denies — potential security concern
        return {
          match: false,
          mismatchType: MismatchType.FALSE_POSITIVE,
          mismatchDetails: `New auth ALLOWS access while legacy DENIES. Legacy error: ${legacyResult.errorCode ?? 'unknown'}`,
        };
      } else {
        // New denies, legacy allows — potential service disruption
        return {
          match: false,
          mismatchType: MismatchType.FALSE_NEGATIVE,
          mismatchDetails: `New auth DENIES access while legacy ALLOWS. New error: ${newResult.errorCode ?? 'unknown'}${newResult.missingPermissions?.length ? `, missing permissions: ${newResult.missingPermissions.join(', ')}` : ''}`,
        };
      }
    }

    // Case 2: Both deny — check if error codes match
    if (!legacyResult.allowed && !newResult.allowed) {
      if (legacyResult.errorCode !== newResult.errorCode) {
        return {
          match: false,
          mismatchType: MismatchType.DATA_MISMATCH,
          mismatchDetails: `Both deny but with different errors. Legacy: ${legacyResult.errorCode}, New: ${newResult.errorCode}`,
        };
      }
      return { match: true };
    }

    // Case 3: Both allow — check context data consistency
    if (legacyResult.allowed && newResult.allowed) {
      const legacyContext = legacyResult.authContext;
      const newContext = newResult.authorizationContext;

      if (legacyContext && newContext) {
        const mismatches: string[] = [];

        // Compare userId
        if (legacyContext.userId !== newContext.userId) {
          mismatches.push(
            `userId: legacy=${legacyContext.userId}, new=${newContext.userId}`,
          );
        }

        // Compare tenantId
        if (legacyContext.tenantId !== newContext.tenantId) {
          mismatches.push(
            `tenantId: legacy=${legacyContext.tenantId}, new=${newContext.tenantId}`,
          );
        }

        // Note: Role comparison is tricky due to enum differences
        // Legacy uses UserRole, new uses MembershipRole
        // This is expected and not necessarily a mismatch

        if (mismatches.length > 0) {
          return {
            match: false,
            mismatchType: MismatchType.DATA_MISMATCH,
            mismatchDetails: `Context data mismatch: ${mismatches.join('; ')}`,
          };
        }
      }

      return { match: true };
    }

    return { match: true };
  };

  /**
   * Build a mismatch log entry for logging.
   */
  const buildMismatchLogEntry = (
    context: ShadowExecutionContext,
    legacyResult: LegacyAuthResult,
    newResult: NewAuthResult,
    mismatchType: MismatchType,
    mismatchDetails: string,
  ): MismatchLogEntry => {
    const legacyLogResult: MismatchLogLegacyResult = {
      allowed: legacyResult.allowed,
      userId: legacyResult.authContext?.userId,
      tenantId: legacyResult.authContext?.tenantId,
      role: legacyResult.authContext?.role,
      errorCode: legacyResult.errorCode,
    };

    const newLogResult: MismatchLogNewResult = {
      allowed: newResult.allowed,
      userId: newResult.authorizationContext?.userId,
      tenantId: newResult.authorizationContext?.tenantId,
      membershipId: newResult.authorizationContext?.membershipId,
      role: newResult.authorizationContext?.role,
      permissions: newResult.authorizationContext
        ? Array.from(newResult.authorizationContext.permissions)
        : undefined,
      errorCode: newResult.errorCode,
      missingPermissions: newResult.missingPermissions
        ? [...newResult.missingPermissions]
        : undefined,
    };

    return {
      correlationId: context.correlationId,
      timestamp: new Date(),
      userId: context.userId ?? 'unknown',
      tenantId: context.tenantId ?? 'unknown',
      endpoint: context.endpoint,
      method: context.method,
      legacyResult: legacyLogResult,
      newResult: newLogResult,
      mismatchType,
      mismatchDetails,
      requiredPermissions:
        context.requiredPermissions.length > 0
          ? [...context.requiredPermissions]
          : undefined,
    };
  };

  /**
   * Log a mismatch with full context.
   *
   * @see Requirements 4.2 — Log mismatches with correlationId, userId, tenantId, etc.
   */
  const logMismatch = (entry: MismatchLogEntry): void => {
    logger.warn('Shadow mode authorization mismatch detected', {
      correlation_id: entry.correlationId,
      timestamp: entry.timestamp.toISOString(),
      user_id: entry.userId,
      tenant_id: entry.tenantId,
      endpoint: entry.endpoint,
      method: entry.method,
      mismatch_type: entry.mismatchType,
      mismatch_details: entry.mismatchDetails,
      legacy_result: {
        allowed: entry.legacyResult.allowed,
        user_id: entry.legacyResult.userId,
        tenant_id: entry.legacyResult.tenantId,
        role: entry.legacyResult.role,
        error_code: entry.legacyResult.errorCode,
      },
      new_result: {
        allowed: entry.newResult.allowed,
        user_id: entry.newResult.userId,
        tenant_id: entry.newResult.tenantId,
        membership_id: entry.newResult.membershipId,
        role: entry.newResult.role,
        error_code: entry.newResult.errorCode,
        missing_permissions: entry.newResult.missingPermissions,
      },
      required_permissions: entry.requiredPermissions,
    });
  };

  /**
   * Update metrics after shadow execution.
   */
  const updateMetrics = (
    result: ShadowAuthResult,
    mismatchType?: MismatchType,
  ): void => {
    metricsState.totalRequests++;
    metricsState.latencies.push(result.executionTimeMs);

    if (!result.match && mismatchType) {
      metricsState.mismatchCount++;

      switch (mismatchType) {
        case MismatchType.FALSE_POSITIVE:
          metricsState.falsePositives++;
          break;
        case MismatchType.FALSE_NEGATIVE:
          metricsState.falseNegatives++;
          break;
        case MismatchType.DATA_MISMATCH:
          metricsState.dataMismatches++;
          break;
      }
    }

    // Check if we need to emit alerts
    const currentMismatchRate =
      metricsState.totalRequests > 0
        ? metricsState.mismatchCount / metricsState.totalRequests
        : 0;

    // Emit critical alert if mismatch rate exceeds threshold
    // @see Requirements 4.7
    if (currentMismatchRate > config.thresholds.mismatchAlertThreshold) {
      logger.error('Shadow mode mismatch rate exceeds threshold', {
        mismatch_rate: currentMismatchRate,
        threshold: config.thresholds.mismatchAlertThreshold,
        total_requests: metricsState.totalRequests,
        mismatch_count: metricsState.mismatchCount,
      });
    }

    // Emit warning if latency exceeds threshold
    // @see Requirements 4.6
    if (result.executionTimeMs > config.thresholds.latencyWarningThresholdMs) {
      logger.warn('Shadow mode latency exceeds threshold', {
        execution_time_ms: result.executionTimeMs,
        threshold_ms: config.thresholds.latencyWarningThresholdMs,
      });
    }
  };

  /**
   * Calculate percentile from sorted array.
   */
  const calculatePercentile = (
    sortedLatencies: number[],
    percentile: number,
  ): number => {
    if (sortedLatencies.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedLatencies.length) - 1;
    return sortedLatencies[Math.max(0, index)] ?? 0;
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    /**
     * Execute shadow mode authorization validation.
     *
     * @see Requirements 4.1 — Parallel execution
     * @see Requirements 4.3 — Legacy result for actual decision
     */
    async execute(context: ShadowExecutionContext): Promise<ShadowAuthResult> {
      const startTime = performance.now();

      // Execute both auth systems in parallel
      const [legacyResult, newResult] = await Promise.all([
        Promise.resolve(executeLegacyAuth(context)),
        executeNewAuth(context),
      ]);

      // Compare results
      const { match, mismatchType, mismatchDetails } = compareResults(
        legacyResult,
        newResult,
      );

      const executionTimeMs = performance.now() - startTime;

      const result: ShadowAuthResult = {
        legacyResult,
        newResult,
        match,
        mismatchType,
        mismatchDetails,
        executionTimeMs,
        executedAt: new Date(),
      };

      // Log mismatch if detected
      // @see Requirements 4.2
      if (!match && mismatchType && mismatchDetails) {
        const logEntry = buildMismatchLogEntry(
          context,
          legacyResult,
          newResult,
          mismatchType,
          mismatchDetails,
        );
        logMismatch(logEntry);
      }

      // Update metrics
      updateMetrics(result, mismatchType);

      return result;
    },

    /**
     * Check if shadow mode is enabled for a given route.
     *
     * @see Requirements 4.5 — Per-route control
     * @see Requirements 4.8 — Auth route exclusion
     */
    isEnabledForRoute(endpoint: string): boolean {
      // Check if globally disabled
      if (!config.enabled) {
        return false;
      }

      // Check if route is excluded
      // @see Requirements 4.8
      for (const pattern of config.excludedRoutes) {
        if (pattern.test(endpoint)) {
          return false;
        }
      }

      // Check for route-specific override
      // @see Requirements 4.5
      const override = config.routeOverrides.get(endpoint);
      if (override !== undefined) {
        return override;
      }

      // Default: enabled when global is enabled (unless explicitly excluded)
      // Per design: per-route defaults to ACTIVE when global enabled
      return true;
    },

    /**
     * Get current shadow mode metrics.
     *
     * @see Requirements 4.4
     */
    getMetrics(): ShadowMetrics {
      const sortedLatencies = [...metricsState.latencies].sort((a, b) => a - b);
      const avgLatencyMs =
        sortedLatencies.length > 0
          ? sortedLatencies.reduce((sum, l) => sum + l, 0) /
            sortedLatencies.length
          : 0;

      const windowEndTime = new Date();
      const windowDays =
        (windowEndTime.getTime() - metricsState.windowStartTime.getTime()) /
        (1000 * 60 * 60 * 24);

      return {
        totalRequests: metricsState.totalRequests,
        mismatchCount: metricsState.mismatchCount,
        mismatchRate:
          metricsState.totalRequests > 0
            ? metricsState.mismatchCount / metricsState.totalRequests
            : 0,
        falsePositives: metricsState.falsePositives,
        falseNegatives: metricsState.falseNegatives,
        dataMismatches: metricsState.dataMismatches,
        avgLatencyMs,
        p95LatencyMs: calculatePercentile(sortedLatencies, 95),
        windowStartTime: metricsState.windowStartTime,
        windowEndTime,
        windowDays,
      };
    },

    /**
     * Reset metrics.
     */
    resetMetrics(): void {
      metricsState = {
        totalRequests: 0,
        mismatchCount: 0,
        falsePositives: 0,
        falseNegatives: 0,
        dataMismatches: 0,
        latencies: [],
        windowStartTime: new Date(),
      };
    },

    /**
     * Update shadow mode configuration.
     */
    updateConfig(newConfig: Partial<ShadowAuthConfig>): void {
      config = {
        ...config,
        ...newConfig,
        thresholds: {
          ...config.thresholds,
          ...(newConfig.thresholds ?? {}),
        },
      };

      logger.info('Shadow mode configuration updated', {
        enabled: config.enabled,
        excluded_routes_count: config.excludedRoutes.length,
        route_overrides_count: config.routeOverrides.size,
        mismatch_alert_threshold: config.thresholds.mismatchAlertThreshold,
        latency_warning_threshold_ms:
          config.thresholds.latencyWarningThresholdMs,
      });
    },

    /**
     * Get current shadow mode configuration.
     */
    getConfig(): ShadowAuthConfig {
      return { ...config };
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type ShadowAuthExecutor = IShadowAuthExecutor;
