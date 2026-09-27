/**
 * Unit tests for BatchOperationsService.
 *
 * @see Task 66 — Batch Operations Support (Req 33)
 * @see Requirements 33 (AC 1-7)
 */

import {
  BatchOperationsServiceImpl,
  type IBatchOperationsService,
  type IBatchOperationAuditLogger,
  type BatchOperationAuditEntry,
  BatchTransactionMode,
  BatchItemStatus,
  DEFAULT_BATCH_OPERATIONS_CONFIG,
} from '../BatchOperationsService';
import { MembershipStatus, MembershipRole } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock audit logger that collects logged entries.
 */
const createMockAuditLogger = (): {
  logger: IBatchOperationAuditLogger;
  entries: BatchOperationAuditEntry[];
} => {
  const entries: BatchOperationAuditEntry[] = [];
  const logger: IBatchOperationAuditLogger = {
    async logOperation(entry: BatchOperationAuditEntry): Promise<void> {
      entries.push(entry);
    },
  };
  return { logger, entries };
};

/**
 * Create a test instance of BatchOperationsService.
 */
const createTestService = (
  options?: {
    maxBatchSize?: number;
    auditLogger?: IBatchOperationAuditLogger;
  },
): IBatchOperationsService => {
  const { maxBatchSize = 100, auditLogger } = options ?? {};
  return BatchOperationsServiceImpl({
    config: {
      ...DEFAULT_BATCH_OPERATIONS_CONFIG,
      maxBatchSize,
    },
    auditLogger,
  });
};

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'user-123';
const TEST_TENANT_ID = 'tenant-456';
const TEST_ORG_UNIT_ID = 'orgunit-789';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BatchOperationsService', () => {
  // -------------------------------------------------------------------------
  // Configuration Tests
  // -------------------------------------------------------------------------

  describe('Configuration', () => {
    it('should return default configuration', () => {
      const service = createTestService();
      const config = service.getConfig();

      expect(config.maxBatchSize).toBe(100);
      expect(config.defaultTransactionMode).toBe(BatchTransactionMode.ATOMIC);
      expect(config.itemTimeoutMs).toBe(5000);
      expect(config.enableItemTiming).toBe(true);
    });

    it('should allow updating configuration', () => {
      const service = createTestService({ maxBatchSize: 50 });

      service.updateConfig({ maxBatchSize: 200 });
      const config = service.getConfig();

      expect(config.maxBatchSize).toBe(200);
    });

    it('should preserve unmodified config values when updating', () => {
      const service = createTestService();

      service.updateConfig({ maxBatchSize: 50 });
      const config = service.getConfig();

      expect(config.maxBatchSize).toBe(50);
      expect(config.defaultTransactionMode).toBe(BatchTransactionMode.ATOMIC);
    });
  });

  // -------------------------------------------------------------------------
  // Batch Size Validation Tests
  // -------------------------------------------------------------------------

  describe('Batch Size Validation', () => {
    it('should reject empty batch', () => {
      const service = createTestService();
      const result = service.validateBatchSize(0);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BATCH_EMPTY_ITEMS');
      }
    });

    it('should accept batch within limit', () => {
      const service = createTestService({ maxBatchSize: 100 });
      const result = service.validateBatchSize(50);

      expect(result.success).toBe(true);
    });

    it('should accept batch at exact limit', () => {
      const service = createTestService({ maxBatchSize: 100 });
      const result = service.validateBatchSize(100);

      expect(result.success).toBe(true);
    });

    it('should reject batch exceeding limit', () => {
      const service = createTestService({ maxBatchSize: 100 });
      const result = service.validateBatchSize(101);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BATCH_SIZE_LIMIT_EXCEEDED');
      }
    });

    it('should use custom batch size limit from config', () => {
      const service = createTestService({ maxBatchSize: 10 });

      expect(service.validateBatchSize(10).success).toBe(true);
      expect(service.validateBatchSize(11).success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Batch Permission Checks Tests
  // -------------------------------------------------------------------------

  describe('checkPermissionsBatch', () => {
    it('should return error for empty permissions array', async () => {
      const service = createTestService();
      const result = await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BATCH_EMPTY_ITEMS');
      }
    });

    it('should return error when batch size exceeds limit', async () => {
      const service = createTestService({ maxBatchSize: 2 });
      const result = await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [
          { permission: 'p1' },
          { permission: 'p2' },
          { permission: 'p3' },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BATCH_SIZE_LIMIT_EXCEEDED');
      }
    });

    it('should process multiple permission checks successfully', async () => {
      const service = createTestService();
      const result = await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [
          { permission: 'resident:read' },
          { permission: 'finance:write' },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalItems).toBe(2);
        expect(result.data.transactionMode).toBe(BatchTransactionMode.PARTIAL);
        expect(result.data.itemResults).toHaveLength(2);
        expect(result.data.itemResults[0]!.status).toBe(BatchItemStatus.SUCCESS);
        expect(result.data.itemResults[1]!.status).toBe(BatchItemStatus.SUCCESS);
      }
    });

    it('should return granted true for allowed permissions', async () => {
      const service = createTestService();
      const result = await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [{ permission: 'resident:read' }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.itemResults[0]!.data?.granted).toBe(true);
      }
    });

    it('should return granted false for denied permissions', async () => {
      const service = createTestService();
      const result = await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [{ permission: 'admin:super-secret' }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.itemResults[0]!.data?.granted).toBe(false);
        expect(result.data.itemResults[0]!.data?.denyReason).toBe('PERMISSION_NOT_GRANTED');
      }
    });

    it('should log audit entry for batch permission check', async () => {
      const { logger, entries } = createMockAuditLogger();
      const service = createTestService({ auditLogger: logger });

      await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [{ permission: 'resident:read' }],
      });

      expect(entries).toHaveLength(1);
      expect(entries[0]!.operationType).toBe('PERMISSION_CHECK');
      expect(entries[0]!.tenantId).toBe(TEST_TENANT_ID);
      expect(entries[0]!.initiatedBy).toBe(TEST_USER_ID);
      expect(entries[0]!.totalItems).toBe(1);
    });

    it('should track processing time per item when enabled', async () => {
      const service = createTestService();
      const result = await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [{ permission: 'resident:read' }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.itemResults[0]!.processingTimeMs).toBeDefined();
        expect(result.data.totalProcessingTimeMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Batch Membership Updates Tests
  // -------------------------------------------------------------------------

  describe('updateMembershipsBatch', () => {
    it('should return error for empty updates array', async () => {
      const service = createTestService();
      const result = await service.updateMembershipsBatch({
        tenantId: TEST_TENANT_ID,
        updatedBy: TEST_USER_ID,
        updates: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BATCH_EMPTY_ITEMS');
      }
    });

    it('should return error when batch size exceeds limit', async () => {
      const service = createTestService({ maxBatchSize: 1 });
      const result = await service.updateMembershipsBatch({
        tenantId: TEST_TENANT_ID,
        updatedBy: TEST_USER_ID,
        updates: [
          { membershipId: 'm1' },
          { membershipId: 'm2' },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BATCH_SIZE_LIMIT_EXCEEDED');
      }
    });

    it('should process multiple membership updates successfully', async () => {
      const service = createTestService();
      const result = await service.updateMembershipsBatch({
        tenantId: TEST_TENANT_ID,
        updatedBy: TEST_USER_ID,
        updates: [
          { membershipId: 'm1', newStatus: MembershipStatus.SUSPENDED },
          { membershipId: 'm2', newRole: MembershipRole.RT_ADMIN },
        ],
        transactionMode: BatchTransactionMode.PARTIAL,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalItems).toBe(2);
        expect(result.data.successCount).toBe(2);
        expect(result.data.failureCount).toBe(0);
      }
    });

    it('should use ATOMIC transaction mode by default', async () => {
      const service = createTestService();
      const result = await service.updateMembershipsBatch({
        tenantId: TEST_TENANT_ID,
        updatedBy: TEST_USER_ID,
        updates: [{ membershipId: 'm1' }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.transactionMode).toBe(BatchTransactionMode.ATOMIC);
      }
    });

    it('should respect specified transaction mode', async () => {
      const service = createTestService();
      const result = await service.updateMembershipsBatch({
        tenantId: TEST_TENANT_ID,
        updatedBy: TEST_USER_ID,
        updates: [{ membershipId: 'm1' }],
        transactionMode: BatchTransactionMode.PARTIAL,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.transactionMode).toBe(BatchTransactionMode.PARTIAL);
      }
    });

    it('should return detailed results for each item', async () => {
      const service = createTestService();
      const result = await service.updateMembershipsBatch({
        tenantId: TEST_TENANT_ID,
        updatedBy: TEST_USER_ID,
        updates: [
          { membershipId: 'm1', newStatus: MembershipStatus.SUSPENDED },
          { membershipId: 'm2', newRole: MembershipRole.RT_ADMIN },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.itemResults[0]!.itemId).toBe('m1');
        expect(result.data.itemResults[0]!.data?.membershipId).toBe('m1');
        expect(result.data.itemResults[1]!.itemId).toBe('m2');
        expect(result.data.itemResults[1]!.data?.membershipId).toBe('m2');
      }
    });

    it('should log audit entry with correlation ID', async () => {
      const { logger, entries } = createMockAuditLogger();
      const service = createTestService({ auditLogger: logger });

      await service.updateMembershipsBatch({
        tenantId: TEST_TENANT_ID,
        updatedBy: TEST_USER_ID,
        updates: [{ membershipId: 'm1' }],
        correlationId: 'test-correlation-id',
      });

      expect(entries).toHaveLength(1);
      expect(entries[0]!.operationType).toBe('MEMBERSHIP_UPDATE');
      expect(entries[0]!.correlationId).toBe('test-correlation-id');
    });
  });

  // -------------------------------------------------------------------------
  // Batch Authorization Queries Tests
  // -------------------------------------------------------------------------

  describe('queryAuthorizationBatch', () => {
    it('should return error for empty queries array', async () => {
      const service = createTestService();
      const result = await service.queryAuthorizationBatch({
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        queries: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BATCH_EMPTY_ITEMS');
      }
    });

    it('should process multiple authorization queries successfully', async () => {
      const service = createTestService();
      const result = await service.queryAuthorizationBatch({
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        queries: [
          { userId: 'user1' },
          { userId: 'user2', permission: 'resident:read' },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalItems).toBe(2);
        expect(result.data.successCount).toBe(2);
        expect(result.data.itemResults[0]!.data?.userId).toBe('user1');
        expect(result.data.itemResults[1]!.data?.userId).toBe('user2');
      }
    });

    it('should return membership status in query result', async () => {
      const service = createTestService();
      const result = await service.queryAuthorizationBatch({
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        queries: [{ userId: 'user1' }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.itemResults[0]!.data?.hasActiveMembership).toBe(true);
        expect(result.data.itemResults[0]!.data?.role).toBe('RESIDENT');
      }
    });

    it('should check specific permission when provided', async () => {
      const service = createTestService();
      const result = await service.queryAuthorizationBatch({
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        queries: [{ userId: 'user1', permission: 'resident:read' }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.itemResults[0]!.data?.permissionGranted).toBeDefined();
      }
    });

    it('should log audit entry for batch authorization query', async () => {
      const { logger, entries } = createMockAuditLogger();
      const service = createTestService({ auditLogger: logger });

      await service.queryAuthorizationBatch({
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        queries: [{ userId: 'user1' }],
      });

      expect(entries).toHaveLength(1);
      expect(entries[0]!.operationType).toBe('AUTHORIZATION_QUERY');
      expect(entries[0]!.tenantId).toBe(TEST_TENANT_ID);
    });
  });

  // -------------------------------------------------------------------------
  // Batch Cache Invalidation Tests
  // -------------------------------------------------------------------------

  describe('invalidateCachesBatch', () => {
    it('should return error for empty requests array', async () => {
      const service = createTestService();
      const result = await service.invalidateCachesBatch({
        requests: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BATCH_EMPTY_ITEMS');
      }
    });

    it('should process multiple cache invalidation requests successfully', async () => {
      const service = createTestService();
      const result = await service.invalidateCachesBatch({
        requests: [
          { userId: 'user1', tenantId: TEST_TENANT_ID },
          { userId: 'user2', tenantId: TEST_TENANT_ID },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalItems).toBe(2);
        expect(result.data.successCount).toBe(2);
        expect(result.data.itemResults[0]!.data?.invalidated).toBe(true);
        expect(result.data.itemResults[1]!.data?.invalidated).toBe(true);
      }
    });

    it('should log audit entry with correlation ID', async () => {
      const { logger, entries } = createMockAuditLogger();
      const service = createTestService({ auditLogger: logger });

      await service.invalidateCachesBatch({
        requests: [{ userId: 'user1', tenantId: TEST_TENANT_ID }],
        correlationId: 'cache-invalidation-123',
      });

      expect(entries).toHaveLength(1);
      expect(entries[0]!.operationType).toBe('CACHE_INVALIDATION');
      expect(entries[0]!.correlationId).toBe('cache-invalidation-123');
    });
  });

  // -------------------------------------------------------------------------
  // Transaction Mode Tests
  // -------------------------------------------------------------------------

  describe('Transaction Mode', () => {
    it('should indicate success=true when all items succeed in ATOMIC mode', async () => {
      const service = createTestService();
      const result = await service.updateMembershipsBatch({
        tenantId: TEST_TENANT_ID,
        updatedBy: TEST_USER_ID,
        updates: [
          { membershipId: 'm1' },
          { membershipId: 'm2' },
        ],
        transactionMode: BatchTransactionMode.ATOMIC,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.rolledBack).toBeFalsy();
      }
    });

    it('should indicate success=true in PARTIAL mode when at least one item succeeds', async () => {
      const service = createTestService();
      const result = await service.updateMembershipsBatch({
        tenantId: TEST_TENANT_ID,
        updatedBy: TEST_USER_ID,
        updates: [{ membershipId: 'm1' }],
        transactionMode: BatchTransactionMode.PARTIAL,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.transactionMode).toBe(BatchTransactionMode.PARTIAL);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Result Aggregation Tests
  // -------------------------------------------------------------------------

  describe('Result Aggregation', () => {
    it('should correctly count successes and failures', async () => {
      const service = createTestService();
      const result = await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [
          { permission: 'resident:read' },
          { permission: 'announcement:read' },
          { permission: 'unknown:permission' },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalItems).toBe(3);
        // All processed successfully even if permission denied
        expect(result.data.successCount).toBe(3);
        expect(result.data.failureCount).toBe(0);
      }
    });

    it('should include processing time in results', async () => {
      const service = createTestService();
      const result = await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [{ permission: 'resident:read' }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalProcessingTimeMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Audit Logging Tests
  // -------------------------------------------------------------------------

  describe('Audit Logging', () => {
    it('should log all batch operations', async () => {
      const { logger, entries } = createMockAuditLogger();
      const service = createTestService({ auditLogger: logger });

      await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [{ permission: 'resident:read' }],
      });

      await service.updateMembershipsBatch({
        tenantId: TEST_TENANT_ID,
        updatedBy: TEST_USER_ID,
        updates: [{ membershipId: 'm1' }],
      });

      await service.queryAuthorizationBatch({
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        queries: [{ userId: 'user1' }],
      });

      await service.invalidateCachesBatch({
        requests: [{ userId: 'user1', tenantId: TEST_TENANT_ID }],
      });

      expect(entries).toHaveLength(4);
      expect(entries.map(e => e.operationType)).toEqual([
        'PERMISSION_CHECK',
        'MEMBERSHIP_UPDATE',
        'AUTHORIZATION_QUERY',
        'CACHE_INVALIDATION',
      ]);
    });

    it('should include operation ID in each audit entry', async () => {
      const { logger, entries } = createMockAuditLogger();
      const service = createTestService({ auditLogger: logger });

      await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [{ permission: 'resident:read' }],
      });

      expect(entries[0]!.operationId).toBeDefined();
      expect(entries[0]!.operationId).toMatch(/^batch-/);
    });

    it('should include timestamp in audit entry', async () => {
      const { logger, entries } = createMockAuditLogger();
      const service = createTestService({ auditLogger: logger });

      const beforeTime = new Date();
      await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [{ permission: 'resident:read' }],
      });
      const afterTime = new Date();

      expect(entries[0]!.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(entries[0]!.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should report accurate success/failure counts in audit', async () => {
      const { logger, entries } = createMockAuditLogger();
      const service = createTestService({ auditLogger: logger });

      await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [
          { permission: 'p1' },
          { permission: 'p2' },
          { permission: 'p3' },
        ],
      });

      expect(entries[0]!.totalItems).toBe(3);
      expect(entries[0]!.successCount).toBe(3);
      expect(entries[0]!.failureCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases Tests
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle single item batch', async () => {
      const service = createTestService();
      const result = await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [{ permission: 'resident:read' }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalItems).toBe(1);
        expect(result.data.itemResults).toHaveLength(1);
      }
    });

    it('should handle batch at exact size limit', async () => {
      const service = createTestService({ maxBatchSize: 3 });
      const result = await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [
          { permission: 'p1' },
          { permission: 'p2' },
          { permission: 'p3' },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalItems).toBe(3);
      }
    });

    it('should handle null orgUnitId for tenant-level queries', async () => {
      const service = createTestService();
      const result = await service.queryAuthorizationBatch({
        tenantId: TEST_TENANT_ID,
        orgUnitId: null,
        queries: [{ userId: 'user1' }],
      });

      expect(result.success).toBe(true);
    });

    it('should maintain item order in results', async () => {
      const service = createTestService();
      const result = await service.checkPermissionsBatch({
        userId: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
        orgUnitId: TEST_ORG_UNIT_ID,
        permissions: [
          { permission: 'first' },
          { permission: 'second' },
          { permission: 'third' },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.itemResults[0]!.index).toBe(0);
        expect(result.data.itemResults[0]!.data?.permission).toBe('first');
        expect(result.data.itemResults[1]!.index).toBe(1);
        expect(result.data.itemResults[1]!.data?.permission).toBe('second');
        expect(result.data.itemResults[2]!.index).toBe(2);
        expect(result.data.itemResults[2]!.data?.permission).toBe('third');
      }
    });
  });
});
