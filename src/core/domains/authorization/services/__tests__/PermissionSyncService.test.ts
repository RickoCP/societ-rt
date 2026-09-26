/**
 * Unit tests for PermissionSyncService.
 *
 * @see Task 67 — Permission Sync Mechanism (Req 35)
 * @see Requirements 35 (Permission Sync)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PermissionSyncServiceImpl,
  type IPermissionSyncService,
  type IPermissionSyncAuditLogger,
  type PermissionSyncAuditEntry,
  type PermissionTargetState,
  type ConsistencyCheckResult,
  SyncOperationType,
  SyncStatus,
  ConflictResolutionStrategy,
  DEFAULT_PERMISSION_SYNC_CONFIG,
} from '../PermissionSyncService';
import { MembershipRole } from '@core/domains/membership/types';
import { ROLE_PERMISSIONS } from '../../permissions/PermissionRegistry';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock audit logger that collects logged entries.
 */
const createMockAuditLogger = (): {
  logger: IPermissionSyncAuditLogger;
  syncEntries: PermissionSyncAuditEntry[];
  consistencyChecks: { targetId: string; result: ConsistencyCheckResult; correlationId?: string }[];
} => {
  const syncEntries: PermissionSyncAuditEntry[] = [];
  const consistencyChecks: { targetId: string; result: ConsistencyCheckResult; correlationId?: string }[] = [];
  
  const logger: IPermissionSyncAuditLogger = {
    async logSyncOperation(entry: PermissionSyncAuditEntry): Promise<void> {
      syncEntries.push(entry);
    },
    async logConsistencyCheck(
      targetId: string,
      result: ConsistencyCheckResult,
      correlationId?: string,
    ): Promise<void> {
      consistencyChecks.push({ targetId, result, correlationId });
    },
  };
  
  return { logger, syncEntries, consistencyChecks };
};

/**
 * Create a test instance of PermissionSyncService.
 */
const createTestService = (
  options?: {
    auditLogger?: IPermissionSyncAuditLogger;
    conflictStrategy?: ConflictResolutionStrategy;
  },
): IPermissionSyncService => {
  const { auditLogger, conflictStrategy = ConflictResolutionStrategy.REJECT } = options ?? {};
  return PermissionSyncServiceImpl({
    config: {
      ...DEFAULT_PERMISSION_SYNC_CONFIG,
      defaultConflictStrategy: conflictStrategy,
    },
    auditLogger,
  });
};

/**
 * Create a target state matching the source registry.
 */
const createMatchingTargetState = (): PermissionTargetState => {
  const rolePermissions: Record<MembershipRole, readonly string[]> = {} as Record<MembershipRole, readonly string[]>;
  for (const role of Object.values(MembershipRole)) {
    rolePermissions[role] = [...ROLE_PERMISSIONS[role]];
  }
  return {
    targetId: 'test-target',
    rolePermissions,
  };
};

/**
 * Create a target state with missing permissions.
 */
const createPartialTargetState = (): PermissionTargetState => {
  const rolePermissions: Record<MembershipRole, readonly string[]> = {} as Record<MembershipRole, readonly string[]>;
  for (const role of Object.values(MembershipRole)) {
    // Only include half the permissions for each role
    const sourcePerms = ROLE_PERMISSIONS[role];
    rolePermissions[role] = sourcePerms.slice(0, Math.ceil(sourcePerms.length / 2));
  }
  return {
    targetId: 'partial-target',
    rolePermissions,
  };
};

/**
 * Create an empty target state.
 */
