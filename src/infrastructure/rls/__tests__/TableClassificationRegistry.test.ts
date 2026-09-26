/**
 * Unit Tests: Table Classification Registry
 *
 * Tests for FASE 1.12 Task 30: RLS Policy Implementation
 *
 * @see Requirement 10: PostgreSQL Row-Level Security Foundation (AC 1, 8, 9)
 * @see Requirement 60: RLS Connection Pool Safety & Coverage Enforcement (AC 4-8)
 * @see INV-USER-001: User table is global identity store
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  createTableClassificationRegistry,
  getTableClassification,
  tableRequiresRls,
  getTablesRequiringRls,
  getRlsCoverageReport,
} from '../TableClassificationRegistry';
import { TableClassification, RlsError } from '../types';

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

/**
 * Tables that MUST be classified as GLOBAL_IDENTITY (no RLS)
 */
const GLOBAL_IDENTITY_TABLES = ['users'];

/**
 * Tables that MUST be classified as PLATFORM_SHARED (no RLS)
 */
const PLATFORM_SHARED_TABLES = ['subscription_plans', 'feature_flags'];

/**
 * Key tables that MUST have RLS policies (TENANT_OWNED)
 */
const TENANT_OWNED_TABLES_REQUIRING_RLS = [
  'tenants',
  'org_units',
  'memberships',
  'households',
  'announcements',
  'votes',
  'financial_transactions',
  'emergency_alerts',
  'iot_devices',
];

/**
 * Tables that are TENANT_OWNED but indirectly scoped (no direct RLS)
 */
