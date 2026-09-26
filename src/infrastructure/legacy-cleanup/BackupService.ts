/**
 * Backup Service — Creates backups of affected tables before destructive operations.
 *
 * This service manages:
 * - Creating backup tables before schema cleanup
 * - Listing available backup checkpoints
 * - Rolling back from a backup checkpoint
 * - Cleaning up expired checkpoints
 *
 * **CRITICAL:** Backup must be created before ANY destructive operation.
 * Rollback window is 24 hours by default (Req 13 AC 5).
 *
 * @see Task 37: Legacy Schema Cleanup
 * @see Requirement 13 (AC 4, 5)
 */

import type {
  IBackupService,
  BackupCheckpoint,
  BackupTableSpec,
  BackupResult,
  RollbackResult,
  BackupOptions,
} from './types';
import {
  CleanupError,
  TABLES_TO_BACKUP,
  COLUMNS_TO_REMOVE,
  DEFAULT_BACKUP_EXPIRATION_HOURS,
} from './types';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Database client interface for backup operations.
 */
export interface BackupDatabaseClient {
  /** Execute raw SQL */
  $executeRawUnsafe: (sql: string) => Promise<number>;
  /** Query raw SQL */
  $queryRawUnsafe: <T>(sql: string) => Promise<T>;
}

/**
 * Dependencies for the Backup Service.
 */
