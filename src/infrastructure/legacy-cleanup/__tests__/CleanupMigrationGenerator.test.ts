/**
 * Cleanup Migration Generator Tests
 *
 * Tests for SQL migration script generation.
 *
 * @see Task 37: Legacy Schema Cleanup
 * @see Requirement 13 (AC 2, 3, 6)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createCleanupMigrationGenerator,
  PRISMA_SCHEMA_UPDATE_INSTRUCTIONS,
} from '../CleanupMigrationGenerator';

describe('CleanupMigrationGenerator', () => {
  const mockDate = new Date('2024-01-15T12:00:00Z');

  function createGenerator() {
    return createCleanupMigrationGenerator({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
      dateProvider: () => mockDate,
    });
  }

  describe('generateMigration', () => {
    it('should generate a migration script', async () => {
      const generator = createGenerator();

      const script = await generator.generateMigration();

      expect(script).toBeDefined();
      expect(script.scriptId).toMatch(/^cleanup-migration-/);
      expect(script.generatedAt).toEqual(mockDate);
    });

    it('should include all required operations', async () => {
      const generator = createGenerator();

      const script = await generator.generateMigration();

      // Should have operations for:
      // 1. Drop FK constraint
      // 2. Drop unique constraint
      // 3. Drop indexes
      // 4. Drop column
      expect(script.operations.length).toBeGreaterThanOrEqual(4);
    });

    it('should include DROP_COLUMN operation for tenant_id', async () => {
      const generator = createGenerator();

      const script = await generator.generateMigration();

      const dropColumnOp = script.operations.find(
        op => op.type === 'DROP_COLUMN' && op.columnName === 'tenant_id',
      );
      expect(dropColumnOp).toBeDefined();
      expect(dropColumnOp?.sql).toContain('DROP COLUMN');
      expect(dropColumnOp?.sql).toContain('tenant_id');
    });

    it('should include DROP_CONSTRAINT operations', async () => {
      const generator = createGenerator();

      const script = await generator.generateMigration();

      const constraintOps = script.operations.filter(op => op.type === 'DROP_CONSTRAINT');
      expect(constraintOps.length).toBeGreaterThanOrEqual(2);
    });

    it('should include DROP_INDEX operations', async () => {
      const generator = createGenerator();

      const script = await generator.generateMigration();

      const indexOps = script.operations.filter(op => op.type === 'DROP_INDEX');
      expect(indexOps.length).toBeGreaterThanOrEqual(1);
    });

    it('should generate forward SQL', async () => {
      const generator = createGenerator();

      const script = await generator.generateMigration();

      expect(script.forwardSql).toBeDefined();
      expect(script.forwardSql).toContain('DROP');
      expect(script.forwardSql).toContain('tenant_id');
    });

    it('should generate rollback SQL', async () => {
      const generator = createGenerator();

      const script = await generator.generateMigration();

      expect(script.rollbackSql).toBeDefined();
      expect(script.rollbackSql).toContain('ADD COLUMN');
    });

    it('should require maintenance window', async () => {
      const generator = createGenerator();

      const script = await generator.generateMigration();

      expect(script.requiresMaintenanceWindow).toBe(true);
    });

    it('should include pre-conditions', async () => {
      const generator = createGenerator();

      const script = await generator.generateMigration();

      expect(script.preConditions.length).toBeGreaterThan(0);
      expect(script.preConditions.some(c => c.includes('FASE 1.14'))).toBe(true);
      expect(script.preConditions.some(c => c.includes('stabilization'))).toBe(true);
      expect(script.preConditions.some(c => c.includes('Backup'))).toBe(true);
    });

    it('should include post-conditions', async () => {
      const generator = createGenerator();

      const script = await generator.generateMigration();

      expect(script.postConditions.length).toBeGreaterThan(0);
      expect(script.postConditions.some(c => c.includes('tenant_id'))).toBe(true);
    });

    it('should include correlation ID when provided', async () => {
      const generator = createGenerator();

      const script = await generator.generateMigration('test-corr-123');

      expect(script.correlationId).toBe('test-corr-123');
    });

    it('should mark operations as destructive', async () => {
      const generator = createGenerator();

      const script = await generator.generateMigration();

      const destructiveOps = script.operations.filter(op => op.isDestructive);
      expect(destructiveOps.length).toBeGreaterThanOrEqual(4);
    });

    it('should order operations correctly', async () => {
      const generator = createGenerator();

      const script = await generator.generateMigration();

      // DROP_COLUMN should be last (highest order)
      const dropColumnOp = script.operations.find(op => op.type === 'DROP_COLUMN');
      const maxOrder = Math.max(...script.operations.map(op => op.order));
      expect(dropColumnOp?.order).toBe(maxOrder);
    });
  });

  describe('getDropTenantIdOperations', () => {
    it('should return operations array', () => {
      const generator = createGenerator();

      const operations = generator.getDropTenantIdOperations();

      expect(Array.isArray(operations)).toBe(true);
      expect(operations.length).toBeGreaterThan(0);
    });

    it('should include all necessary operations', () => {
      const generator = createGenerator();

      const operations = generator.getDropTenantIdOperations();

      const types = operations.map(op => op.type);
      expect(types).toContain('DROP_CONSTRAINT');
      expect(types).toContain('DROP_INDEX');
      expect(types).toContain('DROP_COLUMN');
    });

    it('should have descriptions for all operations', () => {
      const generator = createGenerator();

      const operations = generator.getDropTenantIdOperations();

      operations.forEach(op => {
        expect(op.description).toBeDefined();
        expect(op.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getRemoveEnumValuesOperations', () => {
    it('should return empty array (no enum values to remove currently)', () => {
      const generator = createGenerator();

      const operations = generator.getRemoveEnumValuesOperations();

      // Currently no enum values need removal
      expect(operations).toHaveLength(0);
    });
  });

  describe('validateMigration', () => {
    it('should validate a correct migration', async () => {
      const generator = createGenerator();
      const script = await generator.generateMigration();

      const result = await generator.validateMigration(script);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail if DROP_COLUMN is missing', async () => {
      const generator = createGenerator();

      const invalidScript = {
        scriptId: 'test',
        version: '1.0.0',
        generatedAt: mockDate,
        operations: [], // No operations
        forwardSql: '',
        rollbackSql: '',
        preConditions: ['test'],
        postConditions: ['test'],
        estimatedDurationSeconds: 60,
        requiresMaintenanceWindow: true,
        correlationId: 'test',
      };

      const result = await generator.validateMigration(invalidScript);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('DROP_COLUMN'))).toBe(true);
    });

    it('should fail if maintenance window not required', async () => {
      const generator = createGenerator();
      const script = await generator.generateMigration();

      // @ts-expect-error - Testing validation
      const invalidScript = { ...script, requiresMaintenanceWindow: false };

      const result = await generator.validateMigration(invalidScript);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('maintenance window'))).toBe(true);
    });

    it('should fail if pre-conditions are empty', async () => {
      const generator = createGenerator();
      const script = await generator.generateMigration();

      // @ts-expect-error - Testing validation
      const invalidScript = { ...script, preConditions: [] };

      const result = await generator.validateMigration(invalidScript);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('pre-conditions'))).toBe(true);
    });

    it('should fail if post-conditions are empty', async () => {
      const generator = createGenerator();
      const script = await generator.generateMigration();

      // @ts-expect-error - Testing validation
      const invalidScript = { ...script, postConditions: [] };

      const result = await generator.validateMigration(invalidScript);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('post-conditions'))).toBe(true);
    });

    it('should fail if rollback SQL is missing', async () => {
      const generator = createGenerator();
      const script = await generator.generateMigration();

      // @ts-expect-error - Testing validation
      const invalidScript = { ...script, rollbackSql: '' };

      const result = await generator.validateMigration(invalidScript);

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('rollback SQL'))).toBe(true);
    });
  });

  describe('PRISMA_SCHEMA_UPDATE_INSTRUCTIONS', () => {
    it('should contain instructions for updating Prisma schema', () => {
      expect(PRISMA_SCHEMA_UPDATE_INSTRUCTIONS).toContain('prisma/schema.prisma');
      expect(PRISMA_SCHEMA_UPDATE_INSTRUCTIONS).toContain('tenantId');
      expect(PRISMA_SCHEMA_UPDATE_INSTRUCTIONS).toContain('npx prisma generate');
    });

    it('should mention User model', () => {
      expect(PRISMA_SCHEMA_UPDATE_INSTRUCTIONS).toContain('User model');
    });

    it('should mention Tenant model', () => {
      expect(PRISMA_SCHEMA_UPDATE_INSTRUCTIONS).toContain('Tenant model');
    });
  });
});
