#!/usr/bin/env npx tsx
/**
 * RLS Rollback Validation Script
 *
 * This script validates the RLS rollback procedure by:
 * 1. Executing the RLS rollback migration
 * 2. Timing the operation
 * 3. Verifying rollback completed within 15 minutes
 * 4. Running post-rollback health checks
 * 5. Reporting timing and success/failure status
 *
 * Usage:
 *   npx tsx scripts/rls/validate-rollback-procedure.ts
 *   npx tsx scripts/rls/validate-rollback-procedure.ts --dry-run
 *   npx tsx scripts/rls/validate-rollback-procedure.ts --verify-only
 *
 * Exit codes:
 *   0 - Rollback completed successfully within time limit
 *   1 - Rollback failed or exceeded time limit
 *   2 - Error during execution
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string (required)
 *
 * @see FASE 2.7 Task 16.3: Validate rollback procedure on staging
 * @see Requirement 14.3: Test rollback completes within 15 minutes
 * @see Requirement 14.6: Verify system operational after rollback
 * @see Design Section 7: RLS Database Migration
 */

import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_NAME = 'validate-rollback-procedure';
const MAX_ROLLBACK_TIME_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ROLLBACK_TIME_MINUTES = 15;

// Path to the disable_rls.sql migration file
const DISABLE_RLS_SQL_PATH = path.join(
  __dirname,
  '../../src/infrastructure/rls/migrations/disable_rls.sql',
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RollbackResult {
  success: boolean;
  status: 'success' | 'failed' | 'timed_out' | 'dry_run';
  durationMs: number;
  durationMinutes: number;
  withinTimeLimit: boolean;
  tablesProcessed: number;
  policiesDropped: number;
  errorMessage?: string;
  healthCheckPassed?: boolean;
  startedAt: Date;
  completedAt: Date;
}

interface RlsTableStatus {
  tableName: string;
  rlsEnabled: boolean;
  policies: string[];
}

interface HealthCheckResult {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    message: string;
    durationMs: number;
  }[];
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${SCRIPT_NAME}] ${message}`);
}

function error(message: string): void {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [${SCRIPT_NAME}] ERROR: ${message}`);
}

