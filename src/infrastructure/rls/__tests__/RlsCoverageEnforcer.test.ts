/**
 * Unit Tests: RLS Coverage Enforcer
 *
 * Tests for FASE 1.12 Task 31: RLS Coverage Enforcement
 *
 * @see Requirement 60: RLS Connection Pool Safety & Coverage Enforcement (AC 4-8)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  createRlsCoverageEnforcer,
  checkRlsCoverage,
  runRlsAudit,
  formatRlsCiFailure,
  type IRlsCoverageEnforcer,
  type RlsEnforcementResult,
  type RlsAuditResult,
} from '../RlsCoverageEnforcer';
import { type ITableClassificationRegistry } from '../TableClassificationRegistry';
import { TableClassification } from '../types';

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

/**
 * Sample tables simulating actual database schema.
 */
const SAMPLE_SCHEMA_TABLES = [
  'users',
  'memberships',
  'tenants',
  'org_units',
  'households',
  'residents',
  'announcements',
  'votes',
  'financial_transactions',
  'emergency_alerts',
  'iot_devices',
  'subscription_plans',
  'feature_flags',
];

/**
 * System tables that should be filtered out.
 */
const SYSTEM_TABLES = ['_prisma_migrations', 'pg_stat_user_tables'];

/**
 * Sample unclassified tables for testing CI failure.
 */
const UNCLASSIFIED_TABLES = ['new_custom_table', 'another_unclassified'];

// ---------------------------------------------------------------------------
// Mock Registry Factory
// ---------------------------------------------------------------------------

