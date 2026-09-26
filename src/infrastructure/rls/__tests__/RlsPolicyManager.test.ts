/**
 * Unit Tests: RLS Policy Manager
 *
 * Tests for FASE 1.12 Task 30: RLS Policy Implementation
 *
 * @see Requirement 10: PostgreSQL Row-Level Security Foundation
 * @see Design Section 11: RLS Foundation
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  createRlsPolicyManager,
  generateRlsMigrationSql,
  generateRlsRollbackSql,
  getRlsTables,
  getRlsPolicySql,
} from '../RlsPolicyManager';
import { RlsError, RLS_SESSION_VARIABLE } from '../types';

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const VALID_TENANT_OWNED_TABLE = 'memberships';
const GLOBAL_IDENTITY_TABLE = 'users';
const PLATFORM_SHARED_TABLE = 'subscription_plans';

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('RlsPolicyManager', () => {
  let manager: ReturnType<typeof createRlsPolicyManager>;

  beforeEach(() => {
    manager = createRlsPolicyManager();
  });

  // -------------------------------------------------------------------------
  // Policy Definition Tests
  // -------------------------------------------------------------------------

  describe('generatePolicyDefinition', () => {
    it('should generate policy for TENANT_OWNED tables', () => {
      const policy = manager.generatePolicyDefinition(VALID_TENANT_OWNED_TABLE);

      expect(policy).not.toBeNull();
      expect(policy?.tableName).toBe(VALID_TENANT_OWNED_TABLE);
      expect(policy?.policyName).toBe(`${VALID_TENANT_OWNED_TABLE}_tenant_isolation`);
      expect(policy?.actions).toContain('ALL');
      expect(policy?.usingExpression).toContain(RLS_SESSION_VARIABLE);
    });

    it('should return null for GLOBAL_IDENTITY tables', () => {
      const policy = manager.generatePolicyDefinition(GLOBAL_IDENTITY_TABLE);
      expect(policy).toBeNull();
    });

    it('should return null for PLATFORM_SHARED tables', () => {
      const policy = manager.generatePolicyDefinition(PLATFORM_SHARED_TABLE);
      expect(policy).toBeNull();
    });

    it('should throw for unclassified tables', () => {
      expect(() => manager.generatePolicyDefinition('unknown_table')).toThrow(
        RlsError,
      );
    });

    it('should use correct USING expression with UUID cast', () => {
      const policy = manager.generatePolicyDefinition('memberships');

      expect(policy?.usingExpression).toContain(`current_setting('${RLS_SESSION_VARIABLE}')::uuid`);
    });

    it('tenants table should use "id" column', () => {
      const policy = manager.generatePolicyDefinition('tenants');

      expect(policy).not.toBeNull();
      expect(policy?.usingExpression).toContain('id =');
      expect(policy?.usingExpression).not.toContain('tenant_id =');
    });

    it('should include WITH CHECK expression', () => {
      const policy = manager.generatePolicyDefinition('memberships');

      expect(policy?.withCheckExpression).toBeDefined();
      expect(policy?.withCheckExpression).toContain(RLS_SESSION_VARIABLE);
    });
  });

  // -------------------------------------------------------------------------
  // Policy SQL Generation Tests
  // -------------------------------------------------------------------------

  describe('generatePolicySql', () => {
    it('should generate all required SQL statements', () => {
      const sql = manager.generatePolicySql(VALID_TENANT_OWNED_TABLE);

      expect(sql).not.toBeNull();
      expect(sql?.enableRls).toBeDefined();
      expect(sql?.createPolicy).toBeDefined();
      expect(sql?.dropPolicy).toBeDefined();
      expect(sql?.disableRls).toBeDefined();
      expect(sql?.verifyRls).toBeDefined();
    });

    it('enableRls should use ALTER TABLE ... ENABLE ROW LEVEL SECURITY', () => {
      const sql = manager.generatePolicySql(VALID_TENANT_OWNED_TABLE);

      expect(sql?.enableRls).toMatch(/ALTER TABLE .+ ENABLE ROW LEVEL SECURITY/);
    });

    it('createPolicy should use CREATE POLICY with correct syntax', () => {
      const sql = manager.generatePolicySql(VALID_TENANT_OWNED_TABLE);

      expect(sql?.createPolicy).toMatch(/CREATE POLICY/);
      expect(sql?.createPolicy).toMatch(/ON "memberships"/);
      expect(sql?.createPolicy).toMatch(/USING/);
      expect(sql?.createPolicy).toMatch(/WITH CHECK/);
    });

    it('dropPolicy should use DROP POLICY IF EXISTS', () => {
      const sql = manager.generatePolicySql(VALID_TENANT_OWNED_TABLE);

      expect(sql?.dropPolicy).toMatch(/DROP POLICY IF EXISTS/);
    });

    it('disableRls should use ALTER TABLE ... DISABLE ROW LEVEL SECURITY', () => {
      const sql = manager.generatePolicySql(VALID_TENANT_OWNED_TABLE);

      expect(sql?.disableRls).toMatch(/ALTER TABLE .+ DISABLE ROW LEVEL SECURITY/);
    });

    it('verifyRls should query pg_class and pg_policy', () => {
      const sql = manager.generatePolicySql(VALID_TENANT_OWNED_TABLE);

      expect(sql?.verifyRls).toMatch(/pg_class/);
      expect(sql?.verifyRls).toMatch(/pg_policy/);
    });

    it('should return null for tables without RLS', () => {
      const sql = manager.generatePolicySql(GLOBAL_IDENTITY_TABLE);
      expect(sql).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Migration SQL Tests
  // -------------------------------------------------------------------------

  describe('generateMigrationSql', () => {
    it('should generate complete migration SQL', () => {
      const sql = manager.generateMigrationSql();

      expect(sql).toContain('Multi-Tenant RLS Policy Migration');
      expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('CREATE POLICY');
    });

    it('should include critical rules in comments', () => {
      const sql = manager.generateMigrationSql();

      expect(sql).toContain('NO RLS on users table');
      expect(sql).toContain('NO generic bypass mechanism');
      expect(sql).toContain('Fail closed');
      expect(sql).toContain('SET LOCAL');
    });

    it('should document tables without RLS', () => {
      const sql = manager.generateMigrationSql();

      expect(sql).toContain('Tables WITHOUT RLS');
      expect(sql).toContain('users: GLOBAL_IDENTITY');
      expect(sql).toContain('subscription_plans: PLATFORM_SHARED');
    });

    it('should include verification queries', () => {
      const sql = manager.generateMigrationSql();

      expect(sql).toContain('Verification queries');
      expect(sql).toContain('relrowsecurity');
    });

    it('should include policies for key tables', () => {
      const sql = manager.generateMigrationSql();

      expect(sql).toContain('memberships');
      expect(sql).toContain('org_units');
      expect(sql).toContain('households');
      expect(sql).toContain('residents');
      expect(sql).toContain('emergency_alerts');
    });

    it('should NOT include users table in RLS enablement', () => {
      const sql = manager.generateMigrationSql();
      const lines = sql.split('\n');

      // Find lines that enable RLS (ALTER TABLE ... ENABLE)
      const enableLines = lines.filter(
        (l) => l.includes('ENABLE ROW LEVEL SECURITY') && !l.startsWith('--'),
      );

      // None should reference users
      for (const line of enableLines) {
        expect(line).not.toContain('"users"');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Rollback SQL Tests
  // -------------------------------------------------------------------------

  describe('generateRollbackSql', () => {
    it('should generate complete rollback SQL', () => {
      const sql = manager.generateRollbackSql();

      expect(sql).toContain('ROLLBACK');
      expect(sql).toContain('DROP POLICY');
      expect(sql).toContain('DISABLE ROW LEVEL SECURITY');
    });

    it('should include warning comment', () => {
      const sql = manager.generateRollbackSql();

      expect(sql).toContain('WARNING');
      expect(sql).toContain('disable RLS');
    });

    it('should drop policies before disabling RLS', () => {
      const sql = manager.generateRollbackSql();

      const dropPolicyIndex = sql.indexOf('DROP POLICY');
      const disableRlsIndex = sql.indexOf('DISABLE ROW LEVEL SECURITY');

      expect(dropPolicyIndex).toBeLessThan(disableRlsIndex);
    });
  });

  // -------------------------------------------------------------------------
  // Tables List Tests
  // -------------------------------------------------------------------------

  describe('getTablesWithPolicies', () => {
    it('should return list of tables requiring RLS', () => {
      const tables = manager.getTablesWithPolicies();

      expect(tables.length).toBeGreaterThan(0);
      expect(tables).toContain('memberships');
      expect(tables).toContain('org_units');
      expect(tables).toContain('households');
    });

    it('should NOT include users table', () => {
      const tables = manager.getTablesWithPolicies();

      expect(tables).not.toContain('users');
    });

    it('should NOT include subscription_plans', () => {
      const tables = manager.getTablesWithPolicies();

      expect(tables).not.toContain('subscription_plans');
    });
  });

  describe('getTablesWithoutPolicies', () => {
    it('should return tables excluded from RLS with reasons', () => {
      const tables = manager.getTablesWithoutPolicies();

      expect(tables.length).toBeGreaterThan(0);

      const usersEntry = tables.find((t) => t.tableName === 'users');
      expect(usersEntry).toBeDefined();
      expect(usersEntry?.reason).toContain('GLOBAL_IDENTITY');
    });

    it('should include indirectly scoped tables', () => {
      const tables = manager.getTablesWithoutPolicies();
      const tableNames = tables.map((t) => t.tableName);

      // vote_options is indirectly scoped via votes
      expect(tableNames).toContain('vote_options');
    });
  });

  // -------------------------------------------------------------------------
  // Verification SQL Tests
  // -------------------------------------------------------------------------

  describe('getVerificationSql', () => {
    it('should generate verification SQL for table', () => {
      const sql = manager.getVerificationSql('memberships');

      expect(sql).toContain('pg_class');
      expect(sql).toContain('pg_policy');
      expect(sql).toContain("'memberships'");
    });

    it('should include policy expression columns', () => {
      const sql = manager.getVerificationSql('memberships');

      expect(sql).toContain('pg_get_expr');
      expect(sql).toContain('polqual');
      expect(sql).toContain('polwithcheck');
    });
  });

  // -------------------------------------------------------------------------
  // Convenience Function Tests
  // -------------------------------------------------------------------------

  describe('convenience functions', () => {
    it('generateRlsMigrationSql should work', () => {
      const sql = generateRlsMigrationSql();
      expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    });

    it('generateRlsRollbackSql should work', () => {
      const sql = generateRlsRollbackSql();
      expect(sql).toContain('DISABLE ROW LEVEL SECURITY');
    });

    it('getRlsTables should return tables', () => {
      const tables = getRlsTables();
      expect(tables).toContain('memberships');
    });

    it('getRlsPolicySql should return SQL for valid table', () => {
      const sql = getRlsPolicySql('memberships');
      expect(sql).not.toBeNull();
    });

    it('getRlsPolicySql should return null for excluded table', () => {
      const sql = getRlsPolicySql('users');
      expect(sql).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 10 Compliance Tests
  // -------------------------------------------------------------------------

  describe('Requirement 10 compliance', () => {
    it('AC 2: Should use session variable app.current_tenant_id', () => {
      const sql = manager.generatePolicySql('memberships');

      expect(sql?.createPolicy).toContain("current_setting('app.current_tenant_id')");
    });

    it('AC 3: Query should only return rows where tenant_id matches', () => {
      const policy = manager.generatePolicyDefinition('memberships');

      expect(policy?.usingExpression).toContain('tenant_id = current_setting');
    });

    it('AC 4: Should deny mutations on mismatched tenant_id', () => {
      const policy = manager.generatePolicyDefinition('memberships');

      // WITH CHECK enforces INSERT/UPDATE restrictions
      expect(policy?.withCheckExpression).toContain('tenant_id = current_setting');
    });

    it('AC 5: NO generic bypass for PLATFORM_ADMIN', () => {
      const sql = manager.generateMigrationSql();

      // Should not contain any is_admin or bypass flags
      expect(sql).not.toMatch(/is_platform_admin/i);
      expect(sql).not.toMatch(/bypass_rls/i);
    });

    it('AC 7: Fail closed if session variable not set', () => {
      // The policy uses current_setting()::uuid
      // If not set, current_setting returns empty string
      // Casting empty string to UUID fails = no rows returned
      const policy = manager.generatePolicyDefinition('memberships');

      expect(policy?.usingExpression).toContain('::uuid');
    });
  });
});
