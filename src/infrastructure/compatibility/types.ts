/**
 * Compatibility Module Types — Type definitions for pre-cutover write compatibility.
 *
 * This module defines types for:
 * - Authorization-affecting write path classification
 * - Write path inventory management
 * - Pre-cutover gate verification
 * - Transaction consistency enforcement
 *
 * **CRITICAL:** These types support the TPR-05-FINAL requirement that ALL
 * authorization-affecting writes must synchronize Membership BEFORE cutover.
 *
 * @see Task 24: Pre-Cutover Authorization Write Compatibility
 * @see Requirements 8, 9, 45
 */

// ---------------------------------------------------------------------------
// Write Path Classification
// ---------------------------------------------------------------------------

/**
 * Classification of how an authorization-affecting write operation handles
 * Membership synchronization.
 *
 * **CUTOVER SAFETY RULES:**
 * - MEMBERSHIP_AUTHORITATIVE: Safe for cutover (Membership is source of truth)
 * - DUAL_WRITE: Safe for cutover (both legacy and Membership updated atomically)
 * - LEGACY_ONLY: BLOCKS cutover (must be converted before cutover can proceed)
 * - DISABLED: Safe for cutover (operation is blocked/removed)
 */
export enum WritePathClassification {
  /** Writes Membership as the authoritative state (legacy may be derived) */
  MEMBERSHIP_AUTHORITATIVE = 'MEMBERSHIP_AUTHORITATIVE',

  /** Dual-writes both legacy (User.role/tenantId) and Membership atomically */
  DUAL_WRITE = 'DUAL_WRITE',

  /** Only writes to legacy fields (User.role/tenantId) — BLOCKS CUTOVER */
  LEGACY_ONLY = 'LEGACY_ONLY',

  /** Operation has been disabled/blocked before cutover */
  DISABLED = 'DISABLED',
}

/**
 * Categories of authorization-affecting write operations.
 * These are operations that modify authorization state and must be inventoried.
 */
export enum AuthWriteCategory {
  /** User creation (creates authorization identity) */
  USER_CREATION = 'USER_CREATION',

  /** Role assignment (modifies User.role) */
  ROLE_ASSIGNMENT = 'ROLE_ASSIGNMENT',

  /** Tenant assignment (modifies User.tenantId) */
  TENANT_ASSIGNMENT = 'TENANT_ASSIGNMENT',

  /** Membership CRUD operations */
  MEMBERSHIP_CRUD = 'MEMBERSHIP_CRUD',

  /** OrgUnit scope changes (affects authorization scope) */
  ORGUNIT_SCOPE = 'ORGUNIT_SCOPE',

  /** Direct User.role writes */
  USER_ROLE_WRITE = 'USER_ROLE_WRITE',

  /** Direct User.tenantId writes */
  USER_TENANTID_WRITE = 'USER_TENANTID_WRITE',
}

/**
 * Implementation status of a write path compatibility mechanism.
 */
export enum WritePathStatus {
  /** Not yet inventoried or assessed */
  NOT_ASSESSED = 'NOT_ASSESSED',

  /** Inventoried but not yet implemented */
  PENDING_IMPLEMENTATION = 'PENDING_IMPLEMENTATION',

  /** Implementation in progress */
  IN_PROGRESS = 'IN_PROGRESS',

  /** Implemented and tested */
  IMPLEMENTED = 'IMPLEMENTED',

  /** Verified working in production-like environment */
  VERIFIED = 'VERIFIED',
}

// ---------------------------------------------------------------------------
// Write Path Inventory Entry
// ---------------------------------------------------------------------------

/**
 * An entry in the write path inventory representing a single
 * authorization-affecting write operation.
 */
export interface WritePathEntry {
  /** Unique identifier for this write path */
  readonly id: string;

  /** Human-readable name/description of the write operation */
  readonly name: string;

  /** Category of authorization-affecting write */
  readonly category: AuthWriteCategory;

  /** Location of the write operation (file path or module) */
  readonly location: string;

  /** Classification of how Membership sync is handled */
  readonly classification: WritePathClassification;

  /** Implementation status */
  readonly status: WritePathStatus;

  /** Description of the compatibility mechanism (if implemented) */
  readonly compatibilityMechanism?: string;

  /** Fields affected by this write operation */
  readonly affectedFields: readonly string[];

  /** Whether this write respects quarantine (PNA-01..PNA-05) */
  readonly respectsQuarantine: boolean;

  /** Whether this write uses atomic transactions */
  readonly usesAtomicTransaction: boolean;

  /** Notes or additional context */
  readonly notes?: string;
}

