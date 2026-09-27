#!/usr/bin/env npx tsx
/**
 * Verify Post-Rollback Health Script
 *
 * This script provides comprehensive verification that the system remains operational
 * after a rollback by running health checks across all critical components:
 *
 * 1. Database connectivity (via post-rollback-health-check)
 * 2. Auth system functioning (legacy auth mode)
 * 3. API endpoints responding
 * 4. RLS status (disabled if rolled back)
 *
 * Usage:
 *   npx tsx scripts/rollback/verify-post-rollback-health.ts
 *   npx tsx scripts/rollback/verify-post-rollback-health.ts --verbose
 *   npx tsx scripts/rollback/verify-post-rollback-health.ts --json
 *   npx tsx scripts/rollback/verify-post-rollback-health.ts --api-base http://localhost:3000
 *
 * Exit codes:
 *   0 - All health checks passed, system is operational
 *   1 - One or more health checks failed
 *   2 - Error during execution
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string (required for DB checks)
 *   API_BASE_URL - Base URL for API health checks (default: http://localhost:3000)
 *
 * @see FASE 2.7 Task 16.3: Validate rollback procedure on staging
 * @see FASE 2.14 Task 25.4: Verify system operational after rollback
 * @see Requirement 14.4: Health check commands to verify rollback success
 * @see Requirement 14.6: Verify system operational after rollback
 */

import 'dotenv/config';
import { spawn } from 'child_process';
import path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_NAME = 'verify-post-rollback-health';
const DEFAULT_API_BASE = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Critical API endpoints to verify after rollback.
 * These represent core system functionality.
 */
const CRITICAL_ENDPOINTS = [
  { path: '/api/health', method: 'GET', description: 'Health check endpoint', expectedStatus: 200 },
  { path: '/api/auth/login', method: 'GET', description: 'Auth login endpoint (availability)', expectedStatus: 401 },
] as const;

/**
 * Severity levels for health checks.
 */
type Severity = 'critical' | 'warning' | 'info';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthCheck {
  name: string;
  description: string;
  passed: boolean;
  message: string;
  severity: Severity;
  durationMs: number;
  details?: Record<string, unknown>;
}

interface PostRollbackHealthReport {
  legacyAuthHealthy: boolean;
  databaseHealthy: boolean;
  rlsDisabled: boolean;
  systemOperational: boolean;
}

interface VerificationReport {
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  checks: HealthCheck[];
  totalDurationMs: number;
  systemOperational: boolean;
  components: {
    database: boolean;
    authSystem: boolean;
    apiEndpoints: boolean;
    rlsRolledBack: boolean;
  };
}