export interface BackupServiceDeps {
  /** Database client */
  readonly db: BackupDatabaseClient;
  /** Logger for recording operations */
  readonly logger?: {
    info: (message: string, context?: Record<string, unknown>) => void;
    warn: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
  };
  /** Custom date provider for testing */
  readonly dateProvider?: () => Date;
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface InternalCheckpoint extends BackupCheckpoint {
  readonly _internal: {
    readonly createdVia: 'service' | 'manual';
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for Backup Service.
 *
 * @param deps - Service dependencies
 * @returns Backup Service instance
 */
export function createBackupService(deps: BackupServiceDeps): IBackupService {
  const {
    db,
    logger = console,
    dateProvider = () => new Date(),
  } = deps;

  // In-memory checkpoint registry (in production, this would be persisted)
  const checkpointRegistry = new Map<string, InternalCheckpoint>();

  /**
   * Generate a unique checkpoint ID.
   */
  function generateCheckpointId(): string {
    return `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a correlation ID.
   */
  function generateCorrelationId(): string {
    return `backup-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Format timestamp for backup table suffix.
   */
  function formatTimestamp(date: Date): string {
    return date.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  }

  /**
   * Get row count for a table.
   */
  async function getTableRowCount(tableName: string): Promise<number> {
    try {
      const result = await db.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) as count FROM "${tableName}"`,
      );
      return Number(result[0]?.count ?? 0);
    } catch {
      logger.warn?.(`Could not get row count for table ${tableName}`);
      return 0;
    }
  }

  /**
   * Check if a table exists.
   */
  async function tableExists(tableName: string): Promise<boolean> {
    try {
      const result = await db.$queryRawUnsafe<{ exists: boolean }[]>(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        ) as exists
      `.replace('$1', `'${tableName}'`));
      return result[0]?.exists ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Check if a column exists in a table.
   */
  async function columnExists(tableName: string, columnName: string): Promise<boolean> {
    try {
      const result = await db.$queryRawUnsafe<{ exists: boolean }[]>(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
          AND column_name = '${columnName}'
        ) as exists
      `);
      return result[0]?.exists ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Create a backup of a single table.
   */
  async function backupTable(
    tableName: string,
    backupTableName: string,
    columns: readonly string[],
  ): Promise<BackupTableSpec> {
    const startTime = Date.now();

    // Check if source table exists
    const sourceExists = await tableExists(tableName);
    if (!sourceExists) {
      throw new CleanupError(
        'BACKUP_FAILED',
        `Source table ${tableName} does not exist`,
      );
    }

    // Get current row count
    const rowCount = await getTableRowCount(tableName);

    // Build column list for backup
    // We back up the entire row, but track which columns we're specifically targeting
    const columnList = columns.join(', ');

    // Create backup table with selected columns
    const createBackupSql = `
      CREATE TABLE IF NOT EXISTS "${backupTableName}" AS
      SELECT id, ${columnList}, created_at, updated_at
      FROM "${tableName}"
    `;

    try {
      await db.$executeRawUnsafe(createBackupSql);
      logger.info?.(`Backed up table ${tableName} to ${backupTableName}`, {
        rowCount,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      throw new CleanupError(
        'BACKUP_FAILED',
        `Failed to create backup table ${backupTableName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      tableName,
      columns,
      backupTableName,
      rowCount,
    };
  }

  /**
   * Create a backup checkpoint.
   */
  async function createBackup(options?: BackupOptions): Promise<BackupResult> {
    const startTime = Date.now();
    const now = dateProvider();
    const correlationId = options?.correlationId ?? generateCorrelationId();
    const checkpointId = generateCheckpointId();
    const expirationHours = options?.expirationHours ?? DEFAULT_BACKUP_EXPIRATION_HOURS;
    const backupSuffix = options?.backupSuffix ?? formatTimestamp(now);

    logger.info?.('Creating backup checkpoint', { checkpointId, correlationId });

    try {
      const tables: BackupTableSpec[] = [];
      let totalRows = 0;

      // Backup each target table
      for (const tableName of TABLES_TO_BACKUP) {
        const backupTableName = `${tableName}_backup_${backupSuffix}`;
        
        // Determine columns to backup for this table
        const columnsToBackup = tableName === 'users' ? COLUMNS_TO_REMOVE : [];
        
        // For users table, we need to backup the tenant_id column specifically
        if (tableName === 'users') {
          // Check if tenant_id column still exists
          const tenantIdExists = await columnExists('users', 'tenant_id');
          if (!tenantIdExists) {
            logger.warn?.('User.tenantId column does not exist, nothing to backup');
            continue;
          }
        }

        const tableSpec = await backupTable(tableName, backupTableName, columnsToBackup);
        tables.push(tableSpec);
        totalRows += tableSpec.rowCount;
      }

      const expiresAt = new Date(now.getTime() + expirationHours * 60 * 60 * 1000);

      const checkpoint: InternalCheckpoint = {
        checkpointId,
        createdAt: now,
        tables,
        totalRows,
        expiresAt,
        isValid: true,
        correlationId,
        notes: options?.notes,
        _internal: {
          createdVia: 'service',
        },
      };

      // Register checkpoint
      checkpointRegistry.set(checkpointId, checkpoint);

      logger.info?.('Backup checkpoint created', {
        checkpointId,
        totalRows,
        tablesCount: tables.length,
        expiresAt: expiresAt.toISOString(),
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        checkpoint,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error?.('Backup creation failed', { checkpointId, error: errorMessage });

      return {
        success: false,
        checkpoint: null,
        errorMessage,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * List available backup checkpoints.
   */
  async function listCheckpoints(): Promise<readonly BackupCheckpoint[]> {
    const now = dateProvider();
    const checkpoints: BackupCheckpoint[] = [];

    for (const checkpoint of checkpointRegistry.values()) {
      // Update validity based on expiration
      const isValid = now < checkpoint.expiresAt;
      checkpoints.push({
        ...checkpoint,
        isValid,
      });
    }

    // Sort by creation date (newest first)
    return checkpoints.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get a specific checkpoint.
   */
  async function getCheckpoint(checkpointId: string): Promise<BackupCheckpoint | null> {
    const checkpoint = checkpointRegistry.get(checkpointId);
    if (!checkpoint) {
      return null;
    }

    const now = dateProvider();
    const isValid = now < checkpoint.expiresAt;

    return {
      ...checkpoint,
      isValid,
    };
  }

  /**
   * Rollback from a checkpoint.
   */
  async function rollback(checkpointId: string): Promise<RollbackResult> {
    const startTime = Date.now();

    const checkpoint = await getCheckpoint(checkpointId);
    if (!checkpoint) {
      return {
        success: false,
        checkpointId,
        tablesRestored: [],
        rowsRestored: 0,
        errorMessage: `Checkpoint ${checkpointId} not found`,
        durationMs: Date.now() - startTime,
      };
    }

    if (!checkpoint.isValid) {
      return {
        success: false,
        checkpointId,
        tablesRestored: [],
        rowsRestored: 0,
        errorMessage: `Checkpoint ${checkpointId} has expired and is no longer valid for rollback`,
        durationMs: Date.now() - startTime,
      };
    }

    logger.info?.('Starting rollback from checkpoint', { checkpointId });

    const tablesRestored: string[] = [];
    let rowsRestored = 0;

    try {
      for (const tableSpec of checkpoint.tables) {
        // Check if backup table exists
        const backupExists = await tableExists(tableSpec.backupTableName);
        if (!backupExists) {
          throw new CleanupError(
            'ROLLBACK_FAILED',
            `Backup table ${tableSpec.backupTableName} does not exist`,
          );
        }

        // For users table, we need to re-add the tenant_id column if it was removed
        if (tableSpec.tableName === 'users' && tableSpec.columns.includes('tenant_id')) {
          // Check if column still exists (it should not if cleanup was performed)
          const columnStillExists = await columnExists('users', 'tenant_id');
          
          if (!columnStillExists) {
            // Re-add the column
            await db.$executeRawUnsafe(`
              ALTER TABLE "users" ADD COLUMN "tenant_id" VARCHAR(255)
            `);
            logger.info?.('Re-added tenant_id column to users table');
          }

          // Update the column from backup data
          await db.$executeRawUnsafe(`
            UPDATE "users" u
            SET "tenant_id" = b."tenant_id"
            FROM "${tableSpec.backupTableName}" b
            WHERE u.id = b.id
          `);

          rowsRestored += tableSpec.rowCount;
        }

        tablesRestored.push(tableSpec.tableName);
        logger.info?.(`Restored ${tableSpec.tableName} from ${tableSpec.backupTableName}`);
      }

      logger.info?.('Rollback completed', {
        checkpointId,
        tablesRestored,
        rowsRestored,
        durationMs: Date.now() - startTime,
      });

      return {
        success: true,
        checkpointId,
        tablesRestored,
        rowsRestored,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error?.('Rollback failed', { checkpointId, error: errorMessage });

      return {
        success: false,
        checkpointId,
        tablesRestored,
        rowsRestored,
        errorMessage,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Check if a checkpoint is valid for rollback.
   */
  async function isCheckpointValid(checkpointId: string): Promise<boolean> {
    const checkpoint = await getCheckpoint(checkpointId);
    return checkpoint?.isValid ?? false;
  }

  /**
   * Clean up expired checkpoints.
   */
  async function cleanupExpiredCheckpoints(): Promise<number> {
    const now = dateProvider();
    let cleanedCount = 0;

    for (const [checkpointId, checkpoint] of checkpointRegistry.entries()) {
      if (now >= checkpoint.expiresAt) {
        // Drop backup tables
        for (const tableSpec of checkpoint.tables) {
          try {
            const exists = await tableExists(tableSpec.backupTableName);
            if (exists) {
              await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tableSpec.backupTableName}"`);
              logger.info?.(`Dropped expired backup table ${tableSpec.backupTableName}`);
            }
          } catch (error) {
            logger.warn?.(`Failed to drop backup table ${tableSpec.backupTableName}`, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Remove from registry
        checkpointRegistry.delete(checkpointId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info?.(`Cleaned up ${cleanedCount} expired checkpoint(s)`);
    }

    return cleanedCount;
  }

  return {
    createBackup,
    listCheckpoints,
    getCheckpoint,
    rollback,
    isCheckpointValid,
    cleanupExpiredCheckpoints,
  };
}

/**
 * Default Backup Service instance factory.
 */
export const BackupServiceImpl = createBackupService;
