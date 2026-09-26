/**
 * Shadow Mode Authorization Types — Type definitions for shadow mode validation.
 *
 * Shadow mode runs both legacy and new authorization in parallel to validate
 * the new system before full cutover. The legacy result is used for actual
 * access decisions while new results are compared and logged.
 *
 * **Key Concepts:**
 * - `ShadowAuthConfig`: Configuration for shadow mode behavior
 * - `ShadowAuthResult`: Result of parallel auth execution with comparison
 * - `ShadowMismatch`: Classification and details of authorization mismatches
 * - `ShadowMetrics`: Aggregate metrics for monitoring shadow mode performance
 *
 * @see Requirements 4 (AC 1-8) — Shadow Mode Authorization
 * @see Design Shadow Mode Authorization
 */

import type { AuthContext } from '@core/protocols';
import type { AuthorizationContext } from '@core/domains/authorization/types';

// ---------------------------------------------------------------------------
// Shadow Mode Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for shadow mode authorization validation.
 *
 * @see Requirements 4.1 — Global shadow mode enabled flag
 * @see Requirements 4.5 — Per-route shadow mode enablement
 */
export interface ShadowAuthConfig {
  /**
   * Global shadow mode enabled flag.
   * When true, shadow mode is active for all non-excluded routes.
   */
  readonly enabled: boolean;

  /**
   * Routes excluded from shadow mode (auth routes, health checks).
   * Matched against request pathname.
   *
   * @see Requirements 4.8 — Exclude auth routes from shadow mode
   */
  readonly excludedRoutes: readonly RegExp[];

  /**
   * Per-route overrides for shadow mode.
   * Key is the route pathname pattern, value is enabled/disabled.
   * Takes precedence over global enabled flag when specified.
   *
   * @see Requirements 4.5 — Per-route shadow mode enablement via feature flags
   */
  readonly routeOverrides: ReadonlyMap<string, boolean>;

  /**
   * Threshold configuration for alerting and monitoring.
   */
  readonly thresholds: ShadowModeThresholds;
}

/**
 * Threshold configuration for shadow mode monitoring.
 *
 * @see Requirements 4.6 — Latency impact warning threshold
 * @see Requirements 4.7 — Mismatch rate critical alert threshold
 */
export interface ShadowModeThresholds {
  /**
   * Mismatch rate threshold for critical alerting (default 0.01 = 1%).
   *
   * @see Requirements 4.7
   */
  readonly mismatchAlertThreshold: number;

  /**
   * Latency threshold for warning alert (default 100ms).
   *
   * @see Requirements 4.6
   */
  readonly latencyWarningThresholdMs: number;
}

// ---------------------------------------------------------------------------
// Legacy Auth Result
// ---------------------------------------------------------------------------

/**
 * Result from legacy authorization (resolveAuthContext).
 *
 * Captures whether the legacy system allowed/denied access and the
 * resulting AuthContext if allowed.
 *
 * @deprecated This type represents the LEGACY authorization pattern that is being
 * phased out as part of the Multi-Tenant Integration Cutover.
 *
 * **Migration Path:**
 * - Use {@link NewAuthResult} for new authorization implementations
 * - Use {@link AuthorizationContext} from `@core/domains/authorization/types`
 *   instead of legacy `AuthContext`
 *
 * **Timeline:**
 * - This type will be removed 30 days after migration completion validation
 * - Track progress in `.kiro/specs/multi-tenant-integration-cutover/tasks.md`
 *
 * @see Requirements 18.3 — TSDoc warnings for legacy patterns
 * @see Design Phase 2.15 — Legacy Code Deprecation
 */
export interface LegacyAuthResult {
  /**
   * Whether the legacy auth allowed access.
   * True if resolveAuthContext returned a valid AuthContext.
   */
  readonly allowed: boolean;

  /**
   * The resolved AuthContext from legacy auth (if allowed).
   */
  readonly authContext?: AuthContext;

  /**
   * Error code if denied (null if allowed).
   */
  readonly errorCode?: string;

  /**
   * Execution time in milliseconds.
   */
  readonly executionTimeMs: number;
}

// ---------------------------------------------------------------------------
// New Auth Result
// ---------------------------------------------------------------------------

/**
 * Result from new authorization (AuthorizationContextResolver + withPermission).
 *
 * Captures whether the new system allowed/denied access and the
 * resulting AuthorizationContext if allowed.
 */
export interface NewAuthResult {
  /**
   * Whether the new auth allowed access.
   * True if AuthorizationContextResolver resolved successfully AND
   * permission checks passed.
   */
  readonly allowed: boolean;

  /**
   * The resolved AuthorizationContext from new auth (if allowed).
   */
  readonly authorizationContext?: AuthorizationContext;

