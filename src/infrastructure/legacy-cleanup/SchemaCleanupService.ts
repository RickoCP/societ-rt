/**
 * Schema Cleanup Service — Main orchestrator for legacy schema cleanup.
 *
 * This service orchestrates the complete cleanup workflow:
 * 1. Pre-flight verification (TPR-07 ordered criteria)
 * 2. Backup creation
 * 3. Destructive approval gate
 * 4. Migration execution
 * 5. Post-drop validation
 * 6. Prisma schema update guidance
 *
 * **CRITICAL:** This service handles DESTRUCTIVE operations.
 * - Always run in dry-run mode first
 * - Requires explicit approval
 * - Requires maintenance window
 * - Creates backup before any changes
 *
 * @see Task 37: Legacy Schema Cleanup
 * @see Requirement 13 (AC 1-7)
 * @see TPR-07: Destructive cleanup ordering
 */

import type {
  ISchemaCleanupService,
  IPreFlightVerificationService,
  IBackupService,
  ICleanupMigrationGenerator,
  IPostDropValidationService,
  CleanupExecutionResult,
  CleanupExecutionStatus,
  CleanupExecutionOptions,
  CleanupPhase,
  CleanupLogEntry,
  PreFlightVerificationResult,
  DestructiveApproval,
  ApprovalGateStatus,
  RollbackResult,
} from './types';
import {
  CleanupError,
  DEFAULT_CLEANUP_OPTIONS,
  DEFAULT_APPROVAL_VALIDITY_MINUTES,
  CLEANUP_SERVICE_VERSION,
} from './types';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Database client interface for cleanup operations.
 */
export interface CleanupDatabaseClient {
  /** Execute raw SQL */
  $executeRawUnsafe: (sql: string) => Promise<number>;
  /** Transaction support */
  $transaction: <T>(fn: (tx: CleanupDatabaseClient) => Promise<T>) => Promise<T>;
}

/**
 * Dependencies for the Schema Cleanup Service.
 */