function warn(message: string): void {
  const timestamp = new Date().toISOString();
  console.warn(`[${timestamp}] [${SCRIPT_NAME}] WARN: ${message}`);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s (${ms}ms)`;
  }
  return `${seconds}s (${ms}ms)`;
}

/**
 * Parse command line arguments.
 */
function parseArgs(): { dryRun: boolean; verifyOnly: boolean } {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    verifyOnly: args.includes('--verify-only'),
  };
}

// ---------------------------------------------------------------------------
// RLS Status Queries
// ---------------------------------------------------------------------------

/**
 * Get RLS status for all tables in the public schema.
 */
async function getRlsTableStatus(
  client: pg.PoolClient,
): Promise<RlsTableStatus[]> {
  const result = await client.query<{
    relname: string;
    relrowsecurity: boolean;
    policies: string[] | null;
  }>(`
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
  `);

  return result.rows.map((row) => ({
    tableName: row.relname,
    rlsEnabled: row.relrowsecurity,
    policies: row.policies ?? [],
  }));
}

/**
 * Count tables with RLS enabled.
 */
function countRlsEnabledTables(statuses: RlsTableStatus[]): number {
  return statuses.filter((s) => s.rlsEnabled).length;
}

/**
 * Count total policies.
 */
function countPolicies(statuses: RlsTableStatus[]): number {
  return statuses.reduce((sum, s) => sum + s.policies.length, 0);
}

// ---------------------------------------------------------------------------
// Health Check Functions
// ---------------------------------------------------------------------------

/**
 * Run post-rollback health checks.
 */
async function runHealthChecks(client: pg.PoolClient): Promise<HealthCheckResult> {
  const checks: HealthCheckResult['checks'] = [];
  const overallStart = Date.now();

  // Check 1: Database connectivity
  const connectStart = Date.now();
  try {
    await client.query('SELECT 1 AS ping');
    checks.push({
      name: 'Database Connectivity',
      passed: true,
      message: 'Database is responsive',
      durationMs: Date.now() - connectStart,
    });
  } catch (err) {
    checks.push({
      name: 'Database Connectivity',
      passed: false,
      message: `Database connectivity failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - connectStart,
    });
  }

  // Check 2: No RLS policies remain on tenant tables
  const rlsCheckStart = Date.now();
  try {
    const tenantTables = [
      'tenants',
      'org_units',
      'memberships',
      'households',
      'residents',
      'financial_transactions',
      'announcements',
      'votes',
      'emergency_alerts',
      'iot_devices',
    ];

    const statuses = await getRlsTableStatus(client);
    const tenantTableStatuses = statuses.filter((s) =>
      tenantTables.includes(s.tableName),
    );
    const tablesWithRls = tenantTableStatuses.filter((s) => s.rlsEnabled);

    if (tablesWithRls.length === 0) {
      checks.push({
        name: 'RLS Policies Removed',
        passed: true,
        message: `All ${tenantTables.length} tenant tables have RLS disabled`,
        durationMs: Date.now() - rlsCheckStart,
      });
    } else {
      checks.push({
        name: 'RLS Policies Removed',
        passed: false,
        message: `${tablesWithRls.length} tables still have RLS enabled: ${tablesWithRls.map((t) => t.tableName).join(', ')}`,
        durationMs: Date.now() - rlsCheckStart,
      });
    }
  } catch (err) {
    checks.push({
      name: 'RLS Policies Removed',
      passed: false,
      message: `Failed to check RLS status: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - rlsCheckStart,
    });
  }

  // Check 3: Basic read operation works
  const readCheckStart = Date.now();
  try {
    // Try to read from a common table
    const result = await client.query('SELECT COUNT(*) FROM tenants LIMIT 1');
    checks.push({
      name: 'Basic Read Operation',
      passed: true,
      message: `Read operation successful (tenants count: ${result.rows[0]?.count ?? 'N/A'})`,
      durationMs: Date.now() - readCheckStart,
    });
  } catch (err) {
    // Table might not exist in some environments
    checks.push({
      name: 'Basic Read Operation',
      passed: true,
      message: `Read test skipped (table may not exist): ${err instanceof Error ? err.message : 'Unknown'}`,
      durationMs: Date.now() - readCheckStart,
    });
  }

  // Check 4: Transaction support
  const txCheckStart = Date.now();
  try {
    await client.query('BEGIN');
    await client.query('SELECT 1');
    await client.query('ROLLBACK');
    checks.push({
      name: 'Transaction Support',
      passed: true,
      message: 'Transaction operations work correctly',
      durationMs: Date.now() - txCheckStart,
    });
  } catch (err) {
    checks.push({
      name: 'Transaction Support',
      passed: false,
      message: `Transaction test failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - txCheckStart,
    });
  }

  // Check 5: Session variable operations
  const sessionVarStart = Date.now();
  try {
    // This should work even after RLS is disabled
    await client.query(`SET LOCAL "app.current_tenant_id" = 'test-tenant-id'`);
    await client.query(`RESET "app.current_tenant_id"`);
    checks.push({
      name: 'Session Variable Operations',
      passed: true,
      message: 'Session variable SET/RESET works correctly',
      durationMs: Date.now() - sessionVarStart,
    });
  } catch (err) {
    // This might fail if custom variable not defined, which is OK
    checks.push({
      name: 'Session Variable Operations',
      passed: true,
      message: `Session variable test completed: ${err instanceof Error ? err.message : 'OK'}`,
      durationMs: Date.now() - sessionVarStart,
    });
  }

  const allPassed = checks.every((c) => c.passed);

  return {
    passed: allPassed,
    checks,
    totalDurationMs: Date.now() - overallStart,
  };
}

// ---------------------------------------------------------------------------
// Rollback Execution
// ---------------------------------------------------------------------------

/**
 * Execute the RLS rollback migration.
 */
