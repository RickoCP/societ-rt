/**
 * RLS Policy Manager
 *
 * Manages PostgreSQL Row-Level Security policies for tenant isolation.
 * Generates policy SQL, tracks policy definitions, and supports verification.
 *
 * **CRITICAL RULES:**
 * - NO RLS on `users` table (GLOBAL_IDENTITY per INV-USER-001)
 * - NO generic bypass mechanism for PLATFORM_ADMIN
 * - Fail closed if session variable not set
 *
 * @see FASE 1.12 Task 30: RLS Policy Implementation
 * @see Requirement 10: PostgreSQL Row-Level Security Foundation
 * @see Requirement 60: RLS Connection Pool Safety & Coverage Enforcement
 * @see Design Section 11: RLS Foundation
 */

import {
  TableClassification,
  RLS_SESSION_VARIABLE,
  type RlsPolicyDefinition,
  type RlsPolicySql,
  type RlsPolicyVerification,
  RlsError,
} from './types';
import {
  createTableClassificationRegistry,
  type ITableClassificationRegistry,
} from './TableClassificationRegistry';

// ---------------------------------------------------------------------------
// Policy Constants
// ---------------------------------------------------------------------------

/**
 * Standard policy name suffix for tenant isolation policies.
 */
const TENANT_ISOLATION_POLICY_SUFFIX = '_tenant_isolation';

/**
 * UUID validation regex for tenant IDs.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Policy Manager Interface
// ---------------------------------------------------------------------------

/**
 * RLS Policy Manager Service
 *
 * Generates and manages RLS policies for tenant isolation.
 */
export interface IRlsPolicyManager {
  /**
   * Generate RLS policy definition for a table.
   *
   * @param tableName - PostgreSQL table name
   * @returns Policy definition or null if table doesn't require RLS
   */
  generatePolicyDefinition(tableName: string): RlsPolicyDefinition | null;

  /**
   * Generate SQL statements for applying RLS to a table.
   *
   * @param tableName - PostgreSQL table name
   * @returns SQL statements for enabling RLS and creating policy
   * @throws RlsError if table classification is missing
   */
  generatePolicySql(tableName: string): RlsPolicySql | null;

  /**
   * Generate migration SQL for all tables requiring RLS.
   *
   * @returns Complete migration SQL as string
   */
  generateMigrationSql(): string;

  /**
   * Generate rollback SQL for all RLS policies.
   *
   * @returns Complete rollback SQL as string
   */
  generateRollbackSql(): string;

  /**
   * Get list of all tables that should have RLS policies.
   *
   * @returns Array of table names
   */
  getTablesWithPolicies(): readonly string[];

  /**
   * Get list of tables explicitly excluded from RLS.
   *
   * @returns Array of table names with reasons
   */
  getTablesWithoutPolicies(): readonly { tableName: string; reason: string }[];

  /**
   * Verify RLS policy exists for a table.
   *
   * Note: This generates verification SQL; actual verification requires
   * executing the SQL against the database.
   *
   * @param tableName - PostgreSQL table name
   * @returns SQL to verify RLS status
   */
  getVerificationSql(tableName: string): string;
}

// ---------------------------------------------------------------------------
// Policy Manager Implementation
// ---------------------------------------------------------------------------

/**
 * Dependencies for RlsPolicyManager
 */
export interface RlsPolicyManagerDeps {
  tableClassificationRegistry?: ITableClassificationRegistry;
}

/**
 * Creates an RlsPolicyManager instance.
 *
 * Factory function pattern for DI container registration.
 *
 * @example
 * ```typescript
 * import { createRlsPolicyManager } from '@infrastructure/rls';
 *
 * const manager = createRlsPolicyManager();
 *
 * // Generate SQL for a specific table
 * const sql = manager.generatePolicySql('memberships');
 * console.log(sql.enableRls);    // ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
 * console.log(sql.createPolicy); // CREATE POLICY ...
 *
 * // Generate complete migration
 * const migrationSql = manager.generateMigrationSql();
 * ```
 */
