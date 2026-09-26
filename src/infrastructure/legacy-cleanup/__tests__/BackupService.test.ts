/**
 * Backup Service Tests
 *
 * Tests for backup creation, rollback, and checkpoint management.
 *
 * @see Task 37: Legacy Schema Cleanup
 * @see Requirement 13 (AC 4, 5)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBackupService,
  type BackupServiceDeps,
} from '../BackupService';

describe('BackupService', () => {
  const mockDate = new Date('2024-01-15T12:00:00Z');

  function createMockDb() {
    return {
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $queryRawUnsafe: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return Promise.resolve([{ count: BigInt(100) }]);
        }
        if (sql.includes('EXISTS') && sql.includes('information_schema.tables')) {
          return Promise.resolve([{ exists: true }]);
        }
        if (sql.includes('EXISTS') && sql.includes('information_schema.columns')) {
          return Promise.resolve([{ exists: true }]);
        }
        return Promise.resolve([]);
      }),
    };
  }

  function createMockDeps(
    overrides: Partial<BackupServiceDeps> = {},
  ): BackupServiceDeps {
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

  describe('createBackup', () => {
    it('should create a backup checkpoint successfully', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      const result = await service.createBackup();

      expect(result.success).toBe(true);
      expect(result.checkpoint).not.toBeNull();
      expect(result.checkpoint?.checkpointId).toMatch(/^backup-/);
      expect(result.checkpoint?.createdAt).toEqual(mockDate);
      expect(result.checkpoint?.isValid).toBe(true);
    });

    it('should include correct expiration time (24 hours)', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      const result = await service.createBackup();

      const expectedExpiration = new Date(mockDate.getTime() + 24 * 60 * 60 * 1000);
      expect(result.checkpoint?.expiresAt).toEqual(expectedExpiration);
    });

    it('should use custom expiration hours when provided', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      const result = await service.createBackup({ expirationHours: 48 });

      const expectedExpiration = new Date(mockDate.getTime() + 48 * 60 * 60 * 1000);
      expect(result.checkpoint?.expiresAt).toEqual(expectedExpiration);
    });

    it('should include notes in checkpoint', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      const result = await service.createBackup({ notes: 'Test backup' });

      expect(result.checkpoint?.notes).toBe('Test backup');
    });

    it('should include correlation ID', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      const result = await service.createBackup({ correlationId: 'test-corr-123' });

      expect(result.checkpoint?.correlationId).toBe('test-corr-123');
    });

    it('should execute CREATE TABLE for backup', async () => {
      const mockDb = createMockDb();
      const deps = createMockDeps({ db: mockDb });
      const service = createBackupService(deps);

      await service.createBackup();

      expect(mockDb.$executeRawUnsafe).toHaveBeenCalled();
      const calls = mockDb.$executeRawUnsafe.mock.calls;
      const createTableCall = calls.find(
        (call: string[]) => call[0]?.includes('CREATE TABLE'),
      );
      expect(createTableCall).toBeDefined();
    });

    it('should skip backup if tenant_id column does not exist', async () => {
      const mockDb = createMockDb();
      mockDb.$queryRawUnsafe.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return Promise.resolve([{ count: BigInt(100) }]);
        }
        if (sql.includes('EXISTS') && sql.includes('information_schema.tables')) {
          return Promise.resolve([{ exists: true }]);
        }
        if (sql.includes('EXISTS') && sql.includes('information_schema.columns')) {
          // tenant_id column does not exist
          return Promise.resolve([{ exists: false }]);
        }
        return Promise.resolve([]);
      });
      const deps = createMockDeps({ db: mockDb });
      const service = createBackupService(deps);

      const result = await service.createBackup();

      expect(result.success).toBe(true);
      // Should not have created backup table since column doesn't exist
      expect(result.checkpoint?.tables).toHaveLength(0);
    });

    it('should fail when source table does not exist', async () => {
      const mockDb = createMockDb();
      mockDb.$queryRawUnsafe.mockImplementation((sql: string) => {
        if (sql.includes('EXISTS') && sql.includes('information_schema.tables')) {
          return Promise.resolve([{ exists: false }]);
        }
        return Promise.resolve([]);
      });
      // Need to make column exist check pass first
      mockDb.$queryRawUnsafe.mockImplementation((sql: string) => {
        if (sql.includes('information_schema.columns')) {
          return Promise.resolve([{ exists: true }]);
        }
        if (sql.includes('information_schema.tables')) {
          return Promise.resolve([{ exists: false }]);
        }
        return Promise.resolve([]);
      });
      const deps = createMockDeps({ db: mockDb });
      const service = createBackupService(deps);

      const result = await service.createBackup();

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('does not exist');
    });
  });

  describe('listCheckpoints', () => {
    it('should return empty list initially', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      const checkpoints = await service.listCheckpoints();

      expect(checkpoints).toHaveLength(0);
    });

    it('should return created checkpoints', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      await service.createBackup();
      const checkpoints = await service.listCheckpoints();

      expect(checkpoints).toHaveLength(1);
    });

    it('should mark expired checkpoints as invalid', async () => {
      let currentDate = mockDate;
      const deps = createMockDeps({
        dateProvider: () => currentDate,
      });
      const service = createBackupService(deps);

      // Create backup
      await service.createBackup();

      // Move time forward 25 hours (past 24-hour expiration)
      currentDate = new Date(mockDate.getTime() + 25 * 60 * 60 * 1000);

      const checkpoints = await service.listCheckpoints();

      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0].isValid).toBe(false);
    });
  });

  describe('getCheckpoint', () => {
    it('should return null for non-existent checkpoint', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      const checkpoint = await service.getCheckpoint('non-existent-id');

      expect(checkpoint).toBeNull();
    });

    it('should return checkpoint by ID', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      const result = await service.createBackup();
      const checkpointId = result.checkpoint!.checkpointId;

      const checkpoint = await service.getCheckpoint(checkpointId);

      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.checkpointId).toBe(checkpointId);
    });
  });

  describe('isCheckpointValid', () => {
    it('should return false for non-existent checkpoint', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      const isValid = await service.isCheckpointValid('non-existent-id');

      expect(isValid).toBe(false);
    });

    it('should return true for valid checkpoint', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      const result = await service.createBackup();
      const isValid = await service.isCheckpointValid(result.checkpoint!.checkpointId);

      expect(isValid).toBe(true);
    });

    it('should return false for expired checkpoint', async () => {
      let currentDate = mockDate;
      const deps = createMockDeps({
        dateProvider: () => currentDate,
      });
      const service = createBackupService(deps);

      const result = await service.createBackup();

      // Move time forward 25 hours
      currentDate = new Date(mockDate.getTime() + 25 * 60 * 60 * 1000);

      const isValid = await service.isCheckpointValid(result.checkpoint!.checkpointId);

      expect(isValid).toBe(false);
    });
  });

  describe('rollback', () => {
    it('should fail for non-existent checkpoint', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      const result = await service.rollback('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('not found');
    });

    it('should fail for expired checkpoint', async () => {
      let currentDate = mockDate;
      const deps = createMockDeps({
        dateProvider: () => currentDate,
      });
      const service = createBackupService(deps);

      const backupResult = await service.createBackup();
      const checkpointId = backupResult.checkpoint!.checkpointId;

      // Move time forward 25 hours
      currentDate = new Date(mockDate.getTime() + 25 * 60 * 60 * 1000);

      const result = await service.rollback(checkpointId);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('expired');
    });

    it('should execute rollback for valid checkpoint', async () => {
      const mockDb = createMockDb();
      const deps = createMockDeps({ db: mockDb });
      const service = createBackupService(deps);

      const backupResult = await service.createBackup();
      const checkpointId = backupResult.checkpoint!.checkpointId;

      // Reset mock calls to only capture rollback operations
      mockDb.$executeRawUnsafe.mockClear();

      const result = await service.rollback(checkpointId);

      expect(result.success).toBe(true);
      expect(result.checkpointId).toBe(checkpointId);
    });
  });

  describe('cleanupExpiredCheckpoints', () => {
    it('should return 0 when no checkpoints exist', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      const cleaned = await service.cleanupExpiredCheckpoints();

      expect(cleaned).toBe(0);
    });

    it('should not clean valid checkpoints', async () => {
      const deps = createMockDeps();
      const service = createBackupService(deps);

      await service.createBackup();
      const cleaned = await service.cleanupExpiredCheckpoints();

      expect(cleaned).toBe(0);

      const checkpoints = await service.listCheckpoints();
      expect(checkpoints).toHaveLength(1);
    });

    it('should clean expired checkpoints', async () => {
      let currentDate = mockDate;
      const deps = createMockDeps({
        dateProvider: () => currentDate,
      });
      const service = createBackupService(deps);

      await service.createBackup();

      // Move time forward 25 hours
      currentDate = new Date(mockDate.getTime() + 25 * 60 * 60 * 1000);

      const cleaned = await service.cleanupExpiredCheckpoints();

      expect(cleaned).toBe(1);

      const checkpoints = await service.listCheckpoints();
      expect(checkpoints).toHaveLength(0);
    });
  });
});