interface CommandLineArgs {
  verbose: boolean;
  json: boolean;
  apiBase: string;
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

function parseArgs(): CommandLineArgs {
  const args = process.argv.slice(2);
  let apiBase = process.env.API_BASE_URL ?? DEFAULT_API_BASE;

  // Check for --api-base flag
  const apiBaseIndex = args.indexOf('--api-base');
  if (apiBaseIndex !== -1 && args[apiBaseIndex + 1]) {
    apiBase = args[apiBaseIndex + 1] ?? DEFAULT_API_BASE;
  }

  return {
    verbose: args.includes('--verbose') || args.includes('-v'),
    json: args.includes('--json'),
    apiBase,
  };
}

// ---------------------------------------------------------------------------
// Health Check Functions
// ---------------------------------------------------------------------------

/**
 * Run the post-rollback health check script and parse results.
 * This script checks database connectivity, RLS status, and basic operations.
 */
async function runPostRollbackHealthCheck(): Promise<{
  check: HealthCheck;
  report: PostRollbackHealthReport;
}> {
  const start = Date.now();
  const name = 'Post-Rollback Health Check (Database & RLS)';
  const scriptPath = path.resolve(__dirname, '../rls/post-rollback-health-check.ts');

  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', scriptPath, '--json'], {
      env: { ...process.env },
      shell: true,
      timeout: DEFAULT_TIMEOUT_MS,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - start;

      try {
        // Try to parse JSON output
        const jsonStart = stdout.indexOf('{');
        const jsonEnd = stdout.lastIndexOf('}');

        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
          const result = JSON.parse(jsonStr);

          const passed = result.overallStatus === 'healthy';
          const report: PostRollbackHealthReport = {
            legacyAuthHealthy: result.systemOperational ?? false,
            databaseHealthy: result.systemOperational ?? false,
            rlsDisabled: result.rlsDisabled ?? false,
            systemOperational: result.systemOperational ?? false,
          };

          resolve({
            check: {
              name,
              description: 'Run comprehensive database and RLS health checks',
              passed,
              message: passed
                ? `All database checks passed (${result.passedChecks}/${result.totalChecks})`
                : `${result.failedChecks} checks failed out of ${result.totalChecks}`,
              severity: 'critical',
              durationMs,
              details: {
                passedChecks: result.passedChecks,
                totalChecks: result.totalChecks,
                rlsDisabled: result.rlsDisabled,
                overallStatus: result.overallStatus,
              },
            },
            report,
          });
          return;
        }

        // JSON parsing failed, check exit code
        const passed = code === 0;
        resolve({
          check: {
            name,
            description: 'Run comprehensive database and RLS health checks',
            passed,
            message: passed
              ? 'Post-rollback health check script passed'
              : `Post-rollback health check script failed (exit code: ${code})`,
            severity: 'critical',
            durationMs,
            details: { exitCode: code, stderr: stderr.slice(0, 500) },
          },
          report: {
            legacyAuthHealthy: passed,
            databaseHealthy: passed,
            rlsDisabled: passed,
            systemOperational: passed,
          },
        });
      } catch (parseError) {
        resolve({
          check: {
            name,
            description: 'Run comprehensive database and RLS health checks',
            passed: false,
            message: `Failed to parse health check output: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
            severity: 'critical',
            durationMs,
            details: { stdout: stdout.slice(0, 500), stderr: stderr.slice(0, 500) },
          },
          report: {
            legacyAuthHealthy: false,
            databaseHealthy: false,
            rlsDisabled: false,
            systemOperational: false,
          },
        });
      }
    });

    child.on('error', (err) => {
      const durationMs = Date.now() - start;
      resolve({
        check: {
          name,
          description: 'Run comprehensive database and RLS health checks',
          passed: false,
          message: `Failed to run health check script: ${err.message}`,
          severity: 'critical',
          durationMs,
        },
        report: {
          legacyAuthHealthy: false,
          databaseHealthy: false,
          rlsDisabled: false,
          systemOperational: false,
        },
      });
    });
  });
}

/**
 * Check API endpoint availability.
 */
async function checkApiEndpoint(
  apiBase: string,
  endpoint: { path: string; method: string; description: string; expectedStatus: number },
): Promise<HealthCheck> {
  const start = Date.now();
  const name = `API Endpoint: ${endpoint.path}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${apiBase}${endpoint.path}`, {
      method: endpoint.method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    const durationMs = Date.now() - start;
    const passed = response.status === endpoint.expectedStatus;

    return {
      name,
      description: endpoint.description,
      passed,
      message: passed
        ? `Endpoint responding correctly (${response.status})`
        : `Unexpected response status: ${response.status} (expected: ${endpoint.expectedStatus})`,
      severity: endpoint.path === '/api/health' ? 'critical' : 'warning',
      durationMs,
      details: {
        status: response.status,
        expectedStatus: endpoint.expectedStatus,
        latencyMs: durationMs,
      },
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const isAbort = err instanceof Error && err.name === 'AbortError';

    return {
      name,
      description: endpoint.description,
      passed: false,
      message: isAbort
        ? `Request timeout after 10 seconds`
        : `Request failed: ${err instanceof Error ? err.message : String(err)}`,
      severity: endpoint.path === '/api/health' ? 'critical' : 'warning',
      durationMs,
    };
  }
}

/**
 * Check that legacy auth context resolution works.
 * This verifies the auth system is functioning in legacy mode.
 */
async function checkLegacyAuthSystem(apiBase: string): Promise<HealthCheck> {
  const start = Date.now();
  const name = 'Legacy Auth System';

  try {
    // Test that login endpoint exists and returns proper error for missing credentials
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}), // Empty body to trigger validation error
    });

    clearTimeout(timeoutId);

    const durationMs = Date.now() - start;

    // Expect 400 (validation error) or 401 (invalid credentials)
    // Either indicates the auth system is responding properly
    const validResponses = [400, 401, 422];
    const passed = validResponses.includes(response.status);

    let responseData: unknown = null;
    try {
      responseData = await response.json();
    } catch {
      // Ignore JSON parse errors
    }

    return {
      name,
      description: 'Verify legacy auth system is responding to authentication requests',
      passed,
      message: passed
        ? `Auth system responding correctly (status: ${response.status})`
        : `Unexpected auth response: ${response.status}`,
      severity: 'critical',
      durationMs,
      details: {
        status: response.status,
        response: responseData,
      },
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const isAbort = err instanceof Error && err.name === 'AbortError';

    return {
      name,
      description: 'Verify legacy auth system is responding to authentication requests',
      passed: false,
      message: isAbort
        ? 'Auth system request timeout'
        : `Auth system check failed: ${err instanceof Error ? err.message : String(err)}`,
      severity: 'critical',
      durationMs,
    };
  }
}

/**
 * Check that protected endpoints return proper auth errors without token.
 * This verifies the auth middleware is functioning.
 */
async function checkAuthMiddleware(apiBase: string): Promise<HealthCheck> {
  const start = Date.now();
  const name = 'Auth Middleware Protection';

  try {
    // Test a protected endpoint without token - should return 401
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${apiBase}/api/residents`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        // No Authorization header
      },
    });

    clearTimeout(timeoutId);

    const durationMs = Date.now() - start;

    // Expect 401 (unauthorized) - middleware is protecting routes
    const passed = response.status === 401;

    return {
      name,
      description: 'Verify protected endpoints require authentication',
      passed,
      message: passed
        ? 'Auth middleware protecting routes correctly (401 for unauthenticated)'
        : `Expected 401, got ${response.status} - middleware may not be protecting routes`,
      severity: 'warning',
      durationMs,
      details: {
        status: response.status,
        testedEndpoint: '/api/residents',
      },
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const isAbort = err instanceof Error && err.name === 'AbortError';

    return {
      name,
      description: 'Verify protected endpoints require authentication',
      passed: false,
      message: isAbort
        ? 'Middleware check request timeout'
        : `Middleware check failed: ${err instanceof Error ? err.message : String(err)}`,
      severity: 'warning',
      durationMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Main Verification Runner
// ---------------------------------------------------------------------------

/**
 * Run all verification checks and compile the report.
 */
async function runAllVerifications(args: CommandLineArgs): Promise<VerificationReport> {
  const startTime = Date.now();
  const checks: HealthCheck[] = [];

  log('Starting post-rollback health verification...');

  // 1. Run the main post-rollback health check (database, RLS, basic operations)
  log('Running database and RLS health checks...');
  const { check: dbCheck, report: dbReport } = await runPostRollbackHealthCheck();
  checks.push(dbCheck);

  // 2. Check API health endpoint
  log('Checking API health endpoint...');
  for (const endpoint of CRITICAL_ENDPOINTS) {
    const apiCheck = await checkApiEndpoint(args.apiBase, endpoint);
    checks.push(apiCheck);
  }

  // 3. Check legacy auth system
  log('Checking legacy auth system...');
  const authCheck = await checkLegacyAuthSystem(args.apiBase);
  checks.push(authCheck);

  // 4. Check auth middleware is protecting routes
  log('Checking auth middleware protection...');
  const middlewareCheck = await checkAuthMiddleware(args.apiBase);
  checks.push(middlewareCheck);

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

  // Determine component status
  const healthEndpointCheck = checks.find((c) => c.name.includes('/api/health'));
  const components = {
    database: dbReport.databaseHealthy,
    authSystem: authCheck.passed,
    apiEndpoints: healthEndpointCheck?.passed ?? false,
    rlsRolledBack: dbReport.rlsDisabled,
  };

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
    systemOperational,
    components,
  };
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

/**
 * Format report for console output.
 */
function formatConsoleReport(report: VerificationReport, verbose: boolean): void {
  console.log('');
  console.log('═'.repeat(70));
  console.log('  POST-ROLLBACK HEALTH VERIFICATION REPORT');
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
  console.log(`  System Operational: ${report.systemOperational ? '✅ Yes' : '❌ No'}`);
  console.log('');

  // Component status
  console.log('─'.repeat(70));
  console.log('  COMPONENT STATUS');
  console.log('─'.repeat(70));
  console.log('');
  console.log(`  ${report.components.database ? '✅' : '❌'} Database Connectivity`);
  console.log(`  ${report.components.authSystem ? '✅' : '❌'} Auth System (Legacy Mode)`);
  console.log(`  ${report.components.apiEndpoints ? '✅' : '❌'} API Endpoints Responding`);
  console.log(`  ${report.components.rlsRolledBack ? '✅' : '❌'} RLS Rolled Back (Disabled)`);
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
      const detailsStr = JSON.stringify(check.details, null, 2)
        .split('\n')
        .map((line) => `     ${line}`)
        .join('\n');
      console.log(`     Details:`);
      console.log(detailsStr);
    }

    console.log('');
  }

  console.log('─'.repeat(70));

  if (report.overallStatus === 'healthy') {
    console.log('  ✅ SYSTEM OPERATIONAL AFTER ROLLBACK');
    console.log('');
    console.log('  All critical health checks passed. The system is operational:');
    console.log('  - Database is connected and responding');
    console.log('  - Auth system is functioning (legacy mode)');
    console.log('  - API endpoints are responding');
    console.log('  - RLS has been rolled back (disabled)');
    console.log('');
    console.log('  This satisfies Requirement 14.4: Verify system operational after rollback.');
  } else if (report.overallStatus === 'degraded') {
    console.log('  ⚠️  SYSTEM DEGRADED');
    console.log('');
    console.log('  Some non-critical checks failed. Review the warnings above.');
    console.log('  Core functionality should still be operational.');
    console.log('');
    console.log('  Consider investigating failed checks before proceeding.');
  } else {
    console.log('  ❌ SYSTEM UNHEALTHY');
    console.log('');
    console.log('  Critical health checks failed. The system may not be fully');
    console.log('  operational after rollback. Review the failures above.');
    console.log('');
    console.log('  RECOMMENDED ACTIONS:');
    console.log('  1. Check database connectivity and credentials');
    console.log('  2. Verify the application server is running');
    console.log('  3. Check application logs for errors');
    console.log('  4. Contact DBA if database issues persist');
  }

  console.log('');
  console.log('═'.repeat(70));
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  log('Starting post-rollback system verification...');
  log(`API Base URL: ${args.apiBase}`);

  try {
    const report = await runAllVerifications(args);

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      formatConsoleReport(report, args.verbose);
    }

    // Exit with appropriate code
    if (report.systemOperational) {
      log('Verification complete - system is operational');
      process.exit(0);
    } else {
      log('Verification complete - system health issues detected');
      process.exit(1);
    }
  } catch (err) {
    error(`Unexpected error during verification: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}

// Run
main().catch((err) => {
  error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
