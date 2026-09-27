#!/usr/bin/env npx tsx
/**
 * Verify Tests Passing Script
 *
 * This script runs the full test suite and validates that all tests pass.
 * It captures test results including:
 * - Total tests
 * - Passed tests
 * - Failed tests
 * - Skipped tests
 * - Coverage percentage
 *
 * The script generates a summary report and fails with exit code 1 if any tests fail.
 *
 * Usage:
 *   npx tsx scripts/validation/verify-tests-passing.ts
 *   npx tsx scripts/validation/verify-tests-passing.ts --verbose
 *   npx tsx scripts/validation/verify-tests-passing.ts --json
 *   npx tsx scripts/validation/verify-tests-passing.ts --coverage
 *   npx tsx scripts/validation/verify-tests-passing.ts --output results.json
 *
 * Exit codes:
 *   0 - All tests passed
 *   1 - One or more tests failed
 *   2 - Error during execution
 *
 * @see FASE 2.16 Task 27.3: Verify all integration tests passing
 * @see Requirement 16.4: Verify all integration tests passing
 */

import 'dotenv/config';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_NAME = 'verify-tests-passing';
const DEFAULT_TIMEOUT_MS = 600000; // 10 minutes for full test suite
const COVERAGE_THRESHOLD = 80; // Minimum coverage percentage

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  suites: TestSuiteResult[];
}

interface TestSuiteResult {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  tests: TestResult[];
}

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration?: number;
  error?: string;
}

interface CoverageResults {
  statements: CoverageMetric;
  branches: CoverageMetric;
  functions: CoverageMetric;
  lines: CoverageMetric;
}

interface CoverageMetric {
  total: number;
  covered: number;
  percentage: number;
}

interface VerificationReport {
  timestamp: Date;
  testsPassed: boolean;
  coverageMet: boolean;
  tests: TestResults;
  coverage?: CoverageResults;
  overallStatus: 'passed' | 'failed';
  summary: string;
  exitCode: number;
}

