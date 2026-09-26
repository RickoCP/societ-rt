/**
 * Post-Drop Validation Service Tests
 *
 * Tests for schema validation after column drop.
 *
 * @see Task 37: Legacy Schema Cleanup
 * @see Requirement 13 (AC 2, 6)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createPostDropValidationService,
  type PostDropValidationServiceDeps,
} from '../PostDropValidationService';

describe('PostDropValidationService', () => {
  const mockDate = new Date('2024-01-15T12:00:00Z');

  function createMockDb(options: {
    columnExists?: boolean;
    constraintExists?: boolean;
    indexExists?: boolean;
    membershipsExists?: boolean;
    userCount?: number;
    membershipCount?: number;
    orphanedCount?: number;
  } = {}) {
    const {
      columnExists = false, // After cleanup, column should not exist
      constraintExists = false,
      indexExists = false,
      membershipsExists = true,
      userCount = 100,
      membershipCount = 50,
      orphanedCount = 0,
    } = options;

    return {
      $queryRawUnsafe: vi.fn().mockImplementation((sql: string) => {
        // Column existence check
        if (sql.includes('information_schema.columns')) {
          return Promise.resolve([{ exists: columnExists }]);
        }
        // Constraint existence check
        if (sql.includes('information_schema.table_constraints')) {
          return Promise.resolve([{ exists: constraintExists }]);
        }
        // Index existence check
        if (sql.includes('pg_indexes')) {
          return Promise.resolve([{ exists: indexExists }]);
        }
        // Memberships table existence check
        if (sql.includes('information_schema.tables') && sql.includes('memberships')) {
          return Promise.resolve([{ exists: membershipsExists }]);
        }
        // User count
        if (sql.includes('COUNT(*)') && sql.includes('FROM "users"') && !sql.includes('LEFT JOIN')) {
          return Promise.resolve([{ count: BigInt(userCount) }]);
        }
        // Membership count
        if (sql.includes('COUNT(*)') && sql.includes('memberships') && !sql.includes('LEFT JOIN')) {
          return Promise.resolve([{ count: BigInt(membershipCount) }]);
        }
        // Orphaned memberships count
        if (sql.includes('LEFT JOIN') && sql.includes('WHERE u."id" IS NULL')) {
          return Promise.resolve([{ count: BigInt(orphanedCount) }]);
        }
        // Simple SELECT 1 for connection check
        if (sql === 'SELECT 1') {
          return Promise.resolve([{ '?column?': 1 }]);
        }
        // User lookup
        if (sql.includes('SELECT id, name, email FROM "users"')) {
          return Promise.resolve([{ id: 'user-1', name: 'Test', email: 'test@example.com' }]);
        }
        // Membership lookup
        if (sql.includes('SELECT id, user_id, tenant_id, role FROM "memberships"')) {
          return Promise.resolve([{ id: 'mem-1', user_id: 'user-1', tenant_id: 'tenant-1', role: 'RESIDENT' }]);
        }
        // User-membership join
        if (sql.includes('JOIN "memberships" m ON m.user_id = u.id')) {
          return Promise.resolve([{ id: 'user-1', name: 'Test', email: 'test@example.com', role: 'RESIDENT' }]);
        }
        // Tenant lookup
        if (sql.includes('FROM "tenants"')) {
          return Promise.resolve([{ id: 'tenant-1', name: 'Test Tenant', subdomain: 'test' }]);
        }
        // OrgUnit lookup
        if (sql.includes('FROM "org_units"')) {
          return Promise.resolve([{ id: 'org-1', tenant_id: 'tenant-1', name: 'Test', type: 'RT', path: ['org-1'] }]);
        }
        return Promise.resolve([]);
      }),
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    };
  }

  function createMockDeps(
    overrides: Partial<PostDropValidationServiceDeps> = {},
  ): PostDropValidationServiceDeps {
    return {
      db: createMockDb(),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      dateProvider: () => mockDate,
      ...overrides,
    };
  }

  describe('validate', () => {
    it('should pass all checks when schema is correct after cleanup', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.validate();

      expect(result.valid).toBe(true);
      expect(result.failedChecks).toHaveLength(0);
    });

    it('should fail if tenant_id column still exists', async () => {
      const deps = createMockDeps({
        db: createMockDb({ columnExists: true }),
      });
      const service = createPostDropValidationService(deps);

      const result = await service.validate();

      expect(result.valid).toBe(false);
      expect(result.failedChecks.some(c => c.name.includes('tenantId'))).toBe(true);
    });

    it('should fail if foreign key constraint still exists', async () => {
      const deps = createMockDeps({
        db: createMockDb({ constraintExists: true }),
      });
      const service = createPostDropValidationService(deps);

      const result = await service.validate();

      expect(result.valid).toBe(false);
      expect(result.failedChecks.some(c => c.name.includes('Foreign key'))).toBe(true);
    });

    it('should fail if indexes still exist', async () => {
      const deps = createMockDeps({
        db: createMockDb({ indexExists: true }),
      });
      const service = createPostDropValidationService(deps);

      const result = await service.validate();

      expect(result.valid).toBe(false);
      expect(result.failedChecks.some(c => c.name.includes('Index'))).toBe(true);
    });

    it('should fail if memberships table is missing', async () => {
      const deps = createMockDeps({
        db: createMockDb({ membershipsExists: false }),
      });
      const service = createPostDropValidationService(deps);

      const result = await service.validate();

      expect(result.valid).toBe(false);
      expect(result.failedChecks.some(c => c.name.includes('Memberships table'))).toBe(true);
    });

    it('should include data integrity checks', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.validate();

      const dataChecks = result.checks.filter(c => c.category === 'data');
      expect(dataChecks.length).toBeGreaterThan(0);
    });

    it('should detect orphaned memberships', async () => {
      const deps = createMockDeps({
        db: createMockDb({ orphanedCount: 5 }),
      });
      const service = createPostDropValidationService(deps);

      const result = await service.validate();

      expect(result.valid).toBe(false);
      expect(result.failedChecks.some(c => c.name.includes('orphaned'))).toBe(true);
    });

    it('should include correlation ID', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.validate('test-corr-123');

      expect(result.correlationId).toBe('test-corr-123');
    });

    it('should include validation timestamp', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.validate();

      expect(result.validatedAt).toEqual(mockDate);
    });
  });

  describe('columnExists', () => {
    it('should return false when column does not exist (expected after cleanup)', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const exists = await service.columnExists();

      expect(exists).toBe(false);
    });

    it('should return true when column still exists', async () => {
      const deps = createMockDeps({
        db: createMockDb({ columnExists: true }),
      });
      const service = createPostDropValidationService(deps);

      const exists = await service.columnExists();

      expect(exists).toBe(true);
    });
  });

  describe('verifyApplicationHealth', () => {
    it('should return healthy when all checks pass', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.verifyApplicationHealth();

      expect(result.healthy).toBe(true);
      expect(result.checks.every(c => c.passed)).toBe(true);
    });

    it('should include database connection check', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.verifyApplicationHealth();

      const dbCheck = result.checks.find(c => c.name === 'Database connection');
      expect(dbCheck).toBeDefined();
      expect(dbCheck?.passed).toBe(true);
    });

    it('should include users table query check', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.verifyApplicationHealth();

      const userCheck = result.checks.find(c => c.name === 'Users table query');
      expect(userCheck).toBeDefined();
      expect(userCheck?.passed).toBe(true);
    });

    it('should include memberships table query check', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.verifyApplicationHealth();

      const membershipCheck = result.checks.find(c => c.name === 'Memberships table query');
      expect(membershipCheck).toBeDefined();
      expect(membershipCheck?.passed).toBe(true);
    });

    it('should report unhealthy on database error', async () => {
      const mockDb = createMockDb();
      mockDb.$queryRawUnsafe.mockRejectedValue(new Error('Connection failed'));
      const deps = createMockDeps({ db: mockDb });
      const service = createPostDropValidationService(deps);

      const result = await service.verifyApplicationHealth();

      expect(result.healthy).toBe(false);
    });
  });

  describe('runSmokeTests', () => {
    it('should pass all smoke tests when system is healthy', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.runSmokeTests();

      expect(result.passed).toBe(true);
      expect(result.results.every(r => r.passed)).toBe(true);
    });

    it('should include membership resolution query test', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.runSmokeTests();

      const membershipTest = result.results.find(r => r.testName === 'Membership resolution query');
      expect(membershipTest).toBeDefined();
      expect(membershipTest?.passed).toBe(true);
    });

    it('should include user-membership join query test', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.runSmokeTests();

      const joinTest = result.results.find(r => r.testName === 'User-membership join query');
      expect(joinTest).toBeDefined();
      expect(joinTest?.passed).toBe(true);
    });

    it('should include user lookup by email test', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.runSmokeTests();

      const lookupTest = result.results.find(r => r.testName === 'User lookup by email');
      expect(lookupTest).toBeDefined();
      expect(lookupTest?.passed).toBe(true);
    });

    it('should include tenant query test', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.runSmokeTests();

      const tenantTest = result.results.find(r => r.testName === 'Tenant query');
      expect(tenantTest).toBeDefined();
      expect(tenantTest?.passed).toBe(true);
    });

    it('should include OrgUnit query test', async () => {
      const deps = createMockDeps();
      const service = createPostDropValidationService(deps);

      const result = await service.runSmokeTests();

      const orgUnitTest = result.results.find(r => r.testName === 'OrgUnit query');
      expect(orgUnitTest).toBeDefined();
      expect(orgUnitTest?.passed).toBe(true);
    });

    it('should report failure when a query fails', async () => {
      const mockDb = createMockDb();
      mockDb.$queryRawUnsafe.mockImplementation((sql: string) => {
        if (sql.includes('memberships') && sql.includes('ACTIVE')) {
          return Promise.reject(new Error('Query failed'));
        }
        return Promise.resolve([]);
      });
      const deps = createMockDeps({ db: mockDb });
      const service = createPostDropValidationService(deps);

      const result = await service.runSmokeTests();

      expect(result.passed).toBe(false);
      const failedTest = result.results.find(r => !r.passed);
      expect(failedTest).toBeDefined();
      expect(failedTest?.error).toContain('Query failed');
    });
  });
});