// ---------------------------------------------------------------------------
// Pre-Cutover Gate Types
// ---------------------------------------------------------------------------

/**
 * Individual criterion result in the pre-cutover gate check.
 */
export interface GateCriterion {
  /** Criterion identifier */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Whether this criterion passed */
  readonly passed: boolean;

  /** Detailed message explaining the result */
  readonly message: string;

  /** Blocking criteria prevent cutover if failed */
  readonly blocking: boolean;
}

/**
 * Overall result of the pre-cutover gate verification.
 */
export interface PreCutoverGateResult {
  /** Whether all blocking criteria passed */
  readonly passed: boolean;

  /** Timestamp of the gate check */
  readonly checkedAt: Date;

  /** Version/hash of the check implementation */
  readonly checkVersion: string;

  /** Individual criterion results */
  readonly criteria: readonly GateCriterion[];

  /** Count of legacy-only writers found (must be 0 for PASS) */
  readonly legacyOnlyWriterCount: number;

  /** Count of total write paths inventoried */
  readonly totalWritePathCount: number;

  /** Count of write paths with complete compatibility */
  readonly compatibleWritePathCount: number;

  /** Summary message */
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// Transaction Consistency Types
// ---------------------------------------------------------------------------

/**
 * Result of a dual-write transaction operation.
 */
export interface DualWriteResult<T> {
  /** Whether the dual-write succeeded */
  readonly success: boolean;

  /** The result data (if successful) */
  readonly data?: T;

  /** Error information (if failed) */
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly cause?: unknown;
  };

  /** Whether the transaction was rolled back */
  readonly rolledBack: boolean;

  /** Correlation ID for debugging */
  readonly correlationId: string;
}

/**
 * Context for a dual-write operation, used for audit logging.
 */
export interface DualWriteContext {
  /** Operation type (create, update, delete) */
  readonly operation: 'create' | 'update' | 'delete';

  /** Category of the write operation */
  readonly category: AuthWriteCategory;

  /** User ID performing the operation */
  readonly actorUserId: string;

  /** Tenant ID context */
  readonly tenantId: string;

  /** Target user ID (if applicable) */
  readonly targetUserId?: string;

  /** Correlation ID for tracing */
  readonly correlationId: string;
}

// ---------------------------------------------------------------------------
// Service Interfaces
// ---------------------------------------------------------------------------

/**
 * Interface for the Write Path Inventory service.
 */
export interface IWritePathInventoryService {
  /**
   * Get all inventoried write paths.
   */
  getAllWritePaths(): readonly WritePathEntry[];

  /**
   * Get write paths by category.
   */
  getWritePathsByCategory(category: AuthWriteCategory): readonly WritePathEntry[];

  /**
   * Get write paths by classification.
   */
  getWritePathsByClassification(
    classification: WritePathClassification,
  ): readonly WritePathEntry[];

  /**
   * Get all legacy-only write paths (blockers for cutover).
   */
  getLegacyOnlyWritePaths(): readonly WritePathEntry[];

  /**
   * Check if any legacy-only write paths exist.
   */
  hasLegacyOnlyWritePaths(): boolean;

  /**
   * Get inventory summary statistics.
   */
  getInventorySummary(): WritePathInventorySummary;
}

/**
 * Summary statistics for the write path inventory.
 */
export interface WritePathInventorySummary {
  readonly total: number;
  readonly byClassification: Record<WritePathClassification, number>;
  readonly byCategory: Record<AuthWriteCategory, number>;
  readonly byStatus: Record<WritePathStatus, number>;
  readonly legacyOnlyCount: number;
  readonly cutoverReady: boolean;
}

/**
 * Interface for the Authorization Write Compatibility service.
 */
export interface IAuthorizationWriteCompatibilityService {
  /**
   * Create a user with synchronized Membership (dual-write).
   */
  createUserWithMembership(params: CreateUserWithMembershipParams): Promise<DualWriteResult<UserMembershipPair>>;

  /**
   * Update a user's role with synchronized Membership (dual-write).
   */
  updateRoleWithMembership(params: UpdateRoleWithMembershipParams): Promise<DualWriteResult<void>>;

  /**
   * Check if a user is quarantined (PNA-01..PNA-05).
   */
  isQuarantined(userId: string): boolean;
}

/**
 * Parameters for creating a user with synchronized Membership.
 */
export interface CreateUserWithMembershipParams {
  readonly tenantId: string;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: string;
  readonly orgUnitId: string | null;
  readonly actorUserId: string;
  readonly correlationId: string;
}

/**
 * Parameters for updating role with synchronized Membership.
 */
