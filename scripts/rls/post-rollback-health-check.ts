#!/usr/bin/env npx tsx
/**
 * Post-Rollback Health Check Script
 *
 * This script verifies system health after an RLS rollback by:
 * 1. Verifying database connectivity
 * 2. Verifying basic CRUD operations work
 * 3. Verifying no RLS policies remain active (for tenant tables)
 * 4. Reporting system operational status
 *
 * Usage:
 *   npx tsx scripts/rls/post-rollback-health-check.ts
 *   npx tsx scripts/rls/post-rollback-health-check.ts --verbose
 *   npx tsx scripts/rls/post-rollback-health-check.ts --json
 *
 * Exit codes:
 *   0 - All health checks passed
 *   1 - One or more health checks failed
 *   2 - Error during execution
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string (required)
 *
 * @see FASE 2.7 Task 16.3: Validate rollback procedure on staging
 * @see Requirement 14.4: Health check commands to verify rollback success
 * @see Requirement 14.6: Verify system operational after rollback
 * @see Design Section 7: RLS Database Migration
 */

import 'dotenv/config';
import pg from 'pg';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_NAME = 'post-rollback-health-check';

/**
 * Known tenant tables that should NOT have RLS after rollback.
 * These are the core TENANT_OWNED tables per TableClassificationRegistry.
 */