const createEmptyTargetState = (): PermissionTargetState => {
  const rolePermissions: Record<MembershipRole, readonly string[]> = {} as Record<MembershipRole, readonly string[]>;
  for (const role of Object.values(MembershipRole)) {
    rolePermissions[role] = [];
  }
  return {
    targetId: 'empty-target',
    rolePermissions,
  };
};

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const TEST_TARGET_ID = 'test-sync-target';
const TEST_CORRELATION_ID = 'test-correlation-123';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PermissionSyncService', () => {
  let service: IPermissionSyncService;
  let mockLogger: ReturnType<typeof createMockAuditLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockAuditLogger();
    service = createTestService({ auditLogger: mockLogger.logger });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Configuration Tests
  // -------------------------------------------------------------------------

  describe('Configuration', () => {
    it('should return default configuration', () => {
      const config = service.getConfig();

      expect(config.defaultConflictStrategy).toBe(ConflictResolutionStrategy.REJECT);
      expect(config.syncTimeoutMs).toBe(5000);
      expect(config.invalidateCacheOnSync).toBe(true);
      expect(config.requireForceSyncConfirmation).toBe(true);
      expect(config.maxRetries).toBe(3);
      expect(config.enableDetailedLogging).toBe(true);
    });

    it('should allow updating configuration', () => {
      service.updateConfig({ syncTimeoutMs: 10000 });
      const config = service.getConfig();

      expect(config.syncTimeoutMs).toBe(10000);
    });

    it('should preserve unmodified config values when updating', () => {
      service.updateConfig({ maxRetries: 5 });
      const config = service.getConfig();

      expect(config.maxRetries).toBe(5);
      expect(config.syncTimeoutMs).toBe(5000);
      expect(config.defaultConflictStrategy).toBe(ConflictResolutionStrategy.REJECT);
    });
  });

  // -------------------------------------------------------------------------
  // Source State Tests
  // -------------------------------------------------------------------------

  describe('getSourceState', () => {
    it('should return the current source registry state', () => {
      const sourceState = service.getSourceState();

      expect(sourceState.targetId).toBe('source-registry');
      expect(sourceState.rolePermissions).toBeDefined();
      expect(sourceState.version).toBeDefined();
      expect(sourceState.lastSyncAt).toBeDefined();
    });

    it('should include all membership roles', () => {
      const sourceState = service.getSourceState();

      for (const role of Object.values(MembershipRole)) {
        expect(sourceState.rolePermissions[role]).toBeDefined();
        expect(sourceState.rolePermissions[role].length).toBeGreaterThan(0);
      }
    });

    it('should match the ROLE_PERMISSIONS from registry', () => {
      const sourceState = service.getSourceState();

      for (const role of Object.values(MembershipRole)) {
        const sourcePerms = new Set(sourceState.rolePermissions[role]);
        const registryPerms = new Set(ROLE_PERMISSIONS[role]);
        expect(sourcePerms).toEqual(registryPerms);
      }
    });
  });

  describe('computeSourceVersion', () => {
    it('should return a deterministic version hash', () => {
      const version1 = service.computeSourceVersion();
      const version2 = service.computeSourceVersion();

      expect(version1).toBe(version2);
      expect(version1).toMatch(/^v[a-z0-9]+$/);
    });
  });

  // -------------------------------------------------------------------------
  // Validate Source Registry Tests
  // -------------------------------------------------------------------------

  describe('validateSourceRegistry', () => {
    it('should return success with empty errors for valid registry', () => {
      const result = service.validateSourceRegistry();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Needs Sync Tests
  // -------------------------------------------------------------------------

  describe('needsSync', () => {
    it('should return false when target matches source version', () => {
      const targetState = createMatchingTargetState();
      targetState.rolePermissions; // Access to trigger version computation
      const sourceVersion = service.computeSourceVersion();
      
      const targetWithVersion: PermissionTargetState = {
        ...targetState,
        version: sourceVersion,
      };

      expect(service.needsSync(targetWithVersion)).toBe(false);
    });

    it('should return true when target has different version', () => {
      const targetState = createPartialTargetState();
      
      const targetWithVersion: PermissionTargetState = {
        ...targetState,
        version: 'old-version',
      };

      expect(service.needsSync(targetWithVersion)).toBe(true);
    });

    it('should return true when target has no version', () => {
      const targetState = createEmptyTargetState();

      expect(service.needsSync(targetState)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Sync Permissions Tests
  // -------------------------------------------------------------------------

  describe('syncPermissions', () => {
    describe('Initial Sync', () => {
      it('should sync all permissions to empty target', async () => {
        const targetState = createEmptyTargetState();

        const result = await service.syncPermissions(
          {
            operationType: SyncOperationType.INITIAL,
            targetId: TEST_TARGET_ID,
            correlationId: TEST_CORRELATION_ID,
          },
          targetState,
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.operationType).toBe(SyncOperationType.INITIAL);
          expect(result.data.totalPermissions).toBeGreaterThan(0);
          expect(result.data.roleResults.length).toBe(Object.values(MembershipRole).length);
        }
      });

      it('should generate unique sync ID', async () => {
        const targetState = createEmptyTargetState();

        const result1 = await service.syncPermissions(
          {
            operationType: SyncOperationType.INITIAL,
            targetId: TEST_TARGET_ID,
          },
          targetState,
        );

        const result2 = await service.syncPermissions(
          {
            operationType: SyncOperationType.INITIAL,
            targetId: TEST_TARGET_ID,
          },
          targetState,
        );

        expect(result1.success).toBe(true);
        expect(result2.success).toBe(true);
        if (result1.success && result2.success) {
          expect(result1.data.syncId).not.toBe(result2.data.syncId);
        }
      });
    });

    describe('Incremental Sync', () => {
      it('should detect changes when target is missing permissions', async () => {
        const targetState = createPartialTargetState();

        const result = await service.syncPermissions(
          {
            operationType: SyncOperationType.INCREMENTAL,
            targetId: TEST_TARGET_ID,
          },
          targetState,
        );

        expect(result.success).toBe(true);
        if (result.success) {
          // Should detect that permissions need to be added
          const totalAdded = result.data.roleResults.reduce(
            (sum, r) => sum + r.added.length,
            0,
          );
          expect(totalAdded).toBeGreaterThan(0);
        }
      });

      it('should skip roles with no changes', async () => {
        const targetState = createMatchingTargetState();

        const result = await service.syncPermissions(
          {
            operationType: SyncOperationType.INCREMENTAL,
            targetId: TEST_TARGET_ID,
          },
          targetState,
        );

        expect(result.success).toBe(true);
        if (result.success) {
          // All roles should be skipped (no changes)
          const skippedRoles = result.data.roleResults.filter(
            r => r.status === SyncStatus.SKIPPED,
          );
          expect(skippedRoles.length).toBe(result.data.roleResults.length);
        }
      });
    });

    describe('Validation Sync', () => {
      it('should detect inconsistencies without making changes', async () => {
        const targetState = createPartialTargetState();

        const result = await service.syncPermissions(
          {
            operationType: SyncOperationType.VALIDATION,
            targetId: TEST_TARGET_ID,
            conflictStrategy: ConflictResolutionStrategy.REJECT,
          },
          targetState,
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.operationType).toBe(SyncOperationType.VALIDATION);
          // Should detect conflicts but not make changes
          expect(result.data.conflictCount).toBeGreaterThan(0);
        }
      });
    });

    describe('Dry Run', () => {
      it('should not invalidate cache during dry run', async () => {
        const targetState = createEmptyTargetState();

        const result = await service.syncPermissions(
          {
            operationType: SyncOperationType.INITIAL,
            targetId: TEST_TARGET_ID,
            dryRun: true,
          },
          targetState,
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.cacheInvalidated).toBe(false);
        }
      });

      it('should return PENDING status for dry run with SOURCE_WINS strategy', async () => {
        // Use SOURCE_WINS strategy so conflicts are auto-resolved and we get PENDING
        const serviceWithSourceWins = createTestService({
          auditLogger: mockLogger.logger,
          conflictStrategy: ConflictResolutionStrategy.SOURCE_WINS,
        });
        const targetState = createPartialTargetState();

        const result = await serviceWithSourceWins.syncPermissions(
          {
            operationType: SyncOperationType.INCREMENTAL,
            targetId: TEST_TARGET_ID,
            dryRun: true,
          },
          targetState,
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(SyncStatus.PENDING);
        }
      });

      it('should return CONFLICT status for dry run with REJECT strategy when there are changes', async () => {
        const targetState = createEmptyTargetState();

        const result = await service.syncPermissions(
          {
            operationType: SyncOperationType.INCREMENTAL,
            targetId: TEST_TARGET_ID,
            dryRun: true,
          },
          targetState,
        );

        // With REJECT strategy (default) and changes, status should be CONFLICT
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(SyncStatus.CONFLICT);
        }
      });
    });

    describe('Audit Logging', () => {
      it('should log sync operation', async () => {
        const targetState = createEmptyTargetState();

        await service.syncPermissions(
          {
            operationType: SyncOperationType.INITIAL,
            targetId: TEST_TARGET_ID,
            correlationId: TEST_CORRELATION_ID,
          },
          targetState,
        );

        expect(mockLogger.syncEntries.length).toBe(1);
        expect(mockLogger.syncEntries[0].operationType).toBe(SyncOperationType.INITIAL);
        expect(mockLogger.syncEntries[0].targetId).toBe(TEST_TARGET_ID);
        expect(mockLogger.syncEntries[0].correlationId).toBe(TEST_CORRELATION_ID);
      });

      it('should include source version in audit log', async () => {
        const targetState = createMatchingTargetState();

        await service.syncPermissions(
          {
            operationType: SyncOperationType.INCREMENTAL,
            targetId: TEST_TARGET_ID,
          },
          targetState,
        );

        expect(mockLogger.syncEntries[0].sourceVersion).toBeDefined();
        expect(mockLogger.syncEntries[0].sourceVersion).not.toBe('');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Force Sync Tests
  // -------------------------------------------------------------------------

  describe('forceSyncPermissions', () => {
    it('should require confirmation when configured', async () => {
      const targetState = createPartialTargetState();

      const result = await service.forceSyncPermissions(
        TEST_TARGET_ID,
        targetState,
        undefined, // No confirmation token
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PERMISSION_SYNC_CONFLICT');
      }
    });

    it('should succeed with confirmation token', async () => {
      const targetState = createPartialTargetState();

      const result = await service.forceSyncPermissions(
        TEST_TARGET_ID,
        targetState,
        'confirmation-token',
        TEST_CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operationType).toBe(SyncOperationType.FORCE);
        expect(result.data.conflictStrategy).toBe(ConflictResolutionStrategy.SOURCE_WINS);
      }
    });

    it('should skip confirmation when not required', async () => {
      const serviceNoConfirm = PermissionSyncServiceImpl({
        config: {
          ...DEFAULT_PERMISSION_SYNC_CONFIG,
          requireForceSyncConfirmation: false,
        },
        auditLogger: mockLogger.logger,
      });

      const targetState = createPartialTargetState();

      const result = await serviceNoConfirm.forceSyncPermissions(
        TEST_TARGET_ID,
        targetState,
      );

      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Consistency Check Tests
  // -------------------------------------------------------------------------

  describe('checkConsistency', () => {
    it('should return consistent for matching permissions', async () => {
      const targetState = createMatchingTargetState();

      const result = await service.checkConsistency(
        TEST_TARGET_ID,
        targetState,
        TEST_CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isConsistent).toBe(true);
        expect(result.data.inconsistencies.length).toBe(0);
      }
    });

    it('should detect missing permissions in target', async () => {
      const targetState = createPartialTargetState();

      const result = await service.checkConsistency(
        TEST_TARGET_ID,
        targetState,
        TEST_CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isConsistent).toBe(false);
        const missingInTarget = result.data.inconsistencies.filter(
          i => i.type === 'MISSING_IN_TARGET',
        );
        expect(missingInTarget.length).toBeGreaterThan(0);
      }
    });

    it('should detect extra permissions in target', async () => {
      const targetState = createMatchingTargetState();
      // Add extra permission to target
      const modifiedTarget: PermissionTargetState = {
        ...targetState,
        rolePermissions: {
          ...targetState.rolePermissions,
          [MembershipRole.RESIDENT]: [
            ...targetState.rolePermissions[MembershipRole.RESIDENT],
            'fake:permission',
          ],
        },
      };

      const result = await service.checkConsistency(
        TEST_TARGET_ID,
        modifiedTarget,
        TEST_CORRELATION_ID,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isConsistent).toBe(false);
        const missingInSource = result.data.inconsistencies.filter(
          i => i.type === 'MISSING_IN_SOURCE',
        );
        expect(missingInSource.length).toBeGreaterThan(0);
      }
    });

    it('should log consistency check', async () => {
      const targetState = createMatchingTargetState();

      await service.checkConsistency(
        TEST_TARGET_ID,
        targetState,
        TEST_CORRELATION_ID,
      );

      expect(mockLogger.consistencyChecks.length).toBe(1);
      expect(mockLogger.consistencyChecks[0].targetId).toBe(TEST_TARGET_ID);
      expect(mockLogger.consistencyChecks[0].correlationId).toBe(TEST_CORRELATION_ID);
    });

    it('should include all roles in check', async () => {
      const targetState = createMatchingTargetState();

      const result = await service.checkConsistency(
        TEST_TARGET_ID,
        targetState,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rolesChecked).toBe(Object.values(MembershipRole).length);
      }
    });

    it('should include duration in result', async () => {
      const targetState = createMatchingTargetState();

      const result = await service.checkConsistency(
        TEST_TARGET_ID,
        targetState,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Conflict Resolution Tests
  // -------------------------------------------------------------------------

  describe('resolveConflict', () => {
    const sourcePerms = ['perm:a', 'perm:b', 'perm:c'];
    const targetPerms = ['perm:b', 'perm:c', 'perm:d'];

    it('should use source permissions with SOURCE_WINS', () => {
      const resolved = service.resolveConflict(
        MembershipRole.RESIDENT,
        sourcePerms,
        targetPerms,
        ConflictResolutionStrategy.SOURCE_WINS,
      );

      expect(resolved).toEqual(sourcePerms);
    });

    it('should use target permissions with TARGET_WINS', () => {
      const resolved = service.resolveConflict(
        MembershipRole.RESIDENT,
        sourcePerms,
        targetPerms,
        ConflictResolutionStrategy.TARGET_WINS,
      );

      expect(resolved).toEqual(targetPerms);
    });

    it('should merge permissions with MERGE', () => {
      const resolved = service.resolveConflict(
        MembershipRole.RESIDENT,
        sourcePerms,
        targetPerms,
        ConflictResolutionStrategy.MERGE,
      );

      // Should contain union of both
      expect(resolved).toContain('perm:a');
      expect(resolved).toContain('perm:b');
      expect(resolved).toContain('perm:c');
      expect(resolved).toContain('perm:d');
      // Should not have duplicates
      expect(resolved.length).toBe(4);
    });

    it('should use source with REJECT (caller handles conflict)', () => {
      const resolved = service.resolveConflict(
        MembershipRole.RESIDENT,
        sourcePerms,
        targetPerms,
        ConflictResolutionStrategy.REJECT,
      );

      expect(resolved).toEqual(sourcePerms);
    });
  });

  // -------------------------------------------------------------------------
  // Sync History Tests
  // -------------------------------------------------------------------------

  describe('getLastSyncResult', () => {
    it('should return undefined for never-synced target', () => {
      const result = service.getLastSyncResult('unknown-target');

      expect(result).toBeUndefined();
    });

    it('should return last sync result after sync', async () => {
      const targetState = createMatchingTargetState();

      await service.syncPermissions(
        {
          operationType: SyncOperationType.INCREMENTAL,
          targetId: TEST_TARGET_ID,
        },
        targetState,
      );

      const lastResult = service.getLastSyncResult(TEST_TARGET_ID);

      expect(lastResult).toBeDefined();
      expect(lastResult?.operationType).toBe(SyncOperationType.INCREMENTAL);
    });

    it('should return most recent sync result', async () => {
      const targetState = createMatchingTargetState();

      await service.syncPermissions(
        {
          operationType: SyncOperationType.INITIAL,
          targetId: TEST_TARGET_ID,
        },
        targetState,
      );

      await service.syncPermissions(
        {
          operationType: SyncOperationType.INCREMENTAL,
          targetId: TEST_TARGET_ID,
        },
        targetState,
      );

      const lastResult = service.getLastSyncResult(TEST_TARGET_ID);

      expect(lastResult?.operationType).toBe(SyncOperationType.INCREMENTAL);
    });
  });

  // -------------------------------------------------------------------------
  // Role Permission Sync Item Tests
  // -------------------------------------------------------------------------

  describe('Role Permission Sync Details', () => {
    it('should track added permissions', async () => {
      const targetState = createEmptyTargetState();

      const result = await service.syncPermissions(
        {
          operationType: SyncOperationType.INITIAL,
          targetId: TEST_TARGET_ID,
        },
        targetState,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // All permissions should be "added" since target is empty
        for (const roleResult of result.data.roleResults) {
          expect(roleResult.added.length).toBeGreaterThan(0);
          expect(roleResult.removed.length).toBe(0);
          expect(roleResult.unchanged.length).toBe(0);
        }
      }
    });

    it('should track removed permissions', async () => {
      // Create target with extra permissions
      const targetState = createMatchingTargetState();
      const modifiedTarget: PermissionTargetState = {
        ...targetState,
        rolePermissions: {
          ...targetState.rolePermissions,
          [MembershipRole.RESIDENT]: [
            ...targetState.rolePermissions[MembershipRole.RESIDENT],
            'extra:permission',
          ],
        },
      };

      const result = await service.syncPermissions(
        {
          operationType: SyncOperationType.INCREMENTAL,
          targetId: TEST_TARGET_ID,
        },
        modifiedTarget,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const residentResult = result.data.roleResults.find(
          r => r.role === MembershipRole.RESIDENT,
        );
        expect(residentResult?.removed).toContain('extra:permission');
      }
    });

    it('should track unchanged permissions', async () => {
      const targetState = createMatchingTargetState();

      const result = await service.syncPermissions(
        {
          operationType: SyncOperationType.INCREMENTAL,
          targetId: TEST_TARGET_ID,
        },
        targetState,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // All permissions should be "unchanged" since target matches source
        for (const roleResult of result.data.roleResults) {
          expect(roleResult.unchanged.length).toBeGreaterThan(0);
          expect(roleResult.added.length).toBe(0);
          expect(roleResult.removed.length).toBe(0);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle sync without target state', async () => {
      const result = await service.syncPermissions({
        operationType: SyncOperationType.INITIAL,
        targetId: TEST_TARGET_ID,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should treat missing target as empty
        const totalAdded = result.data.roleResults.reduce(
          (sum, r) => sum + r.added.length,
          0,
        );
        expect(totalAdded).toBeGreaterThan(0);
      }
    });

    it('should work with default configuration (no parameters)', () => {
      const defaultService = PermissionSyncServiceImpl();
      const config = defaultService.getConfig();

      expect(config).toEqual(DEFAULT_PERMISSION_SYNC_CONFIG);
    });

    it('should include source version in sync result', async () => {
      const targetState = createMatchingTargetState();

      const result = await service.syncPermissions(
        {
          operationType: SyncOperationType.INCREMENTAL,
          targetId: TEST_TARGET_ID,
        },
        targetState,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sourceVersion).toBeDefined();
        expect(result.data.sourceVersion).not.toBe('');
      }
    });

    it('should include timing information', async () => {
      const targetState = createMatchingTargetState();

      const result = await service.syncPermissions(
        {
          operationType: SyncOperationType.INCREMENTAL,
          targetId: TEST_TARGET_ID,
        },
        targetState,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.startedAt).toBeDefined();
        expect(result.data.completedAt).toBeDefined();
        expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.data.completedAt.getTime()).toBeGreaterThanOrEqual(
          result.data.startedAt.getTime(),
        );
      }
    });
  });
});