export interface UpdateRoleWithMembershipParams {
  readonly tenantId: string;
  readonly targetUserId: string;
  readonly newRole: string;
  readonly newOrgUnitId?: string | null;
  readonly actorUserId: string;
  readonly correlationId: string;
}

/**
 * Result containing both User and Membership from a dual-write creation.
 */
export interface UserMembershipPair {
  readonly userId: string;
  readonly membershipId: string;
}

/**
 * Interface for the Pre-Cutover Gate service.
 */
export interface IPreCutoverGateService {
  /**
   * Run all pre-cutover gate checks.
   */
  runGateCheck(): Promise<PreCutoverGateResult>;

  /**
   * Check if cutover can proceed.
   */
  canProceedWithCutover(): Promise<boolean>;

  /**
   * Get the list of blocking issues.
   */
  getBlockingIssues(): Promise<readonly GateCriterion[]>;
}

// ---------------------------------------------------------------------------
// Post-Cutover Write Path Finalization Types (Task 28)
// ---------------------------------------------------------------------------

/**
 * Status of a write path in the retirement process.
 *
 * **State Machine:**
 * DUAL_WRITE → RETIREMENT_PENDING → MEMBERSHIP_ONLY → RETIRED
 *           ↓
 *      (rollback)
 *           ↓
 *    DUAL_WRITE (restored)
 */
export enum WritePathRetirementStatus {
  /** Write path is in dual-write mode (legacy + Membership) */
  DUAL_WRITE = 'DUAL_WRITE',

  /** Write path retirement is pending (awaiting stability confirmation) */
  RETIREMENT_PENDING = 'RETIREMENT_PENDING',

  /** Write path is Membership-only (legacy write disabled) */
  MEMBERSHIP_ONLY = 'MEMBERSHIP_ONLY',

  /** Write path is fully retired (legacy code removed) */
  RETIRED = 'RETIRED',
}

/**
 * Retirement condition that must be met before a write path can be retired.
 */
export interface RetirementCondition {
  /** Unique identifier for this condition */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Whether this condition is met */
  readonly met: boolean;

  /** Detailed message explaining the condition status */
  readonly message: string;

  /** Whether this condition is required (blocking) */
  readonly required: boolean;
}

/**
 * Policy rules for write path retirement.
 */
export interface WritePathRetirementPolicyConfig {
  /** Minimum hours of cutover stability before retirement allowed */
  readonly minimumStabilityHours: number;

  /** Maximum data inconsistency rate allowed (0.0 - 1.0) */
  readonly maxInconsistencyRate: number;

  /** Whether rollback capability must be maintained */
  readonly requireRollbackCapability: boolean;

  /** Minimum number of successful writes before retirement */
  readonly minimumSuccessfulWrites: number;
}

/**
 * Evaluation result for a single write path's retirement eligibility.
 */
export interface WritePathRetirementEvaluation {
  /** Write path being evaluated */
  readonly writePathId: string;

  /** Write path name */
  readonly writePathName: string;

  /** Current classification */
  readonly currentClassification: WritePathClassification;

  /** Current retirement status */
  readonly retirementStatus: WritePathRetirementStatus;

  /** Whether the write path can be retired */
  readonly canRetire: boolean;

  /** Conditions that were evaluated */
  readonly conditions: readonly RetirementCondition[];

  /** Blocking conditions that are not met */
  readonly blockingConditions: readonly RetirementCondition[];

  /** Timestamp of evaluation */
  readonly evaluatedAt: Date;

  /** Recommendation message */
  readonly recommendation: string;
}

/**
 * Overall result of evaluating all write paths for retirement.
 */
export interface WritePathFinalizationResult {
  /** Whether finalization is complete (all eligible paths retired) */
  readonly isComplete: boolean;

  /** Timestamp of evaluation */
  readonly evaluatedAt: Date;

  /** Individual write path evaluations */
  readonly evaluations: readonly WritePathRetirementEvaluation[];

  /** Count of paths by retirement status */
  readonly statusCounts: Readonly<Record<WritePathRetirementStatus, number>>;

  /** Paths ready for retirement */
  readonly readyForRetirement: readonly string[];

  /** Paths blocked from retirement */
  readonly blockedFromRetirement: readonly string[];

  /** Summary message */
  readonly summary: string;

  /** Quarantine verification status */
  readonly quarantineVerified: boolean;
}

/**
 * Parameters for initiating write path retirement.
 */
export interface InitiateRetirementParams {
  /** Write path to retire */
  readonly writePathId: string;

  /** User performing the retirement */
  readonly operatorId: string;

  /** Reason for retirement */
  readonly reason: string;

