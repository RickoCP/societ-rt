/**
 * RLS Migration Service
 *
 * Service for executing RLS (Row-Level Security) migrations with atomic
 * transaction support and rollback-on-failure capability.
 *
 * **CRITICAL BEHAVIOR:**
 * - All migrations run atomically (all-or-nothing)
 * - On partial failure: automatic rollback attempted
 * - On rollback failure: HALT deployment, ALERT admins, require manual intervention
 *
 * @see FASE 2.7 Task 15: RLS Database Migration
 * @see Requirement 8: RLS Database Migration Creation
 * @see Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 * @see Design Section 7: RLS Database Migration
 */

import { createRlsPolicyManager, type IRlsPolicyManager } from './RlsPolicyManager';
import {
  createTableClassificationRegistry,
  type ITableClassificationRegistry,
} from './TableClassificationRegistry';

// ---------------------------------------------------------------------------
// Migration Result Types
// ---------------------------------------------------------------------------

/**
 * Status of an RLS migration operation.
 */
export type RlsMigrationStatus =
  | 'success'
  | 'failed'
  | 'rolled_back'
  | 'rollback_failed'
  | 'requires_manual_intervention';

/**
 * Result of an RLS migration operation.
 */
export interface RlsMigrationResult {
  /** Overall status of the migration */
  readonly status: RlsMigrationStatus;
  /** Human-readable message describing the result */
  readonly message: string;
  /** List of tables affected by the migration */
  readonly affectedTables: readonly string[];
  /** Number of policies created/dropped */
  readonly policyCount: number;
  /** Duration of the migration in milliseconds */
  readonly durationMs: number;
  /** Error details if migration failed */
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
  /** Timestamp when migration started */
  readonly startedAt: Date;
  /** Timestamp when migration completed */
  readonly completedAt: Date;
}

/**
 * Options for RLS migration execution.
 */
export interface RlsMigrationOptions {
  /** Whether to run in dry-run mode (generate SQL but don't execute) */
  dryRun?: boolean;
  /** Timeout for the migration in milliseconds */
  timeoutMs?: number;
  /** Whether to continue on partial failure (NOT RECOMMENDED for production) */
  continueOnError?: boolean;
  /** Logger function for progress updates */
  onProgress?: (message: string) => void;
}

/**
 * Admin alert payload for critical failures.
 */
export interface RlsMigrationAlert {
  readonly severity: 'critical' | 'warning' | 'info';
  readonly type: 'rollback_failed' | 'migration_failed' | 'manual_intervention_required';
  readonly message: string;
  readonly timestamp: Date;
  readonly migrationId: string;
  readonly databaseState: 'inconsistent' | 'rolled_back' | 'unknown';
  readonly actionRequired: string;
  readonly details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Migration Service Interface
// ---------------------------------------------------------------------------

/**
 * RLS Migration Service Interface
 *
 * Provides methods for executing RLS migrations atomically with
 * automatic rollback on failure.
 */
export interface IRlsMigrationService {
  /**
   * Apply RLS policies to all TENANT_OWNED tables.
   *
   * ATOMIC: Either all policies are applied, or none are.
   *
   * @param executeRawSql - Function to execute raw SQL against the database
   * @param options - Migration options
   * @returns Migration result
   *
   * @example
   * ```typescript
   * const service = createRlsMigrationService();
   * const result = await service.enableRls(
   *   async (sql) => prisma.$executeRawUnsafe(sql),
   *   { onProgress: console.log }
   * );
   * ```
   */
  enableRls(
    executeRawSql: (sql: string) => Promise<number>,
    options?: RlsMigrationOptions,
  ): Promise<RlsMigrationResult>;

  /**
   * Remove RLS policies from all tables (rollback).
   *
   * ATOMIC: Either all policies are removed, or none are.
   *
   * @param executeRawSql - Function to execute raw SQL against the database
   * @param options - Migration options
   * @returns Migration result
   */
  disableRls(
    executeRawSql: (sql: string) => Promise<number>,
    options?: RlsMigrationOptions,
  ): Promise<RlsMigrationResult>;

