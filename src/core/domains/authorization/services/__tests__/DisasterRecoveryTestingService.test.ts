/**
 * Unit tests for DisasterRecoveryTestingService.
 *
 * Tests comprehensive disaster recovery validation for multi-tenant SaaS architecture:
 * - Database failover scenario testing
 * - Data recovery and integrity validation
 * - Session recovery after system restart
 * - Cache warmup validation
 * - Multi-tenant isolation preservation during recovery
 * - RLS policy consistency verification
 * - RTO/RPO compliance verification
 *
 * @see FASE 1.22 Task 79: Disaster Recovery Testing (Req 32)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DisasterRecoveryTestingServiceImpl,
  DisasterRecoveryCategory,
  DisasterRecoveryStatus,
  DisasterRecoverySeverity,
  FailoverScenario,
  DR_TEST_SCENARIOS,
  DEFAULT_DR_CONFIG,
  DR_ERROR_CODES,
  type IDisasterRecoveryTestingService,
  type DisasterRecoveryTestingServiceDependencies,
  type IDatabaseValidator,
  type ISessionManager,
  type ICacheManager,
  type IRlsPolicyChecker,
  type IBackupManager,
  type BackupMetadata,
  type DisasterRecoveryConfig,
  type IDisasterRecoveryAlertEmitter,
} from '../DisasterRecoveryTestingService';
import { MembershipRole } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

const createMockDatabaseValidator = (
  overrides: Partial<IDatabaseValidator> = {},
): IDatabaseValidator => ({
  checkConnection: vi.fn().mockResolvedValue(true),
  verifyDataIntegrity: vi.fn().mockResolvedValue({
    valid: true,
    recordCount: 1000,
    checksumMatch: true,
  }),
  getReplicationLag: vi.fn().mockResolvedValue(5),
  ...overrides,
});

const createMockSessionManager = (
  overrides: Partial<ISessionManager> = {},
): ISessionManager => ({
  countActiveSessions: vi.fn().mockResolvedValue(10),
  validateSession: vi.fn().mockResolvedValue(true),
  refreshToken: vi.fn().mockResolvedValue({
    success: true,
    newTokenVersion: 2,
  }),
  ...overrides,
});

const createMockCacheManager = (
  overrides: Partial<ICacheManager> = {},
): ICacheManager => ({
  getHitRate: vi.fn().mockResolvedValue(0.95),
  warmupTenant: vi.fn().mockResolvedValue({
    success: true,
    entriesLoaded: 500,
    durationMs: 1000,
  }),
  clearTenantCache: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const createMockRlsPolicyChecker = (
  overrides: Partial<IRlsPolicyChecker> = {},
): IRlsPolicyChecker => ({
  verifyPolicy: vi.fn().mockResolvedValue({
    hasAccess: true,
    policyApplied: 'tenant_isolation_policy',
  }),
  listPolicies: vi.fn().mockResolvedValue([
    'tenant_isolation_policy',
    'org_scope_policy',
    'user_self_policy',
  ]),
  ...overrides,
});

const createMockBackupMetadata = (
  overrides: Partial<BackupMetadata> = {},
): BackupMetadata => ({
  backupId: 'backup-123',
  timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
  sizeBytes: 1024 * 1024 * 100, // 100 MB
  checksum: 'sha256-abc123',
  encrypted: true,
  region: 'us-east-1',
  tenantCount: 5,
  ...overrides,
});

const createMockBackupManager = (
  overrides: Partial<IBackupManager> = {},
): IBackupManager => ({
  getLatestBackup: vi.fn().mockResolvedValue(createMockBackupMetadata()),
  getBackupById: vi.fn().mockResolvedValue(createMockBackupMetadata()),
  verifyBackupIntegrity: vi.fn().mockResolvedValue({
    valid: true,
    checksumVerified: true,
    encrypted: true,
  }),
  listBackupsInTimeRange: vi.fn().mockResolvedValue([
    createMockBackupMetadata(),
    createMockBackupMetadata({ backupId: 'backup-124' }),
  ]),
  ...overrides,
});

const createMockAlertEmitter = (): IDisasterRecoveryAlertEmitter => ({
  emit: vi.fn().mockResolvedValue(undefined),
});

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('DisasterRecoveryTestingService', () => {
  let service: IDisasterRecoveryTestingService;
  let mockAlertEmitter: IDisasterRecoveryAlertEmitter;

  beforeEach(() => {
    mockAlertEmitter = createMockAlertEmitter();
    service = DisasterRecoveryTestingServiceImpl({
      alertEmitter: mockAlertEmitter,
    });
  });

  // -------------------------------------------------------------------------
  // Configuration Tests
  // -------------------------------------------------------------------------

  describe('Configuration', () => {
    it('should use default configuration when not provided', () => {
      const config = service.getConfig();
      expect(config.rtoMinutes).toBe(DEFAULT_DR_CONFIG.rtoMinutes);
      expect(config.rpoMinutes).toBe(DEFAULT_DR_CONFIG.rpoMinutes);
      expect(config.maxAcceptableDataLoss).toBe(DEFAULT_DR_CONFIG.maxAcceptableDataLoss);
    });

    it('should merge custom configuration with defaults', () => {
      const customService = DisasterRecoveryTestingServiceImpl({
        config: {
          rtoMinutes: 120,
          rpoMinutes: 30,
        },
      });

      const config = customService.getConfig();
      expect(config.rtoMinutes).toBe(120);
      expect(config.rpoMinutes).toBe(30);
      expect(config.sessionRecoveryTimeoutSeconds).toBe(
        DEFAULT_DR_CONFIG.sessionRecoveryTimeoutSeconds,
      );
    });

    it('should update configuration dynamically', () => {
      service.updateConfig({ rtoMinutes: 180 });

      const config = service.getConfig();
      expect(config.rtoMinutes).toBe(180);
      expect(config.rpoMinutes).toBe(DEFAULT_DR_CONFIG.rpoMinutes);
    });

    it('should return supported scenarios', () => {
      const scenarios = service.getSupportedScenarios();

      expect(scenarios).toEqual(DR_TEST_SCENARIOS);
      expect(scenarios.length).toBeGreaterThan(0);

      // Verify all required scenarios exist
      const scenarioIds = scenarios.map(s => s.id);
      expect(scenarioIds).toContain('DR-001');
      expect(scenarioIds).toContain('DR-007'); // Tenant isolation
      expect(scenarioIds).toContain('DR-008'); // RLS consistency
    });
  });

  // -------------------------------------------------------------------------
  // Database Failover Tests
  // -------------------------------------------------------------------------

  describe('testDatabaseFailover', () => {
    it('should pass when database connection is restored and replication lag is low', async () => {
      const mockValidator = createMockDatabaseValidator({
        checkConnection: vi.fn().mockResolvedValue(true),
        getReplicationLag: vi.fn().mockResolvedValue(10),
      });

      const serviceWithValidator = DisasterRecoveryTestingServiceImpl({
        databaseValidator: mockValidator,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithValidator.testDatabaseFailover({
        scenario: FailoverScenario.PRIMARY_DATABASE_FAILURE,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.PASSED);
        expect(result.data.category).toBe(DisasterRecoveryCategory.DATABASE_FAILOVER);
        expect(mockValidator.checkConnection).toHaveBeenCalled();
        expect(mockValidator.getReplicationLag).toHaveBeenCalled();
      }
    });

    it('should fail when database connection cannot be restored', async () => {
      const mockValidator = createMockDatabaseValidator({
        checkConnection: vi.fn().mockResolvedValue(false),
      });

      const serviceWithValidator = DisasterRecoveryTestingServiceImpl({
        databaseValidator: mockValidator,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithValidator.testDatabaseFailover({
        scenario: FailoverScenario.PRIMARY_DATABASE_FAILURE,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.FAILED);
        expect(mockAlertEmitter.emit).toHaveBeenCalled();
      }
    });

    it('should warn when replication lag exceeds threshold', async () => {
      const mockValidator = createMockDatabaseValidator({
        checkConnection: vi.fn().mockResolvedValue(true),
        getReplicationLag: vi.fn().mockResolvedValue(120), // Exceeds default 60s threshold
      });

      const serviceWithValidator = DisasterRecoveryTestingServiceImpl({
        databaseValidator: mockValidator,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithValidator.testDatabaseFailover({
        scenario: FailoverScenario.PRIMARY_DATABASE_FAILURE,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.WARNING);
        expect(result.data.metrics?.replicationLagSeconds).toBe(120);
      }
    });

    it('should pass with mock when no validator provided', async () => {
      const result = await service.testDatabaseFailover({
        scenario: FailoverScenario.PRIMARY_DATABASE_FAILURE,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.PASSED);
        expect(result.data.message).toContain('mocked');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Data Recovery Tests
  // -------------------------------------------------------------------------

  describe('testDataRecovery', () => {
    it('should pass when backup exists and integrity is verified', async () => {
      const mockBackupManager = createMockBackupManager();

      const serviceWithBackup = DisasterRecoveryTestingServiceImpl({
        backupManager: mockBackupManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithBackup.testDataRecovery({
        tenantId: 'tenant-123',
        targetTimestamp: new Date(Date.now() - 30 * 60 * 1000),
        verifyIntegrity: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.PASSED);
        expect(mockBackupManager.listBackupsInTimeRange).toHaveBeenCalled();
        expect(mockBackupManager.verifyBackupIntegrity).toHaveBeenCalled();
      }
    });

    it('should fail when no backup found within RPO window', async () => {
      const mockBackupManager = createMockBackupManager({
        listBackupsInTimeRange: vi.fn().mockResolvedValue([]),
      });

      const serviceWithBackup = DisasterRecoveryTestingServiceImpl({
        backupManager: mockBackupManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithBackup.testDataRecovery({
        tenantId: 'tenant-123',
        targetTimestamp: new Date(),
        verifyIntegrity: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.FAILED);
        expect(result.data.message).toContain('No backup found');
        expect(mockAlertEmitter.emit).toHaveBeenCalled();
      }
    });

    it('should fail when backup integrity verification fails', async () => {
      const mockBackupManager = createMockBackupManager({
        verifyBackupIntegrity: vi.fn().mockResolvedValue({
          valid: false,
          checksumVerified: false,
          encrypted: true,
        }),
      });

      const serviceWithBackup = DisasterRecoveryTestingServiceImpl({
        backupManager: mockBackupManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithBackup.testDataRecovery({
        tenantId: 'tenant-123',
        targetTimestamp: new Date(Date.now() - 30 * 60 * 1000),
        verifyIntegrity: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.FAILED);
        expect(result.data.message).toContain('integrity');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Data Integrity Tests
  // -------------------------------------------------------------------------

  describe('validateDataIntegrity', () => {
    it('should pass when data integrity is verified', async () => {
      const mockValidator = createMockDatabaseValidator({
        verifyDataIntegrity: vi.fn().mockResolvedValue({
          valid: true,
          recordCount: 1000,
          checksumMatch: true,
        }),
      });

      const serviceWithValidator = DisasterRecoveryTestingServiceImpl({
        databaseValidator: mockValidator,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithValidator.validateDataIntegrity('tenant-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.PASSED);
        expect(result.data.category).toBe(DisasterRecoveryCategory.DATA_INTEGRITY);
      }
    });

    it('should fail when checksum mismatch detected', async () => {
      const mockValidator = createMockDatabaseValidator({
        verifyDataIntegrity: vi.fn().mockResolvedValue({
          valid: false,
          recordCount: 1000,
          checksumMatch: false,
        }),
      });

      const serviceWithValidator = DisasterRecoveryTestingServiceImpl({
        databaseValidator: mockValidator,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithValidator.validateDataIntegrity('tenant-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.FAILED);
        expect(result.data.message).toContain('checksum');
        expect(mockAlertEmitter.emit).toHaveBeenCalled();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Session Recovery Tests
  // -------------------------------------------------------------------------

  describe('testSessionRecovery', () => {
    it('should pass when sessions are recovered within timeout', async () => {
      const mockSessionManager = createMockSessionManager();

      const serviceWithSession = DisasterRecoveryTestingServiceImpl({
        sessionManager: mockSessionManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithSession.testSessionRecovery({
        userId: 'user-123',
        tenantId: 'tenant-123',
        tokenVersion: 1,
        activeSessions: 5,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.PASSED);
        expect(result.data.category).toBe(DisasterRecoveryCategory.SESSION_RECOVERY);
        expect(mockSessionManager.countActiveSessions).toHaveBeenCalledWith(
          'user-123',
          'tenant-123',
        );
      }
    });

    it('should return metrics with session count', async () => {
      const mockSessionManager = createMockSessionManager({
        countActiveSessions: vi.fn().mockResolvedValue(15),
      });

      const serviceWithSession = DisasterRecoveryTestingServiceImpl({
        sessionManager: mockSessionManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithSession.testSessionRecovery({
        userId: 'user-123',
        tenantId: 'tenant-123',
        tokenVersion: 1,
        activeSessions: 5,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metrics?.affectedSessionCount).toBe(15);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Token Refresh Tests
  // -------------------------------------------------------------------------

  describe('testTokenRefreshAfterRecovery', () => {
    it('should pass when token refresh succeeds', async () => {
      const mockSessionManager = createMockSessionManager({
        refreshToken: vi.fn().mockResolvedValue({
          success: true,
          newTokenVersion: 3,
        }),
      });

      const serviceWithSession = DisasterRecoveryTestingServiceImpl({
        sessionManager: mockSessionManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithSession.testTokenRefreshAfterRecovery(
        'user-123',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.PASSED);
        expect(result.data.details?.newTokenVersion).toBe(3);
      }
    });

    it('should fail when token refresh fails', async () => {
      const mockSessionManager = createMockSessionManager({
        refreshToken: vi.fn().mockResolvedValue({
          success: false,
          newTokenVersion: 0,
        }),
      });

      const serviceWithSession = DisasterRecoveryTestingServiceImpl({
        sessionManager: mockSessionManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithSession.testTokenRefreshAfterRecovery(
        'user-123',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.FAILED);
        expect(mockAlertEmitter.emit).toHaveBeenCalled();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Cache Warmup Tests
  // -------------------------------------------------------------------------

  describe('validateCacheWarmup', () => {
    it('should pass when cache warmup succeeds', async () => {
      const mockCacheManager = createMockCacheManager();

      const serviceWithCache = DisasterRecoveryTestingServiceImpl({
        cacheManager: mockCacheManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithCache.validateCacheWarmup({
        tenantIds: ['tenant-1', 'tenant-2'],
        preloadMemberships: true,
        preloadPermissions: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.PASSED);
        expect(result.data.category).toBe(DisasterRecoveryCategory.CACHE_WARMUP);
        expect(mockCacheManager.warmupTenant).toHaveBeenCalledTimes(2);
        expect(mockCacheManager.getHitRate).toHaveBeenCalled();
      }
    });

    it('should fail when warmup fails for any tenant', async () => {
      let callCount = 0;
      const mockCacheManager = createMockCacheManager({
        warmupTenant: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 2) {
            return { success: false, entriesLoaded: 0, durationMs: 0 };
          }
          return { success: true, entriesLoaded: 500, durationMs: 1000 };
        }),
      });

      const serviceWithCache = DisasterRecoveryTestingServiceImpl({
        cacheManager: mockCacheManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithCache.validateCacheWarmup({
        tenantIds: ['tenant-1', 'tenant-2'],
        preloadMemberships: true,
        preloadPermissions: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.FAILED);
      }
    });

    it('should report cache hit rate in metrics', async () => {
      const mockCacheManager = createMockCacheManager({
        getHitRate: vi.fn().mockResolvedValue(0.87),
      });

      const serviceWithCache = DisasterRecoveryTestingServiceImpl({
        cacheManager: mockCacheManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithCache.validateCacheWarmup({
        tenantIds: ['tenant-1'],
        preloadMemberships: true,
        preloadPermissions: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metrics?.cacheHitRateAfterWarmup).toBe(0.87);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Tenant Isolation Tests
  // -------------------------------------------------------------------------

  describe('validateTenantIsolationDuringRecovery', () => {
    it('should pass when all RLS policies are correctly applied', async () => {
      const mockRlsChecker = createMockRlsPolicyChecker({
        verifyPolicy: vi.fn().mockResolvedValue({
          hasAccess: true,
          policyApplied: 'tenant_isolation_policy',
        }),
      });

      const serviceWithRls = DisasterRecoveryTestingServiceImpl({
        rlsPolicyChecker: mockRlsChecker,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithRls.validateTenantIsolationDuringRecovery({
        tenantIdA: 'tenant-a',
        tenantIdB: 'tenant-b',
        verifyMembershipIsolation: true,
        verifyDataIsolation: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.PASSED);
        expect(result.data.category).toBe(DisasterRecoveryCategory.TENANT_ISOLATION);
        expect(result.data.severity).toBe(DisasterRecoverySeverity.CRITICAL);
        // Verify policies were checked for both tenants
        expect(mockRlsChecker.verifyPolicy).toHaveBeenCalledWith(
          'tenant-a',
          expect.any(String),
          expect.any(String),
        );
        expect(mockRlsChecker.verifyPolicy).toHaveBeenCalledWith(
          'tenant-b',
          expect.any(String),
          expect.any(String),
        );
      }
    });

    it('should fail when tenant isolation is compromised', async () => {
      const mockRlsChecker = createMockRlsPolicyChecker({
        verifyPolicy: vi.fn().mockResolvedValue({
          hasAccess: true,
          policyApplied: '', // No policy applied - isolation breach
        }),
      });

      const serviceWithRls = DisasterRecoveryTestingServiceImpl({
        rlsPolicyChecker: mockRlsChecker,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithRls.validateTenantIsolationDuringRecovery({
        tenantIdA: 'tenant-a',
        tenantIdB: 'tenant-b',
        verifyMembershipIsolation: true,
        verifyDataIsolation: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.FAILED);
        expect(result.data.metrics?.rlsPolicyPassRate).toBe(0);
        expect(mockAlertEmitter.emit).toHaveBeenCalled();
      }
    });

    it('should report policy pass rate in metrics', async () => {
      let callCount = 0;
      const mockRlsChecker = createMockRlsPolicyChecker({
        verifyPolicy: vi.fn().mockImplementation(async () => {
          callCount++;
          // Tables are checked in pairs (A, B), so calls 1-2 are table 0, 3-4 are table 1, etc.
          // To get 50% pass rate (4 out of 8 policies), we need 2 tables to pass (both A and B)
          // Calls 1-4 (tables 0-1) should fail, calls 5-8 (tables 2-3) should pass
          if (callCount <= 4) {
            // First 2 tables: no policy applied
            return { hasAccess: true, policyApplied: '' };
          }
          // Last 2 tables: policy applied for both tenants
          return { hasAccess: true, policyApplied: 'tenant_isolation_policy' };
        }),
      });

      const serviceWithRls = DisasterRecoveryTestingServiceImpl({
        rlsPolicyChecker: mockRlsChecker,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithRls.validateTenantIsolationDuringRecovery({
        tenantIdA: 'tenant-a',
        tenantIdB: 'tenant-b',
        verifyMembershipIsolation: true,
        verifyDataIsolation: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metrics?.rlsPolicyPassRate).toBe(0.5);
      }
    });
  });

  // -------------------------------------------------------------------------
  // RLS Consistency Tests
  // -------------------------------------------------------------------------

  describe('validateRlsConsistencyAfterRecovery', () => {
    it('should pass when all expected tables have RLS policies', async () => {
      const mockRlsChecker = createMockRlsPolicyChecker();

      const serviceWithRls = DisasterRecoveryTestingServiceImpl({
        rlsPolicyChecker: mockRlsChecker,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithRls.validateRlsConsistencyAfterRecovery({
        tenantId: 'tenant-123',
        userId: 'user-123',
        role: MembershipRole.RT_ADMIN,
        expectedAccessibleTables: ['memberships', 'org_units', 'households'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.PASSED);
        expect(result.data.category).toBe(DisasterRecoveryCategory.RLS_CONSISTENCY);
        expect(mockRlsChecker.verifyPolicy).toHaveBeenCalledTimes(3);
      }
    });

    it('should fail when some tables are missing RLS policies', async () => {
      let callCount = 0;
      const mockRlsChecker = createMockRlsPolicyChecker({
        verifyPolicy: vi.fn().mockImplementation(async () => {
          callCount++;
          // Last table has no policy
          if (callCount === 3) {
            return { hasAccess: true, policyApplied: '' };
          }
          return { hasAccess: true, policyApplied: 'tenant_isolation_policy' };
        }),
      });

      const serviceWithRls = DisasterRecoveryTestingServiceImpl({
        rlsPolicyChecker: mockRlsChecker,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithRls.validateRlsConsistencyAfterRecovery({
        tenantId: 'tenant-123',
        userId: 'user-123',
        role: MembershipRole.RT_ADMIN,
        expectedAccessibleTables: ['memberships', 'org_units', 'households'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.FAILED);
        expect(mockAlertEmitter.emit).toHaveBeenCalled();
      }
    });

    it('should include table-level results in details', async () => {
      const mockRlsChecker = createMockRlsPolicyChecker();

      const serviceWithRls = DisasterRecoveryTestingServiceImpl({
        rlsPolicyChecker: mockRlsChecker,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithRls.validateRlsConsistencyAfterRecovery({
        tenantId: 'tenant-123',
        userId: 'user-123',
        role: MembershipRole.RT_ADMIN,
        expectedAccessibleTables: ['memberships', 'org_units'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.details?.tableResults).toBeDefined();
        expect(Array.isArray(result.data.details?.tableResults)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Backup RTO/RPO Verification Tests
  // -------------------------------------------------------------------------

  describe('verifyBackupRtoRpo', () => {
    it('should pass when backup meets RTO/RPO requirements', async () => {
      const mockBackupManager = createMockBackupManager({
        getBackupById: vi.fn().mockResolvedValue(
          createMockBackupMetadata({
            timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
          }),
        ),
      });

      const serviceWithBackup = DisasterRecoveryTestingServiceImpl({
        backupManager: mockBackupManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithBackup.verifyBackupRtoRpo('backup-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.PASSED);
      }
    });

    it('should fail when backup not found', async () => {
      const mockBackupManager = createMockBackupManager({
        getBackupById: vi.fn().mockResolvedValue(null),
      });

      const serviceWithBackup = DisasterRecoveryTestingServiceImpl({
        backupManager: mockBackupManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithBackup.verifyBackupRtoRpo('nonexistent-backup');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.FAILED);
        expect(result.data.message).toContain('not found');
      }
    });

    it('should fail when RPO is exceeded', async () => {
      const mockBackupManager = createMockBackupManager({
        getBackupById: vi.fn().mockResolvedValue(
          createMockBackupMetadata({
            timestamp: new Date(Date.now() - 120 * 60 * 1000), // 2 hours ago (exceeds 1 hour RPO)
          }),
        ),
      });

      const serviceWithBackup = DisasterRecoveryTestingServiceImpl({
        backupManager: mockBackupManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithBackup.verifyBackupRtoRpo('backup-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.FAILED);
        expect(result.data.message).toContain('RPO exceeded');
        expect(mockAlertEmitter.emit).toHaveBeenCalled();
      }
    });

    it('should warn when backup is not encrypted', async () => {
      const mockBackupManager = createMockBackupManager({
        verifyBackupIntegrity: vi.fn().mockResolvedValue({
          valid: true,
          checksumVerified: true,
          encrypted: false,
        }),
      });

      const serviceWithBackup = DisasterRecoveryTestingServiceImpl({
        backupManager: mockBackupManager,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithBackup.verifyBackupRtoRpo('backup-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.WARNING);
        expect(result.data.message).toContain('not encrypted');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Tenant-Specific Restoration Tests
  // -------------------------------------------------------------------------

  describe('validateTenantSpecificRestoration', () => {
    it('should pass when target tenant is restored and others are unaffected', async () => {
      const mockValidator = createMockDatabaseValidator({
        verifyDataIntegrity: vi.fn().mockResolvedValue({
          valid: true,
          recordCount: 1000,
          checksumMatch: true,
        }),
      });

      const serviceWithValidator = DisasterRecoveryTestingServiceImpl({
        databaseValidator: mockValidator,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithValidator.validateTenantSpecificRestoration(
        'tenant-a',
        ['tenant-b', 'tenant-c'],
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.PASSED);
        // Should verify all 3 tenants (1 target + 2 others)
        expect(mockValidator.verifyDataIntegrity).toHaveBeenCalledTimes(3);
      }
    });

    it('should fail when target tenant restoration fails', async () => {
      const mockValidator = createMockDatabaseValidator({
        verifyDataIntegrity: vi.fn().mockResolvedValue({
          valid: false,
          recordCount: 0,
          checksumMatch: false,
        }),
      });

      const serviceWithValidator = DisasterRecoveryTestingServiceImpl({
        databaseValidator: mockValidator,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithValidator.validateTenantSpecificRestoration(
        'tenant-a',
        ['tenant-b'],
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.FAILED);
        expect(result.data.message).toContain('Target tenant');
      }
    });

    it('should fail when other tenants are affected', async () => {
      let callCount = 0;
      const mockValidator = createMockDatabaseValidator({
        verifyDataIntegrity: vi.fn().mockImplementation(async () => {
          callCount++;
          // Target tenant passes, but second check (other tenant) fails
          if (callCount === 2) {
            return { valid: false, recordCount: 0, checksumMatch: false };
          }
          return { valid: true, recordCount: 1000, checksumMatch: true };
        }),
      });

      const serviceWithValidator = DisasterRecoveryTestingServiceImpl({
        databaseValidator: mockValidator,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithValidator.validateTenantSpecificRestoration(
        'tenant-a',
        ['tenant-b'],
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.FAILED);
        expect(result.data.message).toContain('affected');
        expect(mockAlertEmitter.emit).toHaveBeenCalled();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Full Validation Tests
  // -------------------------------------------------------------------------

  describe('runFullValidation', () => {
    it('should run all scenarios and return comprehensive report', async () => {
      const result = await service.runFullValidation();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBeDefined();
        expect(result.data.startTime).toBeInstanceOf(Date);
        expect(result.data.endTime).toBeInstanceOf(Date);
        expect(result.data.results.length).toBe(DR_TEST_SCENARIOS.length);
        expect(result.data.summary).toBeDefined();
        expect(result.data.summary.totalTests).toBe(DR_TEST_SCENARIOS.length);
      }
    });

    it('should skip specified scenarios', async () => {
      const result = await service.runFullValidation({
        skipScenarios: ['DR-001', 'DR-002'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const skippedResults = result.data.results.filter(
          r => r.status === DisasterRecoveryStatus.SKIPPED,
        );
        expect(skippedResults.length).toBe(2);
        expect(skippedResults.some(r => r.scenarioId === 'DR-001')).toBe(true);
        expect(skippedResults.some(r => r.scenarioId === 'DR-002')).toBe(true);
      }
    });

    it('should calculate health score correctly', async () => {
      const result = await service.runFullValidation();

      expect(result.success).toBe(true);
      if (result.success) {
        // All mocked tests pass, so health score should be high
        expect(result.data.summary.overallHealthScore).toBeGreaterThanOrEqual(0);
        expect(result.data.summary.overallHealthScore).toBeLessThanOrEqual(100);
      }
    });

    it('should report RTO/RPO compliance', async () => {
      const result = await service.runFullValidation();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.summary.rtoMet).toBe('boolean');
        expect(typeof result.data.summary.rpoMet).toBe('boolean');
      }
    });

    it('should report tenant isolation and RLS status', async () => {
      const result = await service.runFullValidation();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.summary.tenantIsolationPreserved).toBe('boolean');
        expect(typeof result.data.summary.rlsConsistent).toBe('boolean');
      }
    });

    it('should generate recommendations for failures', async () => {
      // Create service with failing validators
      const mockValidator = createMockDatabaseValidator({
        verifyDataIntegrity: vi.fn().mockResolvedValue({
          valid: false,
          recordCount: 0,
          checksumMatch: false,
        }),
      });

      const serviceWithFailures = DisasterRecoveryTestingServiceImpl({
        databaseValidator: mockValidator,
        alertEmitter: mockAlertEmitter,
      });

      const result = await serviceWithFailures.runFullValidation();

      expect(result.success).toBe(true);
      if (result.success) {
        // When tests fail, recommendations should be provided
        expect(Array.isArray(result.data.recommendations)).toBe(true);
      }
    });

    it('should use config overrides when provided', async () => {
      const result = await service.runFullValidation({
        config: {
          rtoMinutes: 120,
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.config.rtoMinutes).toBe(120);
      }
    });

    it('should set overall status based on test results', async () => {
      // With mocked tests passing
      const result = await service.runFullValidation();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(DisasterRecoveryStatus.PASSED);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Error Code Tests
  // -------------------------------------------------------------------------

  describe('Error Codes', () => {
    it('should have all required error codes defined', () => {
      expect(DR_ERROR_CODES.DR_DATABASE_FAILOVER_FAILED).toBeDefined();
      expect(DR_ERROR_CODES.DR_DATA_INTEGRITY_FAILED).toBeDefined();
      expect(DR_ERROR_CODES.DR_SESSION_RECOVERY_FAILED).toBeDefined();
      expect(DR_ERROR_CODES.DR_CACHE_WARMUP_FAILED).toBeDefined();
      expect(DR_ERROR_CODES.DR_TENANT_ISOLATION_FAILED).toBeDefined();
      expect(DR_ERROR_CODES.DR_RLS_CONSISTENCY_FAILED).toBeDefined();
      expect(DR_ERROR_CODES.DR_BACKUP_RESTORE_FAILED).toBeDefined();
      expect(DR_ERROR_CODES.DR_TOKEN_REFRESH_FAILED).toBeDefined();
      expect(DR_ERROR_CODES.DR_RTO_EXCEEDED).toBeDefined();
      expect(DR_ERROR_CODES.DR_RPO_EXCEEDED).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario Definition Tests
  // -------------------------------------------------------------------------

  describe('DR Test Scenarios', () => {
    it('should have unique scenario IDs', () => {
      const ids = DR_TEST_SCENARIOS.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have all critical security scenarios marked as CRITICAL severity', () => {
      const securityScenarios = DR_TEST_SCENARIOS.filter(
        s =>
          s.category === DisasterRecoveryCategory.TENANT_ISOLATION ||
          s.category === DisasterRecoveryCategory.RLS_CONSISTENCY,
      );

      securityScenarios.forEach(scenario => {
        expect(scenario.severity).toBe(DisasterRecoverySeverity.CRITICAL);
      });
    });

    it('should have database failover scenario marked as requiring downtime', () => {
      const failoverScenario = DR_TEST_SCENARIOS.find(s => s.id === 'DR-001');
      expect(failoverScenario?.requiresDowntime).toBe(true);
    });

    it('should have non-destructive scenarios marked as not affecting production', () => {
      DR_TEST_SCENARIOS.forEach(scenario => {
        expect(scenario.affectsProduction).toBe(false);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Default Configuration Tests
  // -------------------------------------------------------------------------

  describe('Default Configuration', () => {
    it('should have RTO of 4 hours (240 minutes) per Req 32', () => {
      expect(DEFAULT_DR_CONFIG.rtoMinutes).toBe(240);
    });

    it('should have RPO of 1 hour (60 minutes) per Req 32', () => {
      expect(DEFAULT_DR_CONFIG.rpoMinutes).toBe(60);
    });

    it('should have minimum backup frequency of 1 hour per Req 32', () => {
      expect(DEFAULT_DR_CONFIG.minBackupFrequencyHours).toBe(1);
    });
  });
});
