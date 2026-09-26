/**
 * Performance Verification Script
 *
 * Reads benchmark results from existing benchmark scripts and validates against
 * performance requirements (Requirement 16.5).
 *
 * Performance Targets (from Requirements 12):
 * - AuthorizationContext resolution: p50 < 30ms, p95 < 70ms, p99 < 100ms
 * - Permission check (getMissingPermissions): p99 < 10ms
 * - Overall authorization overhead: < 50ms p99 (middleware resolution + serialization)
 * - RLS query overhead: < 20% latency increase
 *
 * Exit Codes:
 * - 0: All benchmarks passed
 * - 1: One or more benchmarks failed
 * - 2: Error reading benchmark results or configuration issue
 *
 * Usage:
 *   npx tsx scripts/validation/verify-performance.ts [options]
 *
 * Options:
 *   --results <path>     Path to benchmark results JSON (default: benchmark-results.json)
 *   --verbose            Enable verbose output
 *   --json               Output results as JSON
 *   --help               Show this help message
 *
 * @see FASE 2.16 Task 27.4: Verify performance benchmarks met
 * @see Requirement 16.5: THE Completion_Validation SHALL verify all performance benchmarks meeting targets
 * @see Requirement 12: Authorization Performance Benchmarks
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Performance threshold configuration
 */
interface PerformanceThresholds {
  authContextResolution: {
    p50: number;
    p95: number;
    p99: number;
  };
  permissionCheck: {
    p99: number;
  };
  overallAuthorizationOverhead: {
    p99: number;
  };
  rlsOverhead: {
    maxPercentage: number;
  };
}

/**
 * Latency statistics from benchmark results
 */
interface LatencyStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  standardDeviation: number;
  samples: number;
}

/**
 * Individual benchmark result
 */
interface BenchmarkResult {
  name: string;
  description: string;
  passed: boolean;
  actualValue: number;
  thresholdValue: number;
  thresholdTarget: string;
  percentageOfTarget: number;
  latencyStats: LatencyStats;
  additionalMetrics?: Record<string, number>;
}

/**
 * Environment information from benchmark
 */
interface EnvironmentInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  memory: number;
  cpus: number;
}

/**
 * Full benchmark suite result (from performance-benchmarks.ts)
 */
interface BenchmarkSuiteResult {
  passed: boolean;
  totalBenchmarks: number;
  passedBenchmarks: number;
  failedBenchmarks: number;
  durationMs: number;
  executedAt: string;
  environment: EnvironmentInfo;
  thresholds: PerformanceThresholds;
  results: BenchmarkResult[];
}

/**
 * Verification result for a single benchmark
 */
interface VerificationResult {
  name: string;
  requirement: string;
  metric: string;
  target: string;
  actual: string;
  passed: boolean;
  percentageOfTarget: number;
  message: string;
}

/**
 * Overall verification summary
 */
