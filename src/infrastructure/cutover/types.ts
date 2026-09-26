/**
 * Authorization Cutover Types — Type definitions for authorization cutover service.
 *
 * This module defines types for:
 * - Cutover status tracking (per-route and global)
 * - Cutover prerequisite verification
 * - Cutover audit logging
 * - Rollback support
 *
 * **CRITICAL:** These types support the Req 8 Authorization Cutover requirement
 * with the following key properties:
 * - Atomic switching via feature flag
 * - Per-route granular cutover
 * - Instant rollback support
 * - Mismatch threshold gate (< 0.1%)
 * - Pre-cutover write compatibility gate verification
 * - Audit logging of all cutover/rollback actions
 *
 * @see Task 25: Authorization Cutover Service
 * @see Requirements 8 (AC 1-7)
 * @see TPR-06: Warning vs Cutover threshold semantics
 */

// ---------------------------------------------------------------------------
// Cutover Status
// ---------------------------------------------------------------------------

/**
 * Status of authorization cutover for a route or globally.
 *
 * **State Machine:**
 * LEGACY → TRANSITIONING → MEMBERSHIP_AUTHORITATIVE
 *       ↓                 ↓
 *    (rollback)       (rollback)
 *       ↓                 ↓
 *   ROLLED_BACK ←────────┘
 */
export enum CutoverStatus {
  /**
   * Legacy authorization is authoritative (default before cutover).
   * User.tenantId + UserRole is used for authorization decisions.
   */
  LEGACY = 'LEGACY',

  /**
   * Cutover is in progress (transitional state during atomic switch).
   * This is a brief state during the cutover operation.
   */
  TRANSITIONING = 'TRANSITIONING',

  /**
   * Membership-based authorization is authoritative (post-cutover).
   * New Membership model is used for authorization decisions.
   */
  MEMBERSHIP_AUTHORITATIVE = 'MEMBERSHIP_AUTHORITATIVE',

  /**
   * Authorization was rolled back to legacy after cutover.
   * This state indicates a rollback has occurred.
   */
  ROLLED_BACK = 'ROLLED_BACK',
}

// ---------------------------------------------------------------------------
// Route Cutover Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for a single route's cutover state.
 */
export interface RouteCutoverConfig {
  /** Unique identifier for the route */
  readonly routeId: string;

  /** Human-readable name/description of the route */
  readonly routeName: string;

  /** Current cutover status */
  readonly status: CutoverStatus;

  /** Timestamp when the route was created in the cutover system */
  readonly createdAt: Date;

  /** Timestamp of last status change */
  readonly updatedAt: Date;

  /** Timestamp when cutover was initiated (if applicable) */
  readonly cutoverAt?: Date;

  /** Timestamp when rollback occurred (if applicable) */
  readonly rolledBackAt?: Date;

  /** User ID who performed the last operation */
  readonly lastOperatorId?: string;

  /** Notes or reason for current state */
  readonly notes?: string;
}

/**
 * Mutable version of RouteCutoverConfig for internal state management.
 */
export interface MutableRouteCutoverConfig {
  routeId: string;
  routeName: string;
  status: CutoverStatus;
  createdAt: Date;
  updatedAt: Date;
  cutoverAt?: Date;
  rolledBackAt?: Date;
  lastOperatorId?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Cutover Audit Logging
// ---------------------------------------------------------------------------

/**
 * Types of cutover audit events.
 */
export enum CutoverAuditAction {
  /** Route cutover initiated */
  CUTOVER_INITIATED = 'CUTOVER_INITIATED',

  /** Route cutover completed successfully */
  CUTOVER_COMPLETED = 'CUTOVER_COMPLETED',

  /** Route cutover failed */
  CUTOVER_FAILED = 'CUTOVER_FAILED',

  /** Route rollback initiated */
  ROLLBACK_INITIATED = 'ROLLBACK_INITIATED',

  /** Route rollback completed successfully */
  ROLLBACK_COMPLETED = 'ROLLBACK_COMPLETED',

  /** Route rollback failed */
  ROLLBACK_FAILED = 'ROLLBACK_FAILED',

  /** Prerequisites verification passed */
  PREREQUISITES_VERIFIED = 'PREREQUISITES_VERIFIED',

  /** Prerequisites verification failed */
  PREREQUISITES_FAILED = 'PREREQUISITES_FAILED',

  /** Global cutover status change */
  GLOBAL_STATUS_CHANGE = 'GLOBAL_STATUS_CHANGE',
}

/**
 * An entry in the cutover audit log.
 *
 * @see Requirements 8 (AC 6)
 */
export interface CutoverAuditEntry {
  /** Unique identifier for this audit entry */
  readonly id: string;

