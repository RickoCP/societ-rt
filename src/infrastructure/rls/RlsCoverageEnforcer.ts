/**
 * RLS Coverage Enforcer
 *
 * Service for enforcing RLS coverage across all database tables.
 * Provides CI enforcement and periodic audit capabilities.
 *
 * This service validates that:
 * - All database tables are explicitly classified
 * - Tables with tenant_id have corresponding RLS policies
 * - New tables fail CI if added without classification
 *
 * @see FASE 1.12 Task 31: RLS Coverage Enforcement
 * @see Requirement 60: RLS Connection Pool Safety & Coverage Enforcement (AC 4-8)
 */

import {
  type ITableClassificationRegistry,
  createTableClassificationRegistry,
} from './TableClassificationRegistry';
import { type RlsCoverageResult } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of an RLS coverage enforcement check.
 */
export interface RlsEnforcementResult {
  /** Whether all tables are classified (CI should pass) */
  readonly passed: boolean;
  /** Total count of tables in the database schema */
  readonly totalTablesInSchema: number;
  /** Count of classified tables */
  readonly classifiedTablesCount: number;
  /** Count of unclassified tables */
  readonly unclassifiedTablesCount: number;
  /** List of unclassified table names (CI failure reason) */
  readonly unclassifiedTables: readonly string[];
  /** Tables requiring RLS policies */
  readonly tablesRequiringRls: readonly string[];
  /** Tables excluded from RLS */
  readonly tablesExcludedFromRls: readonly string[];
  /** Coverage percentage (classified / total) */
  readonly coveragePercentage: number;
  /** Timestamp of the check */
  readonly checkedAt: Date;
  /** Human-readable summary */
  readonly summary: string;
  /** Detailed messages for logging */
  readonly messages: readonly string[];
}

/**
 * Periodic audit result for RLS coverage gaps.
 */
export interface RlsAuditResult {
  /** Whether the audit found any gaps */
  readonly hasGaps: boolean;
  /** Coverage percentage */
  readonly coveragePercentage: number;
  /** Tables with tenant_id but missing from registry */
  readonly unclassifiedTenantTables: readonly string[];
  /** Tables classified as requiring RLS */
  readonly tablesWithRls: readonly string[];
  /** Tables classified as excluded from RLS */
  readonly tablesWithoutRls: readonly string[];
  /** Audit timestamp */
  readonly auditedAt: Date;
  /** Gap descriptions for alerting */
  readonly gaps: readonly RlsCoverageGap[];
}

/**
 * A coverage gap identified during audit.
 */
export interface RlsCoverageGap {
  /** Type of gap */
  readonly type:
    | 'UNCLASSIFIED_TABLE'
    | 'UNCLASSIFIED_TENANT_TABLE'
    | 'MISSING_RLS_POLICY';
  /** Affected table name */
  readonly tableName: string;
  /** Human-readable description */
  readonly description: string;
  /** Severity level */
  readonly severity: 'CRITICAL' | 'WARNING' | 'INFO';
}

/**
 * Dependencies for RlsCoverageEnforcer.
 */
export interface RlsCoverageEnforcerDeps {
  /** Table classification registry */
  readonly registry: ITableClassificationRegistry;
}

/**
 * RLS Coverage Enforcer service interface.
 */
export interface IRlsCoverageEnforcer {
  /**
   * Check RLS coverage for CI enforcement.
   *
   * This method should be called during CI to validate that all database
   * tables are classified. Returns enforcement result with pass/fail status.
   *
   * @param actualTables - List of actual table names from database schema
   * @returns Enforcement result with pass/fail and details
   */
  checkCoverage(actualTables: readonly string[]): RlsEnforcementResult;

  /**
   * Run periodic audit for coverage gaps.
   *
   * This method performs a more detailed audit including checking for
   * tables that might have tenant_id columns but are not classified.
   *
   * @param actualTables - List of actual table names from database schema
   * @param tenantIdTables - Optional list of tables known to have tenant_id column
   * @returns Audit result with gap details
   */
  runAudit(
    actualTables: readonly string[],
    tenantIdTables?: readonly string[],
  ): RlsAuditResult;

  /**
   * Get the underlying coverage report from the registry.
   *
   * @param actualTables - Optional list of actual table names
   * @returns Coverage report from registry
   */
  getCoverageReport(actualTables?: readonly string[]): RlsCoverageResult;

  /**
   * Validate a single table is classified.
   *
   * @param tableName - Table name to validate
   * @returns true if classified, false otherwise
   */
  isTableClassified(tableName: string): boolean;