function createMockRegistry(
  classifiedTables: string[] = SAMPLE_SCHEMA_TABLES,
): ITableClassificationRegistry {
  const classifiedSet = new Set(classifiedTables.map((t) => t.toLowerCase()));

  return {
    getClassification(tableName: string) {
      const normalized = tableName.toLowerCase();
      if (!classifiedSet.has(normalized)) {
        return undefined;
      }
      // Return mock classification based on table name
      if (normalized === 'users') {
        return {
          tableName: normalized,
          classification: TableClassification.GLOBAL_IDENTITY,
          hasTenantIdColumn: true,
          notes: 'Global identity store',
        };
      }
      if (
        normalized === 'subscription_plans' ||
        normalized === 'feature_flags'
      ) {
        return {
          tableName: normalized,
          classification: TableClassification.PLATFORM_SHARED,
          hasTenantIdColumn: false,
          notes: 'Platform shared',
        };
      }
      if (normalized === 'residents') {
        return {
          tableName: normalized,
          classification: TableClassification.ORG_SCOPED,
          hasTenantIdColumn: true,
          tenantIdColumn: 'tenant_id',
          notes: 'Org scoped',
        };
      }
      return {
        tableName: normalized,
        classification: TableClassification.TENANT_OWNED,
        hasTenantIdColumn: true,
        tenantIdColumn: 'tenant_id',
        notes: 'Tenant owned',
      };
    },

    getTablesRequiringRls() {
      return classifiedTables
        .filter(
          (t) =>
            t !== 'users' &&
            t !== 'subscription_plans' &&
            t !== 'feature_flags',
        )
        .map((t) => ({
          tableName: t,
          classification: TableClassification.TENANT_OWNED,
          hasTenantIdColumn: true,
          tenantIdColumn: 'tenant_id',
        }));
    },

    getTablesExcludedFromRls() {
      return ['users', 'subscription_plans', 'feature_flags']
        .filter((t) => classifiedTables.includes(t))
        .map((t) => ({
          tableName: t,
          classification:
            t === 'users'
              ? TableClassification.GLOBAL_IDENTITY
              : TableClassification.PLATFORM_SHARED,
          hasTenantIdColumn: t === 'users',
        }));
    },

    getAllClassifications() {
      return classifiedTables.map((t) => ({
        tableName: t,
        classification: TableClassification.TENANT_OWNED,
        hasTenantIdColumn: true,
      }));
    },

    isClassified(tableName: string) {
      return classifiedSet.has(tableName.toLowerCase());
    },

    requiresRls(tableName: string) {
      const normalized = tableName.toLowerCase();
      if (!classifiedSet.has(normalized)) {
        throw new Error(`Table '${tableName}' is not classified`);
      }
      return (
        normalized !== 'users' &&
        normalized !== 'subscription_plans' &&
        normalized !== 'feature_flags'
      );
    },

    getCoverageReport(actualTables?: readonly string[]) {
      const unclassifiedTables = actualTables?.filter(
        (t) =>
          !classifiedSet.has(t.toLowerCase()) &&
          !t.startsWith('_prisma') &&
          !t.startsWith('pg_'),
      );

      return {
        classifiedTables: classifiedTables.map((t) => ({
          tableName: t,
          classification: TableClassification.TENANT_OWNED,
          hasTenantIdColumn: true,
        })),
        tablesRequiringRls: classifiedTables.filter(
          (t) =>
            t !== 'users' &&
            t !== 'subscription_plans' &&
            t !== 'feature_flags',
        ),
        tablesExcludedFromRls: ['users', 'subscription_plans', 'feature_flags'].filter(
          (t) => classifiedTables.includes(t),
        ),
        unclassifiedTables,
        coveragePercentage: 100,
        isComplete: !unclassifiedTables || unclassifiedTables.length === 0,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('RlsCoverageEnforcer', () => {
  let enforcer: IRlsCoverageEnforcer;

  beforeEach(() => {
    enforcer = createRlsCoverageEnforcer({
      registry: createMockRegistry(),
    });
  });

  // -------------------------------------------------------------------------
  // checkCoverage Tests
  // -------------------------------------------------------------------------

  describe('checkCoverage', () => {
    it('should pass when all tables are classified', () => {
      const result = enforcer.checkCoverage(SAMPLE_SCHEMA_TABLES);

      expect(result.passed).toBe(true);
      expect(result.unclassifiedTables).toHaveLength(0);
      expect(result.unclassifiedTablesCount).toBe(0);
      expect(result.coveragePercentage).toBe(100);
    });

    it('should fail when unclassified tables exist', () => {
      const tablesWithUnclassified = [
        ...SAMPLE_SCHEMA_TABLES,
        ...UNCLASSIFIED_TABLES,
      ];
      const result = enforcer.checkCoverage(tablesWithUnclassified);

      expect(result.passed).toBe(false);
      expect(result.unclassifiedTables).toContain('new_custom_table');
      expect(result.unclassifiedTables).toContain('another_unclassified');
      expect(result.unclassifiedTablesCount).toBe(2);
    });

    it('should filter out system tables (_prisma_migrations)', () => {
      const tablesWithSystem = [
        ...SAMPLE_SCHEMA_TABLES,
        '_prisma_migrations',
      ];
      const result = enforcer.checkCoverage(tablesWithSystem);

      expect(result.passed).toBe(true);
      expect(result.unclassifiedTables).not.toContain('_prisma_migrations');
    });

    it('should filter out pg_ prefixed tables', () => {
      const tablesWithPg = [
        ...SAMPLE_SCHEMA_TABLES,
        'pg_stat_user_tables',
        'pg_indexes',
      ];
      const result = enforcer.checkCoverage(tablesWithPg);

      expect(result.passed).toBe(true);
      expect(result.unclassifiedTables).not.toContain('pg_stat_user_tables');
      expect(result.unclassifiedTables).not.toContain('pg_indexes');
    });

    it('should include timestamp in result', () => {
      const before = new Date();
      const result = enforcer.checkCoverage(SAMPLE_SCHEMA_TABLES);
      const after = new Date();

      expect(result.checkedAt).toBeInstanceOf(Date);
      expect(result.checkedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.checkedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should provide meaningful summary', () => {
      const result = enforcer.checkCoverage(SAMPLE_SCHEMA_TABLES);

      expect(result.summary).toContain('PASSED');
      expect(result.summary).toContain('classified');
    });

    it('should provide failure summary when tables are unclassified', () => {
      const tablesWithUnclassified = [
        ...SAMPLE_SCHEMA_TABLES,
        'unclassified_table',
      ];
      const result = enforcer.checkCoverage(tablesWithUnclassified);

      expect(result.summary).toContain('FAILED');
      expect(result.summary).toContain('unclassified');
    });

    it('should include messages for logging', () => {
      const result = enforcer.checkCoverage(SAMPLE_SCHEMA_TABLES);

      expect(result.messages).toBeInstanceOf(Array);
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('should list tables requiring RLS', () => {
      const result = enforcer.checkCoverage(SAMPLE_SCHEMA_TABLES);

      expect(result.tablesRequiringRls.length).toBeGreaterThan(0);
      expect(result.tablesRequiringRls).toContain('memberships');
      expect(result.tablesRequiringRls).not.toContain('users');
    });

    it('should list tables excluded from RLS', () => {
      const result = enforcer.checkCoverage(SAMPLE_SCHEMA_TABLES);

      expect(result.tablesExcludedFromRls.length).toBeGreaterThan(0);
      expect(result.tablesExcludedFromRls).toContain('users');
      expect(result.tablesExcludedFromRls).toContain('subscription_plans');
    });

    it('should calculate correct coverage percentage', () => {
      // All classified = 100%
      const result1 = enforcer.checkCoverage(SAMPLE_SCHEMA_TABLES);
      expect(result1.coveragePercentage).toBe(100);

      // Some unclassified = less than 100%
      const tablesWithUnclassified = [
        ...SAMPLE_SCHEMA_TABLES,
        'unclassified1',
        'unclassified2',
      ];
      const result2 = enforcer.checkCoverage(tablesWithUnclassified);
      expect(result2.coveragePercentage).toBeLessThan(100);
    });
  });

  // -------------------------------------------------------------------------
  // runAudit Tests
  // -------------------------------------------------------------------------

  describe('runAudit', () => {
    it('should report no gaps when all tables are classified', () => {
      const result = enforcer.runAudit(SAMPLE_SCHEMA_TABLES);

      expect(result.hasGaps).toBe(false);
      expect(result.gaps).toHaveLength(0);
    });

    it('should detect unclassified tables as gaps', () => {
      const tablesWithUnclassified = [
        ...SAMPLE_SCHEMA_TABLES,
        'unclassified_table',
      ];
      const result = enforcer.runAudit(tablesWithUnclassified);

      expect(result.hasGaps).toBe(true);
      expect(result.gaps.some((g) => g.tableName === 'unclassified_table')).toBe(true);
    });

    it('should mark unclassified tenant tables as CRITICAL', () => {
      const tablesWithUnclassified = [
        ...SAMPLE_SCHEMA_TABLES,
        'unclassified_tenant_table',
      ];
      const tenantIdTables = ['memberships', 'unclassified_tenant_table'];

      const result = enforcer.runAudit(tablesWithUnclassified, tenantIdTables);

      const criticalGap = result.gaps.find(
        (g) => g.tableName === 'unclassified_tenant_table',
      );
      expect(criticalGap).toBeDefined();
      expect(criticalGap?.severity).toBe('CRITICAL');
      expect(criticalGap?.type).toBe('UNCLASSIFIED_TENANT_TABLE');
    });

    it('should mark regular unclassified tables as WARNING', () => {
      const tablesWithUnclassified = [
        ...SAMPLE_SCHEMA_TABLES,
        'unclassified_regular',
      ];

      const result = enforcer.runAudit(tablesWithUnclassified);

      const warningGap = result.gaps.find(
        (g) => g.tableName === 'unclassified_regular',
      );
      expect(warningGap).toBeDefined();
      expect(warningGap?.severity).toBe('WARNING');
      expect(warningGap?.type).toBe('UNCLASSIFIED_TABLE');
    });

    it('should include audit timestamp', () => {
      const result = enforcer.runAudit(SAMPLE_SCHEMA_TABLES);

      expect(result.auditedAt).toBeInstanceOf(Date);
    });

    it('should report tables with RLS', () => {
      const result = enforcer.runAudit(SAMPLE_SCHEMA_TABLES);

      expect(result.tablesWithRls.length).toBeGreaterThan(0);
    });

    it('should report tables without RLS', () => {
      const result = enforcer.runAudit(SAMPLE_SCHEMA_TABLES);

      expect(result.tablesWithoutRls.length).toBeGreaterThan(0);
    });

    it('should track unclassified tenant tables separately', () => {
      const tablesWithUnclassified = [
        ...SAMPLE_SCHEMA_TABLES,
        'unclassified_with_tenant_id',
      ];
      const tenantIdTables = [
        'memberships',
        'tenants',
        'unclassified_with_tenant_id',
      ];

      const result = enforcer.runAudit(tablesWithUnclassified, tenantIdTables);

      expect(result.unclassifiedTenantTables).toContain(
        'unclassified_with_tenant_id',
      );
    });
  });

  // -------------------------------------------------------------------------
  // getCoverageReport Tests
  // -------------------------------------------------------------------------

  describe('getCoverageReport', () => {
    it('should return coverage report from registry', () => {
      const report = enforcer.getCoverageReport(SAMPLE_SCHEMA_TABLES);

      expect(report).toBeDefined();
      expect(report.classifiedTables).toBeDefined();
      expect(report.tablesRequiringRls).toBeDefined();
    });

    it('should work without actual tables (registry only)', () => {
      const report = enforcer.getCoverageReport();

      expect(report).toBeDefined();
      expect(report.classifiedTables.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // isTableClassified Tests
  // -------------------------------------------------------------------------

  describe('isTableClassified', () => {
    it('should return true for classified tables', () => {
      expect(enforcer.isTableClassified('users')).toBe(true);
      expect(enforcer.isTableClassified('memberships')).toBe(true);
    });

    it('should return false for unclassified tables', () => {
      expect(enforcer.isTableClassified('unknown_table')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(enforcer.isTableClassified('USERS')).toBe(true);
      expect(enforcer.isTableClassified('Users')).toBe(true);
      expect(enforcer.isTableClassified('users')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // formatCiFailureMessage Tests
  // -------------------------------------------------------------------------

  describe('formatCiFailureMessage', () => {
    it('should format failure message with unclassified tables', () => {
      const message = enforcer.formatCiFailureMessage(UNCLASSIFIED_TABLES);

      expect(message).toContain('RLS COVERAGE ENFORCEMENT FAILED');
      expect(message).toContain('new_custom_table');
      expect(message).toContain('another_unclassified');
    });

    it('should include action required instructions', () => {
      const message = enforcer.formatCiFailureMessage(['some_table']);

      expect(message).toContain('ACTION REQUIRED');
      expect(message).toContain('TableClassificationRegistry.ts');
    });

    it('should list classification options', () => {
      const message = enforcer.formatCiFailureMessage(['some_table']);

      expect(message).toContain('GLOBAL_IDENTITY');
      expect(message).toContain('TENANT_OWNED');
      expect(message).toContain('PLATFORM_SHARED');
    });

    it('should reference Requirement 60', () => {
      const message = enforcer.formatCiFailureMessage(['some_table']);

      expect(message).toContain('Requirement 60');
    });
  });

  // -------------------------------------------------------------------------
  // Convenience Functions Tests
  // -------------------------------------------------------------------------

  describe('convenience functions', () => {
    it('checkRlsCoverage should work', () => {
      const result = checkRlsCoverage(SAMPLE_SCHEMA_TABLES);
      expect(result).toBeDefined();
      expect(result.passed).toBeDefined();
    });

    it('runRlsAudit should work', () => {
      const result = runRlsAudit(SAMPLE_SCHEMA_TABLES);
      expect(result).toBeDefined();
      expect(result.hasGaps).toBeDefined();
    });

    it('formatRlsCiFailure should work', () => {
      const message = formatRlsCiFailure(['table1']);
      expect(message).toContain('table1');
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 60 Compliance Tests
  // -------------------------------------------------------------------------

  describe('Requirement 60 compliance', () => {
    it('AC 4: Should maintain classification registry', () => {
      const report = enforcer.getCoverageReport();
      expect(report.classifiedTables.length).toBeGreaterThan(0);
    });

    it('AC 5: Should detect unclassified tables (CI failure)', () => {
      const tablesWithUnclassified = [
        ...SAMPLE_SCHEMA_TABLES,
        'new_unclassified_table',
      ];
      const result = enforcer.checkCoverage(tablesWithUnclassified);

      // Should fail CI
      expect(result.passed).toBe(false);
      expect(result.unclassifiedTables).toContain('new_unclassified_table');
    });

    it('AC 7: Should support periodic audit for coverage gaps', () => {
      const tablesWithUnclassified = [
        ...SAMPLE_SCHEMA_TABLES,
        'gap_table',
      ];
      const tenantIdTables = ['memberships', 'gap_table'];

      const audit = enforcer.runAudit(tablesWithUnclassified, tenantIdTables);

      expect(audit.hasGaps).toBe(true);
      expect(audit.gaps.length).toBeGreaterThan(0);
    });

    it('AC 8: Should alert on coverage gaps (via gap detection)', () => {
      const tablesWithUnclassified = [
        ...SAMPLE_SCHEMA_TABLES,
        'gap_table',
      ];
      
      const audit = enforcer.runAudit(tablesWithUnclassified);

      // Gaps should have severity for alerting
      const gap = audit.gaps.find((g) => g.tableName === 'gap_table');
      expect(gap).toBeDefined();
      expect(gap?.severity).toBeDefined();
      expect(['CRITICAL', 'WARNING', 'INFO']).toContain(gap?.severity);
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases Tests
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle empty table list', () => {
      const result = enforcer.checkCoverage([]);

      expect(result.passed).toBe(true);
      expect(result.totalTablesInSchema).toBe(0);
      expect(result.coveragePercentage).toBe(100);
    });

    it('should handle list with only system tables', () => {
      const result = enforcer.checkCoverage([
        '_prisma_migrations',
        'pg_stat_statements',
      ]);

      expect(result.passed).toBe(true);
      expect(result.totalTablesInSchema).toBe(0);
    });

    it('should handle mixed case table names', () => {
      const result = enforcer.checkCoverage([
        'USERS',
        'Memberships',
        'tenants',
      ]);

      expect(result.passed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Integration with Default Registry Tests
  // -------------------------------------------------------------------------

  describe('integration with default registry', () => {
    it('should work without custom registry', () => {
      const defaultEnforcer = createRlsCoverageEnforcer();
      const report = defaultEnforcer.getCoverageReport();

      expect(report).toBeDefined();
      expect(report.classifiedTables.length).toBeGreaterThan(0);
    });

    it('should detect actual classified tables', () => {
      const defaultEnforcer = createRlsCoverageEnforcer();

      // users should be classified
      expect(defaultEnforcer.isTableClassified('users')).toBe(true);
      // memberships should be classified
      expect(defaultEnforcer.isTableClassified('memberships')).toBe(true);
    });
  });
});