  /** Timestamp of the audit event */
  readonly timestamp: Date;

  /** Type of action performed */
  readonly action: CutoverAuditAction;

  /** User ID who performed the action */
  readonly operatorId: string;

  /** Route ID(s) affected (empty for global actions) */
  readonly routesAffected: readonly string[];

  /** Reason for the action */
  readonly reason: string;

  /** Previous status before the action */
  readonly previousStatus?: CutoverStatus;

  /** New status after the action */
  readonly newStatus?: CutoverStatus;

  /** Additional context/metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;

  /** Whether the action was successful */
  readonly success: boolean;

  /** Error message if action failed */
  readonly errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Cutover Prerequisites
// ---------------------------------------------------------------------------

/**
 * Result of prerequisite verification for cutover.
 *
 * @see Requirements 8 (AC 5), Task 24 dependency
 */
export interface CutoverPrerequisitesResult {
  /** Whether all prerequisites are met */
  readonly allMet: boolean;

  /** Timestamp of verification */
  readonly verifiedAt: Date;

  /** Pre-cutover write compatibility gate status */
  readonly writeCompatibilityGate: PrerequisiteCheckResult;

  /** Mismatch rate gate status (< 0.1%) */
  readonly mismatchRateGate: PrerequisiteCheckResult;

  /** Zero legacy-only writers check */
  readonly legacyWritersGate: PrerequisiteCheckResult;

  /** Summary message */
  readonly summary: string;

  /** List of blocking issues if any */
  readonly blockingIssues: readonly string[];
}

/**
 * Result of a single prerequisite check.
 */
export interface PrerequisiteCheckResult {
  /** Name of the prerequisite */
  readonly name: string;

  /** Whether the prerequisite is met */
  readonly met: boolean;

  /** Current value (for threshold checks) */
  readonly currentValue?: number | string;

  /** Required value/threshold */
  readonly requiredValue?: number | string;

  /** Detailed message */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Cutover Operation Parameters
// ---------------------------------------------------------------------------

/**
 * Parameters for initiating a route cutover.
 */
export interface InitiateRouteCutoverParams {
  /** Route to cut over */
  readonly routeId: string;

  /** User performing the cutover */
  readonly operatorId: string;

  /** Reason for cutover */
  readonly reason: string;

  /** Whether to skip prerequisite verification (for testing only) */
  readonly skipPrerequisiteCheck?: boolean;

  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * Parameters for rolling back a route cutover.
 */
export interface RollbackRouteCutoverParams {
  /** Route to rollback */
  readonly routeId: string;

  /** User performing the rollback */
  readonly operatorId: string;

  /** Reason for rollback */
  readonly reason: string;

  /** Whether this is an emergency rollback (triggers critical alert) */
  readonly isEmergency?: boolean;

  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

// ---------------------------------------------------------------------------
// Cutover Status Responses
// ---------------------------------------------------------------------------

/**
 * Overall cutover status for the system.
 */
export interface CutoverStatusResponse {
  /** Global cutover status (overall system state) */
  readonly globalStatus: CutoverStatus;

  /** Per-route cutover status */
  readonly routes: readonly RouteCutoverConfig[];

  /** Count of routes in each status */
  readonly statusCounts: Readonly<Record<CutoverStatus, number>>;

  /** Whether the system is fully cut over */
  readonly isFullyCutOver: boolean;

  /** Whether any routes have been rolled back */
  readonly hasRolledBackRoutes: boolean;

  /** Timestamp of last status change */
  readonly lastUpdated: Date;
}

/**
 * Result of a cutover operation.
 */
export interface CutoverOperationResult {
  /** Whether the operation succeeded */
  readonly success: boolean;

  /** Route ID that was operated on */
  readonly routeId: string;

  /** New status after operation */
  readonly newStatus: CutoverStatus;

  /** Audit entry created for this operation */
  readonly auditEntry: CutoverAuditEntry;

  /** Error message if operation failed */
  readonly errorMessage?: string;
}

/**
 * Result of a rollback operation.
 */
export interface RollbackOperationResult {
  /** Whether the operation succeeded */
  readonly success: boolean;

  /** Route ID that was rolled back */
  readonly routeId: string;

  /** New status after rollback */
  readonly newStatus: CutoverStatus;

  /** Whether a critical alert was emitted */
  readonly alertEmitted: boolean;

  /** Audit entry created for this operation */
  readonly auditEntry: CutoverAuditEntry;