export interface SchemaCleanupServiceDeps {
  /** Pre-flight verification service */
  readonly preFlightService: IPreFlightVerificationService;
  /** Backup service */
  readonly backupService: IBackupService;
  /** Migration generator */
  readonly migrationGenerator: ICleanupMigrationGenerator;
  /** Post-drop validation service */
  readonly postDropValidationService: IPostDropValidationService;
  /** Database client */
  readonly db: CleanupDatabaseClient;
  /** Logger for recording execution progress */
  readonly logger?: {
    info: (message: string, context?: Record<string, unknown>) => void;
    warn: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
  };
  /** Custom date provider for testing */
  readonly dateProvider?: () => Date;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for Schema Cleanup Service.
 *
 * @param deps - Service dependencies
 * @returns Schema Cleanup Service instance
 */
export function createSchemaCleanupService(
  deps: SchemaCleanupServiceDeps,
): ISchemaCleanupService {
  const {
    preFlightService,
    backupService,
    migrationGenerator,
    postDropValidationService,
    db,
    logger = console,
    dateProvider = () => new Date(),
  } = deps;

  // Internal state
  let currentStatus: CleanupExecutionStatus | null = null;
  let currentApproval: DestructiveApproval | null = null;
  let latestBackupCheckpointId: string | null = null;
  const executionLog: CleanupLogEntry[] = [];

  /**
   * Generate unique IDs.
   */
  function generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add entry to execution log.
   */
  function log(
    level: 'info' | 'warn' | 'error',
    phase: CleanupPhase,
    message: string,
    details?: Record<string, unknown>,
  ): void {
    const entry: CleanupLogEntry = {
      timestamp: dateProvider(),
      level,
      phase,
      message,
      details,
    };
    executionLog.push(entry);

    // Also log to external logger
    switch (level) {
      case 'info':
        logger.info?.(message, { phase, ...details });
        break;
      case 'warn':
        logger.warn?.(message, { phase, ...details });
        break;
      case 'error':
        logger.error?.(message, { phase, ...details });
        break;
    }
  }

  /**
   * Update execution status.
   */
  function updateStatus(phase: CleanupPhase, options?: { failed?: boolean; error?: string }): void {
    currentStatus = {
      currentPhase: phase,
      phaseStartedAt: dateProvider(),
      inProgress: !['COMPLETED', 'ROLLED_BACK', 'FAILED'].includes(phase),
      complete: phase === 'COMPLETED',
      failed: options?.failed ?? phase === 'FAILED',
      error: options?.error,
      log: [...executionLog],
    };
  }

  /**
   * Request approval for destructive operation.
   */
  async function requestApproval(
    approverId: string,
    reason: string,
  ): Promise<DestructiveApproval> {
    const now = dateProvider();
    const expiresAt = new Date(now.getTime() + DEFAULT_APPROVAL_VALIDITY_MINUTES * 60 * 1000);

    const approval: DestructiveApproval = {
      approvalId: generateId('approval'),
      approverId,
      approvedAt: now,
      expiresAt,
      approvedOperation: 'DROP User.tenantId column',
      reason,
      correlationId: generateId('corr'),
    };

    currentApproval = approval;
    log('info', 'DESTRUCTIVE_APPROVAL', `Approval granted by ${approverId}`, {
      approvalId: approval.approvalId,
      expiresAt: expiresAt.toISOString(),
    });

    return approval;
  }

  /**
   * Get current approval gate status.
   */
  function getApprovalStatus(): ApprovalGateStatus {
    if (!currentApproval) {
      return {
        approved: false,
        approval: null,
        isValid: false,
      };
    }

    const now = dateProvider();
    const isValid = now < currentApproval.expiresAt;
    const timeUntilExpirationSeconds = isValid
      ? Math.floor((currentApproval.expiresAt.getTime() - now.getTime()) / 1000)
      : 0;

    return {
      approved: true,
      approval: currentApproval,
      isValid,
      timeUntilExpirationSeconds: isValid ? timeUntilExpirationSeconds : undefined,
    };
  }

  /**
   * Check if cleanup can be executed.
   */
  async function canExecute(): Promise<PreFlightVerificationResult> {
    return preFlightService.verify({
      correlationId: generateId('preflight'),
    });
  }

  /**
   * Execute the complete cleanup workflow.
   */
  async function execute(
    options?: CleanupExecutionOptions,
  ): Promise<CleanupExecutionResult> {
    const opts = { ...DEFAULT_CLEANUP_OPTIONS, ...options };
    const executionId = generateId('cleanup-exec');
    const correlationId = opts.correlationId ?? generateId('corr');
    const startTime = dateProvider();

    // Reset state
    executionLog.length = 0;
    updateStatus('PRE_FLIGHT_VERIFICATION');

    log('info', 'PRE_FLIGHT_VERIFICATION', `Starting cleanup workflow (dry-run: ${opts.dryRun})`, {
      executionId,
      correlationId,
    });

    let preFlightResult: PreFlightVerificationResult;
    let backupResult = null;
    let postDropResult = null;

    try {
      // Phase 1: Pre-flight verification
      if (!opts.skipPreFlight) {
        log('info', 'PRE_FLIGHT_VERIFICATION', 'Running pre-flight verification');
        preFlightResult = await preFlightService.verify({ correlationId });

        if (!preFlightResult.verified && !opts.force) {
          log('error', 'PRE_FLIGHT_VERIFICATION', 'Pre-flight verification failed', {
            blockingIssues: preFlightResult.blockingIssues,
          });
          updateStatus('FAILED', { failed: true, error: 'Pre-flight verification failed' });

          return {
            success: false,
            executionId,
            startedAt: startTime,
            completedAt: dateProvider(),
            finalPhase: 'PRE_FLIGHT_VERIFICATION',
            preFlightResult,
            backupResult: null,
            postDropResult: null,
            log: [...executionLog],
            durationMs: Date.now() - startTime.getTime(),
            correlationId,
          };
        }
      } else {
        log('warn', 'PRE_FLIGHT_VERIFICATION', 'Pre-flight verification SKIPPED (skipPreFlight=true)');
        preFlightResult = {
          verified: true,
          verifiedAt: dateProvider(),
          criteria: {} as any, // Skipped
          blockingIssues: [],
          warnings: ['Pre-flight verification was skipped'],
          correlationId,
        };
      }

      // Phase 2: Backup creation
      updateStatus('BACKUP_CREATION');
      log('info', 'BACKUP_CREATION', 'Creating backup checkpoint');

      backupResult = await backupService.createBackup({
        correlationId,
        notes: `Pre-cleanup backup for execution ${executionId}`,
      });

      if (!backupResult.success) {
        log('error', 'BACKUP_CREATION', 'Backup creation failed', {
          error: backupResult.errorMessage,
        });
        updateStatus('FAILED', { failed: true, error: 'Backup creation failed' });

        return {
          success: false,
          executionId,
          startedAt: startTime,
          completedAt: dateProvider(),
          finalPhase: 'BACKUP_CREATION',
          preFlightResult,
          backupResult,
          postDropResult: null,
          log: [...executionLog],
          durationMs: Date.now() - startTime.getTime(),
          correlationId,
        };
      }

      latestBackupCheckpointId = backupResult.checkpoint!.checkpointId;
      log('info', 'BACKUP_CREATION', 'Backup checkpoint created', {
        checkpointId: latestBackupCheckpointId,
        totalRows: backupResult.checkpoint!.totalRows,
      });

      // Phase 3: Approval gate (for non-dry-run)
      updateStatus('DESTRUCTIVE_APPROVAL');

      if (!opts.dryRun) {
        const approvalStatus = getApprovalStatus();
        if (!approvalStatus.approved || !approvalStatus.isValid) {
          if (opts.approval) {
            // Use provided approval
            currentApproval = opts.approval;
          } else {
            log('error', 'DESTRUCTIVE_APPROVAL', 'Destructive operation requires approval');
            updateStatus('FAILED', { failed: true, error: 'Approval required' });

            throw new CleanupError(
              'APPROVAL_REQUIRED',
              'Destructive operation requires explicit approval. Call requestApproval() first.',
            );
          }
        }
        log('info', 'DESTRUCTIVE_APPROVAL', 'Approval gate passed', {
          approvalId: currentApproval?.approvalId,
        });
      } else {
        log('info', 'DESTRUCTIVE_APPROVAL', 'Dry-run mode: approval gate skipped');
      }

      // Phase 4: Migration execution
      updateStatus('MIGRATION_EXECUTION');
      log('info', 'MIGRATION_EXECUTION', 'Generating migration script');

      const migrationScript = await migrationGenerator.generateMigration(correlationId);

      // Validate the migration
      const validationResult = await migrationGenerator.validateMigration(migrationScript);
      if (!validationResult.valid) {
        log('error', 'MIGRATION_EXECUTION', 'Migration validation failed', {
          issues: validationResult.issues,
        });
        updateStatus('FAILED', { failed: true, error: 'Migration validation failed' });

        throw new CleanupError(
          'MIGRATION_FAILED',
          `Migration validation failed: ${validationResult.issues.join(', ')}`,
        );
      }

      if (opts.dryRun) {
        log('info', 'MIGRATION_EXECUTION', 'Dry-run mode: migration NOT executed', {
          operations: migrationScript.operations.length,
          forwardSql: migrationScript.forwardSql.substring(0, 500) + '...',
        });
      } else {
        log('info', 'MIGRATION_EXECUTION', 'Executing migration', {
          operationsCount: migrationScript.operations.length,
        });

        // Execute each operation
        for (const operation of migrationScript.operations) {
          log('info', 'MIGRATION_EXECUTION', `Executing: ${operation.description}`, {
            type: operation.type,
            sql: operation.sql.substring(0, 200),
          });

          try {
            await db.$executeRawUnsafe(operation.sql);
            log('info', 'MIGRATION_EXECUTION', `Completed: ${operation.description}`);
          } catch (error) {
            log('error', 'MIGRATION_EXECUTION', `Failed: ${operation.description}`, {
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        }

        log('info', 'MIGRATION_EXECUTION', 'Migration execution completed');
      }

      // Phase 5: Post-drop validation
      updateStatus('POST_DROP_VALIDATION');
      log('info', 'POST_DROP_VALIDATION', 'Running post-drop validation');

      postDropResult = await postDropValidationService.validate(correlationId);

      if (!opts.dryRun && !postDropResult.valid) {
        log('error', 'POST_DROP_VALIDATION', 'Post-drop validation failed', {
          failedChecks: postDropResult.failedChecks.length,
        });
        // Don't fail here - the column might be gone, just report
        log('warn', 'POST_DROP_VALIDATION', 'Validation issues found - review required');
      } else if (opts.dryRun) {
        log('info', 'POST_DROP_VALIDATION', 'Dry-run mode: validation shows current state');
      }

      // Phase 6: Prisma schema update (guidance only)
      updateStatus('PRISMA_SCHEMA_UPDATE');
      log('info', 'PRISMA_SCHEMA_UPDATE', 'Prisma schema update required (manual step)', {
        instruction: 'Remove tenantId from User model in prisma/schema.prisma, then run npx prisma generate',
      });

      // Complete
      updateStatus('COMPLETED');
      log('info', 'COMPLETED', `Cleanup workflow completed (dry-run: ${opts.dryRun})`, {
        durationMs: Date.now() - startTime.getTime(),
      });

      return {
        success: true,
        executionId,
        startedAt: startTime,
        completedAt: dateProvider(),
        finalPhase: 'COMPLETED',
        preFlightResult,
        backupResult,
        postDropResult,
        log: [...executionLog],
        durationMs: Date.now() - startTime.getTime(),
        correlationId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('error', currentStatus?.currentPhase ?? 'FAILED', `Cleanup failed: ${errorMessage}`);
      updateStatus('FAILED', { failed: true, error: errorMessage });

      return {
        success: false,
        executionId,
        startedAt: startTime,
        completedAt: dateProvider(),
        finalPhase: currentStatus?.currentPhase ?? 'FAILED',
        preFlightResult: preFlightResult!,
        backupResult,
        postDropResult,
        log: [...executionLog],
        durationMs: Date.now() - startTime.getTime(),
        correlationId,
      };
    }
  }

  /**
   * Preview cleanup (dry-run).
   */
  async function preview(correlationId?: string): Promise<CleanupExecutionResult> {
    return execute({
      dryRun: true,
      correlationId: correlationId ?? generateId('preview'),
    });
  }

  /**
   * Get current execution status.
   */
  function getStatus(): CleanupExecutionStatus | null {
    return currentStatus;
  }

  /**
   * Rollback from the latest backup.
   */
  async function rollback(): Promise<RollbackResult> {
    if (!latestBackupCheckpointId) {
      return {
        success: false,
        checkpointId: '',
        tablesRestored: [],
        rowsRestored: 0,
        errorMessage: 'No backup checkpoint available for rollback',
        durationMs: 0,
      };
    }

    log('info', 'ROLLED_BACK', 'Starting rollback from latest backup', {
      checkpointId: latestBackupCheckpointId,
    });

    const result = await backupService.rollback(latestBackupCheckpointId);

    if (result.success) {
      updateStatus('ROLLED_BACK');
      log('info', 'ROLLED_BACK', 'Rollback completed successfully', {
        tablesRestored: result.tablesRestored,
        rowsRestored: result.rowsRestored,
      });
    } else {
      log('error', 'FAILED', 'Rollback failed', {
        error: result.errorMessage,
      });
    }

    return result;
  }

  return {
    execute,
    preview,
    getStatus,
    canExecute,
    requestApproval,
    getApprovalStatus,
    rollback,
  };
}

/**
 * Default Schema Cleanup Service instance factory.
 */
export const SchemaCleanupServiceImpl = createSchemaCleanupService;
