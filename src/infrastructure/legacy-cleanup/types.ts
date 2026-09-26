/**
 * Legacy Schema Cleanup Types — Type definitions for User.tenantId column removal.
 *
 * This module defines types for:
 * - Pre-flight verification (TPR-07 ordered criteria)
 * - Backup and recovery operations
 * - Migration script generation
 * - Post-drop validation
 *
 * **CRITICAL:** These types support Requirement 13 (Legacy Schema Cleanup):
 * - AC 1: Execute ONLY after all code dependencies are removed
 * - AC 2: Remove User.tenantId column from users table
 * - AC 3: Remove legacy UserRole enum values no longer used
 * - AC 4: Create backup before any destructive operation
 * - AC 5: Support rollback by restoring from backup within 24 hours
 * - AC 6: Update Prisma schema to reflect removed fields
 * - AC 7: Execute during maintenance window with read-only mode
 *
 * **TPR-07 Applied:** Destructive cleanup ordering (stabilization before drop)
 *
 * @see Task 37: Legacy Schema Cleanup
 * @see Requirement 13 (AC 1-7)
 */

// ---------------------------------------------------------------------------
// TPR-07 Pre-Flight Verification Types
// ---------------------------------------------------------------------------

/**
 * Ordered verification criteria per TPR-07.
 * MUST be checked in this exact order before destructive operations.
 */
export interface PreFlightCriteria {
  /** 1. Legacy dependency has been stopped */
  readonly legacyDependencyStopped: CriterionResult;
  /** 2. Zero authorization dependency on User.tenantId */
  readonly zeroAuthorizationDependency: CriterionResult;
  /** 3. Zero required legacy writes remaining */
  readonly zeroLegacyWrites: CriterionResult;
  /** 4. Stabilization/rollback observation window passed (24 hours) */
  readonly stabilizationWindowPassed: CriterionResult;
  /** 5. Backup/recovery checkpoint created */
  readonly backupCheckpointCreated: CriterionResult;
  /** 6. Explicit destructive-operation approval gate passed */
  readonly destructiveApprovalGate: CriterionResult;
}

/**
 * Result of a single criterion check.
 */
export interface CriterionResult {
  /** Whether the criterion passed */
  readonly passed: boolean;
  /** Timestamp of the check */
  readonly checkedAt: Date;
  /** Evidence supporting the result */
  readonly evidence: string;
  /** Details for logging/debugging */
  readonly details?: Record<string, unknown>;
  /** Blocking reason if not passed */
  readonly blockingReason?: string;
}

/**
 * Comprehensive pre-flight verification result.
 */
export interface PreFlightVerificationResult {
  /** Overall verification status */
  readonly verified: boolean;
  /** Timestamp of verification */
  readonly verifiedAt: Date;
  /** Individual criteria results (ordered per TPR-07) */
  readonly criteria: PreFlightCriteria;
  /** Blocking issues preventing cleanup */
  readonly blockingIssues: readonly string[];
  /** Warnings (non-blocking) */
  readonly warnings: readonly string[];
  /** Correlation ID for tracing */
  readonly correlationId: string;
}

// ---------------------------------------------------------------------------
// Backup Types
// ---------------------------------------------------------------------------

/**
 * Backup table specification.
 */
export interface BackupTableSpec {
  /** Source table name */
  readonly tableName: string;
  /** Columns to backup */
  readonly columns: readonly string[];
  /** Backup table name (suffixed with timestamp) */
  readonly backupTableName: string;
  /** Row count at backup time */
  readonly rowCount: number;
}

/**
 * Backup checkpoint metadata.
 */
export interface BackupCheckpoint {
  /** Unique checkpoint ID */
  readonly checkpointId: string;
  /** Timestamp of backup creation */
  readonly createdAt: Date;
  /** Tables included in backup */
  readonly tables: readonly BackupTableSpec[];
  /** Total rows backed up */
  readonly totalRows: number;
  /** Expiration time (24 hours from creation) */
  readonly expiresAt: Date;
  /** Whether the backup is still valid for rollback */
  readonly isValid: boolean;
  /** Correlation ID for tracing */
  readonly correlationId: string;
  /** Notes/comments */
  readonly notes?: string;
}