  /**
   * Error code if denied (null if allowed).
   */
  readonly errorCode?: string;

  /**
   * Missing permissions (if denied due to insufficient permissions).
   */
  readonly missingPermissions?: readonly string[];

  /**
   * Execution time in milliseconds.
   */
  readonly executionTimeMs: number;
}

// ---------------------------------------------------------------------------
// Mismatch Classification
// ---------------------------------------------------------------------------

/**
 * Classification of shadow mode mismatch types.
 *
 * @see Requirements 4.2 — Log mismatches with mismatchType
 */
export enum MismatchType {
  /**
   * False Positive: New auth ALLOWS when legacy DENIES.
   * This is a security concern — new auth is more permissive.
   *
   * @see Requirements 4.4 — Track false positives
   */
  FALSE_POSITIVE = 'false_positive',

  /**
   * False Negative: New auth DENIES when legacy ALLOWS.
   * This could cause service disruption — new auth is more restrictive.
   *
   * @see Requirements 4.4 — Track false negatives
   */
  FALSE_NEGATIVE = 'false_negative',

  /**
   * Data Mismatch: Both allow/deny match, but context data differs.
   * E.g., different tenantId, userId, role values.
   */
  DATA_MISMATCH = 'data_mismatch',
}

// ---------------------------------------------------------------------------
// Shadow Auth Result
// ---------------------------------------------------------------------------

/**
 * Result of shadow mode parallel authorization execution.
 *
 * Contains results from both legacy and new auth systems, comparison
 * result, and timing information.
 *
 * @see Requirements 4.1 — Parallel execution of legacy and new auth
 * @see Requirements 4.3 — Use legacy result for actual access decision
 */
export interface ShadowAuthResult {
  /**
   * Result from legacy authorization.
   */
  readonly legacyResult: LegacyAuthResult;

  /**
   * Result from new authorization.
   */
  readonly newResult: NewAuthResult;

  /**
   * Whether both systems produced the same decision.
   */
  readonly match: boolean;

  /**
   * Type of mismatch if results don't match.
   */
  readonly mismatchType?: MismatchType;

  /**
   * Detailed description of the mismatch (for logging).
   */
  readonly mismatchDetails?: string;

  /**
   * Total execution time for shadow mode (includes both auth systems).
   */
  readonly executionTimeMs: number;

  /**
   * Timestamp when shadow execution completed.
   */
  readonly executedAt: Date;
}

// ---------------------------------------------------------------------------
// Mismatch Log Entry
// ---------------------------------------------------------------------------

/**
 * Log entry for authorization mismatches.
 *
 * Contains all context needed for debugging and analysis.
 *
 * @see Requirements 4.2 — Log mismatches with full context
 */
export interface MismatchLogEntry {
  /**
   * Correlation ID for request tracing.
   */
  readonly correlationId: string;

  /**
   * Timestamp of the mismatch.
   */
  readonly timestamp: Date;

  /**
   * User ID from the request.
   */
  readonly userId: string;

  /**
   * Tenant ID from the request.
   */
  readonly tenantId: string;

  /**
   * API endpoint that was accessed.
   */
  readonly endpoint: string;

  /**
   * HTTP method (GET, POST, etc.).
   */
  readonly method: string;

  /**
   * Result from legacy authorization.
   */
  readonly legacyResult: MismatchLogLegacyResult;

  /**
   * Result from new authorization.
   */
  readonly newResult: MismatchLogNewResult;

  /**
   * Classification of the mismatch.
   */
  readonly mismatchType: MismatchType;

  /**
   * Detailed description of what differed.
   */
  readonly mismatchDetails: string;

  /**
   * Required permissions for this endpoint (if applicable).
   */
  readonly requiredPermissions?: readonly string[];
}

/**
 * Simplified legacy result for mismatch logging.
 * Excludes sensitive data while keeping relevant context.
 *
 * @deprecated This type supports the LEGACY authorization pattern that is being
 * phased out. It will be removed alongside {@link LegacyAuthResult} 30 days
 * after migration completion validation.
 *
 * @see Requirements 18.3 — TSDoc warnings for legacy patterns
 */
export interface MismatchLogLegacyResult {
  readonly allowed: boolean;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly role?: string;
  readonly errorCode?: string;
}

/**
 * Simplified new result for mismatch logging.
 * Excludes sensitive data while keeping relevant context.
 */
export interface MismatchLogNewResult {
  readonly allowed: boolean;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly membershipId?: string;
  readonly role?: string;
  readonly permissions?: readonly string[];
  readonly errorCode?: string;
  readonly missingPermissions?: readonly string[];
}

// ---------------------------------------------------------------------------
// Shadow Mode Metrics
// ---------------------------------------------------------------------------

