#!/usr/bin/env npx tsx
/**
 * RLS Coverage CI Check Script
 *
 * This script validates that all database tables are classified in the
 * TableClassificationRegistry. It should be run as part of CI to prevent
 * unclassified tables from being merged.
 *
 * Usage:
 *   npx tsx scripts/check-rls-coverage.ts
 *
 * Exit codes:
 *   0 - All tables are classified (CI passes)
 *   1 - Unclassified tables found (CI fails)
 *   2 - Error during execution
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string (optional, uses introspection)
 *
 * @see FASE 1.12 Task 31: RLS Coverage Enforcement
 * @see Requirement 60: RLS Connection Pool Safety & Coverage Enforcement (AC 5)
 */

import 'dotenv/config';
import pg from 'pg';
import {
  createRlsCoverageEnforcer,
  type RlsEnforcementResult,
} from '../src/infrastructure/rls/RlsCoverageEnforcer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_NAME = 'check-rls-coverage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(message: string): void {
  console.log(`[${SCRIPT_NAME}] ${message}`);
}

function error(message: string): void {
  console.error(`[${SCRIPT_NAME}] ERROR: ${message}`);
}

/**
 * Get list of all user tables from PostgreSQL information_schema.
 */
async function getSchemaTableNames(client: pg.PoolClient): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name 
     FROM information_schema.tables 
     WHERE table_schema = 'public' 
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

/**
 * Get list of tables that have a tenant_id column.
 */
async function getTablesWithTenantId(
  client: pg.PoolClient,
): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    `SELECT DISTINCT table_name 
     FROM information_schema.columns 
     WHERE table_schema = 'public' 
       AND column_name = 'tenant_id'
     ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

/**
 * Format result for CI output.
 */
function formatCiOutput(result: RlsEnforcementResult): void {
  console.log('');
  console.log('═'.repeat(70));
  console.log('  RLS COVERAGE CHECK RESULTS');
  console.log('═'.repeat(70));
  console.log('');

  for (const message of result.messages) {
    console.log(`  ${message}`);
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log(`  Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Coverage: ${result.coveragePercentage}%`);
  console.log(`  Tables classified: ${result.classifiedTablesCount}/${result.totalTablesInSchema}`);
  console.log(`  Tables requiring RLS: ${result.tablesRequiringRls.length}`);
  console.log(`  Tables excluded from RLS: ${result.tablesExcludedFromRls.length}`);
  console.log(`  Checked at: ${result.checkedAt.toISOString()}`);
  console.log('─'.repeat(70));
  console.log('');
}

/**
 * Run with database connection for actual schema inspection.
 */
async function runWithDatabase(): Promise<number> {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    error('DATABASE_URL not set. Cannot introspect schema.');
    error('Set DATABASE_URL environment variable to connect to PostgreSQL.');
    return 2;
  }

  const pool = new pg.Pool({ connectionString });
  let client: pg.PoolClient | null = null;

  try {
    client = await pool.connect();
    log('Connected to database');

    // Get actual tables from schema
    const actualTables = await getSchemaTableNames(client);
    log(`Found ${actualTables.length} tables in schema`);

    // Get tables with tenant_id for detailed audit
    const tenantIdTables = await getTablesWithTenantId(client);
    log(`Found ${tenantIdTables.length} tables with tenant_id column`);

    // Create enforcer and check coverage
    const enforcer = createRlsCoverageEnforcer();
    const result = enforcer.checkCoverage(actualTables);

    // Output results
    formatCiOutput(result);

    // If failed, print detailed failure message
    if (!result.passed) {
      console.log(enforcer.formatCiFailureMessage(result.unclassifiedTables));

      // Also run audit for more details
      const auditResult = enforcer.runAudit(actualTables, tenantIdTables);
      
      if (auditResult.gaps.length > 0) {
        console.log('');
        console.log('🔍 AUDIT DETAILS:');
        console.log('');
        for (const gap of auditResult.gaps) {
          const severityIcon =
            gap.severity === 'CRITICAL'
              ? '🚨'
              : gap.severity === 'WARNING'
                ? '⚠️'
                : 'ℹ️';
          console.log(`  ${severityIcon} [${gap.severity}] ${gap.type}`);
          console.log(`     Table: ${gap.tableName}`);
          console.log(`     ${gap.description}`);
          console.log('');
        }
      }
    }

    // Output JSON for CI parsing if requested
    if (process.env.CI_OUTPUT_JSON === 'true') {
      console.log('');
      console.log('JSON_OUTPUT_START');
      console.log(JSON.stringify(result, null, 2));
      console.log('JSON_OUTPUT_END');
    }

    return result.passed ? 0 : 1;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

/**
 * Run without database using only registry (for testing/offline check).
 */
function runOffline(): number {
  log('Running in offline mode (no database connection)');
  log('This checks only that the registry is properly defined.');
  
  const enforcer = createRlsCoverageEnforcer();
  const report = enforcer.getCoverageReport();

  console.log('');
  console.log('═'.repeat(70));
  console.log('  RLS REGISTRY CHECK (OFFLINE MODE)');
  console.log('═'.repeat(70));
  console.log('');
  console.log(`  Total classified tables: ${report.classifiedTables.length}`);
  console.log(`  Tables requiring RLS: ${report.tablesRequiringRls.length}`);
  console.log(`  Tables excluded from RLS: ${report.tablesExcludedFromRls.length}`);
  console.log('');

  if (report.tablesRequiringRls.length > 0) {
    console.log('  Tables with RLS policies:');
    for (const table of report.tablesRequiringRls) {
      console.log(`    • ${table}`);
    }
    console.log('');
  }

  if (report.tablesExcludedFromRls.length > 0) {
    console.log('  Tables excluded from RLS:');
    for (const table of report.tablesExcludedFromRls) {
      console.log(`    • ${table}`);
    }
    console.log('');
  }

  console.log('─'.repeat(70));
  console.log('  Status: ✅ Registry is properly defined');
  console.log('  Note: For full validation, run with DATABASE_URL set');
  console.log('─'.repeat(70));
  console.log('');

  return 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log('Starting RLS coverage check...');
  
  let exitCode: number;

  try {
    if (process.env.DATABASE_URL) {
      exitCode = await runWithDatabase();
    } else {
      exitCode = runOffline();
    }
  } catch (err) {
    error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    exitCode = 2;
  }

  if (exitCode === 0) {
    log('RLS coverage check completed successfully');
  } else if (exitCode === 1) {
    error('RLS coverage check FAILED - unclassified tables found');
  } else {
    error('RLS coverage check encountered an error');
  }

  process.exit(exitCode);
}

// Run
main().catch((err) => {
  error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