  /** Error message if operation failed */
  readonly errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * Interface for the Authorization Cutover Service.
 *
 * @see Task 25: Authorization Cutover Service
 * @see Requirements 8 (AC 1-7)
 */
export interface IAuthorizationCutoverService {
  /**
   * Verify all prerequisites before cutover can proceed.
   *
   * Prerequisites include:
   * - Pre-cutover write compatibility gate PASSED (Task 24)
   * - Mismatch rate < 0.1% (cutover eligibility threshold)
   * - Zero legacy-only authorization writers
   *
   * @returns Prerequisite verification result
   *
   * @see Requirements 8 (AC 5)
   */
  verifyCutoverPrerequisites(): Promise<CutoverPrerequisitesResult>;

  /**
   * Initiate cutover for a specific route.
   *
   * This atomically switches the route from legacy to new authorization.
   *
   * @param params - Cutover parameters
   * @returns Cutover operation result
   *
   * @see Requirements 8 (AC 1-3)
   */
  initiateRouteCutover(params: InitiateRouteCutoverParams): Promise<CutoverOperationResult>;

  /**
   * Rollback a route cutover to legacy authorization.
   *
   * This provides instant rollback capability. If isEmergency is true,
   * a critical alert is emitted.
   *
   * @param params - Rollback parameters
   * @returns Rollback operation result
   *
   * @see Requirements 8 (AC 4, 7)
   */
  rollbackRouteCutover(params: RollbackRouteCutoverParams): Promise<RollbackOperationResult>;

  /**
   * Get the current cutover status for all routes.
   *
   * @returns Current cutover status
   */
  getCutoverStatus(): CutoverStatusResponse;

  /**
   * Get the cutover status for a specific route.
   *
   * @param routeId - Route identifier
   * @returns Route cutover config or undefined if not found
   */
  getRouteCutoverStatus(routeId: string): RouteCutoverConfig | undefined;

  /**
   * Check if a route is currently using membership-based authorization.
   *
   * @param routeId - Route identifier
   * @returns true if the route is cut over to membership authorization
   */
  isRouteCutOver(routeId: string): boolean;

  /**
   * Get the audit log of all cutover/rollback actions.
   *
   * @param options - Optional filtering options
   * @returns Audit log entries
   *
   * @see Requirements 8 (AC 6)
   */
  getAuditLog(options?: AuditLogOptions): readonly CutoverAuditEntry[];

  /**
   * Register a route for cutover tracking.
   *
   * This should be called to add routes to the cutover system before
   * cutover can be initiated.
   *
   * @param routeId - Route identifier
   * @param routeName - Human-readable route name
   */
  registerRoute(routeId: string, routeName: string): void;

  /**
   * Get the list of registered routes.
   */
  getRegisteredRoutes(): readonly string[];
}

/**
 * Options for filtering audit log queries.
 */
export interface AuditLogOptions {
  /** Filter by route ID */
  readonly routeId?: string;

  /** Filter by action type */
  readonly action?: CutoverAuditAction;

  /** Filter by operator ID */
  readonly operatorId?: string;

  /** Filter by time range start */
  readonly fromTimestamp?: Date;

  /** Filter by time range end */
  readonly toTimestamp?: Date;

  /** Maximum number of entries to return */
  readonly limit?: number;

  /** Only include successful operations */
  readonly successOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Alert Interface
// ---------------------------------------------------------------------------

/**
 * Interface for emitting cutover-related alerts.
 */
export interface ICutoverAlertEmitter {
  /**
   * Emit a critical alert (for rollbacks).
   *
   * @see Requirements 8 (AC 7)
   */
  emitCriticalAlert(params: CriticalAlertParams): void;

  /**
   * Emit an info alert (for successful operations).
   */
  emitInfoAlert(params: InfoAlertParams): void;
}

/**
 * Parameters for a critical alert.
 */
export interface CriticalAlertParams {
  readonly type: 'CUTOVER_ROLLBACK';
  readonly routeId: string;
  readonly reason: string;
  readonly operatorId: string;
  readonly timestamp: Date;
  readonly correlationId?: string;
}

/**
 * Parameters for an info alert.
 */
export interface InfoAlertParams {
  readonly type: 'CUTOVER_SUCCESS' | 'PREREQUISITES_VERIFIED';
  readonly routeId?: string;
  readonly message: string;
  readonly operatorId: string;
  readonly timestamp: Date;
  readonly correlationId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default cutover eligibility threshold (0.1% mismatch rate).
 *
 * @see Requirements 8 (AC 5)
 * @see TPR-06
 */
export const CUTOVER_MISMATCH_THRESHOLD = 0.001; // 0.1%

/**
 * Minimum sample size for cutover eligibility.
 */
export const CUTOVER_MIN_SAMPLE_SIZE = 100;