  /**
   * Verify current RLS state matches expected configuration.
   *
   * @param queryRawSql - Function to query raw SQL
   * @returns Verification result
   */
  verifyRlsState(
    queryRawSql: <T>(sql: string) => Promise<T[]>,
  ): Promise<RlsVerificationResult>;

  /**
   * Generate enable migration SQL without executing.
   *
   * @returns SQL statements for enabling RLS
   */
  generateEnableSql(): string;

  /**
   * Generate disable migration SQL without executing.
   *
   * @returns SQL statements for disabling RLS
   */
  generateDisableSql(): string;

  /**
   * Get list of tables that will be affected by RLS migration.
   *
   * @returns List of table names
   */
  getAffectedTables(): readonly string[];

  /**
   * Get list of tables excluded from RLS.
   *
   * @returns List of table names with reasons
   */
  getExcludedTables(): readonly { tableName: string; reason: string }[];

  /**
   * Create an admin alert for critical failures.
   *
   * @param type - Alert type
   * @param details - Additional details
   * @returns Alert object
   */
  createAlert(
    type: RlsMigrationAlert['type'],
    details: Record<string, unknown>,
  ): RlsMigrationAlert;
}

/**
 * RLS verification result.
 */
export interface RlsVerificationResult {
  /** Whether RLS is properly configured */
  readonly isValid: boolean;
  /** Tables with RLS enabled */
  readonly enabledTables: readonly string[];
  /** Tables missing RLS that should have it */
  readonly missingRlsTables: readonly string[];
  /** Tables with unexpected RLS */
  readonly unexpectedRlsTables: readonly string[];
  /** Policy coverage per table */
  readonly policyDetails: readonly {
    tableName: string;
    rlsEnabled: boolean;
    policies: readonly string[];
  }[];
  /** Timestamp of verification */
  readonly verifiedAt: Date;
}

// ---------------------------------------------------------------------------
// Migration Service Implementation
// ---------------------------------------------------------------------------

/**
 * Dependencies for RlsMigrationService
 */
export interface RlsMigrationServiceDeps {
  policyManager?: IRlsPolicyManager;
  tableClassificationRegistry?: ITableClassificationRegistry;
  generateAlertId?: () => string;
}

/**
 * Creates an RlsMigrationService instance.
 *
 * Factory function pattern for DI container registration.
 *
 * @example
 * ```typescript
 * import { createRlsMigrationService } from '@infrastructure/rls';
 * import { prisma } from '@infrastructure/database';
 *
 * const migrationService = createRlsMigrationService();
 *
 * // Enable RLS with atomic transaction
 * const result = await migrationService.enableRls(
 *   async (sql) => prisma.$executeRawUnsafe(sql),
 *   { onProgress: console.log }
 * );
 *
 * if (result.status === 'rollback_failed') {
 *   // CRITICAL: Halt deployment, alert admins
 *   const alert = migrationService.createAlert('rollback_failed', {
 *     ...result.error,
 *   });
 *   await sendCriticalAlert(alert);
 * }
 * ```
 */
export function createRlsMigrationService(
  deps: RlsMigrationServiceDeps = {},
): IRlsMigrationService {
  const policyManager = deps.policyManager ?? createRlsPolicyManager();
  const registry = deps.tableClassificationRegistry ?? createTableClassificationRegistry();
  const generateAlertId = deps.generateAlertId ?? (() => `rls-migration-${Date.now()}`);

  // Get affected tables once
  const affectedTables = policyManager.getTablesWithPolicies();
  const excludedTables = policyManager.getTablesWithoutPolicies();

  /**
   * Policy types for per-operation policies
   */
  const POLICY_OPERATIONS = ['select', 'insert', 'update', 'delete'] as const;

  /**
   * Generate SQL to enable RLS on a single table with all operation policies.
   */
  function generateTableEnableSql(tableName: string): string {
    const entry = registry.getClassification(tableName);
    if (!entry) return '';

    const tenantIdColumn = tableName === 'tenants' ? 'id' : entry.tenantIdColumn;
    if (!tenantIdColumn) return '';

    const lines: string[] = [];

    // Enable RLS
    lines.push(`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`);
    lines.push(`ALTER TABLE "${tableName}" FORCE ROW LEVEL SECURITY;`);

    // Create policies for each operation
    const usingExpr = `${tenantIdColumn} = current_setting('app.current_tenant_id', true)::uuid`;

    // SELECT
    lines.push(`CREATE POLICY "${tableName}_tenant_select" ON "${tableName}"`);
    lines.push(`  FOR SELECT TO PUBLIC`);
    lines.push(`  USING (${usingExpr});`);

    // INSERT
    lines.push(`CREATE POLICY "${tableName}_tenant_insert" ON "${tableName}"`);
    lines.push(`  FOR INSERT TO PUBLIC`);
    lines.push(`  WITH CHECK (${usingExpr});`);

    // UPDATE
    lines.push(`CREATE POLICY "${tableName}_tenant_update" ON "${tableName}"`);
    lines.push(`  FOR UPDATE TO PUBLIC`);
    lines.push(`  USING (${usingExpr})`);
    lines.push(`  WITH CHECK (${usingExpr});`);

    // DELETE
    lines.push(`CREATE POLICY "${tableName}_tenant_delete" ON "${tableName}"`);
    lines.push(`  FOR DELETE TO PUBLIC`);
    lines.push(`  USING (${usingExpr});`);

    return lines.join('\n');
  }

  /**
   * Generate SQL to disable RLS on a single table.
   */
  function generateTableDisableSql(tableName: string): string {
    const lines: string[] = [];

    // Drop all policies
    for (const op of POLICY_OPERATIONS) {
      lines.push(`DROP POLICY IF EXISTS "${tableName}_tenant_${op}" ON "${tableName}";`);
    }

    // Drop legacy combined policy if exists
    lines.push(`DROP POLICY IF EXISTS "${tableName}_tenant_isolation" ON "${tableName}";`);

    // Disable RLS
    lines.push(`ALTER TABLE "${tableName}" DISABLE ROW LEVEL SECURITY;`);

    return lines.join('\n');
  }

  return {
    async enableRls(
      executeRawSql: (sql: string) => Promise<number>,
      options: RlsMigrationOptions = {},
    ): Promise<RlsMigrationResult> {
      const startedAt = new Date();
      const { dryRun = false, onProgress } = options;

      onProgress?.(`Starting RLS enablement for ${affectedTables.length} tables...`);

      // Generate full migration SQL
      const migrationSql = this.generateEnableSql();

      if (dryRun) {
        return {
          status: 'success',
          message: `Dry run completed. Would affect ${affectedTables.length} tables.`,
          affectedTables,
          policyCount: affectedTables.length * POLICY_OPERATIONS.length,
          durationMs: Date.now() - startedAt.getTime(),
          startedAt,
          completedAt: new Date(),
        };
      }

      try {
        onProgress?.('Executing atomic RLS migration within transaction...');

        // Execute full migration as single atomic operation
        // The SQL includes BEGIN/COMMIT so it's already atomic
        await executeRawSql(migrationSql);

        onProgress?.('RLS migration completed successfully.');

        return {
          status: 'success',
          message: `Successfully enabled RLS on ${affectedTables.length} tables with ${affectedTables.length * POLICY_OPERATIONS.length} policies.`,
          affectedTables,
          policyCount: affectedTables.length * POLICY_OPERATIONS.length,
          durationMs: Date.now() - startedAt.getTime(),
          startedAt,
          completedAt: new Date(),
        };
      } catch (error) {
        onProgress?.(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        onProgress?.('Attempting automatic rollback...');

        // Attempt rollback
        try {
          const rollbackSql = this.generateDisableSql();
          await executeRawSql(rollbackSql);

          onProgress?.('Rollback completed successfully.');

          return {
            status: 'rolled_back',
            message: `Migration failed and was rolled back successfully.`,
            affectedTables,
            policyCount: 0,
            durationMs: Date.now() - startedAt.getTime(),
            startedAt,
            completedAt: new Date(),
            error: {
              code: 'RLS_MIGRATION_FAILED',
              message: error instanceof Error ? error.message : 'Migration failed',
              details: { originalError: String(error) },
            },
          };
        } catch (rollbackError) {
          // CRITICAL: Rollback failed
          onProgress?.(`CRITICAL: Rollback FAILED! Manual intervention required.`);

          return {
            status: 'rollback_failed',
            message: `CRITICAL: Migration failed and rollback also failed. Database may be in inconsistent state. Manual intervention required.`,
            affectedTables,
            policyCount: 0,
            durationMs: Date.now() - startedAt.getTime(),
            startedAt,
            completedAt: new Date(),
            error: {
              code: 'RLS_ROLLBACK_FAILED',
              message: 'Migration and rollback both failed',
              details: {
                originalError: error instanceof Error ? error.message : String(error),
                rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
                actionRequired: 'HALT deployment, ALERT administrators, manual intervention required',
              },
            },
          };
        }
      }
    },

    async disableRls(
      executeRawSql: (sql: string) => Promise<number>,
      options: RlsMigrationOptions = {},
    ): Promise<RlsMigrationResult> {
      const startedAt = new Date();
      const { dryRun = false, onProgress } = options;

      onProgress?.(`Starting RLS disablement for ${affectedTables.length} tables...`);

      const rollbackSql = this.generateDisableSql();

      if (dryRun) {
        return {
          status: 'success',
          message: `Dry run completed. Would disable RLS on ${affectedTables.length} tables.`,
          affectedTables,
          policyCount: 0,
          durationMs: Date.now() - startedAt.getTime(),
          startedAt,
          completedAt: new Date(),
        };
      }

      try {
        onProgress?.('Executing atomic RLS rollback within transaction...');

        await executeRawSql(rollbackSql);

        onProgress?.('RLS rollback completed successfully.');

        return {
          status: 'success',
          message: `Successfully disabled RLS on ${affectedTables.length} tables.`,
          affectedTables,
          policyCount: 0,
          durationMs: Date.now() - startedAt.getTime(),
          startedAt,
          completedAt: new Date(),
        };
      } catch (error) {
        onProgress?.(`CRITICAL: RLS rollback failed! ${error instanceof Error ? error.message : 'Unknown error'}`);

        return {
          status: 'failed',
          message: `RLS rollback failed. Database may be in inconsistent state.`,
          affectedTables,
          policyCount: 0,
          durationMs: Date.now() - startedAt.getTime(),
          startedAt,
          completedAt: new Date(),
          error: {
            code: 'RLS_ROLLBACK_FAILED',
            message: error instanceof Error ? error.message : 'Rollback failed',
            details: {
              originalError: String(error),
              actionRequired: 'Manual intervention required to restore database state',
            },
          },
        };
      }
    },

    async verifyRlsState<T extends { relname: string; relrowsecurity: boolean; policies: string[] | null }>(
      queryRawSql: <R>(sql: string) => Promise<R[]>,
    ): Promise<RlsVerificationResult> {
      const verificationSql = `
        SELECT
          c.relname,
          c.relrowsecurity,
          array_agg(DISTINCT p.polname) FILTER (WHERE p.polname IS NOT NULL) AS policies
        FROM pg_class c
        LEFT JOIN pg_policy p ON p.polrelid = c.oid
        WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          AND c.relkind = 'r'
        GROUP BY c.relname, c.relrowsecurity
        ORDER BY c.relname;
      `;

      const results = await queryRawSql<T>(verificationSql);

      const enabledTables: string[] = [];
      const missingRlsTables: string[] = [];
      const unexpectedRlsTables: string[] = [];
      const policyDetails: RlsVerificationResult['policyDetails'][number][] = [];

      const expectedTablesSet = new Set(affectedTables.map((t) => t.toLowerCase()));
      const excludedTablesSet = new Set(excludedTables.map((t) => t.tableName.toLowerCase()));

      for (const row of results) {
        const tableName = row.relname;
        const rlsEnabled = row.relrowsecurity;
        const policies = row.policies ?? [];

        policyDetails.push({
          tableName,
          rlsEnabled,
          policies,
        });

        if (rlsEnabled) {
          enabledTables.push(tableName);

          // Check if unexpected RLS
          if (excludedTablesSet.has(tableName.toLowerCase())) {
            unexpectedRlsTables.push(tableName);
          }
        } else if (expectedTablesSet.has(tableName.toLowerCase())) {
          // Should have RLS but doesn't
          missingRlsTables.push(tableName);
        }
      }

      return {
        isValid: missingRlsTables.length === 0 && unexpectedRlsTables.length === 0,
        enabledTables,
        missingRlsTables,
        unexpectedRlsTables,
        policyDetails,
        verifiedAt: new Date(),
      };
    },

    generateEnableSql(): string {
      const lines: string[] = [];

      lines.push('-- ============================================================');
      lines.push('-- Multi-Tenant RLS Policy Migration (ENABLE)');
      lines.push('-- Generated by RlsMigrationService');
      lines.push('-- ============================================================');
      lines.push('');
      lines.push('BEGIN;');
      lines.push('');

      // Enable RLS and create policies for each table
      for (const tableName of affectedTables) {
        lines.push(`-- Table: ${tableName}`);
        lines.push(generateTableEnableSql(tableName));
        lines.push('');
      }

      lines.push('COMMIT;');

      return lines.join('\n');
    },

    generateDisableSql(): string {
      const lines: string[] = [];

      lines.push('-- ============================================================');
      lines.push('-- Multi-Tenant RLS Policy Migration (DISABLE / ROLLBACK)');
      lines.push('-- Generated by RlsMigrationService');
      lines.push('-- ============================================================');
      lines.push('');
      lines.push('BEGIN;');
      lines.push('');

      // Disable RLS and drop policies for each table
      for (const tableName of affectedTables) {
        lines.push(`-- Table: ${tableName}`);
        lines.push(generateTableDisableSql(tableName));
        lines.push('');
      }

      lines.push('COMMIT;');

      return lines.join('\n');
    },

    getAffectedTables(): readonly string[] {
      return affectedTables;
    },

    getExcludedTables(): readonly { tableName: string; reason: string }[] {
      return excludedTables;
    },

    createAlert(
      type: RlsMigrationAlert['type'],
      details: Record<string, unknown>,
    ): RlsMigrationAlert {
      const alertId = generateAlertId();

      const baseMessages: Record<RlsMigrationAlert['type'], string> = {
        rollback_failed: 'CRITICAL: RLS migration rollback failed. Database in inconsistent state.',
        migration_failed: 'RLS migration failed. Check logs for details.',
        manual_intervention_required: 'RLS migration requires manual database intervention.',
      };

      const actionRequired: Record<RlsMigrationAlert['type'], string> = {
        rollback_failed:
          'HALT all deployments immediately. Contact DBA for manual database recovery. ' +
          'Do NOT retry migration until database state is manually verified.',
        migration_failed:
          'Review migration logs. Verify database state before retrying. ' +
          'Consider running on staging first.',
        manual_intervention_required:
          'DBA must manually verify and correct database state. ' +
          'Run verification queries before proceeding.',
      };

      return {
        severity: type === 'rollback_failed' ? 'critical' : 'warning',
        type,
        message: baseMessages[type],
        timestamp: new Date(),
        migrationId: alertId,
        databaseState: type === 'rollback_failed' ? 'inconsistent' : 'unknown',
        actionRequired: actionRequired[type],
        details,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience Functions
// ---------------------------------------------------------------------------

/**
 * Default service instance for convenience imports.
 */
const defaultService = createRlsMigrationService();

/**
 * Generate enable RLS SQL using default service.
 */
export function generateRlsEnableMigrationSql(): string {
  return defaultService.generateEnableSql();
}

/**
 * Generate disable RLS SQL using default service.
 */
export function generateRlsDisableMigrationSql(): string {
  return defaultService.generateDisableSql();
}

/**
 * Get tables affected by RLS migration.
 */
export function getRlsAffectedTables(): readonly string[] {
  return defaultService.getAffectedTables();
}

/**
 * Get tables excluded from RLS.
 */
export function getRlsExcludedTables(): readonly { tableName: string; reason: string }[] {
  return defaultService.getExcludedTables();
}

/**
 * Create a critical alert for rollback failures.
 */
export function createRlsRollbackFailureAlert(
  details: Record<string, unknown>,
): RlsMigrationAlert {
  return defaultService.createAlert('rollback_failed', details);
}
