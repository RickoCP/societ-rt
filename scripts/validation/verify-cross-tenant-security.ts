#!/usr/bin/env npx tsx
/**
 * Cross-Tenant Security Verification Script
 *
 * This script verifies that all cross-tenant security tests pass by:
 * 1. Running the cross-tenant security test suite from scripts/rls/
 * 2. Validating that RLS policies block unauthorized access
 * 3. Ensuring Tenant A cannot access Tenant B's data
 * 4. Verifying permission checks work correctly
 *
 * The script generates a security test summary and fails with exit code 1
 * if any security test fails.
 *
 * Usage:
 *   npx tsx scripts/validation/verify-cross-tenant-security.ts
 *   npx tsx scripts/validation/verify-cross-tenant-security.ts --verbose
 *   npx tsx scripts/validation/verify-cross-tenant-security.ts --json
 *   npx tsx scripts/validation/verify-cross-tenant-security.ts --output results.json
 *
 * Exit codes:
 *   0 - All cross-tenant security tests passed
 *   1 - One or more security tests failed (CRITICAL - cross-tenant access detected)
 *   2 - Error during execution
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string (required)
 *
 * @see FASE 2.16 Task 27.6: Verify cross-tenant tests passing
 * @see Requirement 16.7: Verify cross-tenant access tests all passing
 * @see Requirement 11: Cross-Tenant Access Prevention Testing
 */

import 'dotenv/config';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import pg from 'pg';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_NAME = 'verify-cross-tenant-security';
const CROSS_TENANT_TESTS_SCRIPT = 'scripts/rls/cross-tenant-security-tests.ts';
const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes for security tests

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SecurityTestResult {
  tableName: string;
  operation: 'READ' | 'INSERT' | 'UPDATE' | 'DELETE';
  passed: boolean;
  blocked: boolean;
  errorType?: 'EMPTY_RESULT' | 'CONSTRAINT_VIOLATION' | 'ZERO_ROWS_AFFECTED' | 'UNEXPECTED_SUCCESS';
  details: string;
  query?: string;
  resultSet?: unknown[];
  executionTimeMs: number;
}

interface SecurityTestSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  readTestsPassed: number;
  writeTestsPassed: number;
  deleteTestsPassed: number;
  complexQueryTestsPassed: number;
  tablesTestedCount: number;
  executionTimeMs: number;
}

interface SecurityVerificationReport {
  timestamp: Date;
  success: boolean;
  summary: SecurityTestSummary;
  failedTests: SecurityTestResult[];
  allTests: SecurityTestResult[];
  rlsStatus: RlsStatusSummary;
  messages: string[];
  errors: string[];
  tenantAId?: string;
  tenantBId?: string;
}

interface RlsStatusSummary {
  rlsEnabled: boolean;
  tablesWithRls: number;
  totalTenantTables: number;
  policiesFound: number;
}