  /**
   * Generate CI failure message for unclassified tables.
   *
   * @param unclassifiedTables - List of unclassified tables
   * @returns Formatted error message for CI output
   */
  formatCiFailureMessage(unclassifiedTables: readonly string[]): string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * System tables to exclude from coverage checks.
 *
 * These are PostgreSQL/Prisma internal tables that don't need classification.
 */
const SYSTEM_TABLES_PATTERN = /^(_prisma_migrations|pg_|information_schema\.)/i;

/**
 * Prisma migration tracking table.
 */
const PRISMA_MIGRATIONS_TABLE = '_prisma_migrations';

/**
 * Filter out system tables that don't need classification.
 */
function filterSystemTables(tables: readonly string[]): string[] {
  return tables.filter(
    (t) =>
      !SYSTEM_TABLES_PATTERN.test(t) &&
      t.toLowerCase() !== PRISMA_MIGRATIONS_TABLE,
  );
}

/**
 * Creates an RlsCoverageEnforcer instance.
 *
 * Factory function pattern for DI container registration.
 *
 * @param deps - Dependencies for the enforcer
 * @returns RlsCoverageEnforcer instance
 *
 * @example
 * ```typescript
 * import { createRlsCoverageEnforcer } from '@infrastructure/rls';
 *
 * const enforcer = createRlsCoverageEnforcer();
 *
 * // Get actual tables from database
 * const actualTables = await getSchemaTableNames();
 *
 * // Check coverage (for CI)
 * const result = enforcer.checkCoverage(actualTables);
 * if (!result.passed) {
 *   console.error(enforcer.formatCiFailureMessage(result.unclassifiedTables));
 *   process.exit(1);
 * }
 * ```
 */
export function createRlsCoverageEnforcer(
  deps?: Partial<RlsCoverageEnforcerDeps>,
): IRlsCoverageEnforcer {
  const registry = deps?.registry ?? createTableClassificationRegistry();

  return {
    checkCoverage(actualTables: readonly string[]): RlsEnforcementResult {
      const checkedAt = new Date();
      const messages: string[] = [];

      // Filter out system tables
      const applicationTables = filterSystemTables(actualTables);
      messages.push(
        'Found ' +
          actualTables.length +
          ' total tables, ' +
          applicationTables.length +
          ' application tables after filtering system tables',
      );

      // Get coverage report from registry
      const coverageReport = registry.getCoverageReport(applicationTables);

      // Determine unclassified tables
      const unclassifiedTables = coverageReport.unclassifiedTables ?? [];
      const unclassifiedCount = unclassifiedTables.length;

      // Calculate coverage
      const classifiedCount = applicationTables.length - unclassifiedCount;
      const coveragePercentage =
        applicationTables.length > 0
          ? Math.round((classifiedCount / applicationTables.length) * 100)
          : 100;

      // Determine pass/fail
      const passed = unclassifiedCount === 0;

      // Build messages
      if (passed) {
        messages.push(
          'All ' + applicationTables.length + ' application tables are classified',
        );
        messages.push('Coverage: ' + coveragePercentage + '%');
      } else {
        messages.push('Found ' + unclassifiedCount + ' unclassified table(s)');
        for (const table of unclassifiedTables) {
          messages.push('  - ' + table);
        }
        messages.push(
          'Coverage: ' +
            coveragePercentage +
            '% (' +
            classifiedCount +
            '/' +
            applicationTables.length +
            ')',
        );
      }

      // Build summary
      const summary = passed
        ? 'RLS coverage check PASSED: All ' +
          applicationTables.length +
          ' tables classified'
        : 'RLS coverage check FAILED: ' +
          unclassifiedCount +
          ' unclassified table(s) found';

      return {
        passed,
        totalTablesInSchema: applicationTables.length,
        classifiedTablesCount: classifiedCount,
        unclassifiedTablesCount: unclassifiedCount,
        unclassifiedTables,
        tablesRequiringRls: coverageReport.tablesRequiringRls,
        tablesExcludedFromRls: coverageReport.tablesExcludedFromRls,
        coveragePercentage,
        checkedAt,
        summary,
        messages,
      };
    },

    runAudit(
      actualTables: readonly string[],
      tenantIdTables?: readonly string[],
    ): RlsAuditResult {
      const auditedAt = new Date();
      const gaps: RlsCoverageGap[] = [];

      // Filter system tables
      const applicationTables = filterSystemTables(actualTables);

      // Get coverage report
      const coverageReport = registry.getCoverageReport(applicationTables);
      const unclassifiedTables = coverageReport.unclassifiedTables ?? [];

      // Check for unclassified tables
      for (const tableName of unclassifiedTables) {
        const hasTenantId = tenantIdTables?.includes(tableName) ?? false;

        if (hasTenantId) {
          // Critical: Table has tenant_id but is not classified
          gaps.push({
            type: 'UNCLASSIFIED_TENANT_TABLE',
            tableName,
            description:
              "Table '" +
              tableName +
              "' has tenant_id column but is not classified. This may cause tenant data leakage.",
            severity: 'CRITICAL',
          });
        } else {
          // Warning: Table is not classified
          gaps.push({
            type: 'UNCLASSIFIED_TABLE',
            tableName,
            description:
              "Table '" + tableName + "' is not classified in the registry.",
            severity: 'WARNING',
          });
        }
      }

      // Find unclassified tables that are in the tenantIdTables list
      const unclassifiedTenantTables = tenantIdTables
        ? tenantIdTables.filter(
            (t) =>
              !registry.isClassified(t) &&
              !SYSTEM_TABLES_PATTERN.test(t) &&
              t.toLowerCase() !== PRISMA_MIGRATIONS_TABLE,
          )
        : [];

      // Calculate coverage
      const classifiedCount =
        applicationTables.length - unclassifiedTables.length;
      const coveragePercentage =
        applicationTables.length > 0
          ? Math.round((classifiedCount / applicationTables.length) * 100)
          : 100;

      return {
        hasGaps: gaps.length > 0,
        coveragePercentage,
        unclassifiedTenantTables,
        tablesWithRls: coverageReport.tablesRequiringRls,
        tablesWithoutRls: coverageReport.tablesExcludedFromRls,
        auditedAt,
        gaps,
      };
    },

    getCoverageReport(actualTables?: readonly string[]): RlsCoverageResult {
      const filteredTables = actualTables
        ? filterSystemTables(actualTables)
        : undefined;
      return registry.getCoverageReport(filteredTables);
    },

    isTableClassified(tableName: string): boolean {
      return registry.isClassified(tableName);
    },

    formatCiFailureMessage(unclassifiedTables: readonly string[]): string {
      const lines: string[] = [];
      lines.push('');
      lines.push(
        '========================================================================',
      );
      lines.push(
        '           RLS COVERAGE ENFORCEMENT FAILED                              ',
      );
      lines.push(
        '========================================================================',
      );
      lines.push('');
      lines.push(
        '  The following tables are NOT classified in the registry:',
      );
      lines.push('');

      for (const table of unclassifiedTables) {
        lines.push('    - ' + table);
      }

      lines.push('');
      lines.push(
        '------------------------------------------------------------------------',
      );
      lines.push('  ACTION REQUIRED:');
      lines.push('');
      lines.push('  Add classification for each table in:');
      lines.push('  src/infrastructure/rls/TableClassificationRegistry.ts');
      lines.push('');
      lines.push('  Classification options:');
      lines.push('    - GLOBAL_IDENTITY  : No tenant RLS (e.g., users)');
      lines.push('    - PLATFORM_SHARED  : No tenant RLS (e.g., plans)');
      lines.push('    - TENANT_OWNED     : Standard tenant RLS');
      lines.push('    - ORG_SCOPED       : Tenant RLS + OrgUnit scope');
      lines.push('    - HOUSEHOLD_SCOPED : Tenant RLS + household scope');
      lines.push('    - USER_SELF        : User own data only');
      lines.push('');
      lines.push('  See Requirement 60 AC 5:');
      lines.push('  "CI build SHALL fail if new table added without');
      lines.push('   explicit classification"');
      lines.push('');
      lines.push(
        '========================================================================',
      );
      lines.push('');

      return lines.join('\n');
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience Functions
// ---------------------------------------------------------------------------

/**
 * Default enforcer instance for convenience imports.
 */
const defaultEnforcer = createRlsCoverageEnforcer();

/**
 * Check RLS coverage using default enforcer.
 */
export function checkRlsCoverage(
  actualTables: readonly string[],
): RlsEnforcementResult {
  return defaultEnforcer.checkCoverage(actualTables);
}

/**
 * Run RLS audit using default enforcer.
 */
export function runRlsAudit(
  actualTables: readonly string[],
  tenantIdTables?: readonly string[],
): RlsAuditResult {
  return defaultEnforcer.runAudit(actualTables, tenantIdTables);
}

/**
 * Format CI failure message using default enforcer.
 */
export function formatRlsCiFailure(
  unclassifiedTables: readonly string[],
): string {
  return defaultEnforcer.formatCiFailureMessage(unclassifiedTables);
}