  /** Whether to skip stability check (for testing only) */
  readonly skipStabilityCheck?: boolean;

  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * Result of a retirement operation.
 */
export interface RetirementOperationResult {
  /** Whether the operation succeeded */
  readonly success: boolean;

  /** Write path that was operated on */
  readonly writePathId: string;

  /** New retirement status */
  readonly newStatus: WritePathRetirementStatus;

  /** Error message if operation failed */
  readonly errorMessage?: string;

  /** Audit entry for this operation */
  readonly auditEntry?: WritePathRetirementAuditEntry;
}

/**
 * Audit entry for write path retirement operations.
 */
export interface WritePathRetirementAuditEntry {
  /** Unique identifier */
  readonly id: string;

  /** Timestamp of the operation */
  readonly timestamp: Date;

  /** Operation type */
  readonly action: 'RETIREMENT_INITIATED' | 'RETIREMENT_COMPLETED' | 'RETIREMENT_FAILED' | 'RETIREMENT_REVERTED';

  /** Write path ID */
  readonly writePathId: string;

  /** User who performed the operation */
  readonly operatorId: string;

  /** Previous status */
  readonly previousStatus: WritePathRetirementStatus;

  /** New status */
  readonly newStatus: WritePathRetirementStatus;

  /** Reason for the operation */
  readonly reason: string;

  /** Whether the operation was successful */
  readonly success: boolean;

  /** Error message if failed */
  readonly errorMessage?: string;

  /** Correlation ID */
  readonly correlationId?: string;
}

/**
 * Stability metrics for write path retirement evaluation.
 */
export interface WritePathStabilityMetrics {
  /** Write path ID */
  readonly writePathId: string;

  /** Cutover timestamp (when Membership became authoritative) */
  readonly cutoverAt: Date;

  /** Hours since cutover */
  readonly hoursSinceCutover: number;

  /** Number of successful writes since cutover */
  readonly successfulWrites: number;

  /** Number of failed writes since cutover */
  readonly failedWrites: number;

  /** Data inconsistency count (legacy vs Membership mismatch) */
  readonly inconsistencyCount: number;

  /** Data inconsistency rate */
  readonly inconsistencyRate: number;

  /** Whether any rollback was triggered */
  readonly rollbackTriggered: boolean;

  /** Last successful write timestamp */
  readonly lastSuccessfulWriteAt?: Date;
}

/**
 * Interface for the Write Path Retirement Policy service.
 */
export interface IWritePathRetirementPolicyService {
  /**
   * Get the current policy configuration.
   */
  getPolicyConfig(): WritePathRetirementPolicyConfig;

  /**
   * Evaluate whether a write path can be retired.
   */
  evaluateRetirementEligibility(
    writePathId: string,
    metrics: WritePathStabilityMetrics,
  ): WritePathRetirementEvaluation;

  /**
   * Check if the minimum stability window has passed.
   */
  hasStabilityWindowPassed(metrics: WritePathStabilityMetrics): boolean;

  /**
   * Check if data consistency requirement is met.
   */
  isDataConsistent(metrics: WritePathStabilityMetrics): boolean;

  /**
   * Check if rollback is still required.
   */
  isRollbackStillRequired(cutoverAt: Date): boolean;
}

/**
 * Interface for the Write Path Finalization service.
 */
export interface IWritePathFinalizationService {
  /**
   * Evaluate all write paths for retirement eligibility.
   */
  evaluateAllWritePaths(): Promise<WritePathFinalizationResult>;

  /**
   * Get retirement status for a specific write path.
   */
  getWritePathRetirementStatus(writePathId: string): WritePathRetirementStatus;

  /**
   * Initiate retirement for a write path.
   */
  initiateRetirement(params: InitiateRetirementParams): Promise<RetirementOperationResult>;

  /**
   * Revert retirement (restore dual-write if needed).
   */
  revertRetirement(params: InitiateRetirementParams): Promise<RetirementOperationResult>;

  /**
   * Get stability metrics for a write path.
   */
  getStabilityMetrics(writePathId: string): WritePathStabilityMetrics | undefined;

  /**
   * Record a write operation for stability tracking.
   */
  recordWriteOperation(writePathId: string, success: boolean): void;

  /**
   * Record a data inconsistency detection.
   */
  recordInconsistency(writePathId: string): void;

  /**
   * Get retirement audit log.
   */
  getRetirementAuditLog(options?: { writePathId?: string; limit?: number }): readonly WritePathRetirementAuditEntry[];

  /**
   * Verify quarantine rules are preserved (PNA-01..PNA-05 unchanged).
   */
  verifyQuarantinePreserved(): boolean;

  /**
   * Check if finalization is complete.
   */
  isFinalizationComplete(): boolean;
}