interface VerificationSummary {
  allPassed: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  results: VerificationResult[];
  violations: VerificationResult[];
  timestamp: string;
  benchmarkResultsPath: string;
  benchmarkExecutedAt?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Required performance thresholds per Requirements 12 and 16.5
 */
const REQUIRED_THRESHOLDS: PerformanceThresholds = {
  authContextResolution: {
    p50: 30,   // < 30ms (Req 12.1)
    p95: 70,   // < 70ms (Req 12.1)
    p99: 100,  // < 100ms (Req 12.1, D4, Critical deployment gate)
  },
  permissionCheck: {
    p99: 10,   // < 10ms (Req 12.2)
  },
  overallAuthorizationOverhead: {
    p99: 50,   // < 50ms (Req 1 Testing Considerations: resolution + serialization)
  },
  rlsOverhead: {
    maxPercentage: 20, // < 20% (Req 12.3)
  },
};

interface CliOptions {
  resultsPath: string;
  verbose: boolean;
  jsonOutput: boolean;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function getStatusIcon(passed: boolean): string {
  return passed ? '✅' : '❌';
}

function printSeparator(char = '─', length = 70): void {
  console.log(char.repeat(length));
}

function printHeader(title: string): void {
  console.log();
  printSeparator('═', 70);
  console.log(`  ${title}`);
  printSeparator('═', 70);
}

// ---------------------------------------------------------------------------
// Benchmark Result Loading
// ---------------------------------------------------------------------------

/**
 * Find benchmark results file
 */
function findBenchmarkResults(providedPath?: string): string | null {
  const searchPaths = [
    providedPath,
    'benchmark-results.json',
    path.join(process.cwd(), 'benchmark-results.json'),
    path.join(__dirname, '..', 'benchmarks', 'benchmark-results.json'),
    path.join(process.cwd(), 'scripts', 'benchmarks', 'benchmark-results.json'),
  ].filter((p): p is string => p !== undefined);

  for (const searchPath of searchPaths) {
    try {
      const resolvedPath = path.resolve(searchPath);
      if (fs.existsSync(resolvedPath)) {
        return resolvedPath;
      }
    } catch {
      // Continue to next path
    }
  }

  return null;
}

/**
 * Load and parse benchmark results
 */
function loadBenchmarkResults(filePath: string): BenchmarkSuiteResult | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as BenchmarkSuiteResult;
  } catch (error) {
    console.error(`Error loading benchmark results: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Verification Logic
// ---------------------------------------------------------------------------

/**
 * Find a benchmark result by name pattern
 */
function findBenchmark(results: BenchmarkResult[], pattern: string): BenchmarkResult | undefined {
  return results.find(r =>
    r.name.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Verify AuthorizationContextResolver resolution latency
 */
function verifyAuthContextResolution(results: BenchmarkResult[]): VerificationResult[] {
  const verificationResults: VerificationResult[] = [];

  // Find the AuthorizationContextResolver benchmark
  const authContextBenchmark = findBenchmark(results, 'AuthorizationContextResolver');

  if (!authContextBenchmark) {
    verificationResults.push({
      name: 'AuthContext Resolution (p99)',
      requirement: '12.1, D4',
      metric: 'p99',
      target: `< ${REQUIRED_THRESHOLDS.authContextResolution.p99}ms`,
      actual: 'N/A',
      passed: false,
      percentageOfTarget: 0,
      message: 'Benchmark result not found - benchmark must be run first',
    });
    return verificationResults;
  }

  const { latencyStats } = authContextBenchmark;

  // Verify p50
  const p50Passed = latencyStats.p50 < REQUIRED_THRESHOLDS.authContextResolution.p50;
  verificationResults.push({
    name: 'AuthContext Resolution (p50)',
    requirement: '12.1',
    metric: 'p50',
    target: `< ${REQUIRED_THRESHOLDS.authContextResolution.p50}ms`,
    actual: `${formatNumber(latencyStats.p50)}ms`,
    passed: p50Passed,
    percentageOfTarget: (latencyStats.p50 / REQUIRED_THRESHOLDS.authContextResolution.p50) * 100,
    message: p50Passed
      ? `p50 latency (${formatNumber(latencyStats.p50)}ms) is within target`
      : `p50 latency (${formatNumber(latencyStats.p50)}ms) EXCEEDS target of ${REQUIRED_THRESHOLDS.authContextResolution.p50}ms`,
  });

  // Verify p95
  const p95Passed = latencyStats.p95 < REQUIRED_THRESHOLDS.authContextResolution.p95;
  verificationResults.push({
    name: 'AuthContext Resolution (p95)',
    requirement: '12.1',
    metric: 'p95',
    target: `< ${REQUIRED_THRESHOLDS.authContextResolution.p95}ms`,
    actual: `${formatNumber(latencyStats.p95)}ms`,
    passed: p95Passed,
    percentageOfTarget: (latencyStats.p95 / REQUIRED_THRESHOLDS.authContextResolution.p95) * 100,
    message: p95Passed
      ? `p95 latency (${formatNumber(latencyStats.p95)}ms) is within target`
      : `p95 latency (${formatNumber(latencyStats.p95)}ms) EXCEEDS target of ${REQUIRED_THRESHOLDS.authContextResolution.p95}ms`,
  });

  // Verify p99 (CRITICAL)
  const p99Passed = latencyStats.p99 < REQUIRED_THRESHOLDS.authContextResolution.p99;
  verificationResults.push({
    name: 'AuthContext Resolution (p99) [CRITICAL]',
    requirement: '12.1, D4, 16.5',
    metric: 'p99',
    target: `< ${REQUIRED_THRESHOLDS.authContextResolution.p99}ms`,
    actual: `${formatNumber(latencyStats.p99)}ms`,
    passed: p99Passed,
    percentageOfTarget: (latencyStats.p99 / REQUIRED_THRESHOLDS.authContextResolution.p99) * 100,
    message: p99Passed
      ? `p99 latency (${formatNumber(latencyStats.p99)}ms) is within target - DEPLOYMENT ALLOWED`
      : `CRITICAL: p99 latency (${formatNumber(latencyStats.p99)}ms) EXCEEDS target of ${REQUIRED_THRESHOLDS.authContextResolution.p99}ms - DEPLOYMENT BLOCKED`,
  });

  return verificationResults;
}

/**
 * Verify permission check latency
 */
function verifyPermissionCheck(results: BenchmarkResult[]): VerificationResult[] {
  const verificationResults: VerificationResult[] = [];

  // Find the permission check benchmark
  const permissionBenchmark = findBenchmark(results, 'Permission') ||
    findBenchmark(results, 'getMissingPermissions');

  if (!permissionBenchmark) {
    verificationResults.push({
      name: 'Permission Check (p99)',
      requirement: '12.2',
      metric: 'p99',
      target: `< ${REQUIRED_THRESHOLDS.permissionCheck.p99}ms`,
      actual: 'N/A',
      passed: false,
      percentageOfTarget: 0,
      message: 'Benchmark result not found - benchmark must be run first',
    });
    return verificationResults;
  }

  const { latencyStats } = permissionBenchmark;

  // Verify p99
  const p99Passed = latencyStats.p99 < REQUIRED_THRESHOLDS.permissionCheck.p99;
  verificationResults.push({
    name: 'Permission Check (p99)',
    requirement: '12.2',
    metric: 'p99',
    target: `< ${REQUIRED_THRESHOLDS.permissionCheck.p99}ms`,
    actual: `${formatNumber(latencyStats.p99)}ms`,
    passed: p99Passed,
    percentageOfTarget: (latencyStats.p99 / REQUIRED_THRESHOLDS.permissionCheck.p99) * 100,
    message: p99Passed
      ? `Permission check p99 (${formatNumber(latencyStats.p99)}ms) is within target`
      : `Permission check p99 (${formatNumber(latencyStats.p99)}ms) EXCEEDS target of ${REQUIRED_THRESHOLDS.permissionCheck.p99}ms`,
  });

  return verificationResults;
}

/**
 * Verify overall authorization overhead (middleware resolution + serialization)
 */
function verifyOverallAuthOverhead(results: BenchmarkResult[]): VerificationResult[] {
  const verificationResults: VerificationResult[] = [];

  // Check for middleware benchmark or use auth context as proxy
  const middlewareBenchmark = findBenchmark(results, 'Middleware') ||
    findBenchmark(results, 'AuthorizationContextResolver');

  if (!middlewareBenchmark) {
    verificationResults.push({
      name: 'Overall Authorization Overhead (p99)',
      requirement: '1 (Testing)',
      metric: 'p99',
      target: `< ${REQUIRED_THRESHOLDS.overallAuthorizationOverhead.p99}ms`,
      actual: 'N/A',
      passed: false,
      percentageOfTarget: 0,
      message: 'Benchmark result not found - benchmark must be run first',
    });
    return verificationResults;
  }

  const { latencyStats } = middlewareBenchmark;

  // Verify p99 overall overhead
  const p99Passed = latencyStats.p99 < REQUIRED_THRESHOLDS.overallAuthorizationOverhead.p99;
  verificationResults.push({
    name: 'Overall Authorization Overhead (p99)',
    requirement: '1 (Testing)',
    metric: 'p99',
    target: `< ${REQUIRED_THRESHOLDS.overallAuthorizationOverhead.p99}ms`,
    actual: `${formatNumber(latencyStats.p99)}ms`,
    passed: p99Passed,
    percentageOfTarget: (latencyStats.p99 / REQUIRED_THRESHOLDS.overallAuthorizationOverhead.p99) * 100,
    message: p99Passed
      ? `Overall authorization overhead (${formatNumber(latencyStats.p99)}ms) is within target`
      : `Overall authorization overhead (${formatNumber(latencyStats.p99)}ms) EXCEEDS target of ${REQUIRED_THRESHOLDS.overallAuthorizationOverhead.p99}ms`,
  });

  return verificationResults;
}

/**
 * Verify RLS query overhead
 */
function verifyRlsOverhead(results: BenchmarkResult[]): VerificationResult[] {
  const verificationResults: VerificationResult[] = [];

  // Find RLS benchmarks
  const rlsBenchmark = findBenchmark(results, 'RLS');
  const withoutRlsBenchmark = findBenchmark(results, 'Without RLS');
  const withRlsBenchmark = findBenchmark(results, 'With RLS');

  // Try to find overhead in RLS benchmark additional metrics
  if (rlsBenchmark?.additionalMetrics?.overhead_percentage !== undefined) {
    const overheadPercent = rlsBenchmark.additionalMetrics.overhead_percentage;
    const passed = overheadPercent < REQUIRED_THRESHOLDS.rlsOverhead.maxPercentage;

    verificationResults.push({
      name: 'RLS Query Overhead',
      requirement: '12.3',
      metric: 'overhead_percentage',
      target: `< ${REQUIRED_THRESHOLDS.rlsOverhead.maxPercentage}%`,
      actual: `${formatNumber(overheadPercent)}%`,
      passed,
      percentageOfTarget: (overheadPercent / REQUIRED_THRESHOLDS.rlsOverhead.maxPercentage) * 100,
      message: passed
        ? `RLS overhead (${formatNumber(overheadPercent)}%) is within acceptable threshold`
        : `RLS overhead (${formatNumber(overheadPercent)}%) EXCEEDS maximum threshold of ${REQUIRED_THRESHOLDS.rlsOverhead.maxPercentage}%`,
    });
  } else if (withoutRlsBenchmark && withRlsBenchmark) {
    // Calculate overhead from separate benchmarks
    const baselineP99 = withoutRlsBenchmark.latencyStats.p99;
    const rlsP99 = withRlsBenchmark.latencyStats.p99;
    const overheadPercent = baselineP99 > 0
      ? ((rlsP99 - baselineP99) / baselineP99) * 100
      : 0;

    const passed = overheadPercent < REQUIRED_THRESHOLDS.rlsOverhead.maxPercentage;

    verificationResults.push({
      name: 'RLS Query Overhead',
      requirement: '12.3',
      metric: 'overhead_percentage',
      target: `< ${REQUIRED_THRESHOLDS.rlsOverhead.maxPercentage}%`,
      actual: `${formatNumber(overheadPercent)}%`,
      passed,
      percentageOfTarget: (overheadPercent / REQUIRED_THRESHOLDS.rlsOverhead.maxPercentage) * 100,
      message: passed
        ? `RLS overhead (${formatNumber(overheadPercent)}%) is within acceptable threshold`
        : `RLS overhead (${formatNumber(overheadPercent)}%) EXCEEDS maximum threshold of ${REQUIRED_THRESHOLDS.rlsOverhead.maxPercentage}%`,
    });
  } else {
    verificationResults.push({
      name: 'RLS Query Overhead',
      requirement: '12.3',
      metric: 'overhead_percentage',
      target: `< ${REQUIRED_THRESHOLDS.rlsOverhead.maxPercentage}%`,
      actual: 'N/A',
      passed: false,
      percentageOfTarget: 0,
      message: 'RLS benchmark results not found - benchmark must be run first',
    });
  }

  return verificationResults;
}

/**
 * Run all verifications and generate summary
 */
function runVerification(benchmarkResults: BenchmarkSuiteResult, resultsPath: string): VerificationSummary {
  const allResults: VerificationResult[] = [];

  // Run all verifications
  allResults.push(...verifyAuthContextResolution(benchmarkResults.results));
  allResults.push(...verifyPermissionCheck(benchmarkResults.results));
  allResults.push(...verifyOverallAuthOverhead(benchmarkResults.results));
  allResults.push(...verifyRlsOverhead(benchmarkResults.results));

  // Calculate summary
  const passedChecks = allResults.filter(r => r.passed).length;
  const failedChecks = allResults.length - passedChecks;
  const violations = allResults.filter(r => !r.passed);

  return {
    allPassed: failedChecks === 0,
    totalChecks: allResults.length,
    passedChecks,
    failedChecks,
    results: allResults,
    violations,
    timestamp: new Date().toISOString(),
    benchmarkResultsPath: resultsPath,
    benchmarkExecutedAt: benchmarkResults.executedAt,
  };
}

// ---------------------------------------------------------------------------
// Output Formatting
// ---------------------------------------------------------------------------

/**
 * Print verification summary to console
 */
function printSummary(summary: VerificationSummary, verbose: boolean): void {
  printHeader('Performance Benchmark Verification');

  console.log();
  console.log(`📊 Benchmark Results: ${summary.benchmarkResultsPath}`);
  if (summary.benchmarkExecutedAt) {
    console.log(`📅 Benchmark Executed: ${summary.benchmarkExecutedAt}`);
  }
  console.log(`🕐 Verified At: ${summary.timestamp}`);
  console.log();

  printSeparator();
  console.log('Performance Targets (per Requirements 12 & 16.5):');
  printSeparator();
  console.log(`  • AuthContext Resolution: p50 < ${REQUIRED_THRESHOLDS.authContextResolution.p50}ms, p95 < ${REQUIRED_THRESHOLDS.authContextResolution.p95}ms, p99 < ${REQUIRED_THRESHOLDS.authContextResolution.p99}ms`);
  console.log(`  • Permission Check: p99 < ${REQUIRED_THRESHOLDS.permissionCheck.p99}ms`);
  console.log(`  • Overall Authorization Overhead: p99 < ${REQUIRED_THRESHOLDS.overallAuthorizationOverhead.p99}ms`);
  console.log(`  • RLS Query Overhead: < ${REQUIRED_THRESHOLDS.rlsOverhead.maxPercentage}%`);
  console.log();

  printSeparator();
  console.log('Verification Results:');
  printSeparator();

  for (const result of summary.results) {
    const icon = getStatusIcon(result.passed);
    const percentStr = result.percentageOfTarget > 0
      ? ` (${formatNumber(result.percentageOfTarget)}% of limit)`
      : '';

    console.log();
    console.log(`${icon} ${result.name}`);
    console.log(`   Requirement: ${result.requirement}`);
    console.log(`   Target: ${result.target}`);
    console.log(`   Actual: ${result.actual}${percentStr}`);

    if (verbose || !result.passed) {
      console.log(`   ${result.message}`);
    }
  }

  console.log();
  printSeparator('═', 70);

  // Summary status
  const statusIcon = summary.allPassed ? '✅' : '❌';
  const status = summary.allPassed ? 'ALL BENCHMARKS PASSED' : 'BENCHMARKS FAILED';

  console.log();
  console.log(`${statusIcon} ${status}`);
  console.log(`   Total Checks: ${summary.totalChecks}`);
  console.log(`   Passed: ${summary.passedChecks}`);
  console.log(`   Failed: ${summary.failedChecks}`);

  // List violations
  if (summary.violations.length > 0) {
    console.log();
    console.log('⚠️  VIOLATIONS:');
    for (const violation of summary.violations) {
      console.log(`   • ${violation.name}: ${violation.actual} (target: ${violation.target})`);
    }
  }

  console.log();

  // Deployment status
  if (summary.allPassed) {
    console.log('🚀 Deployment: ALLOWED - All performance benchmarks met');
  } else {
    console.log('🚫 Deployment: BLOCKED - Performance requirements not met');
    console.log('   Fix the violations above before proceeding with deployment.');
  }

  printSeparator('═', 70);
}

/**
 * Output summary as JSON
 */
function outputJson(summary: VerificationSummary): void {
  console.log(JSON.stringify(summary, null, 2));
}

// ---------------------------------------------------------------------------
// CLI Handling
// ---------------------------------------------------------------------------

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    resultsPath: 'benchmark-results.json',
    verbose: false,
    jsonOutput: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--results':
        options.resultsPath = args[++i] || options.resultsPath;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--json':
        options.jsonOutput = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  return options;
}

function printUsage(): void {
  console.log(`
Performance Verification Script

Verifies that benchmark results meet the required performance targets for
the Multi-Tenant Authorization System cutover.

Usage: npx tsx scripts/validation/verify-performance.ts [options]

Options:
  --results <path>     Path to benchmark results JSON (default: benchmark-results.json)
  --verbose, -v        Enable verbose output
  --json               Output results as JSON
  --help, -h           Show this help message

Performance Targets:
  - AuthContext Resolution: p50 < 30ms, p95 < 70ms, p99 < 100ms (Req 12.1)
  - Permission Check: p99 < 10ms (Req 12.2)
  - Overall Authorization Overhead: p99 < 50ms (Req 1)
  - RLS Query Overhead: < 20% (Req 12.3)

Exit Codes:
  0  All benchmarks passed
  1  One or more benchmarks failed
  2  Error reading benchmark results

Examples:
  # Verify default benchmark-results.json
  npx tsx scripts/validation/verify-performance.ts

  # Verify specific results file with verbose output
  npx tsx scripts/validation/verify-performance.ts --results ./my-results.json --verbose

  # Output as JSON for CI parsing
  npx tsx scripts/validation/verify-performance.ts --json
  `);
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs();

  // Find and load benchmark results
  const resultsPath = findBenchmarkResults(options.resultsPath);

  if (!resultsPath) {
    if (options.jsonOutput) {
      console.log(JSON.stringify({
        error: 'Benchmark results not found',
        message: 'Run performance benchmarks first: npx tsx scripts/benchmarks/performance-benchmarks.ts',
        searchedPath: options.resultsPath,
      }));
    } else {
      console.error('❌ Error: Benchmark results not found');
      console.error();
      console.error('The performance benchmarks must be run first:');
      console.error('  npx tsx scripts/benchmarks/performance-benchmarks.ts');
      console.error();
      console.error(`Searched for: ${options.resultsPath}`);
    }
    process.exit(2);
  }

  const benchmarkResults = loadBenchmarkResults(resultsPath);

  if (!benchmarkResults) {
    if (options.jsonOutput) {
      console.log(JSON.stringify({
        error: 'Failed to parse benchmark results',
        path: resultsPath,
      }));
    } else {
      console.error('❌ Error: Failed to parse benchmark results');
      console.error(`   Path: ${resultsPath}`);
    }
    process.exit(2);
  }

  // Run verification
  const summary = runVerification(benchmarkResults, resultsPath);

  // Output results
  if (options.jsonOutput) {
    outputJson(summary);
  } else {
    printSummary(summary, options.verbose);
  }

  // Exit with appropriate code
  if (summary.allPassed) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(2);
});

export {
  type VerificationSummary,
  type VerificationResult,
  type PerformanceThresholds,
  REQUIRED_THRESHOLDS,
  runVerification,
  findBenchmarkResults,
  loadBenchmarkResults,
};
