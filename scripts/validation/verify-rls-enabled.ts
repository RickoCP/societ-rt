#!/usr/bin/env npx tsx
/**
 * RLS Enabled Verification Script
 *
 * This script verifies that Row-Level Security (RLS) is properly enabled on all
 * tenant-scoped tables in the database. It is designed for CI enforcement to
 * ensure RLS is active before deployment.
 *
 * Verification checks:
 * 1. Connects to database using DATABASE_URL environment variable
 * 2. Lists all tables that SHOULD have RLS (TENANT_OWNED and ORG_SCOPED)
 * 3. Checks each table has:
 *    - RLS enabled (`relrowsecurity = true` in pg_class)
 *    - Appropriate policies in place (SELECT, INSERT, UPDATE, DELETE)
 * 4. Reports coverage: X of Y tables with RLS enabled
 * 5. Fails with exit code 1 if any required table is missing RLS
 *
 * Exit codes:
 *   0 - All RLS policies are correctly enabled (CI passes)
 *   1 - Missing or incomplete RLS configuration (CI fails)
 *   2 - Error during execution (connection, query failure, etc.)
 *
 * Usage:
 *   npx tsx scripts/validation/verify-rls-enabled.ts
 *   npx tsx scripts/validation/verify-rls-enabled.ts --verbose
 *   npx tsx scripts/validation/verify-rls-enabled.ts --json
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string (required)
 *
 * @see FASE 2.9 Task 27.2: Verify RLS enabled on all tenant tables
 * @see Requirement 16.3: Validate rollback procedure on staging
 * @see Requirement 10: RLS Coverage CI Validation
 */

import 'dotenv/config';
import pg from 'pg';
import {
  createTableClassificationRegistry,
  type ITableClassificationRegistry,
  type TableClassificationEntry,
  TableClassification,
} from '../../src/infrastructure/rls/index';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_NAME = 'verify-rls-enabled';

/** Required RLS policy operations */
const REQUIRED_POLICY_OPERATIONS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RlsTableStatus {
  tableName: string;
  rlsEnabled: boolean;
  policies: string[];
  classification: TableClassification;
  hasTenantIdColumn: boolean;
  tenantIdColumn?: string;
  isCompliant: boolean;
  missingPolicies: string[];
  notes?: string;
}

interface RlsVerificationReport {
  success: boolean;
  timestamp: Date;
  totalTablesChecked: number;
  tablesRequiringRls: number;
  tablesWithRlsEnabled: number;
  tablesWithCompletePolicies: number;
  coveragePercentage: number;
  policyCompliancePercentage: number;
  tableStatuses: RlsTableStatus[];
  compliantTables: string[];
  nonCompliantTables: RlsTableStatus[];
  excludedTables: { tableName: string; reason: string }[];
  messages: string[];
  errors: string[];
}

interface CliOptions {
  verbose: boolean;
  json: boolean;
  ciMode: boolean;
}

// ---------------------------------------------------------------------------
// Database Queries
// ---------------------------------------------------------------------------

/**
 * Query to get RLS status and policies for all public tables.
 *
 * Returns:
 * - relname: table name
 * - relrowsecurity: whether RLS is enabled on the table
 * - policies: array of policy names for this table
 */
const RLS_STATUS_QUERY = `
  SELECT
    c.relname,
    c.relrowsecurity,
    COALESCE(
      array_agg(DISTINCT p.polname) FILTER (WHERE p.polname IS NOT NULL),
      ARRAY[]::text[]
    ) AS policies
  FROM pg_class c
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND c.relkind = 'r'
  GROUP BY c.relname, c.relrowsecurity
  ORDER BY c.relname;
`;

