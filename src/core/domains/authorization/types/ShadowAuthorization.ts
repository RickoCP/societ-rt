/**
 * Shadow Authorization Types
 *
 * Types for shadow authorization validation (FASE 1.9).
 * Executes both legacy and new authorization for each request,
 * logs mismatches, and tracks metrics for cutover eligibility.
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
 * @see Requirements 7 (AC 1-8)
 * @see Design Shadow Authorization Validation section
 * @see TPR-06: Warning vs Cutover threshold semantics
 */

import type { MembershipRole } from '@core/domains/membership/types';
import type { UserRole } from '@core/protocols';

// ---------------------------------------------------------------------------
// Authorization Result Types
// ---------------------------------------------------------------------------

/**
 * Result of an authorization check (legacy or new).
 */
export interface AuthorizationDecision {
  /**
   * Whether access is allowed.
   */
  readonly allowed: boolean;

  /**
   * The reason for the decision (for logging/debugging).
   */
  readonly reason: string;

  /**
   * Error code if denied (e.g., AUTH_NO_MEMBERSHIP).
   */
  readonly errorCode?: string;

  /**
   * The role that was checked (for comparison).
   */
  readonly role?: MembershipRole | UserRole;

  /**
   * The tenant ID that was checked.
   */
  readonly tenantId?: string;

  /**
   * The OrgUnit ID that was checked (only for new authorization).
   */
  readonly orgUnitId?: string | null;
}

/**
 * Result of shadow authorization comparison.
 *
 * Contains both legacy and new authorization results plus comparison outcome.
 */
export interface ShadowAuthorizationResult {
  /**
   * Unique correlation ID for this request.
   */
  readonly correlationId: string;

  /**
   * Result from legacy authorization (User.tenantId + UserRole).
   */
  readonly legacyResult: AuthorizationDecision;

  /**
   * Result from new authorization (Membership-based).
   */
  readonly newResult: AuthorizationDecision;

  /**
   * Whether there is a mismatch between legacy and new.
   */
  readonly hasMismatch: boolean;

  /**
   * Type of mismatch (if any).
   * - 'false_positive': new allows when legacy denies
   * - 'false_negative': new denies when legacy allows
   * - null: no mismatch
   */
  readonly mismatchType: 'false_positive' | 'false_negative' | null;

  /**
   * The final decision used for the request (always legacy in shadow mode).
   */
  readonly finalDecision: AuthorizationDecision;

  /**
   * Whether this request was excluded from mismatch calculation (quarantined user).
   */
  readonly excludedFromMetrics: boolean;

  /**
   * Timestamp when the shadow auth was executed.
   */
  readonly executedAt: Date;

  /**
   * Duration of shadow authorization in milliseconds.
   */
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// Mismatch Logging Types
// ---------------------------------------------------------------------------

/**
 * Detailed mismatch record for logging and analysis.
 *
 * Contains full context for debugging authorization differences.
 */
export interface ShadowMismatch {
  /**
   * Unique correlation ID for tracing.
   */
  readonly correlationId: string;

  /**
   * User ID being authorized.
   */
  readonly userId: string;

  /**
   * Tenant ID context.
   */
  readonly tenantId: string;

  /**
   * The API endpoint being accessed.
   */
  readonly endpoint: string;

  /**
   * HTTP method (GET, POST, etc.).
   */
  readonly method: string;

  /**
   * Route ID for per-route shadow tracking.
   */
  readonly routeId: string;

  /**
   * Legacy authorization result.
   */
  readonly legacyResult: AuthorizationDecision;

  /**
   * New authorization result.
   */
  readonly newResult: AuthorizationDecision;

  /**
   * Type of mismatch.
   */
  readonly mismatchType: 'false_positive' | 'false_negative';

  /**
   * Timestamp when the mismatch occurred.
   */
  readonly timestamp: Date;

  /**
   * Additional context for debugging.
   */
  readonly context: {
    /**
     * Legacy User.tenantId value.
     */
    readonly legacyTenantId: string | null;

    /**
     * Legacy User.role value.
     */
    readonly legacyRole: UserRole | null;

    /**
     * New Membership details (if resolved).
     */
    readonly membershipId?: string;
    readonly membershipRole?: MembershipRole;
    readonly membershipOrgUnitId?: string | null;
    readonly membershipStatus?: string;
  };
}

// ---------------------------------------------------------------------------
// Metrics Types
// ---------------------------------------------------------------------------

/**
 * Aggregated metrics for shadow authorization.
 *
 * Used for monitoring, alerts, and cutover eligibility checks.
 */
export interface ShadowAuthorizationMetrics {
  /**
   * Total authorization checks executed (excluding quarantined).
   */
  readonly totalChecks: number;

  /**
   * Number of mismatches detected.
   */
  readonly mismatchCount: number;

  /**
   * Number of false positives (new allows when legacy denies).
   * SECURITY CONCERN: These could allow unauthorized access after cutover.
   */
  readonly falsePositives: number;

  /**
   * Number of false negatives (new denies when legacy allows).
   * AVAILABILITY CONCERN: These could block legitimate access after cutover.
   */
  readonly falseNegatives: number;