/**
 * Backup operation result.
 */
export interface BackupResult {
  /** Whether backup succeeded */
  readonly success: boolean;
  /** Created checkpoint (if successful) */
  readonly checkpoint: BackupCheckpoint | null;
  /** Error message if failed */
  readonly errorMessage?: string;
  /** Duration of backup operation in ms */
  readonly durationMs: number;
}

/**
 * Rollback operation result.
 */
export interface RollbackResult {
  /** Whether rollback succeeded */
  readonly success: boolean;
  /** Checkpoint used for rollback */
  readonly checkpointId: string;
  /** Tables restored */
  readonly tablesRestored: readonly string[];
  /** Rows restored */
  readonly rowsRestored: number;
  /** Error message if failed */
  readonly errorMessage?: string;
  /** Duration of rollback operation in ms */
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// Migration Script Types
// ---------------------------------------------------------------------------

/**
 * Schema change operation type.
 */
export type SchemaOperationType =
  | 'DROP_COLUMN'
  | 'DROP_ENUM_VALUE'
  | 'DROP_INDEX'
  | 'DROP_CONSTRAINT'
  | 'ALTER_TABLE';

/**
 * A single schema change operation.
 */
export interface SchemaChangeOperation {
  /** Operation type */
  readonly type: SchemaOperationType;
  /** Target table (if applicable) */
  readonly tableName?: string;
  /** Target column (if applicable) */
  readonly columnName?: string;
  /** Target enum (if applicable) */
  readonly enumName?: string;
  /** Target enum value (if applicable) */
  readonly enumValue?: string;
  /** SQL statement to execute */
  readonly sql: string;
  /** Rollback SQL statement */
  readonly rollbackSql: string;
  /** Whether this is destructive (cannot be undone without backup) */
  readonly isDestructive: boolean;
  /** Human-readable description */
  readonly description: string;
  /** Order in which to execute (lower = first) */
  readonly order: number;
}

/**
 * Generated migration script.
 */
export interface CleanupMigrationScript {
  /** Script ID for tracking */
  readonly scriptId: string;
  /** Script version */
  readonly version: string;
  /** Generated timestamp */
  readonly generatedAt: Date;
  /** Operations to execute (in order) */
  readonly operations: readonly SchemaChangeOperation[];
  /** Combined forward migration SQL */
  readonly forwardSql: string;
  /** Combined rollback SQL */
  readonly rollbackSql: string;
  /** Pre-conditions that must be met */
  readonly preConditions: readonly string[];
  /** Post-conditions to verify after execution */
  readonly postConditions: readonly string[];
  /** Estimated execution time in seconds */
  readonly estimatedDurationSeconds: number;
  /** Requires maintenance window flag */
  readonly requiresMaintenanceWindow: boolean;
  /** Correlation ID for tracing */
  readonly correlationId: string;
}

// ---------------------------------------------------------------------------
// Post-Drop Validation Types
// ---------------------------------------------------------------------------

/**
 * Validation check for schema state.
 */
export interface SchemaValidationCheck {
  /** Check name */
  readonly name: string;
  /** Check passed */
  readonly passed: boolean;
  /** Check category */
  readonly category: 'schema' | 'data' | 'application';
  /** Evidence supporting the result */
  readonly evidence: string;
  /** Error message if failed */
  readonly errorMessage?: string;
}

/**
 * Post-drop validation result.
 */
export interface PostDropValidationResult {
  /** Overall validation status */
  readonly valid: boolean;
  /** Timestamp of validation */
  readonly validatedAt: Date;
  /** Individual check results */
  readonly checks: readonly SchemaValidationCheck[];
  /** Checks that failed */
  readonly failedChecks: readonly SchemaValidationCheck[];
  /** Warnings (passed but with concerns) */
  readonly warnings: readonly string[];
  /** Correlation ID for tracing */
  readonly correlationId: string;
}

// ---------------------------------------------------------------------------
// Cleanup Execution Types
// ---------------------------------------------------------------------------

/**
 * Cleanup execution phase.
 */
export type CleanupPhase =
  | 'PRE_FLIGHT_VERIFICATION'
  | 'BACKUP_CREATION'
  | 'DESTRUCTIVE_APPROVAL'
  | 'MIGRATION_EXECUTION'
  | 'POST_DROP_VALIDATION'
  | 'PRISMA_SCHEMA_UPDATE'
  | 'COMPLETED'
  | 'ROLLED_BACK'
  | 'FAILED';

/**
 * Cleanup execution status.
 */
export interface CleanupExecutionStatus {
  /** Current phase */
  readonly currentPhase: CleanupPhase;
  /** Timestamp of phase start */
  readonly phaseStartedAt: Date;
  /** Whether execution is in progress */
  readonly inProgress: boolean;
  /** Whether execution is complete */
  readonly complete: boolean;
  /** Whether execution failed */
  readonly failed: boolean;
  /** Error if failed */
  readonly error?: string;
  /** Execution log */
  readonly log: readonly CleanupLogEntry[];
}

/**
 * Log entry for cleanup execution.
 */
export interface CleanupLogEntry {
  /** Timestamp */
  readonly timestamp: Date;
  /** Log level */
  readonly level: 'info' | 'warn' | 'error';
  /** Phase during which log was created */
  readonly phase: CleanupPhase;
  /** Message */
  readonly message: string;
  /** Additional details */
  readonly details?: Record<string, unknown>;
}

/**
 * Complete cleanup execution result.
 */
export interface CleanupExecutionResult {
  /** Overall success status */
  readonly success: boolean;
  /** Execution ID for tracking */
  readonly executionId: string;
  /** Start timestamp */
  readonly startedAt: Date;
  /** End timestamp */
  readonly completedAt: Date;
  /** Final phase reached */
  readonly finalPhase: CleanupPhase;
  /** Pre-flight verification result */
  readonly preFlightResult: PreFlightVerificationResult;
  /** Backup result */
  readonly backupResult: BackupResult | null;
  /** Post-drop validation result */
  readonly postDropResult: PostDropValidationResult | null;
  /** Execution log */
  readonly log: readonly CleanupLogEntry[];
  /** Total duration in ms */
  readonly durationMs: number;
  /** Correlation ID for tracing */
  readonly correlationId: string;
}

// ---------------------------------------------------------------------------
// Approval Gate Types
// ---------------------------------------------------------------------------

/**
 * Destructive operation approval.
 */
export interface DestructiveApproval {
  /** Unique approval ID */
  readonly approvalId: string;
  /** Approver identity (user ID or service principal) */
  readonly approverId: string;
  /** Approval timestamp */
  readonly approvedAt: Date;
  /** Approval expires at (should be short-lived) */
  readonly expiresAt: Date;
  /** What was approved */
  readonly approvedOperation: string;
  /** Reason/justification for approval */
  readonly reason: string;
  /** Correlation ID for tracing */
  readonly correlationId: string;
}

/**
 * Approval gate status.
 */
export interface ApprovalGateStatus {
  /** Whether approval has been granted */
  readonly approved: boolean;
  /** Current approval (if any) */
  readonly approval: DestructiveApproval | null;
  /** Whether approval is still valid (not expired) */
  readonly isValid: boolean;
  /** Time until expiration in seconds (if approved) */
  readonly timeUntilExpirationSeconds?: number;
}

// ---------------------------------------------------------------------------
// Service Options
// ---------------------------------------------------------------------------

/**
 * Options for pre-flight verification.
 */
export interface PreFlightOptions {
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Whether to skip stabilization window check (DANGEROUS) */
  readonly skipStabilizationCheck?: boolean;
  /** Stabilization window duration in hours (default: 24) */
  readonly stabilizationWindowHours?: number;
  /** Custom FASE 1.14 completion timestamp (for testing) */
  readonly fase114CompletedAt?: Date;
}

/**
 * Options for backup creation.
 */
export interface BackupOptions {
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Custom backup suffix (default: timestamp) */
  readonly backupSuffix?: string;
  /** Backup expiration hours (default: 24) */
  readonly expirationHours?: number;
  /** Notes to include in backup */
  readonly notes?: string;
}

/**
 * Options for cleanup execution.
 */
export interface CleanupExecutionOptions {
  /** If true, validate and generate scripts without executing */
  readonly dryRun: boolean;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
  /** Approval for destructive operations (required if not dry-run) */
  readonly approval?: DestructiveApproval;
  /** Skip pre-flight verification (DANGEROUS - only for testing) */
  readonly skipPreFlight?: boolean;
  /** Force execution even if validation fails (EXTREMELY DANGEROUS) */
  readonly force?: boolean;
}

/**
 * Default cleanup execution options.
 */
export const DEFAULT_CLEANUP_OPTIONS: CleanupExecutionOptions = {
  dryRun: true, // Default to dry-run for safety
};

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

/**
 * Error codes for cleanup operations.
 */
export type CleanupErrorCode =
  | 'PRE_FLIGHT_FAILED'
  | 'BACKUP_FAILED'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_EXPIRED'
  | 'MIGRATION_FAILED'
  | 'VALIDATION_FAILED'
  | 'ROLLBACK_FAILED'
  | 'PRISMA_UPDATE_FAILED'
  | 'INVALID_CONFIGURATION'
  | 'MAINTENANCE_WINDOW_REQUIRED';

/**
 * Error thrown during cleanup operations.
 */
export class CleanupError extends Error {
  constructor(
    public readonly code: CleanupErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CleanupError';
    Object.setPrototypeOf(this, CleanupError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Service Interfaces
// ---------------------------------------------------------------------------

/**
 * Pre-Flight Verification Service interface.
 *
 * Verifies all TPR-07 ordered criteria before destructive operations.
 */
export interface IPreFlightVerificationService {
  /**
   * Run full pre-flight verification in TPR-07 order.
   *
   * @param options - Verification options
   * @returns Comprehensive verification result
   */
  verify(options?: PreFlightOptions): Promise<PreFlightVerificationResult>;

  /**
   * Check a single criterion.
   *
   * @param criterionName - Name of criterion to check
   * @returns Criterion result
   */
  checkCriterion(criterionName: keyof PreFlightCriteria): Promise<CriterionResult>;

  /**
   * Get current stabilization window status.
   *
   * @returns Whether stabilization window has passed
   */
  getStabilizationStatus(): Promise<{
    windowPassed: boolean;
    fase114CompletedAt: Date | null;
    windowEndTime: Date | null;
    hoursRemaining: number | null;
  }>;
}

/**
 * Backup Service interface.
 *
 * Creates backups of affected tables before destructive operations.
 */
export interface IBackupService {
  /**
   * Create a backup checkpoint.
   *
   * @param options - Backup options
   * @returns Backup result with checkpoint
   */
  createBackup(options?: BackupOptions): Promise<BackupResult>;

  /**
   * List available backup checkpoints.
   *
   * @returns Array of checkpoints
   */
  listCheckpoints(): Promise<readonly BackupCheckpoint[]>;

  /**
   * Get a specific checkpoint.
   *
   * @param checkpointId - Checkpoint ID
   * @returns Checkpoint or null if not found
   */
  getCheckpoint(checkpointId: string): Promise<BackupCheckpoint | null>;

  /**
   * Rollback from a checkpoint.
   *
   * @param checkpointId - Checkpoint to rollback from
   * @returns Rollback result
   */
  rollback(checkpointId: string): Promise<RollbackResult>;

  /**
   * Check if a checkpoint is valid for rollback.
   *
   * @param checkpointId - Checkpoint to check
   * @returns Whether checkpoint is valid
   */
  isCheckpointValid(checkpointId: string): Promise<boolean>;

  /**
   * Clean up expired checkpoints.
   *
   * @returns Number of checkpoints cleaned up
   */
  cleanupExpiredCheckpoints(): Promise<number>;
}

/**
 * Cleanup Migration Generator interface.
 *
 * Generates SQL migration scripts for schema cleanup.
 */
export interface ICleanupMigrationGenerator {
  /**
   * Generate migration script for User.tenantId removal.
   *
   * @param correlationId - Correlation ID for tracing
   * @returns Generated migration script
   */
  generateMigration(correlationId?: string): Promise<CleanupMigrationScript>;

  /**
   * Get operations for dropping User.tenantId column.
   *
   * @returns Array of schema change operations
   */
  getDropTenantIdOperations(): readonly SchemaChangeOperation[];

  /**
   * Get operations for removing unused UserRole enum values.
   *
   * @returns Array of schema change operations
   */
  getRemoveEnumValuesOperations(): readonly SchemaChangeOperation[];

  /**
   * Validate generated migration.
   *
   * @param script - Script to validate
   * @returns Validation result
   */
  validateMigration(script: CleanupMigrationScript): Promise<{
    valid: boolean;
    issues: readonly string[];
  }>;
}

/**
 * Post-Drop Validation Service interface.
 *
 * Validates schema state after column drop.
 */
export interface IPostDropValidationService {
  /**
   * Run post-drop validation.
   *
   * @param correlationId - Correlation ID for tracing
   * @returns Validation result
   */
  validate(correlationId?: string): Promise<PostDropValidationResult>;

  /**
   * Check if User.tenantId column exists.
   *
   * @returns true if column exists (should be false after cleanup)
   */
  columnExists(): Promise<boolean>;

  /**
   * Verify application health after schema change.
   *
   * @returns Health check result
   */
  verifyApplicationHealth(): Promise<{
    healthy: boolean;
    checks: readonly { name: string; passed: boolean; message?: string }[];
  }>;

  /**
   * Run smoke tests against critical paths.
   *
   * @returns Smoke test results
   */
  runSmokeTests(): Promise<{
    passed: boolean;
    results: readonly { testName: string; passed: boolean; error?: string }[];
  }>;
}

/**
 * Schema Cleanup Service interface.
 *
 * Main orchestrator for the cleanup workflow.
 */
export interface ISchemaCleanupService {
  /**
   * Run the complete cleanup workflow.
   *
   * @param options - Execution options
   * @returns Execution result
   */
  execute(options?: CleanupExecutionOptions): Promise<CleanupExecutionResult>;

  /**
   * Preview cleanup (dry-run).
   *
   * @param correlationId - Correlation ID for tracing
   * @returns Preview result with what would happen
   */
  preview(correlationId?: string): Promise<CleanupExecutionResult>;

  /**
   * Get current execution status.
   *
   * @returns Current status or null if no execution in progress
   */
  getStatus(): CleanupExecutionStatus | null;

  /**
   * Check if cleanup can be executed.
   *
   * @returns Pre-flight verification result
   */
  canExecute(): Promise<PreFlightVerificationResult>;

  /**
   * Request approval for destructive operation.
   *
   * @param approverId - ID of the approver
   * @param reason - Reason for approval
   * @returns Approval object
   */
  requestApproval(approverId: string, reason: string): Promise<DestructiveApproval>;

  /**
   * Get current approval gate status.
   *
   * @returns Approval gate status
   */
  getApprovalStatus(): ApprovalGateStatus;

  /**
   * Rollback from the latest backup.
   *
   * @returns Rollback result
   */
  rollback(): Promise<RollbackResult>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Service version for tracking.
 */
export const CLEANUP_SERVICE_VERSION = '1.0.0';

/**
 * Default stabilization window in hours.
 */
export const DEFAULT_STABILIZATION_WINDOW_HOURS = 24;

/**
 * Default backup expiration in hours.
 */
export const DEFAULT_BACKUP_EXPIRATION_HOURS = 24;

/**
 * Default approval validity in minutes.
 */
export const DEFAULT_APPROVAL_VALIDITY_MINUTES = 30;

/**
 * Tables to backup before cleanup.
 */
export const TABLES_TO_BACKUP = ['users'] as const;

/**
 * Columns to remove from users table.
 */
export const COLUMNS_TO_REMOVE = ['tenant_id'] as const;

/**
 * Legacy enum values that may be removed (if no longer in use).
 * Note: This should be determined dynamically based on actual usage.
 */
export const POTENTIALLY_UNUSED_ENUM_VALUES: readonly string[] = [];
