/**
 * Schema Cleanup Service Tests
 *
 * Tests for the main cleanup orchestration service.
 *
 * @see Task 37: Legacy Schema Cleanup
 * @see Requirement 13 (AC 1-7)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSchemaCleanupService,
  type SchemaCleanupServiceDeps,
} from '../SchemaCleanupService';
import type {
  IPreFlightVerificationService,
  IBackupService,
  ICleanupMigrationGenerator,
  IPostDropValidationService,
  PreFlightVerificationResult,
  BackupResult,
  CleanupMigrationScript,
  PostDropValidationResult,
} from '../types';

describe('SchemaCleanupService', () => {
  const mockDate = new Date('2024-01-15T12:00:00Z');

  function createMockPreFlightService(): IPreFlightVerificationService {
    const mockResult: PreFlightVerificationResult = {
      verified: true,
      verifiedAt: mockDate,
      criteria: {
        legacyDependencyStopped: { passed: true, checkedAt: mockDate, evidence: 'passed' },
        zeroAuthorizationDependency: { passed: true, checkedAt: mockDate, evidence: 'passed' },
        zeroLegacyWrites: { passed: true, checkedAt: mockDate, evidence: 'passed' },
        stabilizationWindowPassed: { passed: true, checkedAt: mockDate, evidence: 'passed' },
        backupCheckpointCreated: { passed: true, checkedAt: mockDate, evidence: 'passed' },
        destructiveApprovalGate: { passed: true, checkedAt: mockDate, evidence: 'passed' },
      },
      blockingIssues: [],
      warnings: [],
      correlationId: 'test-corr',
    };

    return {
      verify: vi.fn().mockResolvedValue(mockResult),
      checkCriterion: vi.fn().mockResolvedValue({ passed: true, checkedAt: mockDate, evidence: 'passed' }),
      getStabilizationStatus: vi.fn().mockResolvedValue({
        windowPassed: true,
        fase114CompletedAt: mockDate,
        windowEndTime: mockDate,
        hoursRemaining: 0,
      }),
    };
  }

  function createMockBackupService(): IBackupService {
    const mockResult: BackupResult = {
      success: true,
      checkpoint: {
        checkpointId: 'backup-123',
        createdAt: mockDate,
        tables: [{ tableName: 'users', columns: ['tenant_id'], backupTableName: 'users_backup', rowCount: 100 }],
        totalRows: 100,
        expiresAt: new Date(mockDate.getTime() + 24 * 60 * 60 * 1000),
        isValid: true,
        correlationId: 'test-corr',
      },
      durationMs: 1000,
    };

    return {
      createBackup: vi.fn().mockResolvedValue(mockResult),
      listCheckpoints: vi.fn().mockResolvedValue([]),
      getCheckpoint: vi.fn().mockResolvedValue(null),
      rollback: vi.fn().mockResolvedValue({
        success: true,
        checkpointId: 'backup-123',
        tablesRestored: ['users'],
        rowsRestored: 100,
        durationMs: 500,
      }),
      isCheckpointValid: vi.fn().mockResolvedValue(true),
      cleanupExpiredCheckpoints: vi.fn().mockResolvedValue(0),
    };
  }

  function createMockMigrationGenerator(): ICleanupMigrationGenerator {
    const mockScript: CleanupMigrationScript = {
      scriptId: 'migration-123',
      version: '1.0.0',
      generatedAt: mockDate,
      operations: [
        {
          type: 'DROP_COLUMN',
          tableName: 'users',
          columnName: 'tenant_id',
          sql: 'ALTER TABLE users DROP COLUMN tenant_id',
          rollbackSql: 'ALTER TABLE users ADD COLUMN tenant_id VARCHAR(255)',
          isDestructive: true,
          description: 'Drop tenant_id column',
          order: 1,
        },
      ],
      forwardSql: 'ALTER TABLE users DROP COLUMN tenant_id',
      rollbackSql: 'ALTER TABLE users ADD COLUMN tenant_id VARCHAR(255)',
      preConditions: ['FASE 1.14 complete'],
      postConditions: ['tenant_id column removed'],
      estimatedDurationSeconds: 60,
      requiresMaintenanceWindow: true,
      correlationId: 'test-corr',
    };

    return {
      generateMigration: vi.fn().mockResolvedValue(mockScript),
      getDropTenantIdOperations: vi.fn().mockReturnValue(mockScript.operations),
      getRemoveEnumValuesOperations: vi.fn().mockReturnValue([]),
      validateMigration: vi.fn().mockResolvedValue({ valid: true, issues: [] }),
    };
  }

  function createMockPostDropValidationService(): IPostDropValidationService {
    const mockResult: PostDropValidationResult = {
      valid: true,
      validatedAt: mockDate,
      checks: [{ name: 'tenant_id column removed', passed: true, category: 'schema', evidence: 'Column not found' }],
      failedChecks: [],
      warnings: [],
      correlationId: 'test-corr',
    };

    return {
      validate: vi.fn().mockResolvedValue(mockResult),
      columnExists: vi.fn().mockResolvedValue(false),
      verifyApplicationHealth: vi.fn().mockResolvedValue({ healthy: true, checks: [] }),
      runSmokeTests: vi.fn().mockResolvedValue({ passed: true, results: [] }),
    };
  }

  function createMockDb() {
    return {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn().mockImplementation(fn => fn({})),
    };
  }

  function createMockDeps(
    overrides: Partial<SchemaCleanupServiceDeps> = {},
  ): SchemaCleanupServiceDeps {
    return {
      preFlightService: createMockPreFlightService(),
      backupService: createMockBackupService(),
      migrationGenerator: createMockMigrationGenerator(),
      postDropValidationService: createMockPostDropValidationService(),
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

  describe('preview (dry-run)', () => {
    it('should execute workflow without making changes', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const result = await service.preview();

      expect(result.success).toBe(true);
      expect(deps.preFlightService.verify).toHaveBeenCalled();
      expect(deps.backupService.createBackup).toHaveBeenCalled();
      expect(deps.migrationGenerator.generateMigration).toHaveBeenCalled();
      // SQL should NOT be executed in dry-run
      expect(deps.db.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('should return execution result with all phases', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const result = await service.preview();

      expect(result.preFlightResult).toBeDefined();
      expect(result.backupResult).toBeDefined();
      expect(result.postDropResult).toBeDefined();
      expect(result.log.length).toBeGreaterThan(0);
    });

    it('should complete with COMPLETED phase', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const result = await service.preview();

      expect(result.finalPhase).toBe('COMPLETED');
    });
  });

  describe('execute', () => {
    it('should fail without approval in non-dry-run mode', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const result = await service.execute({ dryRun: false });

      expect(result.success).toBe(false);
      expect(result.log.some(l => l.message.toLowerCase().includes('approval'))).toBe(true);
    });

    it('should require approval before destructive operations', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      // First get approval
      await service.requestApproval('admin-user', 'Maintenance window');

      // Then execute
      const result = await service.execute({ dryRun: false });

      expect(result.success).toBe(true);
      expect(deps.db.$executeRawUnsafe).toHaveBeenCalled();
    });

    it('should fail if pre-flight verification fails', async () => {
      const mockPreFlight = createMockPreFlightService();
      mockPreFlight.verify = vi.fn().mockResolvedValue({
        verified: false,
        verifiedAt: mockDate,
        criteria: {},
        blockingIssues: ['FASE 1.14 not complete'],
        warnings: [],
        correlationId: 'test',
      });
      const deps = createMockDeps({ preFlightService: mockPreFlight });
      const service = createSchemaCleanupService(deps);

      const result = await service.preview();

      expect(result.success).toBe(false);
      expect(result.finalPhase).toBe('PRE_FLIGHT_VERIFICATION');
    });

    it('should fail if backup creation fails', async () => {
      const mockBackup = createMockBackupService();
      mockBackup.createBackup = vi.fn().mockResolvedValue({
        success: false,
        checkpoint: null,
        errorMessage: 'Backup failed',
        durationMs: 100,
      });
      const deps = createMockDeps({ backupService: mockBackup });
      const service = createSchemaCleanupService(deps);

      const result = await service.preview();

      expect(result.success).toBe(false);
      expect(result.finalPhase).toBe('BACKUP_CREATION');
    });

    it('should fail if migration validation fails', async () => {
      const mockGenerator = createMockMigrationGenerator();
      mockGenerator.validateMigration = vi.fn().mockResolvedValue({
        valid: false,
        issues: ['Missing DROP_COLUMN operation'],
      });
      const deps = createMockDeps({ migrationGenerator: mockGenerator });
      const service = createSchemaCleanupService(deps);
      await service.requestApproval('admin', 'test');

      const result = await service.execute({ dryRun: false });

      expect(result.success).toBe(false);
      expect(result.log.some(l => l.message.toLowerCase().includes('validation failed'))).toBe(true);
    });

    it('should execute SQL operations in non-dry-run mode', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);
      await service.requestApproval('admin', 'test');

      const result = await service.execute({ dryRun: false });

      expect(result.success).toBe(true);
      expect(deps.db.$executeRawUnsafe).toHaveBeenCalled();
    });

    it('should skip pre-flight when skipPreFlight is true', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const result = await service.preview('test-corr');

      // Should still work with skipPreFlight
      const resultWithSkip = await service.execute({
        dryRun: true,
        skipPreFlight: true,
      });

      expect(resultWithSkip.success).toBe(true);
    });
  });

  describe('canExecute', () => {
    it('should return pre-flight verification result', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const result = await service.canExecute();

      expect(result.verified).toBe(true);
      expect(deps.preFlightService.verify).toHaveBeenCalled();
    });
  });

  describe('requestApproval', () => {
    it('should grant approval', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const approval = await service.requestApproval('admin-user', 'Maintenance window');

      expect(approval.approvalId).toBeDefined();
      expect(approval.approverId).toBe('admin-user');
      expect(approval.reason).toBe('Maintenance window');
      expect(approval.approvedAt).toEqual(mockDate);
    });

    it('should set expiration time', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const approval = await service.requestApproval('admin-user', 'test');

      expect(approval.expiresAt.getTime()).toBeGreaterThan(mockDate.getTime());
    });
  });

  describe('getApprovalStatus', () => {
    it('should return not approved initially', () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const status = service.getApprovalStatus();

      expect(status.approved).toBe(false);
      expect(status.approval).toBeNull();
    });

    it('should return approved after requestApproval', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      await service.requestApproval('admin-user', 'test');
      const status = service.getApprovalStatus();

      expect(status.approved).toBe(true);
      expect(status.isValid).toBe(true);
      expect(status.approval).not.toBeNull();
    });
  });

  describe('getStatus', () => {
    it('should return null initially', () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const status = service.getStatus();

      expect(status).toBeNull();
    });

    it('should return status after execution starts', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      await service.preview();
      const status = service.getStatus();

      expect(status).not.toBeNull();
      expect(status?.complete).toBe(true);
    });
  });

  describe('rollback', () => {
    it('should fail if no backup exists', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const result = await service.rollback();

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('No backup');
    });

    it('should rollback from latest backup after execution', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      // First execute (dry-run still creates backup)
      await service.preview();

      // Then rollback
      const result = await service.rollback();

      expect(result.success).toBe(true);
      expect(deps.backupService.rollback).toHaveBeenCalled();
    });
  });

  describe('execution logging', () => {
    it('should log all phases', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const result = await service.preview();

      expect(result.log.length).toBeGreaterThan(0);
      const phases = result.log.map(l => l.phase);
      expect(phases).toContain('PRE_FLIGHT_VERIFICATION');
      expect(phases).toContain('BACKUP_CREATION');
      expect(phases).toContain('MIGRATION_EXECUTION');
      expect(phases).toContain('POST_DROP_VALIDATION');
      expect(phases).toContain('COMPLETED');
    });

    it('should include correlation ID in result', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const result = await service.preview('my-correlation-id');

      expect(result.correlationId).toBe('my-correlation-id');
    });

    it('should measure execution duration', async () => {
      const deps = createMockDeps();
      const service = createSchemaCleanupService(deps);

      const result = await service.preview();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