  /**
   * Mismatch rate as a decimal (0.0 to 1.0).
   * Calculated as: mismatchCount / totalChecks
   */
  readonly mismatchRate: number;

  /**
   * Number of checks excluded from metrics (quarantined users).
   */
  readonly excludedCount: number;

  /**
   * Whether WARNING threshold is exceeded (> 1%).
   * Triggers operational alert when true.
   */
  readonly warningThresholdExceeded: boolean;

  /**
   * Whether system is eligible for cutover (< 0.1% mismatch rate).
   * This is a stricter threshold than the warning threshold.
   * MUST be true before authorization cutover can proceed.
   */
  readonly cutoverEligible: boolean;

  /**
   * Timestamp when metrics were last updated.
   */
  readonly lastUpdated: Date;

  /**
   * Start of the metrics collection window.
   */
  readonly windowStart: Date;

  /**
   * Per-route breakdown of mismatches.
   */
  readonly perRouteMetrics: ReadonlyMap<string, RouteMetrics>;
}

/**
 * Per-route metrics for granular analysis.
 */
export interface RouteMetrics {
  /**
   * Route identifier.
   */
  readonly routeId: string;

  /**
   * Total checks for this route.
   */
  readonly totalChecks: number;

  /**
   * Mismatches for this route.
   */
  readonly mismatchCount: number;

  /**
   * Mismatch rate for this route.
   */
  readonly mismatchRate: number;

  /**
   * Whether shadow mode is enabled for this route.
   */
  readonly shadowEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Configuration Types
// ---------------------------------------------------------------------------

/**
 * Threshold configuration for shadow authorization.
 *
 * TPR-06: Warning threshold (1%) vs Cutover eligibility threshold (0.1%)
 * are intentionally different for operational vs security gates.
 */
export interface ShadowAuthorizationThresholds {
  /**
   * WARNING threshold (default 1% = 0.01).
   * When mismatch rate exceeds this, operational alerts are triggered.
   */
  readonly warningThreshold: number;

  /**
   * CUTOVER ELIGIBILITY threshold (default 0.1% = 0.001).
   * Mismatch rate MUST be below this for cutover to proceed.
   * This is a security gate, not just an operational alert.
   */
  readonly cutoverThreshold: number;
}

/**
 * Default thresholds per TPR-06.
 */
export const DEFAULT_SHADOW_THRESHOLDS: Readonly<ShadowAuthorizationThresholds> =
  Object.freeze({
    warningThreshold: 0.01, // 1% - triggers operational alert
    cutoverThreshold: 0.001, // 0.1% - security gate for cutover
  });

/**
 * Shadow authorization request input.
 */
export interface ShadowAuthorizationRequest {
  /**
   * Unique correlation ID for tracing.
   */
  readonly correlationId: string;

  /**
   * User ID being authorized.
   */
  readonly userId: string;

  /**
   * Active tenant ID from JWT.
   */
  readonly activeTenantId: string;

  /**
   * Active OrgUnit ID from JWT (can be null for tenant-level admins).
   */
  readonly activeOrgUnitId: string | null;

  /**
   * Token version from JWT.
   */
  readonly tokenVersion: number;

  /**
   * Route being accessed.
   */
  readonly routeId: string;

  /**
   * Endpoint being accessed.
   */
  readonly endpoint: string;

  /**
   * HTTP method.
   */
  readonly method: string;

  /**
   * Required permissions for this route.
   */
  readonly requiredPermissions: readonly string[];

  /**
   * Resource tenant ID (for cross-tenant checks).
   */
  readonly resourceTenantId?: string;

  /**
   * Resource OrgUnit ID (for scope checks).
   */
  readonly resourceOrgUnitId?: string;
}

/**
 * Shadow mode configuration for a route.
 */
export interface RouteShoadowConfig {
  /**
   * Route identifier.
   */
  readonly routeId: string;

  /**
   * Whether shadow mode is enabled for this route.
   */
  readonly enabled: boolean;

  /**
   * When shadow mode was enabled.
   */
  readonly enabledAt?: Date;

  /**
   * Optional override for warning threshold.
   */
  readonly warningThresholdOverride?: number;
}

// ---------------------------------------------------------------------------
// Cutover Eligibility Types
// ---------------------------------------------------------------------------

/**
 * Result of cutover eligibility check.
 */
export interface CutoverEligibilityResult {
  /**
   * Whether cutover is eligible.
   */
  readonly eligible: boolean;

  /**
   * Current mismatch rate.
   */
  readonly currentMismatchRate: number;

  /**
   * Required threshold for eligibility.
   */
  readonly requiredThreshold: number;

  /**
   * Reason if not eligible.
   */
  readonly reason?: string;

  /**
   * Recommendations for achieving eligibility.
   */
  readonly recommendations: readonly string[];

  /**
   * Routes with highest mismatch rates (for prioritization).
   */
  readonly problemRoutes: readonly {
    readonly routeId: string;
    readonly mismatchRate: number;
    readonly mismatchCount: number;
  }[];
}