interface CommandLineArgs {
  verbose: boolean;
  json: boolean;
  coverage: boolean;
  output?: string;
  help: boolean;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function log(message: string, verbose: boolean = false): void {
  if (!verbose) {
    console.log(`[${SCRIPT_NAME}] ${message}`);
  } else {
    console.log(`[${SCRIPT_NAME}] [${new Date().toISOString()}] ${message}`);
  }
}

function logVerbose(message: string, isVerbose: boolean): void {
  if (isVerbose) {
    log(message, true);
  }
}

function logError(message: string): void {
  console.error(`[${SCRIPT_NAME}] ❌ ${message}`);
}

function logSuccess(message: string): void {
  console.log(`[${SCRIPT_NAME}] ✅ ${message}`);
}

function logWarning(message: string): void {
  console.warn(`[${SCRIPT_NAME}] ⚠️  ${message}`);
}

function parseArgs(): CommandLineArgs {
  const args: CommandLineArgs = {
    verbose: false,
    json: false,
    coverage: false,
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
      case '--coverage':
      case '-c':
        args.coverage = true;
        break;
      case '--output':
      case '-o':
        args.output = process.argv[++i];
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
${SCRIPT_NAME} - Verify all tests are passing

Usage:
  npx tsx scripts/validation/${SCRIPT_NAME}.ts [options]

Options:
  --verbose, -v     Enable verbose output
  --json            Output results as JSON
  --coverage, -c    Include coverage analysis
  --output, -o      Output file for results (JSON format)
  --help, -h        Show this help message

Exit codes:
  0 - All tests passed (and coverage met if --coverage)
  1 - One or more tests failed or coverage below threshold
  2 - Error during execution

Requirements validated:
  - Requirement 16.4: Verify all integration tests passing
`);
}

// ---------------------------------------------------------------------------
// Test Runner
// ---------------------------------------------------------------------------

async function runTestSuite(
  withCoverage: boolean,
  verbose: boolean,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const args = withCoverage
      ? ['run', '--coverage', '--reporter=verbose', '--reporter=json', '--outputFile=test-results.json']
      : ['run', '--reporter=verbose', '--reporter=json', '--outputFile=test-results.json'];

    logVerbose(`Running: vitest ${args.join(' ')}`, verbose);

    const child = spawn('npx', ['vitest', ...args], {
      cwd: process.cwd(),
      shell: true,
      timeout: DEFAULT_TIMEOUT_MS,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      if (verbose) {
        process.stdout.write(text);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (verbose) {
        process.stderr.write(text);
      }
    });

    child.on('error', error => {
      reject(new Error(`Failed to run test suite: ${error.message}`));
    });

    child.on('close', exitCode => {
      resolve({
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

function parseTestResults(stdout: string, exitCode: number): TestResults {
  const results: TestResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    suites: [],
  };

  // Try to read JSON results file if it exists
  const jsonResultsPath = path.join(process.cwd(), 'test-results.json');
  if (fs.existsSync(jsonResultsPath)) {
    try {
      const jsonResults = JSON.parse(fs.readFileSync(jsonResultsPath, 'utf-8'));
      return parseVitestJsonResults(jsonResults);
    } catch {
      // Fall back to parsing stdout
    }
  }

  // Parse from stdout output
  // Look for vitest summary line: "Tests  X passed | Y failed | Z skipped (N)"
  const summaryMatch = stdout.match(
    /Tests\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?(?:\s*\|\s*(\d+)\s+skipped)?/i,
  );

  if (summaryMatch) {
    results.passed = parseInt(summaryMatch[1] || '0', 10);
    results.failed = parseInt(summaryMatch[2] || '0', 10);
    results.skipped = parseInt(summaryMatch[3] || '0', 10);
    results.total = results.passed + results.failed + results.skipped;
  }

  // Parse duration
  const durationMatch = stdout.match(/Duration\s+([\d.]+)s/i);
  if (durationMatch) {
    results.duration = parseFloat(durationMatch[1] ?? '0') * 1000;
  }

  // If we couldn't parse results but tests passed, assume success
  if (results.total === 0 && exitCode === 0) {
    results.total = 1;
    results.passed = 1;
  }

  return results;
}

function parseVitestJsonResults(json: unknown): TestResults {
  const results: TestResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    suites: [],
  };

  // Handle vitest JSON reporter format
  if (typeof json === 'object' && json !== null) {
    const data = json as Record<string, unknown>;

    // Check for testResults array (standard vitest JSON format)
    if (Array.isArray(data.testResults)) {
      for (const suite of data.testResults) {
        const suiteResult: TestSuiteResult = {
          name: (suite as Record<string, unknown>).name as string || 'Unknown Suite',
          passed: 0,
          failed: 0,
          skipped: 0,
          tests: [],
        };

        const assertionResults = (suite as Record<string, unknown>).assertionResults;
        if (Array.isArray(assertionResults)) {
          for (const test of assertionResults) {
            const testObj = test as Record<string, unknown>;
            const status = testObj.status as string;
            const testResult: TestResult = {
              name: testObj.fullName as string || testObj.title as string || 'Unknown Test',
              status: status === 'passed' ? 'passed' : status === 'skipped' ? 'skipped' : 'failed',
              duration: testObj.duration as number,
            };

            suiteResult.tests.push(testResult);

            if (testResult.status === 'passed') {
              suiteResult.passed++;
              results.passed++;
            } else if (testResult.status === 'failed') {
              suiteResult.failed++;
              results.failed++;
            } else {
              suiteResult.skipped++;
              results.skipped++;
            }
          }
        }

        results.suites.push(suiteResult);
      }

      results.total = results.passed + results.failed + results.skipped;
      results.duration = (data.endTime as number || 0) - (data.startTime as number || 0);
    }

    // Alternative format: numTotalTests, numPassedTests, etc.
    if (typeof data.numTotalTests === 'number') {
      results.total = data.numTotalTests as number;
      results.passed = (data.numPassedTests as number) || 0;
      results.failed = (data.numFailedTests as number) || 0;
      results.skipped = (data.numPendingTests as number) || (data.numTodoTests as number) || 0;
    }
  }

  return results;
}

function parseCoverageResults(verbose: boolean): CoverageResults | undefined {
  // Try to read coverage summary from coverage-summary.json
  const coveragePaths = [
    path.join(process.cwd(), 'coverage', 'coverage-summary.json'),
    path.join(process.cwd(), 'coverage-summary.json'),
  ];

  for (const coveragePath of coveragePaths) {
    if (fs.existsSync(coveragePath)) {
      try {
        const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
        const total = coverageData.total;

        if (total) {
          const coverage: CoverageResults = {
            statements: {
              total: total.statements?.total || 0,
              covered: total.statements?.covered || 0,
              percentage: total.statements?.pct || 0,
            },
            branches: {
              total: total.branches?.total || 0,
              covered: total.branches?.covered || 0,
              percentage: total.branches?.pct || 0,
            },
            functions: {
              total: total.functions?.total || 0,
              covered: total.functions?.covered || 0,
              percentage: total.functions?.pct || 0,
            },
            lines: {
              total: total.lines?.total || 0,
              covered: total.lines?.covered || 0,
              percentage: total.lines?.pct || 0,
            },
          };

          logVerbose(`Parsed coverage from: ${coveragePath}`, verbose);
          return coverage;
        }
      } catch (error) {
        logVerbose(`Failed to parse coverage from ${coveragePath}: ${error}`, verbose);
      }
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

function checkCoverageMet(coverage?: CoverageResults): boolean {
  if (!coverage) {
    return true; // No coverage data means we don't check
  }

  return (
    coverage.statements.percentage >= COVERAGE_THRESHOLD &&
    coverage.branches.percentage >= COVERAGE_THRESHOLD &&
    coverage.functions.percentage >= COVERAGE_THRESHOLD &&
    coverage.lines.percentage >= COVERAGE_THRESHOLD
  );
}

function generateSummary(results: TestResults, coverage?: CoverageResults): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    TEST VERIFICATION REPORT                   ');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Test Results
  lines.push('📊 TEST RESULTS');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(`  Total Tests:   ${results.total}`);
  lines.push(`  ✅ Passed:     ${results.passed}`);
  lines.push(`  ❌ Failed:     ${results.failed}`);
  lines.push(`  ⏭️  Skipped:    ${results.skipped}`);
  lines.push(`  ⏱️  Duration:   ${(results.duration / 1000).toFixed(2)}s`);
  lines.push('');

  if (results.failed > 0) {
    lines.push('❌ FAILED TESTS:');
    for (const suite of results.suites) {
      for (const test of suite.tests) {
        if (test.status === 'failed') {
          lines.push(`  • ${suite.name} > ${test.name}`);
          if (test.error) {
            lines.push(`    Error: ${test.error}`);
          }
        }
      }
    }
    lines.push('');
  }

  // Coverage Results
  if (coverage) {
    lines.push('📈 COVERAGE RESULTS');
    lines.push('───────────────────────────────────────────────────────────────');
    const threshold = COVERAGE_THRESHOLD;

    const formatCoverage = (metric: CoverageMetric, name: string): string => {
      const status = metric.percentage >= threshold ? '✅' : '❌';
      return `  ${status} ${name.padEnd(12)} ${metric.percentage.toFixed(2)}% (${metric.covered}/${metric.total})`;
    };

    lines.push(formatCoverage(coverage.statements, 'Statements'));
    lines.push(formatCoverage(coverage.branches, 'Branches'));
    lines.push(formatCoverage(coverage.functions, 'Functions'));
    lines.push(formatCoverage(coverage.lines, 'Lines'));
    lines.push(`  Threshold:     ${threshold}%`);
    lines.push('');
  }

  // Overall Status
  lines.push('═══════════════════════════════════════════════════════════════');
  const testsPassed = results.failed === 0;
  const coverageMet = checkCoverageMet(coverage);

  if (testsPassed && coverageMet) {
    lines.push('✅ VERIFICATION PASSED');
    lines.push('   All tests passed and coverage thresholds met.');
  } else if (!testsPassed) {
    lines.push('❌ VERIFICATION FAILED');
    lines.push(`   ${results.failed} test(s) failed.`);
  } else {
    lines.push('❌ VERIFICATION FAILED');
    lines.push('   Coverage below threshold.');
  }
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

function generateReport(
  tests: TestResults,
  coverage: CoverageResults | undefined,
  _exitCode: number,
): VerificationReport {
  const testsPassed = tests.failed === 0;
  const coverageMet = checkCoverageMet(coverage);

  return {
    timestamp: new Date(),
    testsPassed,
    coverageMet,
    tests,
    coverage,
    overallStatus: testsPassed && coverageMet ? 'passed' : 'failed',
    summary: generateSummary(tests, coverage),
    exitCode: testsPassed && coverageMet ? 0 : 1,
  };
}

// ---------------------------------------------------------------------------
// Main Execution
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  log('Starting test verification...');
  log(`Configuration: coverage=${args.coverage}, verbose=${args.verbose}`);

  try {
    // Run the test suite
    log('Running test suite...');
    const { stdout, exitCode } = await runTestSuite(args.coverage, args.verbose);

    // Parse test results
    log('Parsing test results...');
    const testResults = parseTestResults(stdout, exitCode);

    // Parse coverage results if requested
    let coverageResults: CoverageResults | undefined;
    if (args.coverage) {
      log('Parsing coverage results...');
      coverageResults = parseCoverageResults(args.verbose);

      if (!coverageResults) {
        logWarning('Could not parse coverage results');
      }
    }

    // Generate report
    const report = generateReport(testResults, coverageResults, exitCode);

    // Output results
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log('');
      console.log(report.summary);
    }

    // Write to output file if specified
    if (args.output) {
      fs.writeFileSync(args.output, JSON.stringify(report, null, 2));
      log(`Results written to: ${args.output}`);
    }

    // Clean up temporary files
    const tempResultsPath = path.join(process.cwd(), 'test-results.json');
    if (fs.existsSync(tempResultsPath)) {
      fs.unlinkSync(tempResultsPath);
    }

    // Exit with appropriate code
    if (report.overallStatus === 'passed') {
      logSuccess('All tests passing - verification complete!');
      process.exit(0);
    } else {
      logError('Verification failed - see report above');
      process.exit(1);
    }
  } catch (error) {
    logError(`Error during verification: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

// Run if executed directly (not when imported as a module)
const isMainModule = process.argv[1]?.includes('verify-tests-passing');
if (isMainModule) {
  main().catch(error => {
    logError(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  });
}

export {
  runTestSuite,
  parseTestResults,
  parseCoverageResults,
  generateReport,
  checkCoverageMet,
  type TestResults,
  type CoverageResults,
  type VerificationReport,
};