export function createRlsPolicyManager(
  deps: RlsPolicyManagerDeps = {},
): IRlsPolicyManager {
  const registry = deps.tableClassificationRegistry ?? createTableClassificationRegistry();

  return {
    generatePolicyDefinition(tableName: string): RlsPolicyDefinition | null {
      const classification = registry.getClassification(tableName);

      if (!classification) {
        throw new RlsError(
          'RLS_CLASSIFICATION_MISSING',
          `Table '${tableName}' is not classified in the registry.`,
          { tableName },
        );
      }

      // GLOBAL_IDENTITY and PLATFORM_SHARED don't get RLS
      if (
        classification.classification === TableClassification.GLOBAL_IDENTITY ||
        classification.classification === TableClassification.PLATFORM_SHARED
      ) {
        return null;
      }

      // Tables without direct tenant_id column don't get direct RLS
      // (they are indirectly scoped via FK)
      if (!classification.hasTenantIdColumn || !classification.tenantIdColumn) {
        return null;
      }

      const tenantIdColumn = classification.tenantIdColumn;
      const policyName = `${tableName}${TENANT_ISOLATION_POLICY_SUFFIX}`;

      // Special case: tenants table uses 'id' instead of 'tenant_id'
      const usingExpression =
        tableName === 'tenants'
          ? `id = current_setting('${RLS_SESSION_VARIABLE}')::uuid`
          : `${tenantIdColumn} = current_setting('${RLS_SESSION_VARIABLE}')::uuid`;

      return {
        policyName,
        tableName,
        actions: ['ALL'],
        usingExpression,
        withCheckExpression: usingExpression,
      };
    },

    generatePolicySql(tableName: string): RlsPolicySql | null {
      const policy = this.generatePolicyDefinition(tableName);

      if (!policy) {
        return null;
      }

      // Generate enable RLS SQL
      const enableRls = `ALTER TABLE "${policy.tableName}" ENABLE ROW LEVEL SECURITY;`;

      // Generate create policy SQL
      // Using ALL covers SELECT, INSERT, UPDATE, DELETE
      const createPolicy = `CREATE POLICY "${policy.policyName}" ON "${policy.tableName}"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (${policy.usingExpression})
  WITH CHECK (${policy.withCheckExpression ?? policy.usingExpression});`;

      // Generate drop policy SQL (for rollback)
      const dropPolicy = `DROP POLICY IF EXISTS "${policy.policyName}" ON "${policy.tableName}";`;

      // Generate disable RLS SQL (for rollback)
      const disableRls = `ALTER TABLE "${policy.tableName}" DISABLE ROW LEVEL SECURITY;`;

      // Generate verification SQL
      const verifyRls = `SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  p.polname AS policy_name
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname = '${policy.tableName}'
  AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');`;

      return {
        enableRls,
        createPolicy,
        dropPolicy,
        disableRls,
        verifyRls,
      };
    },

    generateMigrationSql(): string {
      const tablesWithPolicies = registry.getTablesRequiringRls();
      const lines: string[] = [];

      // Header comment
      lines.push('-- ============================================================');
      lines.push('-- Multi-Tenant RLS Policy Migration');
      lines.push('-- FASE 1.12 Task 30: RLS Policy Implementation');
      lines.push('-- ============================================================');
      lines.push('');
      lines.push('-- CRITICAL RULES:');
      lines.push('-- 1. NO RLS on users table (GLOBAL_IDENTITY per INV-USER-001)');
      lines.push('-- 2. NO generic bypass mechanism for PLATFORM_ADMIN');
      lines.push('-- 3. Fail closed if session variable not set');
      lines.push('-- 4. Use SET LOCAL (transaction-scoped) for connection pool safety');
      lines.push('');
      lines.push('-- Session variable used: ' + RLS_SESSION_VARIABLE);
      lines.push('');

      // Enable RLS on all tables first
      lines.push('-- ============================================================');
      lines.push('-- STEP 1: Enable Row Level Security on TENANT_OWNED tables');
      lines.push('-- ============================================================');
      lines.push('');

      for (const entry of tablesWithPolicies) {
        lines.push(`ALTER TABLE "${entry.tableName}" ENABLE ROW LEVEL SECURITY;`);
      }

      lines.push('');

      // Create policies
      lines.push('-- ============================================================');
      lines.push('-- STEP 2: Create tenant isolation policies');
      lines.push('-- ============================================================');
      lines.push('');

      for (const entry of tablesWithPolicies) {
        const sql = this.generatePolicySql(entry.tableName);
        if (sql) {
          lines.push(`-- Policy for ${entry.tableName}`);
          lines.push(sql.createPolicy);
          lines.push('');
        }
      }

      // Tables explicitly excluded
      lines.push('-- ============================================================');
      lines.push('-- Tables WITHOUT RLS (by design)');
      lines.push('-- ============================================================');
      lines.push('-- users: GLOBAL_IDENTITY - Access authorized via Membership lookup');
      lines.push('-- subscription_plans: PLATFORM_SHARED - Read-all for authenticated users');
      lines.push('-- feature_flags: PLATFORM_SHARED - Read-all for authenticated users');
      lines.push('-- (Various child tables without direct tenant_id are indirectly scoped via FK)');
      lines.push('');

      // Verification queries
      lines.push('-- ============================================================');
      lines.push('-- STEP 3: Verification queries');
      lines.push('-- ============================================================');
      lines.push('-- Run these to verify RLS is properly enabled');
      lines.push('');
      lines.push(`-- List all tables with RLS enabled:
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       array_agg(p.polname) AS policies
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;`);

      return lines.join('\n');
    },

    generateRollbackSql(): string {
      const tablesWithPolicies = registry.getTablesRequiringRls();
      const lines: string[] = [];

      // Header comment
      lines.push('-- ============================================================');
      lines.push('-- Multi-Tenant RLS Policy ROLLBACK');
      lines.push('-- ============================================================');
      lines.push('-- WARNING: This will disable RLS and remove tenant isolation!');
      lines.push('');

      // Drop policies first
      lines.push('-- STEP 1: Drop all tenant isolation policies');
      lines.push('');

      for (const entry of tablesWithPolicies) {
        const policyName = `${entry.tableName}${TENANT_ISOLATION_POLICY_SUFFIX}`;
        lines.push(`DROP POLICY IF EXISTS "${policyName}" ON "${entry.tableName}";`);
      }

      lines.push('');

      // Disable RLS
      lines.push('-- STEP 2: Disable Row Level Security');
      lines.push('');

      for (const entry of tablesWithPolicies) {
        lines.push(`ALTER TABLE "${entry.tableName}" DISABLE ROW LEVEL SECURITY;`);
      }

      return lines.join('\n');
    },

    getTablesWithPolicies(): readonly string[] {
      return registry.getTablesRequiringRls().map((e) => e.tableName);
    },

    getTablesWithoutPolicies(): readonly { tableName: string; reason: string }[] {
      const excluded = registry.getTablesExcludedFromRls();
      const result: { tableName: string; reason: string }[] = [];

      for (const entry of excluded) {
        let reason: string;
        switch (entry.classification) {
          case TableClassification.GLOBAL_IDENTITY:
            reason = 'GLOBAL_IDENTITY - Access authorized via Membership lookup';
            break;
          case TableClassification.PLATFORM_SHARED:
            reason = 'PLATFORM_SHARED - Read-all for authenticated users';
            break;
          default:
            reason = 'No direct tenant_id column (indirectly scoped via FK)';
        }
        result.push({ tableName: entry.tableName, reason });
      }

      // Also add tables that are tenant-scoped but don't have direct tenant_id
      const allClassifications = registry.getAllClassifications();
      for (const entry of allClassifications) {
        if (
          (entry.classification === TableClassification.TENANT_OWNED ||
            entry.classification === TableClassification.ORG_SCOPED) &&
          (!entry.hasTenantIdColumn || !entry.tenantIdColumn)
        ) {
          result.push({
            tableName: entry.tableName,
            reason: 'Indirectly tenant-scoped via FK (no direct tenant_id column)',
          });
        }
      }

      return result;
    },

    getVerificationSql(tableName: string): string {
      return `SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  p.polname AS policy_name,
  pg_get_expr(p.polqual, p.polrelid) AS using_expression,
  pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expression
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname = '${tableName}'
  AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');`;
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience Functions
// ---------------------------------------------------------------------------

/**
 * Default manager instance for convenience imports.
 */
const defaultManager = createRlsPolicyManager();

/**
 * Generate migration SQL using default manager.
 */
export function generateRlsMigrationSql(): string {
  return defaultManager.generateMigrationSql();
}

/**
 * Generate rollback SQL using default manager.
 */
export function generateRlsRollbackSql(): string {
  return defaultManager.generateRollbackSql();
}

/**
 * Get tables that should have RLS policies.
 */
export function getRlsTables(): readonly string[] {
  return defaultManager.getTablesWithPolicies();
}

/**
 * Generate policy SQL for a specific table.
 */
export function getRlsPolicySql(tableName: string): RlsPolicySql | null {
  return defaultManager.generatePolicySql(tableName);
}