/**
 * Aggregate metrics for shadow mode monitoring.
 *
 * @see Requirements 4.4 — Track and expose metrics
 */
export interface ShadowMetrics {
  /**
   * Total requests processed in shadow mode.
   */
  readonly totalRequests: number;

  /**
   * Number of mismatches detected.
   */
  readonly mismatchCount: number;

  /**
   * Mismatch rate (mismatchCount / totalRequests).
   */
  readonly mismatchRate: number;

  /**
   * Number of false positives (new allows, legacy denies).
   */
  readonly falsePositives: number;

  /**
   * Number of false negatives (new denies, legacy allows).
   */
  readonly falseNegatives: number;

  /**
   * Number of data mismatches.
   */
  readonly dataMismatches: number;

  /**
   * Average latency in milliseconds.
   */
  readonly avgLatencyMs: number;

  /**
   * 95th percentile latency in milliseconds.
   */
  readonly p95LatencyMs: number;

  /**
   * Time window start for these metrics.
   */
  readonly windowStartTime: Date;

  /**
   * Time window end for these metrics.
   */
  readonly windowEndTime: Date;

  /**
   * Duration of the time window in days.
   */
  readonly windowDays: number;
}

// ---------------------------------------------------------------------------
// Execution Context
// ---------------------------------------------------------------------------

/**
 * Context for shadow mode authorization execution.
 *
 * Contains all information needed to execute both auth systems.
 */
export interface ShadowExecutionContext {
  /**
   * Correlation ID for request tracing.
   */
  readonly correlationId: string;

  /**
   * API endpoint being accessed.
   */
  readonly endpoint: string;

  /**
   * HTTP method (GET, POST, etc.).
   */
  readonly method: string;

  /**
   * Required permissions for this endpoint.
   */
  readonly requiredPermissions: readonly string[];

  /**
   * Whether suspended memberships are allowed (safety-critical routes).
   */
  readonly allowSuspended?: boolean;

  /**
   * User ID extracted from JWT (for legacy auth).
   */
  readonly userId?: string;

  /**
   * Tenant ID extracted from JWT (for legacy auth).
   */
  readonly tenantId?: string;

  /**
   * User role extracted from headers (for legacy auth).
   */
  readonly userRole?: string;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * Interface for the Shadow Auth Executor service.
 *
 * @see Requirements 4 (AC 1-8)
 */
export interface IShadowAuthExecutor {
  /**
   * Execute shadow mode authorization validation.
   *
   * Runs both legacy and new authorization in parallel, compares results,
   * and logs any mismatches. Returns the shadow auth result with comparison.
   *
   * IMPORTANT: The actual access decision uses the LEGACY result.
   *
   * @param context - Execution context with request details
   * @returns Shadow auth result with comparison
   *
   * @see Requirements 4.1 — Parallel execution
   * @see Requirements 4.3 — Legacy result for actual decision
   */
  execute(context: ShadowExecutionContext): Promise<ShadowAuthResult>;

  /**
   * Check if shadow mode is enabled for a given route.
   *
   * @param endpoint - The API endpoint path
   * @returns true if shadow mode should run for this route
   *
   * @see Requirements 4.5 — Per-route shadow mode control
   * @see Requirements 4.8 — Auth route exclusion
   */
  isEnabledForRoute(endpoint: string): boolean;

  /**
   * Get current shadow mode metrics.
   *
   * @returns Current metrics snapshot
   *
   * @see Requirements 4.4 — Track and expose metrics
   */
  getMetrics(): ShadowMetrics;

  /**
   * Reset metrics (for testing or new monitoring window).
   */
  resetMetrics(): void;

  /**
   * Update shadow mode configuration.
   *
   * @param config - New configuration (partial update supported)
   */
  updateConfig(config: Partial<ShadowAuthConfig>): void;

  /**
   * Get current shadow mode configuration.
   */
  getConfig(): ShadowAuthConfig;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default mismatch alert threshold (1%).
 */
export const DEFAULT_MISMATCH_ALERT_THRESHOLD = 0.01;

/**
 * Default latency warning threshold (100ms).
 */
export const DEFAULT_LATENCY_WARNING_THRESHOLD_MS = 100;

/**
 * Auth routes excluded from shadow mode by default.
 *
 * @see Requirements 4.8
 */
export const DEFAULT_EXCLUDED_ROUTES: RegExp[] = [
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/logout$/,
  /^\/api\/auth\/register$/,
  /^\/api\/auth\/refresh$/,
  /^\/api\/auth\/forgot-password$/,
  /^\/api\/auth\/reset-password$/,
  /^\/api\/health$/,
  /^\/api\/health\/.*$/,
];