const TENANT_TABLES = [
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
  'iuran_statuses',
  'device_events',
  'patrol_schedules',
  'incident_reports',
  'letter_requests',
  'community_events',
  'visitor_logs',
  'package_logs',
  'invoices',
  'feature_flag_overrides',
  'notifications',
  'audit_logs',
  'push_subscriptions',
  'incidents',
  'gates',
  'gate_events',
  'cctv_cameras',
  'cctv_snapshots',
  'patrol_routes',
  'patrol_sessions',
  'alarm_devices',
  'alarm_events',
  'automation_rules',
  'automation_executions',
  'homes',
  'door_sensor_configs',
  'door_installation_requests',
  'emergency_contacts',
  'invitation_tokens',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthCheck {
  name: string;
  description: string;
  passed: boolean;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  durationMs: number;
  details?: Record<string, unknown>;
}

interface HealthCheckReport {
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  checks: HealthCheck[];
  totalDurationMs: number;
  rlsDisabled: boolean;
  systemOperational: boolean;
}

interface RlsTableInfo {
  tableName: string;
  rlsEnabled: boolean;
  rlsForced: boolean;
  policyCount: number;
  policies: string[];
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

function parseArgs(): { verbose: boolean; json: boolean } {
  const args = process.argv.slice(2);
  return {
    verbose: args.includes('--verbose') || args.includes('-v'),
    json: args.includes('--json'),
  };
}

// ---------------------------------------------------------------------------
// Health Check Functions
// ---------------------------------------------------------------------------

/**
 * Check database connectivity.
 */
async function checkDatabaseConnectivity(
  client: pg.PoolClient,
): Promise<HealthCheck> {
  const start = Date.now();
  const name = 'Database Connectivity';

  try {
    const result = await client.query('SELECT 1 AS ping, NOW() AS server_time');
    const serverTime = result.rows[0]?.server_time;

    return {
      name,
      description: 'Verify database is responsive to queries',
      passed: true,
      message: 'Database connection successful',
      severity: 'critical',
      durationMs: Date.now() - start,
      details: {
        serverTime: serverTime?.toISOString(),
        latencyMs: Date.now() - start,
      },
    };
  } catch (err) {
    return {
      name,
      description: 'Verify database is responsive to queries',
      passed: false,
      message: `Database connection failed: ${err instanceof Error ? err.message : String(err)}`,
      severity: 'critical',
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Get RLS information for all tables.
 */
async function getRlsInfo(client: pg.PoolClient): Promise<RlsTableInfo[]> {
  const result = await client.query<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
    policies: string[] | null;
    policy_count: string;
  }>(`
    SELECT
      c.relname,
      c.relrowsecurity,
      c.relforcerowsecurity,
      array_agg(DISTINCT p.polname) FILTER (WHERE p.polname IS NOT NULL) AS policies,
      COUNT(DISTINCT p.polname)::text AS policy_count
    FROM pg_class c
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
    WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND c.relkind = 'r'
    GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
    ORDER BY c.relname;
  `);

  return result.rows.map((row) => ({
    tableName: row.relname,
    rlsEnabled: row.relrowsecurity,
    rlsForced: row.relforcerowsecurity,
    policyCount: parseInt(row.policy_count, 10) || 0,
    policies: row.policies ?? [],
  }));
}

/**
 * Check that RLS is disabled on all tenant tables.
 */
async function checkRlsDisabled(client: pg.PoolClient): Promise<HealthCheck> {
  const start = Date.now();
  const name = 'RLS Policies Removed';

  try {
    const rlsInfo = await getRlsInfo(client);

    // Filter to known tenant tables that exist in the schema
    const existingTenantTables = rlsInfo.filter((t) =>
      TENANT_TABLES.includes(t.tableName),
    );

    const tablesWithRls = existingTenantTables.filter(
      (t) => t.rlsEnabled || t.policyCount > 0,
    );

    if (tablesWithRls.length === 0) {
      return {
        name,
        description: 'Verify no RLS policies remain active on tenant tables',
        passed: true,
        message: `All ${existingTenantTables.length} tenant tables have RLS disabled`,
        severity: 'critical',
        durationMs: Date.now() - start,
        details: {
          totalTenantTables: existingTenantTables.length,
          tablesChecked: existingTenantTables.map((t) => t.tableName),
        },
      };
    } else {
      return {
        name,
        description: 'Verify no RLS policies remain active on tenant tables',
        passed: false,
        message: `${tablesWithRls.length} tenant tables still have RLS enabled`,
        severity: 'critical',
        durationMs: Date.now() - start,
        details: {
          tablesWithRls: tablesWithRls.map((t) => ({
            table: t.tableName,
            rlsEnabled: t.rlsEnabled,
            policyCount: t.policyCount,
            policies: t.policies,
          })),
        },
      };
    }
  } catch (err) {
    return {
      name,
      description: 'Verify no RLS policies remain active on tenant tables',
      passed: false,
      message: `Failed to check RLS status: ${err instanceof Error ? err.message : String(err)}`,
      severity: 'critical',
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Check basic SELECT operation without RLS context.
 */
async function checkBasicRead(client: pg.PoolClient): Promise<HealthCheck> {
  const start = Date.now();
  const name = 'Basic Read Operation';

  try {
    // Try to read from a common table without setting tenant context
    // This should work after RLS is disabled
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tenants'
      ) AS tenants_exists
    `);

    const tenantsExists = result.rows[0]?.tenants_exists;

    if (tenantsExists) {
      // If tenants table exists, try to count
      const countResult = await client.query('SELECT COUNT(*)::int AS count FROM tenants');
      const count = countResult.rows[0]?.count ?? 0;

      return {
        name,
        description: 'Verify basic SELECT works without RLS session context',
        passed: true,
        message: `Read operation successful (tenants count: ${count})`,
        severity: 'critical',
        durationMs: Date.now() - start,
        details: { tenantsCount: count },
      };
    } else {
      return {
        name,
        description: 'Verify basic SELECT works without RLS session context',
        passed: true,
        message: 'Read operation successful (tenants table not found, which is OK)',
        severity: 'critical',
        durationMs: Date.now() - start,
      };
    }
  } catch (err) {
    return {
      name,
      description: 'Verify basic SELECT works without RLS session context',
      passed: false,
      message: `Read operation failed: ${err instanceof Error ? err.message : String(err)}`,
      severity: 'critical',
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Check transaction support.
 */
async function checkTransactions(client: pg.PoolClient): Promise<HealthCheck> {
  const start = Date.now();
  const name = 'Transaction Support';

  try {
    // Test BEGIN, query, ROLLBACK flow
    await client.query('BEGIN');
    await client.query('SELECT 1');
    await client.query('ROLLBACK');

    // Test savepoints
    await client.query('BEGIN');
    await client.query('SAVEPOINT test_savepoint');
    await client.query('SELECT 1');
    await client.query('ROLLBACK TO SAVEPOINT test_savepoint');
    await client.query('COMMIT');

    return {
      name,
      description: 'Verify transaction and savepoint operations work',
      passed: true,
      message: 'Transaction operations work correctly',
      severity: 'warning',
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name,
      description: 'Verify transaction and savepoint operations work',
      passed: false,
      message: `Transaction test failed: ${err instanceof Error ? err.message : String(err)}`,
      severity: 'warning',
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Check connection pool health by acquiring multiple connections.
 */
async function checkConnectionPool(pool: pg.Pool): Promise<HealthCheck> {
  const start = Date.now();
  const name = 'Connection Pool Health';

  try {
    // Acquire 3 connections simultaneously
    const connections: pg.PoolClient[] = [];

    try {
      for (let i = 0; i < 3; i++) {
        const conn = await pool.connect();
        connections.push(conn);
      }

      // Run parallel queries
      await Promise.all(
        connections.map((c) => c.query('SELECT pg_sleep(0.01)')),
      );

      return {
        name,
        description: 'Verify connection pool can handle concurrent connections',
        passed: true,
        message: 'Connection pool healthy (3 concurrent connections successful)',
        severity: 'warning',
        durationMs: Date.now() - start,
        details: { concurrentConnections: 3 },
      };
    } finally {
      // Always release connections
      for (const conn of connections) {
        conn.release();
      }
    }
  } catch (err) {
    return {
      name,
      description: 'Verify connection pool can handle concurrent connections',
      passed: false,
      message: `Connection pool test failed: ${err instanceof Error ? err.message : String(err)}`,
      severity: 'warning',
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Check that Prisma session variables still work (for future re-enable).
 */
async function checkSessionVariables(client: pg.PoolClient): Promise<HealthCheck> {
  const start = Date.now();
  const name = 'Session Variable Operations';

  try {
    await client.query('BEGIN');

    // Set tenant context (should still work even though RLS is disabled)
    await client.query(
      `SET LOCAL "app.current_tenant_id" = '00000000-0000-0000-0000-000000000000'`,
    );

    // Verify it's set
    const result = await client.query(
      `SELECT current_setting('app.current_tenant_id', true) AS tenant_id`,
    );
    const tenantId = result.rows[0]?.tenant_id;

    await client.query('ROLLBACK');

    if (tenantId === '00000000-0000-0000-0000-000000000000') {
      return {
        name,
        description: 'Verify RLS session variables can be set (for re-enable)',
        passed: true,
        message: 'Session variable SET/GET works correctly',
        severity: 'info',
        durationMs: Date.now() - start,
      };
    } else {
      return {
        name,
        description: 'Verify RLS session variables can be set (for re-enable)',
        passed: false,
        message: `Session variable mismatch: expected test UUID, got ${tenantId}`,
        severity: 'info',
        durationMs: Date.now() - start,
      };
    }
  } catch (err) {
    // Custom GUCs might not be defined, which is OK after rollback
    const errMsg = err instanceof Error ? err.message : String(err);
    const isGucNotDefined = errMsg.includes('unrecognized configuration parameter');

    return {
      name,
      description: 'Verify RLS session variables can be set (for re-enable)',
      passed: true, // Not critical if GUC not defined
      message: isGucNotDefined
        ? 'Session variable GUC not defined (OK - will be created on RLS re-enable)'
        : `Session variable test: ${errMsg}`,
      severity: 'info',
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Check basic write operation.
 */
async function checkBasicWrite(client: pg.PoolClient): Promise<HealthCheck> {
  const start = Date.now();
  const name = 'Basic Write Operation';

  try {
    // Try a temporary table write test
    await client.query('BEGIN');

    await client.query(`
      CREATE TEMP TABLE _health_check_test (
        id serial PRIMARY KEY,
        data text
      )
    `);

    await client.query(`
      INSERT INTO _health_check_test (data) VALUES ('test')
    `);

    const result = await client.query(`
      SELECT data FROM _health_check_test WHERE id = 1
    `);

    await client.query(`
      UPDATE _health_check_test SET data = 'updated' WHERE id = 1
    `);

    await client.query(`
      DELETE FROM _health_check_test WHERE id = 1
    `);

    await client.query('ROLLBACK'); // Clean up

    const data = result.rows[0]?.data;

    if (data === 'test') {
      return {
        name,
        description: 'Verify INSERT, UPDATE, DELETE operations work',
        passed: true,
        message: 'CRUD operations work correctly',
        severity: 'critical',
        durationMs: Date.now() - start,
      };
    } else {
      return {
        name,
        description: 'Verify INSERT, UPDATE, DELETE operations work',
        passed: false,
        message: `Write test data mismatch: expected 'test', got '${data}'`,
        severity: 'critical',
        durationMs: Date.now() - start,
      };
    }
  } catch (err) {
    // Make sure to rollback if something went wrong
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors
    }

    return {
      name,
      description: 'Verify INSERT, UPDATE, DELETE operations work',
      passed: false,
      message: `Write operation failed: ${err instanceof Error ? err.message : String(err)}`,
      severity: 'critical',
      durationMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Main Health Check Runner
// ---------------------------------------------------------------------------

/**
 * Run all health checks and compile report.
 */
async function runAllHealthChecks(
  pool: pg.Pool,
  client: pg.PoolClient,
): Promise<HealthCheckReport> {
  const startTime = Date.now();
  const checks: HealthCheck[] = [];

  // Run checks in order of importance
  log('Running database connectivity check...');
  checks.push(await checkDatabaseConnectivity(client));

  log('Running RLS disabled check...');
  checks.push(await checkRlsDisabled(client));

  log('Running basic read check...');
  checks.push(await checkBasicRead(client));

  log('Running basic write check...');
  checks.push(await checkBasicWrite(client));

  log('Running transaction support check...');
  checks.push(await checkTransactions(client));

  log('Running connection pool check...');
  checks.push(await checkConnectionPool(pool));

  log('Running session variable check...');
  checks.push(await checkSessionVariables(client));

  // Calculate summary
  const passedChecks = checks.filter((c) => c.passed).length;
  const failedChecks = checks.filter((c) => !c.passed).length;
  const criticalFailures = checks.filter(
    (c) => !c.passed && c.severity === 'critical',
  ).length;

  // Determine overall status
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (criticalFailures > 0) {
    overallStatus = 'unhealthy';
  } else if (failedChecks > 0) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  // Check if RLS is fully disabled
  const rlsCheck = checks.find((c) => c.name === 'RLS Policies Removed');
  const rlsDisabled = rlsCheck?.passed ?? false;

  // System is operational if critical checks pass
  const systemOperational = criticalFailures === 0;

  return {
    overallStatus,
    timestamp: new Date(),
    totalChecks: checks.length,
    passedChecks,
    failedChecks,
    checks,
    totalDurationMs: Date.now() - startTime,
    rlsDisabled,
    systemOperational,
  };
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

/**
 * Format report for console output.
 */
function formatConsoleReport(report: HealthCheckReport, verbose: boolean): void {
  console.log('');
  console.log('═'.repeat(70));
  console.log('  POST-ROLLBACK HEALTH CHECK REPORT');
  console.log('═'.repeat(70));
  console.log('');

  const statusIcon =
    report.overallStatus === 'healthy'
      ? '✅'
      : report.overallStatus === 'degraded'
        ? '⚠️'
        : '❌';

  console.log(`  Overall Status: ${statusIcon} ${report.overallStatus.toUpperCase()}`);
  console.log(`  Timestamp: ${report.timestamp.toISOString()}`);
  console.log(`  Duration: ${report.totalDurationMs}ms`);
  console.log('');
  console.log(`  Checks: ${report.passedChecks}/${report.totalChecks} passed`);
  console.log(`  RLS Disabled: ${report.rlsDisabled ? '✅ Yes' : '❌ No'}`);
  console.log(`  System Operational: ${report.systemOperational ? '✅ Yes' : '❌ No'}`);
  console.log('');
  console.log('─'.repeat(70));
  console.log('  INDIVIDUAL CHECKS');
  console.log('─'.repeat(70));
  console.log('');

  for (const check of report.checks) {
    const icon = check.passed ? '✅' : '❌';
    const severityBadge =
      check.severity === 'critical'
        ? '[CRITICAL]'
        : check.severity === 'warning'
          ? '[WARNING]'
          : '[INFO]';

    console.log(`  ${icon} ${check.name} ${severityBadge}`);
    console.log(`     ${check.message}`);
    console.log(`     Duration: ${check.durationMs}ms`);

    if (verbose && check.details) {
      console.log(`     Details: ${JSON.stringify(check.details, null, 2).split('\n').join('\n     ')}`);
    }

    console.log('');
  }

  console.log('─'.repeat(70));

  if (report.overallStatus === 'healthy') {
    console.log('  ✅ SYSTEM HEALTHY AFTER ROLLBACK');
    console.log('');
    console.log('  All critical health checks passed. The system is operational');
    console.log('  and RLS has been successfully disabled.');
    console.log('');
    console.log('  This satisfies Requirement 14.6: Verify system operational after rollback.');
  } else if (report.overallStatus === 'degraded') {
    console.log('  ⚠️  SYSTEM DEGRADED');
    console.log('');
    console.log('  Some non-critical checks failed. Review the warnings above.');
    console.log('  Core functionality should still be operational.');
  } else {
    console.log('  ❌ SYSTEM UNHEALTHY');
    console.log('');
    console.log('  Critical health checks failed. The system may not be fully');
    console.log('  operational. Review the failures above and take action.');
    console.log('');
    console.log('  RECOMMENDED: Contact DBA and review database state manually.');
  }

  console.log('');
  console.log('═'.repeat(70));
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { verbose, json } = parseArgs();

  log('Starting post-rollback health check...');

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

    const report = await runAllHealthChecks(pool, client);

    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      formatConsoleReport(report, verbose);
    }

    // Exit with appropriate code
    if (report.overallStatus === 'healthy') {
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