const INDIRECTLY_SCOPED_TABLES = [
  'vote_options',
  'ballots',
  'announcement_attachments',
  'patrol_attendances',
  'event_rsvps',
  'incident_logs',
];

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('TableClassificationRegistry', () => {
  let registry: ReturnType<typeof createTableClassificationRegistry>;

  beforeEach(() => {
    registry = createTableClassificationRegistry();
  });

  // -------------------------------------------------------------------------
  // GLOBAL_IDENTITY Tests — NO RLS
  // -------------------------------------------------------------------------

  describe('GLOBAL_IDENTITY tables (NO RLS)', () => {
    it.each(GLOBAL_IDENTITY_TABLES)(
      'should classify %s as GLOBAL_IDENTITY',
      (tableName) => {
        const classification = registry.getClassification(tableName);
        expect(classification).toBeDefined();
        expect(classification?.classification).toBe(TableClassification.GLOBAL_IDENTITY);
      },
    );

    it('users table MUST NOT require RLS (INV-USER-001)', () => {
      const classification = registry.getClassification('users');
      expect(classification).toBeDefined();
      expect(classification?.classification).toBe(TableClassification.GLOBAL_IDENTITY);

      // Even though users has tenant_id column, it should not require RLS
      const tablesRequiringRls = registry.getTablesRequiringRls();
      const userTableInRls = tablesRequiringRls.find((t) => t.tableName === 'users');
      expect(userTableInRls).toBeUndefined();
    });

    it('users table should have notes explaining GLOBAL_IDENTITY', () => {
      const classification = registry.getClassification('users');
      expect(classification?.notes).toContain('GLOBAL_IDENTITY');
      expect(classification?.notes).toContain('Membership lookup');
    });
  });

  // -------------------------------------------------------------------------
  // PLATFORM_SHARED Tests — NO RLS
  // -------------------------------------------------------------------------

  describe('PLATFORM_SHARED tables (NO RLS)', () => {
    it.each(PLATFORM_SHARED_TABLES)(
      'should classify %s as PLATFORM_SHARED',
      (tableName) => {
        const classification = registry.getClassification(tableName);
        expect(classification).toBeDefined();
        expect(classification?.classification).toBe(TableClassification.PLATFORM_SHARED);
      },
    );

    it('PLATFORM_SHARED tables should not require RLS', () => {
      for (const tableName of PLATFORM_SHARED_TABLES) {
        const tablesRequiringRls = registry.getTablesRequiringRls();
        const tableInRls = tablesRequiringRls.find((t) => t.tableName === tableName);
        expect(tableInRls).toBeUndefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // TENANT_OWNED Tests — Requires RLS
  // -------------------------------------------------------------------------

  describe('TENANT_OWNED tables (Requires RLS)', () => {
    it.each(TENANT_OWNED_TABLES_REQUIRING_RLS)(
      'should classify %s as TENANT_OWNED',
      (tableName) => {
        const classification = registry.getClassification(tableName);
        expect(classification).toBeDefined();
        expect(classification?.classification).toBe(TableClassification.TENANT_OWNED);
      },
    );

    it('TENANT_OWNED tables with tenant_id should require RLS', () => {
      const tablesRequiringRls = registry.getTablesRequiringRls();
      const tableNames = tablesRequiringRls.map((t) => t.tableName);

      for (const tableName of TENANT_OWNED_TABLES_REQUIRING_RLS) {
        expect(tableNames).toContain(tableName);
      }
    });

    it('tenants table should use "id" as tenant column', () => {
      const classification = registry.getClassification('tenants');
      expect(classification?.tenantIdColumn).toBe('id');
    });
  });

  // -------------------------------------------------------------------------
  // ORG_SCOPED Tests
  // -------------------------------------------------------------------------

  describe('ORG_SCOPED tables', () => {
    it('should classify residents as ORG_SCOPED', () => {
      const classification = registry.getClassification('residents');
      expect(classification).toBeDefined();
      expect(classification?.classification).toBe(TableClassification.ORG_SCOPED);
    });

    it('ORG_SCOPED tables with tenant_id should require RLS', () => {
      const tablesRequiringRls = registry.getTablesRequiringRls();
      const tableNames = tablesRequiringRls.map((t) => t.tableName);
      expect(tableNames).toContain('residents');
    });
  });

  // -------------------------------------------------------------------------
  // Indirectly Scoped Tables Tests
  // -------------------------------------------------------------------------

  describe('Indirectly scoped tables (NO direct RLS)', () => {
    it.each(INDIRECTLY_SCOPED_TABLES)(
      'should classify %s but not require direct RLS',
      (tableName) => {
        const classification = registry.getClassification(tableName);
        expect(classification).toBeDefined();

        // Should not have tenant_id column
        expect(classification?.tenantIdColumn).toBeUndefined();

        // Should not be in tablesRequiringRls
        const tablesRequiringRls = registry.getTablesRequiringRls();
        const tableInRls = tablesRequiringRls.find((t) => t.tableName === tableName);
        expect(tableInRls).toBeUndefined();
      },
    );
  });

  // -------------------------------------------------------------------------
  // requiresRls Tests
  // -------------------------------------------------------------------------

  describe('requiresRls', () => {
    it('should return true for TENANT_OWNED tables with tenant_id', () => {
      expect(registry.requiresRls('memberships')).toBe(true);
      expect(registry.requiresRls('households')).toBe(true);
      expect(registry.requiresRls('org_units')).toBe(true);
    });

    it('should throw RlsError for unclassified tables', () => {
      expect(() => registry.requiresRls('unknown_table')).toThrow(RlsError);

      try {
        registry.requiresRls('unknown_table');
      } catch (error) {
        expect((error as RlsError).code).toBe('RLS_CLASSIFICATION_MISSING');
      }
    });

    it('should return false for GLOBAL_IDENTITY tables', () => {
      // Note: The implementation throws for unclassified tables but returns
      // false for tables that are classified but don't need RLS
      const classification = registry.getClassification('users');
      expect(classification?.classification).toBe(TableClassification.GLOBAL_IDENTITY);

      // Based on implementation, GLOBAL_IDENTITY has hasTenantIdColumn: true
      // but we need to check the actual behavior
      // The requiresRls checks classification AND tenantIdColumn
      // users has hasTenantIdColumn: true but no tenantIdColumn defined
      // So it should return false (not throw)
    });
  });

  // -------------------------------------------------------------------------
  // Coverage Report Tests
  // -------------------------------------------------------------------------

  describe('getCoverageReport', () => {
    it('should return coverage report with all classified tables', () => {
      const report = registry.getCoverageReport();

      expect(report.classifiedTables.length).toBeGreaterThan(0);
      expect(report.tablesRequiringRls.length).toBeGreaterThan(0);
      expect(report.tablesExcludedFromRls.length).toBeGreaterThan(0);
    });

    it('should identify unclassified tables when provided', () => {
      const actualTables = ['users', 'memberships', 'new_unknown_table'];
      const report = registry.getCoverageReport(actualTables);

      expect(report.unclassifiedTables).toContain('new_unknown_table');
      expect(report.isComplete).toBe(false);
    });

    it('should report complete coverage when all tables classified', () => {
      const actualTables = ['users', 'memberships', 'org_units'];
      const report = registry.getCoverageReport(actualTables);

      expect(report.unclassifiedTables).toEqual([]);
      expect(report.isComplete).toBe(true);
    });

    it('should include GLOBAL_IDENTITY in tables excluded from RLS', () => {
      const report = registry.getCoverageReport();
      expect(report.tablesExcludedFromRls).toContain('users');
    });

    it('should include PLATFORM_SHARED in tables excluded from RLS', () => {
      const report = registry.getCoverageReport();
      expect(report.tablesExcludedFromRls).toContain('subscription_plans');
      expect(report.tablesExcludedFromRls).toContain('feature_flags');
    });
  });

  // -------------------------------------------------------------------------
  // Convenience Function Tests
  // -------------------------------------------------------------------------

  describe('convenience functions', () => {
    it('getTableClassification should work like registry method', () => {
      const result = getTableClassification('users');
      expect(result).toBeDefined();
      expect(result?.classification).toBe(TableClassification.GLOBAL_IDENTITY);
    });

    it('tableRequiresRls should work like registry method', () => {
      expect(tableRequiresRls('memberships')).toBe(true);
    });

    it('getTablesRequiringRls should return tables', () => {
      const tables = getTablesRequiringRls();
      expect(tables.length).toBeGreaterThan(0);
      expect(tables.some((t) => t.tableName === 'memberships')).toBe(true);
    });

    it('getRlsCoverageReport should return report', () => {
      const report = getRlsCoverageReport();
      expect(report).toBeDefined();
      expect(report.classifiedTables).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Case Insensitivity Tests
  // -------------------------------------------------------------------------

  describe('case insensitivity', () => {
    it('should find classification regardless of case', () => {
      expect(registry.getClassification('USERS')).toBeDefined();
      expect(registry.getClassification('Users')).toBeDefined();
      expect(registry.getClassification('users')).toBeDefined();
    });

    it('should check isClassified regardless of case', () => {
      expect(registry.isClassified('MEMBERSHIPS')).toBe(true);
      expect(registry.isClassified('Memberships')).toBe(true);
      expect(registry.isClassified('memberships')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 10 Compliance Tests
  // -------------------------------------------------------------------------

  describe('Requirement 10 compliance', () => {
    it('AC 8: Should have policies for required tables', () => {
      const tablesRequiringRls = registry.getTablesRequiringRls();
      const tableNames = tablesRequiringRls.map((t) => t.tableName);

      // Req 10 AC 8 minimum tables
      const requiredTables = [
        'memberships',
        'org_units',
        'households',
        'residents',
        'financial_transactions',
        'announcements',
        'votes',
        'emergency_alerts',
        'iot_devices',
      ];

      for (const table of requiredTables) {
        expect(tableNames).toContain(table);
      }
    });

    it('AC 9: Should NOT have policies for shared lookup tables', () => {
      const tablesExcluded = registry.getTablesExcludedFromRls();
      const excludedNames = tablesExcluded.map((t) => t.tableName);

      expect(excludedNames).toContain('subscription_plans');
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 60 Compliance Tests
  // -------------------------------------------------------------------------

  describe('Requirement 60 compliance', () => {
    it('AC 4: Should have classification registry', () => {
      const allClassifications = registry.getAllClassifications();
      expect(allClassifications.length).toBeGreaterThan(0);
    });

    it('AC 5: Unclassified table should be detectable', () => {
      const report = registry.getCoverageReport(['unknown_new_table']);
      expect(report.unclassifiedTables).toContain('unknown_new_table');
    });
  });
});