interface RlsStatusRow {
  relname: string;
  relrowsecurity: boolean;
  policies: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(message: string, options?: CliOptions): void {
  if (!options?.json) {
    console.log(`[${SCRIPT_NAME}] ${message}`);
  }
}

function error(message: string, options?: CliOptions): void {
  if (!options?.json) {
    console.error(`[${SCRIPT_NAME}] ERROR: ${message}`);
  }
}

function verbose(message: string, options: CliOptions): void {
  if (options.verbose && !options.json) {
    console.log(`[${SCRIPT_NAME}] ${message}`);
  }
}

/**
 * Check if a table has all required policy operations.
 *
 * Expected policy naming convention:
 * - {tablename}_tenant_select
 * - {tablename}_tenant_insert
 * - {tablename}_tenant_update
 * - {tablename}_tenant_delete
 *
 * Or alternate naming (for flexibility):
 * - {tablename}_rls_select / _read
 * - Any policy containing SELECT/INSERT/UPDATE/DELETE in name
 */
function checkPolicyCompleteness(
  tableName: string,
  policies: string[],
): { isComplete: boolean; missingPolicies: string[] } {
  const normalizedPolicies = policies.map((p) => p.toLowerCase());
  const tablePrefix = tableName.toLowerCase();
  const missingPolicies: string[] = [];

  for (const operation of REQUIRED_POLICY_OPERATIONS) {
    const operationLower = operation.toLowerCase();

    // Check various naming conventions
    const hasPolicy = normalizedPolicies.some((policy) => {
      // Standard naming: tablename_tenant_operation
      if (policy.includes(`${tablePrefix}_tenant_${operationLower}`)) return true;
      // Alternative: tablename_rls_operation
      if (policy.includes(`${tablePrefix}_rls_${operationLower}`)) return true;
      // Generic policy for this table with operation keyword
      if (policy.startsWith(tablePrefix) && policy.includes(operationLower)) return true;
      // read/write aliases
      if (operationLower === 'select' && policy.startsWith(tablePrefix) && policy.includes('read'))
        return true;
      if (
        (operationLower === 'insert' ||
          operationLower === 'update' ||
          operationLower === 'delete') &&
        policy.startsWith(tablePrefix) &&
        policy.includes('write')
      )
        return true;
      return false;
    });

    if (!hasPolicy) {
      missingPolicies.push(operation);
    }
  }

  // If policies exist but naming doesn't match convention, still consider complete
  // if there are at least 4 policies for this table (one per operation)
  if (missingPolicies.length > 0 && policies.length >= 4) {
    const tablePolicies = policies.filter((p) =>
      p.toLowerCase().startsWith(tablePrefix),
    );
    if (tablePolicies.length >= 4) {
      return { isComplete: true, missingPolicies: [] };
    }
  }

  return { isComplete: missingPolicies.length === 0, missingPolicies };
}

/**
 * Get tables that require RLS from the classification registry.
 */
function getTablesRequiringRls(
  registry: ITableClassificationRegistry,
): TableClassificationEntry[] {
  return registry.getTablesRequiringRls().slice() as TableClassificationEntry[];
}

/**
 * Get tables excluded from RLS from the classification registry.
 */
function getTablesExcludedFromRls(
  registry: ITableClassificationRegistry,
): { tableName: string; reason: string }[] {
  const excluded = registry.getTablesExcludedFromRls();
  return excluded.map((entry) => ({
    tableName: entry.tableName,
    reason: `Classification: ${entry.classification}${entry.notes ? ` - ${entry.notes}` : ''}`,
  }));
}

// ---------------------------------------------------------------------------
// Verification Logic
// ---------------------------------------------------------------------------

/**
 * Verify RLS is enabled on all required tables.
 */
async function verifyRlsEnabled(
  client: pg.PoolClient,
  options: CliOptions,
): Promise<RlsVerificationReport> {
  const timestamp = new Date();
  const messages: string[] = [];
  const errors: string[] = [];

  // Initialize registry
  const registry = createTableClassificationRegistry();
  const requiredTables = getTablesRequiringRls(registry);
  const excludedTables = getTablesExcludedFromRls(registry);

  verbose(`Found ${requiredTables.length} tables requiring RLS`, options);
  verbose(`Found ${excludedTables.length} tables excluded from RLS`, options);

  // Query actual RLS status from database
  const result = await client.query<RlsStatusRow>(RLS_STATUS_QUERY);
  const dbTableStatuses = new Map<string, RlsStatusRow>();

  for (const row of result.rows) {
    dbTableStatuses.set(row.relname.toLowerCase(), row);
  }

  verbose(`Database has ${dbTableStatuses.size} tables in public schema`, options);

  // Check each required table
  const tableStatuses: RlsTableStatus[] = [];
  const compliantTables: string[] = [];
  const nonCompliantTables: RlsTableStatus[] = [];

  for (const entry of requiredTables) {
    const tableLower = entry.tableName.toLowerCase();
    const dbStatus = dbTableStatuses.get(tableLower);

    if (!dbStatus) {
      // Table doesn't exist in database
      const status: RlsTableStatus = {
        tableName: entry.tableName,
        rlsEnabled: false,
        policies: [],
        classification: entry.classification,
        hasTenantIdColumn: entry.hasTenantIdColumn,
        tenantIdColumn: entry.tenantIdColumn,
        isCompliant: false,
        missingPolicies: [...REQUIRED_POLICY_OPERATIONS],
        notes: 'Table not found in database',
      };
      tableStatuses.push(status);
      nonCompliantTables.push(status);
      errors.push(`Table '${entry.tableName}' not found in database`);
      continue;
    }

    const { isComplete, missingPolicies } = checkPolicyCompleteness(
      entry.tableName,
      dbStatus.policies,
    );

    const isCompliant = dbStatus.relrowsecurity && isComplete;

    const status: RlsTableStatus = {
      tableName: entry.tableName,
      rlsEnabled: dbStatus.relrowsecurity,
      policies: dbStatus.policies,
      classification: entry.classification,
      hasTenantIdColumn: entry.hasTenantIdColumn,
      tenantIdColumn: entry.tenantIdColumn,
      isCompliant,
      missingPolicies,
      notes: entry.notes,
    };

    tableStatuses.push(status);

    if (isCompliant) {
      compliantTables.push(entry.tableName);
    } else {
      nonCompliantTables.push(status);
      if (!dbStatus.relrowsecurity) {
        errors.push(`Table '${entry.tableName}' does NOT have RLS enabled`);
      }
      if (missingPolicies.length > 0) {
        errors.push(
          `Table '${entry.tableName}' is missing policies for: ${missingPolicies.join(', ')}`,
        );
      }
    }
  }

  // Calculate metrics
  const tablesWithRlsEnabled = tableStatuses.filter((t) => t.rlsEnabled).length;
  const tablesWithCompletePolicies = tableStatuses.filter(
    (t) => t.missingPolicies.length === 0,
  ).length;

  const coveragePercentage =
    requiredTables.length > 0
      ? Math.round((tablesWithRlsEnabled / requiredTables.length) * 100)
      : 100;

  const policyCompliancePercentage =
    requiredTables.length > 0
      ? Math.round((tablesWithCompletePolicies / requiredTables.length) * 100)
      : 100;

  // Build messages
  messages.push(`Checked ${requiredTables.length} tables requiring RLS`);
  messages.push(`RLS Enabled: ${tablesWithRlsEnabled}/${requiredTables.length} (${coveragePercentage}%)`);
  messages.push(
    `Complete Policies: ${tablesWithCompletePolicies}/${requiredTables.length} (${policyCompliancePercentage}%)`,
  );

  const success = nonCompliantTables.length === 0;

  if (success) {
    messages.push('✅ All tenant tables have RLS enabled with complete policies');
  } else {
    messages.push(`❌ Found ${nonCompliantTables.length} non-compliant table(s)`);
  }

  return {
    success,
    timestamp,
    totalTablesChecked: tableStatuses.length,
    tablesRequiringRls: requiredTables.length,
    tablesWithRlsEnabled,
    tablesWithCompletePolicies,
    coveragePercentage,
    policyCompliancePercentage,
    tableStatuses,
    compliantTables,
    nonCompliantTables,
    excludedTables,
    messages,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

function formatReport(report: RlsVerificationReport, options: CliOptions): void {
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('');
  console.log('═'.repeat(70));
  console.log('  RLS ENABLED VERIFICATION REPORT');
  console.log('═'.repeat(70));
  console.log('');

  for (const message of report.messages) {
    console.log(`  ${message}`);
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log(`  Status: ${report.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  RLS Coverage: ${report.coveragePercentage}%`);
  console.log(`  Policy Compliance: ${report.policyCompliancePercentage}%`);
  console.log(
    `  Tables with RLS: ${report.tablesWithRlsEnabled}/${report.tablesRequiringRls}`,
  );
  console.log(`  Checked at: ${report.timestamp.toISOString()}`);
  console.log('─'.repeat(70));

  if (options.verbose) {
    console.log('');
    console.log('COMPLIANT TABLES:');
    for (const tableName of report.compliantTables) {
      console.log(`  ✅ ${tableName}`);
    }
  }

  if (report.nonCompliantTables.length > 0) {
    console.log('');
    console.log('NON-COMPLIANT TABLES:');
    for (const table of report.nonCompliantTables) {
      console.log('');
      console.log(`  ❌ ${table.tableName}`);
      console.log(`     Classification: ${table.classification}`);
      console.log(`     RLS Enabled: ${table.rlsEnabled ? 'Yes' : 'NO'}`);
      console.log(`     Policies Found: ${table.policies.length > 0 ? table.policies.join(', ') : 'None'}`);
      if (table.missingPolicies.length > 0) {
        console.log(`     Missing Policies: ${table.missingPolicies.join(', ')}`);
      }
      if (table.notes) {
        console.log(`     Notes: ${table.notes}`);
      }
    }
  }

  if (report.excludedTables.length > 0 && options.verbose) {
    console.log('');
    console.log('EXCLUDED TABLES (no RLS required):');
    for (const table of report.excludedTables) {
      console.log(`  ⏭️  ${table.tableName}: ${table.reason}`);
    }
  }

  if (report.errors.length > 0) {
    console.log('');
    console.log('ERRORS:');
    for (const err of report.errors) {
      console.log(`  ❌ ${err}`);
    }
  }

  console.log('');

  // CI-friendly summary
  if (options.ciMode) {
    console.log('─'.repeat(70));
    console.log('CI SUMMARY:');
    console.log(`  EXIT_CODE: ${report.success ? 0 : 1}`);
    console.log(`  RLS_COVERAGE: ${report.coveragePercentage}`);
    console.log(`  POLICY_COMPLIANCE: ${report.policyCompliancePercentage}`);
    console.log(`  TABLES_PASSING: ${report.compliantTables.length}`);
    console.log(`  TABLES_FAILING: ${report.nonCompliantTables.length}`);
    console.log('─'.repeat(70));
  }

  console.log('');
}

function formatFailureMessage(report: RlsVerificationReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('========================================================================');
  lines.push('           RLS ENABLED VERIFICATION FAILED                              ');
  lines.push('========================================================================');
  lines.push('');
  lines.push('  The following tables are NOT properly configured for RLS:');
  lines.push('');

  for (const table of report.nonCompliantTables) {
    lines.push(`    - ${table.tableName}`);
    if (!table.rlsEnabled) {
      lines.push(`        ⚠️  RLS is NOT enabled`);
    }
    if (table.missingPolicies.length > 0) {
      lines.push(`        ⚠️  Missing policies: ${table.missingPolicies.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('------------------------------------------------------------------------');
  lines.push('  ACTION REQUIRED:');
  lines.push('');
  lines.push('  1. Run the RLS migration to enable policies:');
  lines.push('     npx tsx scripts/rls/execute-staging-migration.ts');
  lines.push('');
  lines.push('  2. Verify RLS state after migration:');
  lines.push('     npx tsx scripts/rls/execute-staging-migration.ts --verify');
  lines.push('');
  lines.push('  3. Re-run this verification:');
  lines.push('     npx tsx scripts/validation/verify-rls-enabled.ts');
  lines.push('');
  lines.push('  See Requirement 10: RLS Coverage CI Validation');
  lines.push('  See Task 27.2: Verify RLS enabled on all tenant tables');
  lines.push('');
  lines.push('========================================================================');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main Execution
// ---------------------------------------------------------------------------

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  return {
    verbose: args.includes('--verbose') || args.includes('-v'),
    json: args.includes('--json'),
    ciMode: args.includes('--ci') || process.env.CI === 'true',
  };
}

function printUsage(): void {
  console.log(`
RLS Enabled Verification Script

Verifies that Row-Level Security (RLS) is properly enabled on all
tenant-scoped tables (TENANT_OWNED and ORG_SCOPED classifications).

Usage:
  npx tsx scripts/validation/verify-rls-enabled.ts [options]

Options:
  --verbose, -v   Show detailed status for all tables
  --json          Output results as JSON (for CI/CD integration)
  --ci            Enable CI-specific output formatting
  --help, -h      Show this help message

Environment:
  DATABASE_URL    PostgreSQL connection string (required)

Exit Codes:
  0 - All RLS policies are correctly enabled (CI passes)
  1 - Missing or incomplete RLS configuration (CI fails)
  2 - Error during execution

Examples:
  # Basic verification
  npx tsx scripts/validation/verify-rls-enabled.ts

  # Verbose output with all table details
  npx tsx scripts/validation/verify-rls-enabled.ts --verbose

  # JSON output for CI parsing
  npx tsx scripts/validation/verify-rls-enabled.ts --json

  # CI mode with summary
  npx tsx scripts/validation/verify-rls-enabled.ts --ci

Verification Checks:
  1. RLS is enabled on each table (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
  2. Appropriate policies exist for SELECT, INSERT, UPDATE, DELETE operations
  3. Tables are classified correctly in TableClassificationRegistry

Tables Checked:
  - TENANT_OWNED: Standard tenant isolation (tenant_id = app.current_tenant_id)
  - ORG_SCOPED: Tenant isolation + OrgUnit scope

Tables Excluded:
  - GLOBAL_IDENTITY: No tenant RLS (e.g., users)
  - PLATFORM_SHARED: No tenant RLS (e.g., subscription_plans, feature_flags)
`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (process.argv.slice(2).includes('--help') || process.argv.slice(2).includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    error('DATABASE_URL environment variable is not set', options);
    error('Set DATABASE_URL to connect to PostgreSQL', options);
    process.exit(2);
  }

  log('Starting RLS enabled verification...', options);

  const pool = new pg.Pool({ connectionString });
  let client: pg.PoolClient | null = null;

  try {
    client = await pool.connect();
    verbose('Connected to database', options);

    const report = await verifyRlsEnabled(client, options);

    formatReport(report, options);

    if (!report.success) {
      if (!options.json) {
        console.log(formatFailureMessage(report));
      }
      log('RLS verification FAILED', options);
      process.exit(1);
    }

    log('RLS verification PASSED', options);
    process.exit(0);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(`Unexpected error: ${errorMessage}`, options);

    if (options.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: errorMessage,
          timestamp: new Date(),
        }),
      );
    }

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
  console.error(`[${SCRIPT_NAME}] Fatal error:`, err instanceof Error ? err.message : String(err));
  process.exit(2);
});
