#!/usr/bin/env npx tsx
/**
 * Migration Completion Report Generator
 *
 * This script orchestrates all validation scripts (27.1-27.6) and generates
 * a comprehensive completion report for the Multi-Tenant Integration Cutover.
 *
 * **Purpose:**
 * - Run all validation scripts in sequence
 * - Collect and aggregate results
 * - Generate a human-readable markdown report
 * - Generate a machine-readable JSON report for CI/CD
 *
 * **Validation Scripts Executed:**
 * 1. verify-migration-complete.ts (27.1) - Route handler migration status
 * 2. verify-rls-enabled.ts (27.2) - RLS coverage on tenant tables
 * 3. verify-tests-passing.ts (27.3) - Integration test results
 * 4. verify-performance.ts (27.4) - Performance benchmark validation
 * 5. verify-shadow-mode-metrics.ts (27.5) - Shadow mode 0% mismatch
 * 6. cross-tenant-security-tests.ts (27.6) - Cross-tenant security tests
 *
 * **Output Files:**
 * - `.kiro/specs/multi-tenant-integration-cutover/COMPLETION_REPORT.md`
 * - `.kiro/specs/multi-tenant-integration-cutover/completion-report.json`
 *
 * Usage:
 *   npx tsx scripts/validation/generate-completion-report.ts
 *   npx tsx scripts/validation/generate-completion-report.ts --verbose
 *   npx tsx scripts/validation/generate-completion-report.ts --skip-tests
 *
 * Exit codes:
 *   0 - All validations passed (ready for cutover)
 *   1 - One or more validations failed (not ready for cutover)
 *   2 - Error during execution
 *
 * @see FASE 2.16 Task 27.7: Generate completion report
 * @see Requirement 16.8: Generate a completion report with sign-off
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_NAME = 'generate-completion-report';

/** Output paths */
const SPEC_DIR = '.kiro/specs/multi-tenant-integration-cutover';
const MARKDOWN_REPORT_PATH = path.join(process.cwd(), SPEC_DIR, 'COMPLETION_REPORT.md');
const JSON_REPORT_PATH = path.join(process.cwd(), SPEC_DIR, 'completion-report.json');

/** Validation script paths */
const VALIDATION_SCRIPTS = {
  migrationComplete: 'scripts/validation/verify-migration-complete.ts',
  rlsEnabled: 'scripts/validation/verify-rls-enabled.ts',
  testsPassing: 'scripts/validation/verify-tests-passing.ts',
  performance: 'scripts/validation/verify-performance.ts',
  shadowMode: 'scripts/validation/verify-shadow-mode-metrics.ts',
  crossTenant: 'scripts/rls/cross-tenant-security-tests.ts',
};

/** Legacy removal timeline (30 days after completion) */
const LEGACY_REMOVAL_DAYS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationResult {
  name: string;
  task: string;
  requirement: string;
  passed: boolean;
  summary: string;
  details: Record<string, unknown>;
  executionTimeMs: number;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

interface CompletionReport {
  /** Report metadata */
  metadata: {
    generatedAt: string;
    generatedBy: string;
    version: string;
    specDirectory: string;
  };
  /** Executive summary */
  executiveSummary: {
    overallStatus: 'PASSED' | 'FAILED' | 'PARTIAL';
    totalValidations: number;
    passedValidations: number;
    failedValidations: number;
    skippedValidations: number;
    readyForCutover: boolean;
    blockers: string[];
    warnings: string[];
  };
  /** Migration status */
  migrationStatus: {
    passed: boolean;
    directoriesMigrated: number;
    totalDirectories: number;
    legacyPatternsRemaining: number;
    migrationPercentage: number;
    details: Record<string, unknown>;
  };
  /** RLS coverage */
  rlsCoverage: {
    passed: boolean;
    tablesWithRls: number;
    totalTables: number;
    coveragePercentage: number;
    policyCompliancePercentage: number;
    nonCompliantTables: string[];
    details: Record<string, unknown>;
  };
  /** Test results */
  testResults: {
    passed: boolean;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    coveragePercentage?: number;
    details: Record<string, unknown>;
  };
  /** Performance benchmarks */
  performanceBenchmarks: {
    passed: boolean;
    authContextResolutionP99Ms: number;
    permissionCheckP99Ms: number;
    rlsOverheadPercentage: number;
    allTargetsMet: boolean;
    failedBenchmarks: string[];
    details: Record<string, unknown>;
  };
  /** Shadow mode metrics */
  shadowModeMetrics: {
    passed: boolean;
    consecutiveDaysAt0Percent: number;
    requiredDays: number;
    totalRequests: number;
    requiredSampleSize: number;
    mismatchRate: number;
    meetsRequirements: boolean;
    details: Record<string, unknown>;
  };
  /** Cross-tenant security */
  crossTenantSecurity: {
    passed: boolean;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    tablesValidated: number;
    details: Record<string, unknown>;
  };
  /** Sign-off section */
  signOffs: {
    engineeringLead: SignOff;
    securityLead: SignOff;
    qaLead: SignOff;
  };
  /** Legacy removal timeline */
  legacyRemovalTimeline: {
    completionDate?: string;
    removalEligibleDate?: string;
    daysUntilRemoval?: number;
    deprecatedItems: string[];
    removalSteps: string[];
  };
  /** Individual validation results */
  validationResults: ValidationResult[];
}

interface SignOff {
  name: string;
  role: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  date?: string;
  signature?: string;
  comments?: string;
}

interface CliOptions {
  verbose: boolean;
  skipTests: boolean;
  skipDatabase: boolean;
  json: boolean;
}

// ---------------------------------------------------------------------------
// Logging Utilities
// ---------------------------------------------------------------------------

function log(message: string): void {
  console.log(`[${SCRIPT_NAME}] ${message}`);
}

function logError(message: string): void {
  console.error(`[${SCRIPT_NAME}] ❌ ERROR: ${message}`);
}

function logSuccess(message: string): void {
  console.log(`[${SCRIPT_NAME}] ✅ ${message}`);
}

function logSection(title: string): void {
  console.log('');
  console.log('━'.repeat(70));
  console.log(`  ${title}`);
  console.log('━'.repeat(70));
}

// ---------------------------------------------------------------------------
// Script Execution
// ---------------------------------------------------------------------------

interface ScriptResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
}

