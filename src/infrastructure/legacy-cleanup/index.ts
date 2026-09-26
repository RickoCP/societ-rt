/**
 * Legacy Cleanup Module — Barrel exports for schema cleanup services.
 *
 * This module provides tooling for safely removing the User.tenantId column:
 * - Pre-flight verification (TPR-07 ordered criteria)
 * - Backup and recovery
 * - Migration script generation
 * - Post-drop validation
 * - Complete cleanup orchestration
 *
 * **USAGE:**
 *
 * ```typescript
 * import {
 *   createSchemaCleanupService,
 *   createPreFlightVerificationService,
 *   createBackupService,
 *   createCleanupMigrationGenerator,
 *   createPostDropValidationService,
 * } from '@infrastructure/legacy-cleanup';
 *
 * // 1. Create services
 * const preFlightService = createPreFlightVerificationService({ ... });
 * const backupService = createBackupService({ db });
 * const migrationGenerator = createCleanupMigrationGenerator();
 * const postDropValidationService = createPostDropValidationService({ db });
 *
 * // 2. Create main orchestrator
 * const cleanupService = createSchemaCleanupService({
 *   preFlightService,
 *   backupService,
 *   migrationGenerator,
 *   postDropValidationService,
 *   db,
 * });
 *
 * // 3. Preview (dry-run)
 * const previewResult = await cleanupService.preview();
 *
 * // 4. If preview passes, request approval
 * await cleanupService.requestApproval('admin-user-id', 'Approved for maintenance window');
 *
 * // 5. Execute actual cleanup (during maintenance window)
 * const result = await cleanupService.execute({ dryRun: false });
 *
 * // 6. If issues, rollback
 * if (!result.success) {
 *   await cleanupService.rollback();
 * }
 * ```
 *
 * @see Task 37: Legacy Schema Cleanup
 * @see Requirement 13 (AC 1-7)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  // Pre-flight types
  IPreFlightVerificationService,
  PreFlightVerificationResult,
  PreFlightCriteria,
  CriterionResult,
  PreFlightOptions,
  // Backup types
  IBackupService,
  BackupCheckpoint,
  BackupTableSpec,
  BackupResult,
  RollbackResult,
  BackupOptions,
  // Migration types
  ICleanupMigrationGenerator,
  CleanupMigrationScript,
  SchemaChangeOperation,
  SchemaOperationType,
  // Validation types
  IPostDropValidationService,
  PostDropValidationResult,
  SchemaValidationCheck,
  // Execution types
  ISchemaCleanupService,
  CleanupExecutionResult,
  CleanupExecutionStatus,
  CleanupExecutionOptions,
  CleanupPhase,
  CleanupLogEntry,
  // Approval types
  DestructiveApproval,
  ApprovalGateStatus,
} from './types';

export {
  // Error types
  CleanupError,
  // Error codes
  type CleanupErrorCode,
  // Constants
  CLEANUP_SERVICE_VERSION,
  DEFAULT_STABILIZATION_WINDOW_HOURS,
  DEFAULT_BACKUP_EXPIRATION_HOURS,
  DEFAULT_APPROVAL_VALIDITY_MINUTES,
  DEFAULT_CLEANUP_OPTIONS,
  TABLES_TO_BACKUP,
  COLUMNS_TO_REMOVE,
  POTENTIALLY_UNUSED_ENUM_VALUES,
} from './types';

// ---------------------------------------------------------------------------
// Service Factories
// ---------------------------------------------------------------------------

export {
  createPreFlightVerificationService,
  PreFlightVerificationServiceImpl,
  type PreFlightVerificationServiceDeps,
} from './PreFlightVerificationService';

export {
  createBackupService,
  BackupServiceImpl,
  type BackupServiceDeps,
  type BackupDatabaseClient,
} from './BackupService';

export {
  createCleanupMigrationGenerator,
  CleanupMigrationGeneratorImpl,
  type CleanupMigrationGeneratorDeps,
  PRISMA_SCHEMA_UPDATE_INSTRUCTIONS,
} from './CleanupMigrationGenerator';

export {
  createPostDropValidationService,
  PostDropValidationServiceImpl,
  type PostDropValidationServiceDeps,
  type ValidationDatabaseClient,
} from './PostDropValidationService';

export {
  createSchemaCleanupService,
  SchemaCleanupServiceImpl,
  type SchemaCleanupServiceDeps,
  type CleanupDatabaseClient,
} from './SchemaCleanupService';