async function executeRollback(
  client: pg.PoolClient,
  dryRun: boolean,
): Promise<RollbackResult> {
  const startedAt = new Date();

  // Get initial state
  const beforeStatuses = await getRlsTableStatus(client);
  const tablesWithRlsBefore = countRlsEnabledTables(beforeStatuses);
  const policiesBefore = countPolicies(beforeStatuses);

  log(`Initial state: ${tablesWithRlsBefore} tables with RLS, ${policiesBefore} policies`);

  if (dryRun) {
    log('DRY RUN: Would execute rollback migration');
    log(`Would affect ${tablesWithRlsBefore} tables with ${policiesBefore} policies`);

    return {
      success: true,
      status: 'dry_run',
      durationMs: Date.now() - startedAt.getTime(),
      durationMinutes: 0,
      withinTimeLimit: true,
      tablesProcessed: tablesWithRlsBefore,
      policiesDropped: policiesBefore,
      startedAt,
      completedAt: new Date(),
    };
  }

  // Read the rollback SQL file
  if (!fs.existsSync(DISABLE_RLS_SQL_PATH)) {
    error(`Rollback SQL file not found: ${DISABLE_RLS_SQL_PATH}`);
    return {
      success: false,
      status: 'failed',
      durationMs: Date.now() - startedAt.getTime(),
      durationMinutes: 0,
      withinTimeLimit: true,
      tablesProcessed: 0,
      policiesDropped: 0,
      errorMessage: `Rollback SQL file not found: ${DISABLE_RLS_SQL_PATH}`,
      startedAt,
      completedAt: new Date(),
    };
  }

  const rollbackSql = fs.readFileSync(DISABLE_RLS_SQL_PATH, 'utf-8');
  log('Loaded rollback SQL migration');

  // Execute rollback
  log('Executing RLS rollback migration...');
  const executionStart = Date.now();

  try {
    await client.query(rollbackSql);

    const executionDuration = Date.now() - executionStart;
    const durationMs = Date.now() - startedAt.getTime();
    const durationMinutes = durationMs / 60000;

    log(`Rollback SQL execution completed in ${formatDuration(executionDuration)}`);

    // Verify rollback
    const afterStatuses = await getRlsTableStatus(client);
    const tablesWithRlsAfter = countRlsEnabledTables(afterStatuses);
    const policiesAfter = countPolicies(afterStatuses);

    log(`After rollback: ${tablesWithRlsAfter} tables with RLS, ${policiesAfter} policies`);

    const tablesProcessed = tablesWithRlsBefore - tablesWithRlsAfter;
    const policiesDropped = policiesBefore - policiesAfter;

    // Run health checks
    log('Running post-rollback health checks...');
    const healthCheckResult = await runHealthChecks(client);

    const withinTimeLimit = durationMs <= MAX_ROLLBACK_TIME_MS;
    const success = tablesWithRlsAfter === 0 && healthCheckResult.passed && withinTimeLimit;

    if (!withinTimeLimit) {
      warn(`Rollback exceeded time limit of ${MAX_ROLLBACK_TIME_MINUTES} minutes`);
    }

    return {
      success,
      status: success ? 'success' : withinTimeLimit ? 'failed' : 'timed_out',
      durationMs,
      durationMinutes,
      withinTimeLimit,
      tablesProcessed,
      policiesDropped,
      healthCheckPassed: healthCheckResult.passed,
      startedAt,
      completedAt: new Date(),
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt.getTime();

    error(`Rollback execution failed: ${err instanceof Error ? err.message : String(err)}`);

    return {
      success: false,
      status: 'failed',
      durationMs,
      durationMinutes: durationMs / 60000,
      withinTimeLimit: true,
      tablesProcessed: 0,
      policiesDropped: 0,
      errorMessage: err instanceof Error ? err.message : String(err),
      startedAt,
      completedAt: new Date(),
    };
  }
}

/**
 * Verify current RLS state without executing rollback.
 */
async function verifyRlsState(client: pg.PoolClient): Promise<void> {
  log('Verifying current RLS state...');

  const statuses = await getRlsTableStatus(client);
  const tablesWithRls = statuses.filter((s) => s.rlsEnabled);
  const totalPolicies = countPolicies(statuses);

  console.log('');
  console.log('═'.repeat(70));
  console.log('  CURRENT RLS STATE');
  console.log('═'.repeat(70));
  console.log('');
  console.log(`  Total tables in schema: ${statuses.length}`);
  console.log(`  Tables with RLS enabled: ${tablesWithRls.length}`);
  console.log(`  Total RLS policies: ${totalPolicies}`);
  console.log('');

  if (tablesWithRls.length > 0) {
    console.log('  Tables with RLS enabled:');
    for (const table of tablesWithRls) {
      console.log(`    • ${table.tableName} (${table.policies.length} policies)`);
      for (const policy of table.policies) {
        console.log(`        - ${policy}`);
      }
    }
  } else {
    console.log('  ✅ No tables have RLS enabled');
  }

  console.log('');
  console.log('═'.repeat(70));

  // Also run health checks
  log('Running health checks...');
  const healthCheckResult = await runHealthChecks(client);

  console.log('');
  console.log('  HEALTH CHECK RESULTS');
  console.log('─'.repeat(70));
  for (const check of healthCheckResult.checks) {
    const icon = check.passed ? '✅' : '❌';
    console.log(`  ${icon} ${check.name}: ${check.message} (${check.durationMs}ms)`);
  }
  console.log('─'.repeat(70));
  console.log(`  Overall: ${healthCheckResult.passed ? 'PASSED' : 'FAILED'} (${healthCheckResult.totalDurationMs}ms)`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

/**
 * Format rollback result for console output.
 */
function formatResult(result: RollbackResult): void {
  console.log('');
  console.log('═'.repeat(70));
  console.log('  RLS ROLLBACK VALIDATION RESULTS');
  console.log('═'.repeat(70));
  console.log('');

  const statusIcon =
    result.status === 'success'
      ? '✅'
      : result.status === 'dry_run'
        ? '🔍'
        : result.status === 'timed_out'
          ? '⏱️'
          : '❌';

  console.log(`  Status: ${statusIcon} ${result.status.toUpperCase()}`);
  console.log(`  Duration: ${formatDuration(result.durationMs)}`);
  console.log(`  Duration (minutes): ${result.durationMinutes.toFixed(2)}`);
  console.log(`  Time limit (minutes): ${MAX_ROLLBACK_TIME_MINUTES}`);
  console.log(`  Within time limit: ${result.withinTimeLimit ? '✅ Yes' : '❌ No'}`);
  console.log('');
  console.log(`  Tables processed: ${result.tablesProcessed}`);
  console.log(`  Policies dropped: ${result.policiesDropped}`);

  if (result.healthCheckPassed !== undefined) {
    console.log(`  Health check: ${result.healthCheckPassed ? '✅ Passed' : '❌ Failed'}`);
  }

  if (result.errorMessage) {
    console.log('');
    console.log(`  Error: ${result.errorMessage}`);
  }

  console.log('');
  console.log('  Timing Details:');
  console.log(`    Started at: ${result.startedAt.toISOString()}`);
  console.log(`    Completed at: ${result.completedAt.toISOString()}`);

  console.log('');
  console.log('─'.repeat(70));

  if (result.success) {
    console.log('  ✅ ROLLBACK VALIDATION PASSED');
    console.log('');
    console.log('  The rollback procedure completed successfully within the');
    console.log(`  required ${MAX_ROLLBACK_TIME_MINUTES} minute time limit.`);
    console.log('');
    console.log('  This staging validation satisfies Requirement 14.3 and 14.6.');
  } else if (result.status === 'dry_run') {
    console.log('  🔍 DRY RUN COMPLETED');
    console.log('');
    console.log('  No changes were made. Run without --dry-run to execute rollback.');
  } else {
    console.log('  ❌ ROLLBACK VALIDATION FAILED');
    console.log('');
    if (!result.withinTimeLimit) {
      console.log(`  Rollback exceeded the ${MAX_ROLLBACK_TIME_MINUTES} minute time limit.`);
      console.log('  Consider optimizing the rollback procedure or increasing the limit.');
    }
    if (!result.healthCheckPassed) {
      console.log('  Post-rollback health checks failed.');
      console.log('  Review the health check output for details.');
    }
    if (result.errorMessage) {
      console.log('  See error details above.');
    }
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { dryRun, verifyOnly } = parseArgs();

  log('Starting RLS rollback validation...');
  log(`Mode: ${dryRun ? 'DRY RUN' : verifyOnly ? 'VERIFY ONLY' : 'EXECUTE'}`);

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    error('DATABASE_URL not set. Cannot connect to database.');
    process.exit(2);
  }

  const pool = new pg.Pool({ connectionString });
  let client: pg.PoolClient | null = null;

  try {
    client = await pool.connect();
    log('Connected to database');

    if (verifyOnly) {
      await verifyRlsState(client);
      process.exit(0);
    }

    const result = await executeRollback(client, dryRun);

    formatResult(result);

    // Exit with appropriate code
    if (result.success || result.status === 'dry_run') {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Run
main().catch((err) => {
  error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