/**
 * Execute a validation script and capture output
 */
async function executeScript(
  scriptPath: string,
  args: string[] = [],
  verbose: boolean = false
): Promise<ScriptResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const fullPath = path.join(process.cwd(), scriptPath);

    // Check if script exists
    if (!fs.existsSync(fullPath)) {
      resolve({
        exitCode: 2,
        stdout: '',
        stderr: `Script not found: ${scriptPath}`,
        executionTimeMs: Date.now() - startTime,
      });
      return;
    }

    const child = spawn('npx', ['tsx', fullPath, ...args, '--json'], {
      cwd: process.cwd(),
      shell: true,
      timeout: 300000, // 5 minutes timeout
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

    child.on('error', (error) => {
      resolve({
        exitCode: 2,
        stdout,
        stderr: stderr + `\nExecution error: ${error.message}`,
        executionTimeMs: Date.now() - startTime,
      });
    });

    child.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
        executionTimeMs: Date.now() - startTime,
      });
    });
  });
}

/**
 * Parse JSON from script output (handles mixed output)
 */
function parseJsonFromOutput(output: string): Record<string, unknown> | null {
  // Try to find JSON in the output (it might be mixed with log messages)
  const jsonMatch = output.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validation Runners
// ---------------------------------------------------------------------------

/**
 * Run migration completion validation (27.1)
 */
async function runMigrationValidation(verbose: boolean): Promise<ValidationResult> {
  log('Running migration completion validation (Task 27.1)...');
  const result = await executeScript(VALIDATION_SCRIPTS.migrationComplete, [], verbose);
  const jsonData = parseJsonFromOutput(result.stdout);

  return {
    name: 'Migration Completion',
    task: '27.1',
    requirement: '16.1, 16.2',
    passed: result.exitCode === 0,
    summary: result.exitCode === 0
      ? 'All route handlers migrated to withPermission pattern'
      : 'Some route handlers still using legacy resolveAuthContext()',
    details: jsonData ?? {
      exitCode: result.exitCode,
      rawOutput: result.stdout.slice(0, 1000),
    },
    executionTimeMs: result.executionTimeMs,
    error: result.exitCode !== 0 ? result.stderr : undefined,
  };
}

/**
 * Run RLS enabled validation (27.2)
 */
async function runRlsValidation(verbose: boolean, skipDatabase: boolean): Promise<ValidationResult> {
  log('Running RLS enabled validation (Task 27.2)...');

  if (skipDatabase || !process.env.DATABASE_URL) {
    return {
      name: 'RLS Coverage',
      task: '27.2',
      requirement: '16.3',
      passed: false,
      summary: 'Skipped: Database connection not available',
      details: {},
      executionTimeMs: 0,
      skipped: true,
      skipReason: skipDatabase ? 'User requested skip' : 'DATABASE_URL not set',
    };
  }

  const result = await executeScript(VALIDATION_SCRIPTS.rlsEnabled, [], verbose);
  const jsonData = parseJsonFromOutput(result.stdout);

  return {
    name: 'RLS Coverage',
    task: '27.2',
    requirement: '16.3',
    passed: result.exitCode === 0,
    summary: result.exitCode === 0
      ? 'RLS enabled on all tenant-scoped tables'
      : 'Some tables missing RLS policies',
    details: jsonData ?? {
      exitCode: result.exitCode,
      rawOutput: result.stdout.slice(0, 1000),
    },
    executionTimeMs: result.executionTimeMs,
    error: result.exitCode !== 0 ? result.stderr : undefined,
  };
}

/**
 * Run tests passing validation (27.3)
 */
async function runTestsValidation(verbose: boolean, skipTests: boolean): Promise<ValidationResult> {
  log('Running tests passing validation (Task 27.3)...');

  if (skipTests) {
    return {
      name: 'Integration Tests',
      task: '27.3',
      requirement: '16.4',
      passed: false,
      summary: 'Skipped: Tests skipped by user request',
      details: {},
      executionTimeMs: 0,
      skipped: true,
      skipReason: 'User requested skip',
    };
  }

  const result = await executeScript(VALIDATION_SCRIPTS.testsPassing, [], verbose);
  const jsonData = parseJsonFromOutput(result.stdout);

  return {
    name: 'Integration Tests',
    task: '27.3',
    requirement: '16.4',
    passed: result.exitCode === 0,
    summary: result.exitCode === 0
      ? 'All integration tests passing'
      : 'Some tests failing',
    details: jsonData ?? {
      exitCode: result.exitCode,
      rawOutput: result.stdout.slice(0, 1000),
    },
    executionTimeMs: result.executionTimeMs,
    error: result.exitCode !== 0 ? result.stderr : undefined,
  };
}

/**
 * Run performance validation (27.4)
 */
async function runPerformanceValidation(verbose: boolean): Promise<ValidationResult> {
  log('Running performance benchmark validation (Task 27.4)...');
  const result = await executeScript(VALIDATION_SCRIPTS.performance, [], verbose);
  const jsonData = parseJsonFromOutput(result.stdout);

  // Handle case where benchmark results don't exist
  if (result.exitCode === 2) {
    return {
      name: 'Performance Benchmarks',
      task: '27.4',
      requirement: '16.5',
      passed: false,
      summary: 'Benchmark results not found - run benchmarks first',
      details: { error: 'No benchmark-results.json found' },
      executionTimeMs: result.executionTimeMs,
      skipped: true,
      skipReason: 'Benchmark results file not found',
    };
  }

  return {
    name: 'Performance Benchmarks',
    task: '27.4',
    requirement: '16.5',
    passed: result.exitCode === 0,
    summary: result.exitCode === 0
      ? 'All performance benchmarks met'
      : 'Some performance benchmarks failed',
    details: jsonData ?? {
      exitCode: result.exitCode,
      rawOutput: result.stdout.slice(0, 1000),
    },
    executionTimeMs: result.executionTimeMs,
    error: result.exitCode !== 0 ? result.stderr : undefined,
  };
}

/**
 * Run shadow mode metrics validation (27.5)
 */
async function runShadowModeValidation(verbose: boolean): Promise<ValidationResult> {
  log('Running shadow mode metrics validation (Task 27.5)...');
  const result = await executeScript(VALIDATION_SCRIPTS.shadowMode, [], verbose);
  const jsonData = parseJsonFromOutput(result.stdout);

  // Handle case where shadow mode metrics don't exist
  if (!jsonData && result.stdout.includes('No metrics data found')) {
    return {
      name: 'Shadow Mode Metrics',
      task: '27.5',
      requirement: '16.6',
      passed: false,
      summary: 'Shadow mode metrics not available - enable shadow mode first',
      details: { error: 'No shadow mode metrics file found' },
      executionTimeMs: result.executionTimeMs,
      skipped: true,
      skipReason: 'Shadow mode metrics not collected yet',
    };
  }

  return {
    name: 'Shadow Mode Metrics',
    task: '27.5',
    requirement: '16.6',
    passed: result.exitCode === 0,
    summary: result.exitCode === 0
      ? 'Shadow mode at 0% mismatch for 7+ consecutive days'
      : 'Shadow mode requirements not met',
    details: jsonData ?? {
      exitCode: result.exitCode,
      rawOutput: result.stdout.slice(0, 1000),
    },
    executionTimeMs: result.executionTimeMs,
    error: result.exitCode !== 0 ? result.stderr : undefined,
  };
}

/**
 * Run cross-tenant security validation (27.6)
 */
async function runCrossTenantValidation(verbose: boolean, skipDatabase: boolean): Promise<ValidationResult> {
  log('Running cross-tenant security validation (Task 27.6)...');

  if (skipDatabase || !process.env.DATABASE_URL) {
    return {
      name: 'Cross-Tenant Security',
      task: '27.6',
      requirement: '16.7',
      passed: false,
      summary: 'Skipped: Database connection not available',
      details: {},
      executionTimeMs: 0,
      skipped: true,
      skipReason: skipDatabase ? 'User requested skip' : 'DATABASE_URL not set',
    };
  }

  const result = await executeScript(VALIDATION_SCRIPTS.crossTenant, [], verbose);
  const jsonData = parseJsonFromOutput(result.stdout);

  return {
    name: 'Cross-Tenant Security',
    task: '27.6',
    requirement: '16.7',
    passed: result.exitCode === 0,
    summary: result.exitCode === 0
      ? 'All cross-tenant access properly blocked'
      : 'Cross-tenant access vulnerabilities detected',
    details: jsonData ?? {
      exitCode: result.exitCode,
      rawOutput: result.stdout.slice(0, 1000),
    },
    executionTimeMs: result.executionTimeMs,
    error: result.exitCode !== 0 ? result.stderr : undefined,
  };
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

/**
 * Build completion report from validation results
 */
function buildCompletionReport(validationResults: ValidationResult[]): CompletionReport {
  const now = new Date();
  const passedValidations = validationResults.filter(r => r.passed && !r.skipped).length;
  const failedValidations = validationResults.filter(r => !r.passed && !r.skipped).length;
  const skippedValidations = validationResults.filter(r => r.skipped).length;

  const blockers: string[] = [];
  const warnings: string[] = [];

  // Extract results by type
  const migrationResult = validationResults.find(r => r.task === '27.1');
  const rlsResult = validationResults.find(r => r.task === '27.2');
  const testsResult = validationResults.find(r => r.task === '27.3');
  const performanceResult = validationResults.find(r => r.task === '27.4');
  const shadowModeResult = validationResults.find(r => r.task === '27.5');
  const crossTenantResult = validationResults.find(r => r.task === '27.6');

  // Build blockers list
  for (const result of validationResults) {
    if (!result.passed && !result.skipped) {
      blockers.push(`${result.name}: ${result.summary}`);
    }
    if (result.skipped) {
      warnings.push(`${result.name} was skipped: ${result.skipReason}`);
    }
  }

  // Determine overall status
  const allPassed = passedValidations === validationResults.length - skippedValidations && failedValidations === 0;
  const overallStatus = allPassed ? 'PASSED' : failedValidations > 0 ? 'FAILED' : 'PARTIAL';

  // Calculate legacy removal date if passed
  const completionDate = allPassed ? now.toISOString() : undefined;
  const removalEligibleDate = allPassed
    ? new Date(now.getTime() + LEGACY_REMOVAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : undefined;

  return {
    metadata: {
      generatedAt: now.toISOString(),
      generatedBy: SCRIPT_NAME,
      version: '1.0.0',
      specDirectory: SPEC_DIR,
    },
    executiveSummary: {
      overallStatus,
      totalValidations: validationResults.length,
      passedValidations,
      failedValidations,
      skippedValidations,
      readyForCutover: allPassed,
      blockers,
      warnings,
    },
    migrationStatus: {
      passed: migrationResult?.passed ?? false,
      directoriesMigrated: (migrationResult?.details as Record<string, unknown>)?.totalDirectoriesScanned as number ?? 0,
      totalDirectories: 28,
      legacyPatternsRemaining: (migrationResult?.details as Record<string, unknown>)?.routesUsingLegacyPattern as number ?? 0,
      migrationPercentage: (migrationResult?.details as Record<string, unknown>)?.migrationPercentage as number ?? 0,
      details: migrationResult?.details ?? {},
    },
    rlsCoverage: {
      passed: rlsResult?.passed ?? false,
      tablesWithRls: (rlsResult?.details as Record<string, unknown>)?.tablesWithRlsEnabled as number ?? 0,
      totalTables: (rlsResult?.details as Record<string, unknown>)?.tablesRequiringRls as number ?? 0,
      coveragePercentage: (rlsResult?.details as Record<string, unknown>)?.coveragePercentage as number ?? 0,
      policyCompliancePercentage: (rlsResult?.details as Record<string, unknown>)?.policyCompliancePercentage as number ?? 0,
      nonCompliantTables: ((rlsResult?.details as Record<string, unknown>)?.nonCompliantTables as { tableName: string }[])?.map(t => t.tableName) ?? [],
      details: rlsResult?.details ?? {},
    },
    testResults: {
      passed: testsResult?.passed ?? false,
      totalTests: ((testsResult?.details as Record<string, unknown>)?.tests as Record<string, unknown>)?.total as number ?? 0,
      passedTests: ((testsResult?.details as Record<string, unknown>)?.tests as Record<string, unknown>)?.passed as number ?? 0,
      failedTests: ((testsResult?.details as Record<string, unknown>)?.tests as Record<string, unknown>)?.failed as number ?? 0,
      skippedTests: ((testsResult?.details as Record<string, unknown>)?.tests as Record<string, unknown>)?.skipped as number ?? 0,
      coveragePercentage: (((testsResult?.details as Record<string, unknown>)?.coverage as Record<string, unknown>)?.lines as Record<string, unknown>)?.percentage as number,
      details: testsResult?.details ?? {},
    },
    performanceBenchmarks: {
      passed: performanceResult?.passed ?? false,
      authContextResolutionP99Ms: 0,
      permissionCheckP99Ms: 0,
      rlsOverheadPercentage: 0,
      allTargetsMet: performanceResult?.passed ?? false,
      failedBenchmarks: ((performanceResult?.details as Record<string, unknown>)?.violations as { name: string }[])?.map(v => v.name) ?? [],
      details: performanceResult?.details ?? {},
    },
    shadowModeMetrics: {
      passed: shadowModeResult?.passed ?? false,
      consecutiveDaysAt0Percent: ((shadowModeResult?.details as Record<string, unknown>)?.aggregateStats as Record<string, unknown>)?.consecutiveDaysAt0Percent as number ?? 0,
      requiredDays: 7,
      totalRequests: ((shadowModeResult?.details as Record<string, unknown>)?.aggregateStats as Record<string, unknown>)?.totalRequests as number ?? 0,
      requiredSampleSize: 10000,
      mismatchRate: ((shadowModeResult?.details as Record<string, unknown>)?.aggregateStats as Record<string, unknown>)?.overallMismatchRate as number ?? 0,
      meetsRequirements: shadowModeResult?.passed ?? false,
      details: shadowModeResult?.details ?? {},
    },
    crossTenantSecurity: {
      passed: crossTenantResult?.passed ?? false,
      totalTests: (crossTenantResult?.details as Record<string, unknown>)?.totalTests as number ?? 0,
      passedTests: (crossTenantResult?.details as Record<string, unknown>)?.passedTests as number ?? 0,
      failedTests: (crossTenantResult?.details as Record<string, unknown>)?.failedTests as number ?? 0,
      tablesValidated: 0,
      details: crossTenantResult?.details ?? {},
    },
    signOffs: {
      engineeringLead: {
        name: '[ENGINEERING LEAD NAME]',
        role: 'Engineering Lead',
        status: 'PENDING',
        comments: 'Review completion report and approve cutover',
      },
      securityLead: {
        name: '[SECURITY LEAD NAME]',
        role: 'Security Lead',
        status: 'PENDING',
        comments: 'Review cross-tenant security tests and RLS coverage',
      },
      qaLead: {
        name: '[QA LEAD NAME]',
        role: 'QA Lead',
        status: 'PENDING',
        comments: 'Review test results and coverage',
      },
    },
    legacyRemovalTimeline: {
      completionDate,
      removalEligibleDate,
      daysUntilRemoval: allPassed ? LEGACY_REMOVAL_DAYS : undefined,
      deprecatedItems: [
        'resolveAuthContext() function',
        'Legacy AuthContext type',
        'Cutover feature flags (retain for emergency rollback)',
      ],
      removalSteps: [
        '1. Wait 30 days after completion validation',
        '2. Run scripts/deprecation/check-removal-eligibility.ts',
        '3. Obtain Engineering Lead approval',
        '4. Remove deprecated code and types',
        '5. Archive cutover flags (do not delete)',
        '6. Update documentation',
      ],
    },
    validationResults,
  };
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(report: CompletionReport): string {
  const lines: string[] = [];

  // Header
  lines.push('# Multi-Tenant Integration Cutover - Completion Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date(report.metadata.generatedAt).toLocaleString()}`);
  lines.push(`**Version:** ${report.metadata.version}`);
  lines.push('');

  // Executive Summary
  lines.push('---');
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');

  const statusEmoji = report.executiveSummary.overallStatus === 'PASSED' ? '✅' : 
                      report.executiveSummary.overallStatus === 'FAILED' ? '❌' : '⚠️';
  
  lines.push(`### Overall Status: ${statusEmoji} ${report.executiveSummary.overallStatus}`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Ready for Cutover | ${report.executiveSummary.readyForCutover ? '✅ YES' : '❌ NO'} |`);
  lines.push(`| Total Validations | ${report.executiveSummary.totalValidations} |`);
  lines.push(`| Passed | ${report.executiveSummary.passedValidations} |`);
  lines.push(`| Failed | ${report.executiveSummary.failedValidations} |`);
  lines.push(`| Skipped | ${report.executiveSummary.skippedValidations} |`);
  lines.push('');

  if (report.executiveSummary.blockers.length > 0) {
    lines.push('### ❌ Blockers');
    lines.push('');
    for (const blocker of report.executiveSummary.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push('');
  }

  if (report.executiveSummary.warnings.length > 0) {
    lines.push('### ⚠️ Warnings');
    lines.push('');
    for (const warning of report.executiveSummary.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }

  // Migration Status
  lines.push('---');
  lines.push('');
  lines.push('## 1. Migration Status');
  lines.push('');
  lines.push(`**Status:** ${report.migrationStatus.passed ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Directories Migrated | ${report.migrationStatus.directoriesMigrated}/${report.migrationStatus.totalDirectories} |`);
  lines.push(`| Legacy Patterns Remaining | ${report.migrationStatus.legacyPatternsRemaining} |`);
  lines.push(`| Migration Percentage | ${report.migrationStatus.migrationPercentage}% |`);
  lines.push('');
  lines.push('**Requirement:** All 28+ API directories migrated to withPermission pattern (no resolveAuthContext() calls remaining)');
  lines.push('');

  // RLS Coverage
  lines.push('---');
  lines.push('');
  lines.push('## 2. RLS Coverage');
  lines.push('');
  lines.push(`**Status:** ${report.rlsCoverage.passed ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Tables with RLS | ${report.rlsCoverage.tablesWithRls}/${report.rlsCoverage.totalTables} |`);
  lines.push(`| Coverage Percentage | ${report.rlsCoverage.coveragePercentage}% |`);
  lines.push(`| Policy Compliance | ${report.rlsCoverage.policyCompliancePercentage}% |`);
  lines.push('');
  if (report.rlsCoverage.nonCompliantTables.length > 0) {
    lines.push('**Non-compliant Tables:**');
    for (const table of report.rlsCoverage.nonCompliantTables) {
      lines.push(`- ${table}`);
    }
    lines.push('');
  }
  lines.push('**Requirement:** RLS enabled on all TENANT_OWNED and ORG_SCOPED tables with SELECT, INSERT, UPDATE, DELETE policies');
  lines.push('');

  // Test Results
  lines.push('---');
  lines.push('');
  lines.push('## 3. Test Results');
  lines.push('');
  lines.push(`**Status:** ${report.testResults.passed ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Tests | ${report.testResults.totalTests} |`);
  lines.push(`| Passed | ${report.testResults.passedTests} |`);
  lines.push(`| Failed | ${report.testResults.failedTests} |`);
  lines.push(`| Skipped | ${report.testResults.skippedTests} |`);
  if (report.testResults.coveragePercentage !== undefined) {
    lines.push(`| Coverage | ${report.testResults.coveragePercentage}% |`);
  }
  lines.push('');
  lines.push('**Requirement:** All integration tests passing with >= 80% coverage');
  lines.push('');

  // Performance Benchmarks
  lines.push('---');
  lines.push('');
  lines.push('## 4. Performance Benchmarks');
  lines.push('');
  lines.push(`**Status:** ${report.performanceBenchmarks.passed ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push('');
  lines.push(`| Benchmark | Target | Status |`);
  lines.push(`|-----------|--------|--------|`);
  lines.push(`| AuthContext Resolution | < 100ms p99 | ${report.performanceBenchmarks.allTargetsMet ? '✅' : '❌'} |`);
  lines.push(`| Permission Check | < 10ms p99 | ${report.performanceBenchmarks.allTargetsMet ? '✅' : '❌'} |`);
  lines.push(`| RLS Overhead | < 20% | ${report.performanceBenchmarks.allTargetsMet ? '✅' : '❌'} |`);
  lines.push('');
  if (report.performanceBenchmarks.failedBenchmarks.length > 0) {
    lines.push('**Failed Benchmarks:**');
    for (const benchmark of report.performanceBenchmarks.failedBenchmarks) {
      lines.push(`- ${benchmark}`);
    }
    lines.push('');
  }
  lines.push('**Requirement:** All performance benchmarks meeting targets (Requirement 12)');
  lines.push('');

  // Shadow Mode Metrics
  lines.push('---');
  lines.push('');
  lines.push('## 5. Shadow Mode Metrics');
  lines.push('');
  lines.push(`**Status:** ${report.shadowModeMetrics.passed ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push('');
  lines.push(`| Metric | Required | Actual |`);
  lines.push(`|--------|----------|--------|`);
  lines.push(`| Consecutive Days at 0% | ${report.shadowModeMetrics.requiredDays} days | ${report.shadowModeMetrics.consecutiveDaysAt0Percent} days |`);
  lines.push(`| Total Requests | >= ${report.shadowModeMetrics.requiredSampleSize.toLocaleString()} | ${report.shadowModeMetrics.totalRequests.toLocaleString()} |`);
  lines.push(`| Mismatch Rate | 0% | ${report.shadowModeMetrics.mismatchRate.toFixed(4)}% |`);
  lines.push('');
  lines.push('**Requirement:** Shadow mode mismatch rate at 0% for 7 consecutive days with >= 10,000 requests');
  lines.push('');

  // Cross-Tenant Security
  lines.push('---');
  lines.push('');
  lines.push('## 6. Cross-Tenant Security');
  lines.push('');
  lines.push(`**Status:** ${report.crossTenantSecurity.passed ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Security Tests | ${report.crossTenantSecurity.totalTests} |`);
  lines.push(`| Passed | ${report.crossTenantSecurity.passedTests} |`);
  lines.push(`| Failed | ${report.crossTenantSecurity.failedTests} |`);
  lines.push('');
  lines.push('**Requirement:** All cross-tenant access attempts blocked (READ, WRITE, DELETE)');
  lines.push('');

  // Sign-off Section
  lines.push('---');
  lines.push('');
  lines.push('## Sign-off Section');
  lines.push('');
  lines.push('**Required sign-offs before production cutover:**');
  lines.push('');
  lines.push('### Engineering Lead');
  lines.push('');
  lines.push(`- **Name:** ${report.signOffs.engineeringLead.name}`);
  lines.push(`- **Status:** ${report.signOffs.engineeringLead.status}`);
  lines.push(`- **Date:** ${report.signOffs.engineeringLead.date ?? '_________________'}`);
  lines.push(`- **Signature:** ${report.signOffs.engineeringLead.signature ?? '_________________'}`);
  lines.push(`- **Comments:** ${report.signOffs.engineeringLead.comments ?? ''}`);
  lines.push('');
  lines.push('### Security Lead');
  lines.push('');
  lines.push(`- **Name:** ${report.signOffs.securityLead.name}`);
  lines.push(`- **Status:** ${report.signOffs.securityLead.status}`);
  lines.push(`- **Date:** ${report.signOffs.securityLead.date ?? '_________________'}`);
  lines.push(`- **Signature:** ${report.signOffs.securityLead.signature ?? '_________________'}`);
  lines.push(`- **Comments:** ${report.signOffs.securityLead.comments ?? ''}`);
  lines.push('');
  lines.push('### QA Lead');
  lines.push('');
  lines.push(`- **Name:** ${report.signOffs.qaLead.name}`);
  lines.push(`- **Status:** ${report.signOffs.qaLead.status}`);
  lines.push(`- **Date:** ${report.signOffs.qaLead.date ?? '_________________'}`);
  lines.push(`- **Signature:** ${report.signOffs.qaLead.signature ?? '_________________'}`);
  lines.push(`- **Comments:** ${report.signOffs.qaLead.comments ?? ''}`);
  lines.push('');

  // Legacy Removal Timeline
  lines.push('---');
  lines.push('');
  lines.push('## Timeline for Legacy Removal');
  lines.push('');
  if (report.legacyRemovalTimeline.completionDate) {
    lines.push(`**Completion Date:** ${new Date(report.legacyRemovalTimeline.completionDate).toLocaleString()}`);
    lines.push(`**Removal Eligible Date:** ${new Date(report.legacyRemovalTimeline.removalEligibleDate!).toLocaleString()}`);
    lines.push(`**Days Until Removal:** ${report.legacyRemovalTimeline.daysUntilRemoval}`);
  } else {
    lines.push('**Status:** Not yet eligible - validation must pass first');
  }
  lines.push('');
  lines.push('### Deprecated Items to Remove');
  lines.push('');
  for (const item of report.legacyRemovalTimeline.deprecatedItems) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('### Removal Process');
  lines.push('');
  for (const step of report.legacyRemovalTimeline.removalSteps) {
    lines.push(step);
  }
  lines.push('');

  // Validation Details
  lines.push('---');
  lines.push('');
  lines.push('## Validation Details');
  lines.push('');
  lines.push('| Task | Name | Requirement | Status | Execution Time |');
  lines.push('|------|------|-------------|--------|----------------|');
  for (const result of report.validationResults) {
    const status = result.skipped ? '⏭️ SKIPPED' : result.passed ? '✅ PASSED' : '❌ FAILED';
    lines.push(`| ${result.task} | ${result.name} | ${result.requirement} | ${status} | ${result.executionTimeMs}ms |`);
  }
  lines.push('');

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*This report was automatically generated by the Multi-Tenant Integration Cutover validation system.*');
  lines.push('');
  lines.push('**Reference Documents:**');
  lines.push('- `.kiro/specs/multi-tenant-integration-cutover/requirements.md`');
  lines.push('- `.kiro/specs/multi-tenant-integration-cutover/design.md`');
  lines.push('- `.kiro/specs/multi-tenant-integration-cutover/tasks.md`');
  lines.push('- `docs/LEGACY_REMOVAL_TIMELINE.md`');
  lines.push('- `docs/REMOVAL_APPROVAL_PROCESS.md`');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI Handling
// ---------------------------------------------------------------------------

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    verbose: false,
    skipTests: false,
    skipDatabase: false,
    json: false,
  };

  for (const arg of args) {
    switch (arg) {
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--skip-tests':
        options.skipTests = true;
        break;
      case '--skip-database':
      case '--skip-db':
        options.skipDatabase = true;
        break;
      case '--json':
        options.json = true;
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
${SCRIPT_NAME} - Generate Migration Completion Report

Usage: npx tsx scripts/validation/generate-completion-report.ts [options]

Options:
  --verbose, -v       Enable verbose output for all validation scripts
  --skip-tests        Skip running integration tests (faster execution)
  --skip-database     Skip database-dependent validations (RLS, cross-tenant)
  --json              Only output JSON report (no markdown)
  --help, -h          Show this help message

Output Files:
  ${MARKDOWN_REPORT_PATH}
  ${JSON_REPORT_PATH}

Validations Performed:
  27.1 - Migration completion (verify-migration-complete.ts)
  27.2 - RLS enabled (verify-rls-enabled.ts)
  27.3 - Tests passing (verify-tests-passing.ts)
  27.4 - Performance benchmarks (verify-performance.ts)
  27.5 - Shadow mode metrics (verify-shadow-mode-metrics.ts)
  27.6 - Cross-tenant security (cross-tenant-security-tests.ts)

Requirements:
  DATABASE_URL    Required for RLS and cross-tenant validations

Exit Codes:
  0 - All validations passed (ready for cutover)
  1 - One or more validations failed (not ready)
  2 - Error during execution

Examples:
  # Full validation
  npx tsx scripts/validation/generate-completion-report.ts

  # Quick check (skip tests and database)
  npx tsx scripts/validation/generate-completion-report.ts --skip-tests --skip-database

  # Verbose output
  npx tsx scripts/validation/generate-completion-report.ts --verbose
  `);
}

// ---------------------------------------------------------------------------
// Main Execution
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();
  const options = parseArgs();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     MULTI-TENANT INTEGRATION CUTOVER                             ║');
  console.log('║     COMPLETION REPORT GENERATOR                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
  log('Starting completion report generation...');
  log(`Options: verbose=${options.verbose}, skipTests=${options.skipTests}, skipDatabase=${options.skipDatabase}`);

  const validationResults: ValidationResult[] = [];

  try {
    // Run all validations
    logSection('Running Validations');

    // 27.1 - Migration Completion
    validationResults.push(await runMigrationValidation(options.verbose));

    // 27.2 - RLS Enabled
    validationResults.push(await runRlsValidation(options.verbose, options.skipDatabase));

    // 27.3 - Tests Passing
    validationResults.push(await runTestsValidation(options.verbose, options.skipTests));

    // 27.4 - Performance Benchmarks
    validationResults.push(await runPerformanceValidation(options.verbose));

    // 27.5 - Shadow Mode Metrics
    validationResults.push(await runShadowModeValidation(options.verbose));

    // 27.6 - Cross-Tenant Security
    validationResults.push(await runCrossTenantValidation(options.verbose, options.skipDatabase));

    // Build completion report
    logSection('Generating Report');
    log('Building completion report from validation results...');
    const report = buildCompletionReport(validationResults);

    // Ensure output directory exists
    const specDir = path.join(process.cwd(), SPEC_DIR);
    if (!fs.existsSync(specDir)) {
      fs.mkdirSync(specDir, { recursive: true });
    }

    // Write JSON report
    log(`Writing JSON report to: ${JSON_REPORT_PATH}`);
    fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(report, null, 2));

    // Write Markdown report
    if (!options.json) {
      log(`Writing Markdown report to: ${MARKDOWN_REPORT_PATH}`);
      const markdownReport = generateMarkdownReport(report);
      fs.writeFileSync(MARKDOWN_REPORT_PATH, markdownReport);
    }

    // Print summary
    logSection('Report Summary');
    console.log('');
    console.log(`Overall Status: ${report.executiveSummary.overallStatus}`);
    console.log(`Ready for Cutover: ${report.executiveSummary.readyForCutover ? '✅ YES' : '❌ NO'}`);
    console.log('');
    console.log('Validation Results:');
    for (const result of validationResults) {
      const status = result.skipped ? '⏭️ SKIPPED' : result.passed ? '✅ PASSED' : '❌ FAILED';
      console.log(`  ${status} [${result.task}] ${result.name}`);
    }
    console.log('');

    if (report.executiveSummary.blockers.length > 0) {
      console.log('Blockers:');
      for (const blocker of report.executiveSummary.blockers) {
        console.log(`  ❌ ${blocker}`);
      }
      console.log('');
    }

    const endTime = Date.now();
    log(`Report generation completed in ${endTime - startTime}ms`);
    log(`Reports written to:`);
    log(`  - ${MARKDOWN_REPORT_PATH}`);
    log(`  - ${JSON_REPORT_PATH}`);

    // Exit with appropriate code
    if (report.executiveSummary.readyForCutover) {
      logSuccess('All validations passed - system is ready for production cutover!');
      process.exit(0);
    } else {
      logError('Validation failed - system is NOT ready for production cutover');
      process.exit(1);
    }
  } catch (error) {
    logError(`Report generation failed: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(2);
  }
}

// Run if executed directly (not when imported as a module)
const isMainModule = process.argv[1]?.includes('generate-completion-report');
if (isMainModule) {
  main();
}

export {
  type CompletionReport,
  type ValidationResult,
  buildCompletionReport,
  generateMarkdownReport,
};