interface CliOptions {
  verbose: boolean;
  json: boolean;
  output?: string;
  skipCleanup: boolean;
  help: boolean;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function log(message: string, options?: CliOptions): void {
  if (!options?.json) {
    console.log(`[${SCRIPT_NAME}] ${message}`);
  }
}

function logVerbose(message: string, options: CliOptions): void {
  if (options.verbose && !options.json) {
    console.log(`[${SCRIPT_NAME}] ${message}`);
  }
}

function logError(message: string, options?: CliOptions): void {
  if (!options?.json) {
    console.error(`[${SCRIPT_NAME}] ❌ ERROR: ${message}`);
  }
}

function logSuccess(message: string, options?: CliOptions): void {
  if (!options?.json) {
    console.log(`[${SCRIPT_NAME}] ✅ ${message}`);
  }
}

function logWarning(message: string, options?: CliOptions): void {
  if (!options?.json) {
    console.warn(`[${SCRIPT_NAME}] ⚠️  ${message}`);
  }
}

function parseArgs(): CliOptions {
  const args: CliOptions = {
    verbose: false,
    json: false,
    skipCleanup: false,
    help: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    switch (arg) {
      case '--verbose':
      case '-v':
        args.verbose = true;
        break;
      case '--json':
        args.json = true;
        break;
      case '--output':
      case '-o':
        args.output = process.argv[++i];
        break;
      case '--skip-cleanup':
        args.skipCleanup = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
${SCRIPT_NAME} - Verify cross-tenant security tests pass

Usage:
  npx tsx scripts/validation/${SCRIPT_NAME}.ts [options]

Options:
  --verbose, -v     Enable verbose output
  --json            Output results as JSON
  --output, -o      Output file for results (JSON format)
  --skip-cleanup    Skip test data cleanup (for debugging)
  --help, -h        Show this help message

Exit codes:
  0 - All cross-tenant security tests passed
  1 - One or more security tests failed (CRITICAL)
  2 - Error during execution

Environment:
  DATABASE_URL    PostgreSQL connection string (required)

Requirements validated:
  - Requirement 11.1: Tenant B user cannot read Tenant A's data
  - Requirement 11.2: Tenant B user cannot write to Tenant A's data
  - Requirement 11.3: Tenant B user cannot delete Tenant A's data
  - Requirement 11.4: All TENANT_OWNED tables covered
  - Requirement 11.5: Zero rows returned (not just filtered)
  - Requirement 11.7: Complex queries (joins, subqueries) also isolated
  - Requirement 16.7: Verify cross-tenant access tests all passing

Security Tests Include:
  - Cross-tenant READ tests (SELECT)
  - Cross-tenant INSERT tests
  - Cross-tenant UPDATE tests
  - Cross-tenant DELETE tests
  - JOIN query isolation tests
  - Subquery isolation tests
  - Aggregation query isolation tests
`);
}

// ---------------------------------------------------------------------------
// RLS Status Check
// ---------------------------------------------------------------------------

async function checkRlsStatus(options: CliOptions): Promise<RlsStatusSummary> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return {
      rlsEnabled: false,
      tablesWithRls: 0,
      totalTenantTables: 0,
      policiesFound: 0,
    };
  }

  const pool = new pg.Pool({ connectionString });
  let client: pg.PoolClient | null = null;

  try {
    client = await pool.connect();
    logVerbose('Connected to database for RLS status check', options);

    // Check RLS status on tables
    const rlsQuery = `
      SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS force_rls,
        COUNT(p.polname) AS policy_count
      FROM pg_class c
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND c.relkind = 'r'
        AND c.relname NOT IN ('_prisma_migrations', 'subscription_plans', 'feature_flags')
      GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
      ORDER BY c.relname;
    `;

    const result = await client.query<{
      table_name: string;
      rls_enabled: boolean;
      force_rls: boolean;
      policy_count: string;
    }>(rlsQuery);

    let tablesWithRls = 0;
    let totalPolicies = 0;
    let totalTables = 0;

    for (const row of result.rows) {
      // Skip non-tenant tables
      if (row.table_name === 'users') continue;

      totalTables++;
      if (row.rls_enabled && row.force_rls) {
        tablesWithRls++;
      }
      totalPolicies += parseInt(row.policy_count, 10);
    }

    return {
      rlsEnabled: tablesWithRls > 0,
      tablesWithRls,
      totalTenantTables: totalTables,
      policiesFound: totalPolicies,
    };
  } catch (error) {
    logWarning(`Could not check RLS status: ${error instanceof Error ? error.message : String(error)}`, options);
    return {
      rlsEnabled: false,
      tablesWithRls: 0,
      totalTenantTables: 0,
      policiesFound: 0,
    };
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Test Execution
// ---------------------------------------------------------------------------

interface TestExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCrossTenantSecurityTests(options: CliOptions): Promise<TestExecutionResult> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), CROSS_TENANT_TESTS_SCRIPT);

    // Check if the test script exists
    if (!fs.existsSync(scriptPath)) {
      resolve({
        success: false,
        stdout: '',
        stderr: `Cross-tenant security test script not found: ${scriptPath}`,
        exitCode: 2,
      });
      return;
    }

    logVerbose(`Running: npx tsx ${CROSS_TENANT_TESTS_SCRIPT}`, options);

    const env = {
      ...process.env,
      VERBOSE: options.verbose ? 'true' : 'false',
      SKIP_CLEANUP: options.skipCleanup ? 'true' : 'false',
    };

    const child: ChildProcess = spawn('npx', ['tsx', CROSS_TENANT_TESTS_SCRIPT], {
      cwd: process.cwd(),
      shell: true,
      env,
      timeout: DEFAULT_TIMEOUT_MS,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      if (options.verbose && !options.json) {
        process.stdout.write(text);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (options.verbose && !options.json) {
        process.stderr.write(text);
      }
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        stdout,
        stderr: `${stderr}\nProcess error: ${error.message}`,
        exitCode: 2,
      });
    });

    child.on('close', (exitCode) => {
      resolve({
        success: exitCode === 0,
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Result Parsing
// ---------------------------------------------------------------------------

function parseSecurityTestResults(stdout: string, exitCode: number): {
  tests: SecurityTestResult[];
  summary: SecurityTestSummary;
  tenantAId?: string;
  tenantBId?: string;
} {
  const tests: SecurityTestResult[] = [];
  const tablesTestedSet = new Set<string>();

  // Parse test results from stdout
  // Look for patterns like "✅ tablename READ blocked" or "❌ tablename READ FAILED"
  const passedRegex = /✅\s*(\w+)\s+(READ|INSERT|UPDATE|DELETE)\s+blocked/gi;
  const failedRegex = /❌\s*(\w+)\s+(READ|INSERT|UPDATE|DELETE)\s+(?:FAILED|SECURITY ISSUE)/gi;
  const detailRegex = /\[cross-tenant-security-tests\]\s+(.+)/gi;

  let match: RegExpExecArray | null;

  // Parse passed tests
  while ((match = passedRegex.exec(stdout)) !== null) {
    const tableName = match[1];
    const operation = match[2].toUpperCase() as SecurityTestResult['operation'];
    tablesTestedSet.add(tableName);
    tests.push({
      tableName,
      operation,
      passed: true,
      blocked: true,
      errorType: operation === 'READ' ? 'EMPTY_RESULT' : 'ZERO_ROWS_AFFECTED',
      details: `Cross-tenant ${operation} properly blocked`,
      executionTimeMs: 0,
    });
  }

  // Parse failed tests
  while ((match = failedRegex.exec(stdout)) !== null) {
    const tableName = match[1];
    const operation = match[2].toUpperCase() as SecurityTestResult['operation'];
    tablesTestedSet.add(tableName);
    tests.push({
      tableName,
      operation,
      passed: false,
      blocked: false,
      errorType: 'UNEXPECTED_SUCCESS',
      details: `SECURITY ISSUE: Cross-tenant ${operation} was NOT blocked`,
      executionTimeMs: 0,
    });
  }

  // Parse tenant IDs if available
  const tenantAMatch = stdout.match(/Tenant A ID:\s*([a-f0-9-]+)/i);
  const tenantBMatch = stdout.match(/Tenant B ID:\s*([a-f0-9-]+)/i);

  // Parse summary from stdout if available
  const totalMatch = stdout.match(/Total Tests:\s*(\d+)/i);
  const passedMatch = stdout.match(/Passed:\s*(\d+)/i);
  const failedMatch = stdout.match(/Failed:\s*(\d+)/i);
  const durationMatch = stdout.match(/Duration:\s*([\d.]+)(?:ms|s)/i);

  let totalTests = tests.length;
  let passedTests = tests.filter((t) => t.passed).length;
  let failedTests = tests.filter((t) => !t.passed).length;
  let executionTimeMs = 0;

  if (totalMatch) totalTests = parseInt(totalMatch[1], 10);
  if (passedMatch) passedTests = parseInt(passedMatch[1], 10);
  if (failedMatch) failedTests = parseInt(failedMatch[1], 10);
  if (durationMatch) {
    const duration = parseFloat(durationMatch[1]);
    executionTimeMs = durationMatch[0].includes('s') && !durationMatch[0].includes('ms')
      ? duration * 1000
      : duration;
  }

  // If we couldn't parse results from stdout but exit code indicates success
  if (tests.length === 0 && exitCode === 0) {
    // Check for summary indicators in stdout
    const allPassedMatch = stdout.match(/All.+tests?\s+pass(?:ed|ing)/i);
    if (allPassedMatch) {
      totalTests = 1;
      passedTests = 1;
      failedTests = 0;
    }
  }

  const summary: SecurityTestSummary = {
    totalTests: Math.max(totalTests, tests.length),
    passedTests,
    failedTests,
    readTestsPassed: tests.filter((t) => t.operation === 'READ' && t.passed).length,
    writeTestsPassed: tests.filter((t) => (t.operation === 'INSERT' || t.operation === 'UPDATE') && t.passed).length,
    deleteTestsPassed: tests.filter((t) => t.operation === 'DELETE' && t.passed).length,
    complexQueryTestsPassed: tests.filter((t) => t.tableName.includes('_join') && t.passed).length,
    tablesTestedCount: tablesTestedSet.size,
    executionTimeMs,
  };

  return {
    tests,
    summary,
    tenantAId: tenantAMatch?.[1],
    tenantBId: tenantBMatch?.[1],
  };
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

function generateVerificationReport(
  testResult: TestExecutionResult,
  rlsStatus: RlsStatusSummary,
  options: CliOptions,
): SecurityVerificationReport {
  const timestamp = new Date();
  const messages: string[] = [];
  const errors: string[] = [];

  // Parse test results
  const { tests, summary, tenantAId, tenantBId } = parseSecurityTestResults(
    testResult.stdout,
    testResult.exitCode,
  );

  const failedTests = tests.filter((t) => !t.passed);

  // Build messages
  messages.push(`Cross-tenant security test suite executed`);
  messages.push(`RLS Status: ${rlsStatus.tablesWithRls}/${rlsStatus.totalTenantTables} tables with RLS enabled`);
  messages.push(`Total Tests: ${summary.totalTests}`);
  messages.push(`Passed: ${summary.passedTests}, Failed: ${summary.failedTests}`);

  if (summary.tablesTestedCount > 0) {
    messages.push(`Tables Tested: ${summary.tablesTestedCount}`);
  }

  // Add error messages for failed tests
  for (const test of failedTests) {
    errors.push(`SECURITY ISSUE: ${test.tableName} ${test.operation} - ${test.details}`);
    if (test.query) {
      errors.push(`  Query: ${test.query}`);
    }
    if (test.resultSet && test.resultSet.length > 0) {
      errors.push(`  Result Set: ${JSON.stringify(test.resultSet).slice(0, 200)}...`);
    }
  }

  // Check stderr for additional errors
  if (testResult.stderr && testResult.stderr.trim()) {
    const stderrLines = testResult.stderr.split('\n').filter((l) => l.trim());
    for (const line of stderrLines.slice(0, 5)) {
      if (line.includes('ERROR') || line.includes('FAIL')) {
        errors.push(line.trim());
      }
    }
  }

  const success = testResult.success && failedTests.length === 0;

  if (success) {
    messages.push('✅ All cross-tenant security tests PASSED');
    messages.push('   Tenant A cannot access Tenant B\'s data');
    messages.push('   RLS policies properly block unauthorized access');
    messages.push('   Permission checks work correctly');
  } else {
    messages.push('❌ Cross-tenant security tests FAILED');
    messages.push('   CRITICAL: Cross-tenant access detected!');
  }

  return {
    timestamp,
    success,
    summary,
    failedTests,
    allTests: tests,
    rlsStatus,
    messages,
    errors,
    tenantAId,
    tenantBId,
  };
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

function formatReport(report: SecurityVerificationReport, options: CliOptions): void {
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('');
  console.log('═'.repeat(70));
  console.log('  CROSS-TENANT SECURITY VERIFICATION REPORT');
  console.log('═'.repeat(70));
  console.log('');

  // Messages
  for (const message of report.messages) {
    console.log(`  ${message}`);
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('  RLS STATUS');
  console.log('─'.repeat(70));
  console.log(`    RLS Enabled:     ${report.rlsStatus.rlsEnabled ? 'Yes' : 'NO'}`);
  console.log(`    Tables with RLS: ${report.rlsStatus.tablesWithRls}/${report.rlsStatus.totalTenantTables}`);
  console.log(`    Policies Found:  ${report.rlsStatus.policiesFound}`);

  console.log('');
  console.log('─'.repeat(70));
  console.log('  TEST SUMMARY');
  console.log('─'.repeat(70));
  console.log(`    Total Tests:      ${report.summary.totalTests}`);
  console.log(`    ✅ Passed:        ${report.summary.passedTests}`);
  console.log(`    ❌ Failed:        ${report.summary.failedTests}`);
  console.log(`    Tables Tested:    ${report.summary.tablesTestedCount}`);
  console.log(`    Execution Time:   ${report.summary.executionTimeMs.toFixed(0)}ms`);

  if (options.verbose) {
    console.log('');
    console.log('  TESTS BY OPERATION:');
    console.log(`    READ Tests:       ${report.summary.readTestsPassed} passed`);
    console.log(`    WRITE Tests:      ${report.summary.writeTestsPassed} passed`);
    console.log(`    DELETE Tests:     ${report.summary.deleteTestsPassed} passed`);
    console.log(`    Complex Queries:  ${report.summary.complexQueryTestsPassed} passed`);
  }

  // Failed tests details
  if (report.failedTests.length > 0) {
    console.log('');
    console.log('─'.repeat(70));
    console.log('  🚨 FAILED TESTS (SECURITY ISSUES)');
    console.log('─'.repeat(70));

    for (const test of report.failedTests) {
      console.log('');
      console.log(`    ❌ ${test.tableName} - ${test.operation}`);
      console.log(`       ${test.details}`);
      if (test.query) {
        console.log(`       Query: ${test.query.slice(0, 80)}${test.query.length > 80 ? '...' : ''}`);
      }
    }
  }

  // Errors
  if (report.errors.length > 0) {
    console.log('');
    console.log('─'.repeat(70));
    console.log('  ERRORS');
    console.log('─'.repeat(70));
    for (const err of report.errors) {
      console.log(`    ❌ ${err}`);
    }
  }

  // Overall status
  console.log('');
  console.log('═'.repeat(70));
  if (report.success) {
    console.log('  ✅ SECURITY VERIFICATION PASSED');
    console.log('     All cross-tenant access properly blocked');
  } else {
    console.log('  ❌ SECURITY VERIFICATION FAILED');
    console.log('     CRITICAL: Unauthorized cross-tenant access detected!');
    console.log('');
    console.log('  ACTION REQUIRED:');
    console.log('  1. Review RLS policies on affected tables');
    console.log('  2. Ensure app.current_tenant_id is properly set');
    console.log('  3. Verify RLS policies are enabled and enforced');
    console.log('  4. Re-run: npx tsx scripts/rls/cross-tenant-security-tests.ts');
  }
  console.log('═'.repeat(70));
  console.log('');

  // Tenant info
  if (report.tenantAId || report.tenantBId) {
    console.log('  Test Tenants:');
    if (report.tenantAId) console.log(`    Tenant A: ${report.tenantAId}`);
    if (report.tenantBId) console.log(`    Tenant B: ${report.tenantBId}`);
    console.log('');
  }

  console.log(`  Verified at: ${report.timestamp.toISOString()}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Main Execution
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    logError('DATABASE_URL environment variable is not set', options);
    logError('Set DATABASE_URL to connect to PostgreSQL', options);
    process.exit(2);
  }

  log('Starting cross-tenant security verification...', options);
  log('', options);

  try {
    // Step 1: Check RLS status
    log('Checking RLS status...', options);
    const rlsStatus = await checkRlsStatus(options);
    logVerbose(`RLS enabled on ${rlsStatus.tablesWithRls}/${rlsStatus.totalTenantTables} tables`, options);

    if (!rlsStatus.rlsEnabled) {
      logWarning('RLS may not be enabled on tenant tables!', options);
    }

    // Step 2: Run cross-tenant security tests
    log('Running cross-tenant security test suite...', options);
    const testResult = await runCrossTenantSecurityTests(options);

    // Step 3: Generate report
    log('Generating verification report...', options);
    const report = generateVerificationReport(testResult, rlsStatus, options);

    // Step 4: Output results
    formatReport(report, options);

    // Step 5: Write to output file if specified
    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
      log(`Results written to: ${options.output}`, options);
    }

    // Step 6: Exit with appropriate code
    if (report.success) {
      logSuccess('Cross-tenant security verification PASSED', options);
      process.exit(0);
    } else {
      logError('Cross-tenant security verification FAILED', options);
      logError('CRITICAL: Unauthorized cross-tenant access detected!', options);
      process.exit(1);
    }
  } catch (error) {
    logError(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`, options);

    if (options.json) {
      console.log(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        }),
      );
    }

    process.exit(2);
  }
}

// Run if executed directly
main().catch((err) => {
  console.error(`[${SCRIPT_NAME}] Fatal error:`, err instanceof Error ? err.message : String(err));
  process.exit(2);
});

export {
  runCrossTenantSecurityTests,
  parseSecurityTestResults,
  checkRlsStatus,
  generateVerificationReport,
  type SecurityTestResult,
  type SecurityTestSummary,
  type SecurityVerificationReport,
  type RlsStatusSummary,
};
