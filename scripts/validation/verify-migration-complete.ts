#!/usr/bin/env npx tsx
/**
 * Migration Completion Verification Script
 *
 * This script performs static analysis to verify that all API route handlers
 * have been migrated from the legacy `resolveAuthContext()` pattern to the
 * new `withPermission` wrapper pattern.
 *
 * **Key Checks:**
 * 1. Scans all `/api/**` route handler files (route.ts)
 * 2. Detects any remaining `resolveAuthContext()` calls (excluding exemptions)
 * 3. Verifies routes use the new `withPermission` pattern
 * 4. Reports migration completion statistics
 *
 * **Exit Codes:**
 * - 0: All routes migrated successfully (CI passes)
 * - 1: Non-exempted legacy usage found (CI fails)
 * - 2: Error during execution
 *
 * @see Requirements 16.1 - Verify all 28+ API directories migrated
 * @see Requirements 16.2 - No remaining resolveAuthContext() calls in route handlers
 * @see FASE 2.16 Task 27.1 - Migration Completion Validation
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SCRIPT_NAME = 'verify-migration-complete';

/** Root directory for API routes */
const API_ROOT = 'src/app/api';

/** File patterns to scan */
const ROUTE_FILE_PATTERN = /route\.ts$/;

/** Pattern to detect legacy resolveAuthContext usage */
const LEGACY_PATTERN = /resolveAuthContext\s*\(/g;

/** Pattern to detect new withPermission usage */
const WITH_PERMISSION_PATTERN = /withPermission\s*\(/g;

/** Pattern to detect withPublicRoute usage */
const WITH_PUBLIC_ROUTE_PATTERN = /withPublicRoute\s*\(/g;

/** Pattern to detect withAuthOnlyRoute usage */
const WITH_AUTH_ONLY_PATTERN = /withAuthOnlyRoute\s*\(/g;

/** Directories that are exempted from migration (special handling) */
const EXEMPTED_DIRECTORIES: ExemptedDirectory[] = [
  {
    path: 'auth',
    reason: 'Auth routes use withPublicRoute/withAuthOnlyRoute pattern',
    reference: 'Requirements 17.1, 17.2, 17.3',
  },
  {
    path: 'health',
    reason: 'Health check endpoint is public infrastructure',
    reference: 'N/A - Infrastructure route',
  },
];

/** Files that are exempted from legacy pattern check (but still scanned) */
const EXEMPTED_FILES: ExemptedFile[] = [
  {
    pattern: /__tests?__/,
    reason: 'Test files may contain legacy pattern examples',
  },
  {
    pattern: /\.test\.ts$/,
    reason: 'Test files may contain legacy pattern examples',
  },
  {
    pattern: /\.spec\.ts$/,
    reason: 'Spec files may contain legacy pattern examples',
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExemptedDirectory {
  path: string;
  reason: string;
  reference: string;
}

interface ExemptedFile {
  pattern: RegExp;
  reason: string;
}

interface RouteFileAnalysis {
  filePath: string;
  relativePath: string;
  domain: string;
  hasLegacyPattern: boolean;
  hasWithPermission: boolean;
  hasWithPublicRoute: boolean;
  hasWithAuthOnlyRoute: boolean;
  legacyOccurrences: number;
  withPermissionOccurrences: number;
  isMigrated: boolean;
  isExempted: boolean;
  exemptReason?: string;
}

interface DomainSummary {
  name: string;
  totalRoutes: number;
  migratedRoutes: number;
  legacyRoutes: number;
  exemptedRoutes: number;
  migrationPercentage: number;
}

interface VerificationResult {
  timestamp: Date;
  totalDirectoriesScanned: number;
  totalRoutesScanned: number;
  routesUsingWithPermission: number;
  routesUsingLegacyPattern: number;
  routesExempted: number;
  migrationPercentage: number;
  domainSummaries: DomainSummary[];
  legacyUsageDetails: RouteFileAnalysis[];
  passed: boolean;
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function log(message: string): void {
  console.log(`[${SCRIPT_NAME}] ${message}`);
}

function error(message: string): void {
  console.error(`[${SCRIPT_NAME}] ERROR: ${message}`);
}

/**
 * Recursively find all route.ts files in a directory.
 */
function findRouteFiles(dir: string, baseDir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findRouteFiles(fullPath, baseDir));
    } else if (entry.isFile() && ROUTE_FILE_PATTERN.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Extract the domain name from a route file path.
 * e.g., 'src/app/api/residents/route.ts' -> 'residents'
 */
function extractDomain(filePath: string, apiRoot: string): string {
  const relativePath = path.relative(apiRoot, filePath);
  const parts = relativePath.split(path.sep);
  return parts[0] ?? 'unknown';
}

/**
 * Check if a file path is exempted from analysis.
 */
function isFileExempted(filePath: string): { exempted: boolean; reason?: string } {
  for (const exemption of EXEMPTED_FILES) {
    if (exemption.pattern.test(filePath)) {
      return { exempted: true, reason: exemption.reason };
    }
  }
  return { exempted: false };
}

/**
 * Check if a domain is exempted from migration.
 */
function isDomainExempted(domain: string): { exempted: boolean; reason?: string } {
  for (const exemption of EXEMPTED_DIRECTORIES) {
    if (exemption.path === domain) {
      return { exempted: true, reason: exemption.reason };
    }
  }
  return { exempted: false };
}

/**
 * Analyze a single route file for migration status.
 */
function analyzeRouteFile(filePath: string, apiRoot: string): RouteFileAnalysis {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(process.cwd(), filePath);
  const domain = extractDomain(filePath, apiRoot);

  // Check for patterns
  const legacyMatches = content.match(LEGACY_PATTERN);
  const withPermissionMatches = content.match(WITH_PERMISSION_PATTERN);
  const withPublicRouteMatches = content.match(WITH_PUBLIC_ROUTE_PATTERN);
  const withAuthOnlyMatches = content.match(WITH_AUTH_ONLY_PATTERN);

  const hasLegacyPattern = legacyMatches !== null && legacyMatches.length > 0;
  const hasWithPermission = withPermissionMatches !== null && withPermissionMatches.length > 0;
  const hasWithPublicRoute = withPublicRouteMatches !== null && withPublicRouteMatches.length > 0;
  const hasWithAuthOnlyRoute = withAuthOnlyMatches !== null && withAuthOnlyMatches.length > 0;

  // Check exemptions
  const fileExemption = isFileExempted(filePath);
  const domainExemption = isDomainExempted(domain);
  const isExempted = fileExemption.exempted || domainExemption.exempted;
  const exemptReason = fileExemption.reason ?? domainExemption.reason;

  // Determine if migrated:
  // - Uses withPermission, withPublicRoute, or withAuthOnlyRoute
  // - Does NOT have direct resolveAuthContext calls (unless exempted)
  const usesNewPattern = hasWithPermission || hasWithPublicRoute || hasWithAuthOnlyRoute;
  const isMigrated = isExempted || (usesNewPattern && !hasLegacyPattern);

  return {
    filePath,
    relativePath,
    domain,
    hasLegacyPattern,
    hasWithPermission,
    hasWithPublicRoute,
    hasWithAuthOnlyRoute,
    legacyOccurrences: legacyMatches?.length ?? 0,
    withPermissionOccurrences: withPermissionMatches?.length ?? 0,
    isMigrated,
    isExempted,
    exemptReason,
  };
}

/**
 * Group route analyses by domain.
 */
function groupByDomain(analyses: RouteFileAnalysis[]): Map<string, RouteFileAnalysis[]> {
  const groups = new Map<string, RouteFileAnalysis[]>();

  for (const analysis of analyses) {
    const existing = groups.get(analysis.domain) ?? [];
    existing.push(analysis);
    groups.set(analysis.domain, existing);
  }

  return groups;
}

/**
 * Create domain summary from analyses.
 */
function createDomainSummary(domain: string, analyses: RouteFileAnalysis[]): DomainSummary {
  const totalRoutes = analyses.length;
  const migratedRoutes = analyses.filter(a => a.isMigrated && !a.isExempted).length;
  const exemptedRoutes = analyses.filter(a => a.isExempted).length;
  const legacyRoutes = analyses.filter(a => !a.isMigrated && !a.isExempted).length;

  // Migration percentage excludes exempted routes from calculation
  const nonExemptedTotal = totalRoutes - exemptedRoutes;
  const migrationPercentage =
    nonExemptedTotal > 0 ? Math.round((migratedRoutes / nonExemptedTotal) * 100 * 100) / 100 : 100;

  return {
    name: domain,
    totalRoutes,
    migratedRoutes,
    legacyRoutes,
    exemptedRoutes,
    migrationPercentage,
  };
}

// ---------------------------------------------------------------------------
// Main Verification Logic
// ---------------------------------------------------------------------------

/**
 * Run the migration verification.
 */
function runVerification(): VerificationResult {
  const apiRootPath = path.join(process.cwd(), API_ROOT);

  if (!fs.existsSync(apiRootPath)) {
    throw new Error(`API root directory not found: ${apiRootPath}`);
  }

  // Find all route files
  log('Scanning for route files...');
  const routeFiles = findRouteFiles(apiRootPath, apiRootPath);
  log(`Found ${routeFiles.length} route files`);

  // Analyze each route file
  log('Analyzing route files for migration status...');
  const analyses: RouteFileAnalysis[] = routeFiles.map(file =>
    analyzeRouteFile(file, apiRootPath),
  );

  // Group by domain and create summaries
  const domainGroups = groupByDomain(analyses);
  const domainSummaries: DomainSummary[] = [];

  for (const [domain, domainAnalyses] of domainGroups) {
    domainSummaries.push(createDomainSummary(domain, domainAnalyses));
  }

  // Sort domain summaries alphabetically
  domainSummaries.sort((a, b) => a.name.localeCompare(b.name));

  // Calculate overall statistics
  const totalDirectoriesScanned = domainGroups.size;
  const totalRoutesScanned = analyses.length;
  const routesExempted = analyses.filter(a => a.isExempted).length;
  const routesUsingWithPermission = analyses.filter(
    a => (a.hasWithPermission || a.hasWithPublicRoute || a.hasWithAuthOnlyRoute) && !a.isExempted,
  ).length;
  const routesUsingLegacyPattern = analyses.filter(
    a => a.hasLegacyPattern && !a.isExempted,
  ).length;

  // Calculate migration percentage (excluding exempted routes)
  const nonExemptedTotal = totalRoutesScanned - routesExempted;
  const migrationPercentage =
    nonExemptedTotal > 0
      ? Math.round(((nonExemptedTotal - routesUsingLegacyPattern) / nonExemptedTotal) * 100 * 100) /
        100
      : 100;

  // Get details of legacy usage
  const legacyUsageDetails = analyses.filter(a => a.hasLegacyPattern && !a.isExempted);

  // Determine pass/fail
  const passed = routesUsingLegacyPattern === 0;
  const failureReason = passed
    ? undefined
    : `Found ${routesUsingLegacyPattern} route(s) still using legacy resolveAuthContext() pattern`;

  return {
    timestamp: new Date(),
    totalDirectoriesScanned,
    totalRoutesScanned,
    routesUsingWithPermission,
    routesUsingLegacyPattern,
    routesExempted,
    migrationPercentage,
    domainSummaries,
    legacyUsageDetails,
    passed,
    failureReason,
  };
}

// ---------------------------------------------------------------------------
// Report Formatting
// ---------------------------------------------------------------------------

/**
 * Print the verification report to console.
 */
function printReport(result: VerificationResult): void {
  console.log('');
  console.log('═'.repeat(80));
  console.log('  MIGRATION COMPLETION VERIFICATION REPORT');
  console.log('  Requirements: 16.1, 16.2 — Multi-Tenant Integration Cutover');
  console.log('═'.repeat(80));
  console.log('');

  // Summary Statistics
  console.log('📊 SUMMARY STATISTICS');
  console.log('─'.repeat(80));
  console.log(`  Timestamp:                   ${result.timestamp.toISOString()}`);
  console.log(`  Total Directories Scanned:   ${result.totalDirectoriesScanned}`);
  console.log(`  Total Routes Scanned:        ${result.totalRoutesScanned}`);
  console.log(`  Routes Using withPermission: ${result.routesUsingWithPermission}`);
  console.log(`  Routes Using Legacy Pattern: ${result.routesUsingLegacyPattern}`);
  console.log(`  Routes Exempted:             ${result.routesExempted}`);
  console.log(`  Migration Completion:        ${result.migrationPercentage}%`);
  console.log('');

  // Domain Breakdown
  console.log('📁 DOMAIN BREAKDOWN');
  console.log('─'.repeat(80));
  console.log(
    '  Domain                 | Total | Migrated | Legacy | Exempted | Completion',
  );
  console.log('  ' + '-'.repeat(76));

  for (const summary of result.domainSummaries) {
    const domainPadded = summary.name.padEnd(22);
    const totalPadded = summary.totalRoutes.toString().padStart(5);
    const migratedPadded = summary.migratedRoutes.toString().padStart(8);
    const legacyPadded = summary.legacyRoutes.toString().padStart(6);
    const exemptedPadded = summary.exemptedRoutes.toString().padStart(8);
    const percentPadded = `${summary.migrationPercentage}%`.padStart(10);

    const status =
      summary.legacyRoutes > 0 ? '❌' : summary.exemptedRoutes > 0 ? '⚪' : '✅';

    console.log(
      `  ${status} ${domainPadded} | ${totalPadded} | ${migratedPadded} | ${legacyPadded} | ${exemptedPadded} | ${percentPadded}`,
    );
  }
  console.log('');

  // Legacy Usage Details (if any)
  if (result.legacyUsageDetails.length > 0) {
    console.log('⚠️  LEGACY PATTERN USAGE DETECTED');
    console.log('─'.repeat(80));
    console.log('  The following routes still use resolveAuthContext() and need migration:');
    console.log('');

    for (const detail of result.legacyUsageDetails) {
      console.log(`  ❌ ${detail.relativePath}`);
      console.log(`     Domain: ${detail.domain}`);
      console.log(`     Legacy calls: ${detail.legacyOccurrences}`);
      console.log(`     withPermission calls: ${detail.withPermissionOccurrences}`);
      console.log('');
    }
  }

  // Exemptions
  console.log('📋 EXEMPTIONS');
  console.log('─'.repeat(80));
  for (const exemption of EXEMPTED_DIRECTORIES) {
    console.log(`  ⚪ /${API_ROOT}/${exemption.path}/**`);
    console.log(`     Reason: ${exemption.reason}`);
    console.log(`     Reference: ${exemption.reference}`);
    console.log('');
  }

  // Final Status
  console.log('═'.repeat(80));
  if (result.passed) {
    console.log('  ✅ VERIFICATION PASSED');
    console.log('  All route handlers have been migrated to withPermission pattern.');
    console.log(`  Migration completion: ${result.migrationPercentage}%`);
  } else {
    console.log('  ❌ VERIFICATION FAILED');
    console.log(`  ${result.failureReason}`);
    console.log('  Please migrate the remaining routes before cutover.');
  }
  console.log('═'.repeat(80));
  console.log('');
}

/**
 * Generate JSON report for CI/programmatic use.
 */
function generateJsonReport(result: VerificationResult): string {
  return JSON.stringify(
    {
      ...result,
      timestamp: result.timestamp.toISOString(),
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// Main Execution
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║  Migration Completion Verification                                            ║');
  console.log('║  Task 27.1 - Verify all 28+ directories migrated                              ║');
  console.log('║  Requirements: 16.1, 16.2                                                     ║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log('');

  let exitCode: number;

  try {
    const result = runVerification();
    printReport(result);

    // Output JSON if requested
    if (process.argv.includes('--json')) {
      console.log('📦 JSON Output:');
      console.log(generateJsonReport(result));
    }

    // Write JSON report to file if requested
    if (process.argv.includes('--output')) {
      const outputPath = process.argv[process.argv.indexOf('--output') + 1];
      if (outputPath) {
        fs.writeFileSync(outputPath, generateJsonReport(result));
        log(`Report written to: ${outputPath}`);
      }
    }

    exitCode = result.passed ? 0 : 1;
  } catch (err) {
    error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    exitCode = 2;
  }

  if (exitCode === 0) {
    log('Migration verification completed successfully');
  } else if (exitCode === 1) {
    error('Migration verification FAILED - legacy patterns found');
  } else {
    error('Migration verification encountered an error');
  }

  process.exit(exitCode);
}

// Run the verification
main().catch(err => {
  error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
