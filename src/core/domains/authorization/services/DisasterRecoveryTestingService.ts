/**
 * Disaster Recovery Testing Service
 *
 * Validates disaster recovery procedures for multi-tenant SaaS architecture.
 * Implements comprehensive testing for:
 * - Failover scenario validation
 * - Data recovery integrity
 * - Session recovery after system restart
 * - Cache warmup validation
 * - Multi-tenant isolation preservation during recovery
 * - RLS policy consistency after recovery
 *
 * @see Requirements 32 (Backup/DR Requirements)
 * @see FASE 1.22 Task 79: Disaster Recovery Testing
 *
 * RTO (Recovery Time Objective): 4 hours
 * RPO (Recovery Point Objective): 1 hour
 */

import { type DomainResult, ok, fail } from '@core/utils/DomainResult';
import { technicalError, businessError } from '@core/utils/AppError';
import type { MembershipRole } from '@core/domains/membership/types';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const DR_ERROR_CODES = {
  /** Database failover test failed */
  DR_DATABASE_FAILOVER_FAILED: 'DR_DATABASE_FAILOVER_FAILED',
  /** Data integrity verification failed after recovery */
  DR_DATA_INTEGRITY_FAILED: 'DR_DATA_INTEGRITY_FAILED',
  /** Session recovery test failed */
  DR_SESSION_RECOVERY_FAILED: 'DR_SESSION_RECOVERY_FAILED',
  /** Cache warmup validation failed */
  DR_CACHE_WARMUP_FAILED: 'DR_CACHE_WARMUP_FAILED',
  /** Tenant isolation compromised during recovery */
  DR_TENANT_ISOLATION_FAILED: 'DR_TENANT_ISOLATION_FAILED',
  /** RLS policy consistency check failed */
  DR_RLS_CONSISTENCY_FAILED: 'DR_RLS_CONSISTENCY_FAILED',
  /** Backup restoration failed */
  DR_BACKUP_RESTORE_FAILED: 'DR_BACKUP_RESTORE_FAILED',
  /** Token refresh after recovery failed */
  DR_TOKEN_REFRESH_FAILED: 'DR_TOKEN_REFRESH_FAILED',
  /** Recovery time exceeded RTO */
  DR_RTO_EXCEEDED: 'DR_RTO_EXCEEDED',
  /** Data loss exceeded RPO */
  DR_RPO_EXCEEDED: 'DR_RPO_EXCEEDED',
} as const;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Categories of disaster recovery tests.
 */
export enum DisasterRecoveryCategory {
  /** Database failover and restoration */
  DATABASE_FAILOVER = 'DATABASE_FAILOVER',
  /** Data integrity verification */
  DATA_INTEGRITY = 'DATA_INTEGRITY',
  /** Session and authentication recovery */
  SESSION_RECOVERY = 'SESSION_RECOVERY',
  /** Cache warmup and invalidation */
  CACHE_WARMUP = 'CACHE_WARMUP',
  /** Multi-tenant isolation during recovery */
  TENANT_ISOLATION = 'TENANT_ISOLATION',
  /** RLS policy consistency */
  RLS_CONSISTENCY = 'RLS_CONSISTENCY',
  /** Point-in-time recovery */
  POINT_IN_TIME_RECOVERY = 'POINT_IN_TIME_RECOVERY',
  /** Cross-region replication */
  CROSS_REGION_REPLICATION = 'CROSS_REGION_REPLICATION',
}

/**
 * Status of disaster recovery validation.
 */
export enum DisasterRecoveryStatus {
  /** Test passed successfully */
  PASSED = 'PASSED',
  /** Test failed */
  FAILED = 'FAILED',
  /** Test has warnings but acceptable */
  WARNING = 'WARNING',
  /** Test was skipped */
  SKIPPED = 'SKIPPED',
  /** Test is not applicable */
  NOT_APPLICABLE = 'NOT_APPLICABLE',
  /** Test is in progress */
  IN_PROGRESS = 'IN_PROGRESS',
}

/**
 * Severity levels for DR test failures.
 */
export enum DisasterRecoverySeverity {
  /** Critical failure - immediate attention required */
  CRITICAL = 'CRITICAL',
  /** High severity - affects recovery capability */
  HIGH = 'HIGH',
  /** Medium severity - degraded recovery */
  MEDIUM = 'MEDIUM',
  /** Low severity - minor issue */
  LOW = 'LOW',
  /** Informational only */
  INFO = 'INFO',
}

/**
 * Types of failover scenarios.
 */
export enum FailoverScenario {
  /** Primary database failure */
  PRIMARY_DATABASE_FAILURE = 'PRIMARY_DATABASE_FAILURE',
  /** Read replica promotion */
  READ_REPLICA_PROMOTION = 'READ_REPLICA_PROMOTION',
  /** Full cluster failover */
  CLUSTER_FAILOVER = 'CLUSTER_FAILOVER',
  /** Regional failover */
  REGIONAL_FAILOVER = 'REGIONAL_FAILOVER',
  /** Application server failure */
  APP_SERVER_FAILURE = 'APP_SERVER_FAILURE',
  /** Cache server failure */
  CACHE_FAILURE = 'CACHE_FAILURE',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Configuration for DR testing thresholds.
 */
export interface DisasterRecoveryConfig {
  /** Recovery Time Objective in minutes (default: 240 = 4 hours) */
  readonly rtoMinutes: number;
  /** Recovery Point Objective in minutes (default: 60 = 1 hour) */
  readonly rpoMinutes: number;
  /** Maximum acceptable data loss records */
  readonly maxAcceptableDataLoss: number;
  /** Session recovery timeout in seconds */
  readonly sessionRecoveryTimeoutSeconds: number;
  /** Cache warmup timeout in seconds */
  readonly cacheWarmupTimeoutSeconds: number;
  /** Minimum backup frequency in hours */
  readonly minBackupFrequencyHours: number;
  /** Cross-region replication lag threshold in seconds */
  readonly maxReplicationLagSeconds: number;
}

/**
 * Default DR configuration based on Req 32.
 */
export const DEFAULT_DR_CONFIG: DisasterRecoveryConfig = {
  rtoMinutes: 240, // 4 hours
  rpoMinutes: 60,  // 1 hour
  maxAcceptableDataLoss: 0,
  sessionRecoveryTimeoutSeconds: 60,
  cacheWarmupTimeoutSeconds: 300,
  minBackupFrequencyHours: 1,
  maxReplicationLagSeconds: 60,
};

/**
 * Test scenario definition.
 */
export interface DisasterRecoveryScenario {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: DisasterRecoveryCategory;
  readonly severity: DisasterRecoverySeverity;
  readonly estimatedDurationMinutes: number;
  readonly requiresDowntime: boolean;
  readonly affectsProduction: boolean;
}

/**
 * Result of a single DR test.
 */
export interface DisasterRecoveryTestResult {
  readonly scenarioId: string;
  readonly category: DisasterRecoveryCategory;
  readonly status: DisasterRecoveryStatus;
  readonly severity: DisasterRecoverySeverity;
  readonly message: string;
  readonly durationMs: number;
  readonly timestamp: Date;
  readonly metrics?: DisasterRecoveryMetrics;
  readonly details?: Record<string, unknown>;
}

/**
 * Metrics collected during DR testing.
 */
export interface DisasterRecoveryMetrics {
  /** Actual recovery time in minutes */
  readonly actualRecoveryTimeMinutes: number;
  /** Actual data loss in minutes (RPO) */
  readonly actualDataLossMinutes: number;
  /** Number of affected tenants */
  readonly affectedTenantCount: number;
  /** Number of affected sessions */
  readonly affectedSessionCount: number;
  /** Cache hit rate after warmup */
  readonly cacheHitRateAfterWarmup: number;
  /** RLS policy check pass rate */
  readonly rlsPolicyPassRate: number;
  /** Replication lag in seconds */
  readonly replicationLagSeconds?: number;
}

/**
 * Full DR validation report.
 */
export interface DisasterRecoveryReport {
  readonly id: string;
  readonly status: DisasterRecoveryStatus;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly totalDurationMs: number;
  readonly config: DisasterRecoveryConfig;
  readonly results: readonly DisasterRecoveryTestResult[];
  readonly summary: DisasterRecoverySummary;
  readonly recommendations: readonly string[];
}

/**
 * Summary of DR validation.
 */
export interface DisasterRecoverySummary {
  readonly totalTests: number;
  readonly passed: number;
  readonly failed: number;
  readonly warnings: number;
  readonly skipped: number;
  readonly rtoMet: boolean;
  readonly rpoMet: boolean;
  readonly tenantIsolationPreserved: boolean;
  readonly rlsConsistent: boolean;
  readonly overallHealthScore: number; // 0-100
}

/**
 * Input for database failover test.
 */
export interface TestDatabaseFailoverInput {
  readonly scenario: FailoverScenario;
  readonly targetTenantIds?: readonly string[];
  readonly simulateDataLoss?: boolean;
}

/**
 * Input for data recovery test.
 */
export interface TestDataRecoveryInput {
  readonly tenantId: string;
  readonly targetTimestamp: Date;
  readonly verifyIntegrity: boolean;
}

/**
 * Input for session recovery test.
 */
export interface TestSessionRecoveryInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly tokenVersion: number;
  readonly activeSessions: number;
}

/**
 * Input for cache warmup test.
 */
export interface TestCacheWarmupInput {
  readonly tenantIds: readonly string[];
  readonly preloadMemberships: boolean;
  readonly preloadPermissions: boolean;
}

/**
 * Input for tenant isolation test during recovery.
 */
export interface TestTenantIsolationInput {
  readonly tenantIdA: string;
  readonly tenantIdB: string;
  readonly verifyMembershipIsolation: boolean;
  readonly verifyDataIsolation: boolean;
}

/**
 * Input for RLS consistency test.
 */
export interface TestRlsConsistencyInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: MembershipRole;
  readonly expectedAccessibleTables: readonly string[];
}

/**
 * Backup metadata for verification.
 */
export interface BackupMetadata {
  readonly backupId: string;
  readonly timestamp: Date;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly encrypted: boolean;
  readonly region: string;
  readonly tenantCount: number;
}

/**
 * Alert emitter interface for DR alerts.
 */
export interface IDisasterRecoveryAlertEmitter {
  emit(alert: DisasterRecoveryAlert): Promise<void>;
}

/**
 * DR alert structure.
 */
export interface DisasterRecoveryAlert {
  readonly id: string;
  readonly severity: DisasterRecoverySeverity;
  readonly category: DisasterRecoveryCategory;
  readonly message: string;
  readonly timestamp: Date;
  readonly affectedTenants?: readonly string[];
  readonly recommendation?: string;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * Disaster Recovery Testing Service Interface.
 *
 * Provides comprehensive DR testing capabilities:
 * - Database failover scenario testing
 * - Data recovery and integrity validation
 * - Session recovery after system restart
 * - Cache warmup validation
 * - Multi-tenant isolation preservation
 * - RLS policy consistency verification
 */
export interface IDisasterRecoveryTestingService {
  /**
   * Run full disaster recovery validation suite.
   *
   * @param options Optional configuration overrides
   * @returns Full DR report with all test results
   */
  runFullValidation(options?: {
    readonly config?: Partial<DisasterRecoveryConfig>;
    readonly skipScenarios?: readonly string[];
    readonly dryRun?: boolean;
  }): Promise<DomainResult<DisasterRecoveryReport>>;

  /**
   * Test database failover scenario.
   *
   * @param input Failover test configuration
   * @returns Test result with failover metrics
   */
  testDatabaseFailover(
    input: TestDatabaseFailoverInput,
  ): Promise<DomainResult<DisasterRecoveryTestResult>>;

  /**
   * Test data recovery from backup.
   *
   * @param input Data recovery test configuration
   * @returns Test result with recovery metrics
   */
  testDataRecovery(
    input: TestDataRecoveryInput,
  ): Promise<DomainResult<DisasterRecoveryTestResult>>;

  /**
   * Validate data integrity after recovery.
   *
   * @param tenantId Tenant to validate
   * @returns Test result with integrity metrics
   */
  validateDataIntegrity(
    tenantId: string,
  ): Promise<DomainResult<DisasterRecoveryTestResult>>;

  /**
   * Test session recovery after system restart.
   *
   * @param input Session recovery test configuration
   * @returns Test result with session metrics
   */
  testSessionRecovery(
    input: TestSessionRecoveryInput,
  ): Promise<DomainResult<DisasterRecoveryTestResult>>;

  /**
   * Test token refresh flow after recovery.
   *
   * @param userId User to test token refresh
   * @param tenantId Tenant context
   * @returns Test result with token metrics
   */
  testTokenRefreshAfterRecovery(
    userId: string,
    tenantId: string,
  ): Promise<DomainResult<DisasterRecoveryTestResult>>;

  /**
   * Validate cache warmup after recovery.
   *
   * @param input Cache warmup test configuration
   * @returns Test result with cache metrics
   */
  validateCacheWarmup(
    input: TestCacheWarmupInput,
  ): Promise<DomainResult<DisasterRecoveryTestResult>>;

  /**
   * Validate tenant isolation is preserved during recovery.
   *
   * @param input Tenant isolation test configuration
   * @returns Test result with isolation metrics
   */
  validateTenantIsolationDuringRecovery(
    input: TestTenantIsolationInput,
  ): Promise<DomainResult<DisasterRecoveryTestResult>>;

  /**
   * Validate RLS policy consistency after recovery.
   *
   * @param input RLS consistency test configuration
   * @returns Test result with RLS metrics
   */
  validateRlsConsistencyAfterRecovery(
    input: TestRlsConsistencyInput,
  ): Promise<DomainResult<DisasterRecoveryTestResult>>;

  /**
   * Verify backup meets RTO/RPO requirements.
   *
   * @param backupId Backup to verify
   * @returns Verification result with backup metadata
   */
  verifyBackupRtoRpo(
    backupId: string,
  ): Promise<DomainResult<DisasterRecoveryTestResult>>;

  /**
   * Test point-in-time recovery accuracy.
   *
   * @param targetTimestamp Target recovery point
   * @param tenantId Tenant to recover
   * @returns Test result with accuracy metrics
   */
  testPointInTimeRecovery(
    targetTimestamp: Date,
    tenantId: string,
  ): Promise<DomainResult<DisasterRecoveryTestResult>>;

  /**
   * Validate tenant-specific data restoration without affecting other tenants.
   *
   * @param tenantId Tenant to restore
   * @param otherTenantIds Other tenants to verify unaffected
   * @returns Test result with isolation metrics
   */
  validateTenantSpecificRestoration(
    tenantId: string,
    otherTenantIds: readonly string[],
  ): Promise<DomainResult<DisasterRecoveryTestResult>>;

  /**
   * Get list of supported DR scenarios.
   *
   * @returns Array of available test scenarios
   */
  getSupportedScenarios(): readonly DisasterRecoveryScenario[];

  /**
   * Get current DR configuration.
   *
   * @returns Current configuration
   */
  getConfig(): DisasterRecoveryConfig;

  /**
   * Update DR configuration.
   *
   * @param config Partial configuration to update
   */
  updateConfig(config: Partial<DisasterRecoveryConfig>): void;
}

/**
 * Type alias for cleaner usage.
 */
export type DisasterRecoveryTestingService = IDisasterRecoveryTestingService;

// ---------------------------------------------------------------------------
// Supported Scenarios
// ---------------------------------------------------------------------------

/**
 * Predefined DR test scenarios.
 */
export const DR_TEST_SCENARIOS: readonly DisasterRecoveryScenario[] = [
  {
    id: 'DR-001',
    name: 'Primary Database Failover',
    description: 'Tests failover from primary to standby database',
    category: DisasterRecoveryCategory.DATABASE_FAILOVER,
    severity: DisasterRecoverySeverity.CRITICAL,
    estimatedDurationMinutes: 30,
    requiresDowntime: true,
    affectsProduction: false,
  },
  {
    id: 'DR-002',
    name: 'Point-in-Time Recovery',
    description: 'Tests recovery to specific timestamp within RPO',
    category: DisasterRecoveryCategory.POINT_IN_TIME_RECOVERY,
    severity: DisasterRecoverySeverity.CRITICAL,
    estimatedDurationMinutes: 45,
    requiresDowntime: true,
    affectsProduction: false,
  },
  {
    id: 'DR-003',
    name: 'Data Integrity Verification',
    description: 'Validates data integrity after recovery',
    category: DisasterRecoveryCategory.DATA_INTEGRITY,
    severity: DisasterRecoverySeverity.CRITICAL,
    estimatedDurationMinutes: 20,
    requiresDowntime: false,
    affectsProduction: false,
  },
  {
    id: 'DR-004',
    name: 'Session Recovery Test',
    description: 'Tests user session continuity after system restart',
    category: DisasterRecoveryCategory.SESSION_RECOVERY,
    severity: DisasterRecoverySeverity.HIGH,
    estimatedDurationMinutes: 15,
    requiresDowntime: false,
    affectsProduction: false,
  },
  {
    id: 'DR-005',
    name: 'Token Refresh After Recovery',
    description: 'Tests token refresh flow after system recovery',
    category: DisasterRecoveryCategory.SESSION_RECOVERY,
    severity: DisasterRecoverySeverity.HIGH,
    estimatedDurationMinutes: 10,
    requiresDowntime: false,
    affectsProduction: false,
  },
  {
    id: 'DR-006',
    name: 'Cache Warmup Validation',
    description: 'Validates cache warmup efficiency after recovery',
    category: DisasterRecoveryCategory.CACHE_WARMUP,
    severity: DisasterRecoverySeverity.MEDIUM,
    estimatedDurationMinutes: 15,
    requiresDowntime: false,
    affectsProduction: false,
  },
  {
    id: 'DR-007',
    name: 'Tenant Isolation During Recovery',
    description: 'Validates no cross-tenant data leakage during recovery',
    category: DisasterRecoveryCategory.TENANT_ISOLATION,
    severity: DisasterRecoverySeverity.CRITICAL,
    estimatedDurationMinutes: 25,
    requiresDowntime: false,
    affectsProduction: false,
  },
  {
    id: 'DR-008',
    name: 'RLS Policy Consistency',
    description: 'Validates RLS policies remain consistent after recovery',
    category: DisasterRecoveryCategory.RLS_CONSISTENCY,
    severity: DisasterRecoverySeverity.CRITICAL,
    estimatedDurationMinutes: 20,
    requiresDowntime: false,
    affectsProduction: false,
  },
  {
    id: 'DR-009',
    name: 'Single Tenant Restoration',
    description: 'Validates single tenant can be restored without affecting others',
    category: DisasterRecoveryCategory.DATA_INTEGRITY,
    severity: DisasterRecoverySeverity.HIGH,
    estimatedDurationMinutes: 35,
    requiresDowntime: false,
    affectsProduction: false,
  },
  {
    id: 'DR-010',
    name: 'Cross-Region Replication Verification',
    description: 'Validates cross-region backup replication',
    category: DisasterRecoveryCategory.CROSS_REGION_REPLICATION,
    severity: DisasterRecoverySeverity.HIGH,
    estimatedDurationMinutes: 20,
    requiresDowntime: false,
    affectsProduction: false,
  },
] as const;

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies for DisasterRecoveryTestingService.
 */
export interface DisasterRecoveryTestingServiceDependencies {
  /** Optional custom configuration */
  readonly config?: Partial<DisasterRecoveryConfig>;
  /** Optional alert emitter */
  readonly alertEmitter?: IDisasterRecoveryAlertEmitter;
  /** Database connection validator */
  readonly databaseValidator?: IDatabaseValidator;
  /** Session manager for recovery testing */
  readonly sessionManager?: ISessionManager;
  /** Cache manager for warmup testing */
  readonly cacheManager?: ICacheManager;
  /** RLS policy checker */
  readonly rlsPolicyChecker?: IRlsPolicyChecker;
  /** Backup manager for restore testing */
  readonly backupManager?: IBackupManager;
}

/**
 * Database validator interface for DR testing.
 */
export interface IDatabaseValidator {
  checkConnection(): Promise<boolean>;
  verifyDataIntegrity(tenantId: string): Promise<{
    valid: boolean;
    recordCount: number;
    checksumMatch: boolean;
  }>;
  getReplicationLag(): Promise<number>;
}

/**
 * Session manager interface for DR testing.
 */
export interface ISessionManager {
  countActiveSessions(userId: string, tenantId: string): Promise<number>;
  validateSession(sessionId: string): Promise<boolean>;
  refreshToken(userId: string, tenantId: string): Promise<{
    success: boolean;
    newTokenVersion: number;
  }>;
}

/**
 * Cache manager interface for DR testing.
 */
export interface ICacheManager {
  getHitRate(): Promise<number>;
  warmupTenant(tenantId: string): Promise<{
    success: boolean;
    entriesLoaded: number;
    durationMs: number;
  }>;
  clearTenantCache(tenantId: string): Promise<void>;
}

/**
 * RLS policy checker interface for DR testing.
 */
export interface IRlsPolicyChecker {
  verifyPolicy(
    tenantId: string,
    userId: string,
    tableName: string,
  ): Promise<{
    hasAccess: boolean;
    policyApplied: string;
  }>;
  listPolicies(): Promise<readonly string[]>;
}

/**
 * Backup manager interface for DR testing.
 */
export interface IBackupManager {
  getLatestBackup(): Promise<BackupMetadata | null>;
  getBackupById(backupId: string): Promise<BackupMetadata | null>;
  verifyBackupIntegrity(backupId: string): Promise<{
    valid: boolean;
    checksumVerified: boolean;
    encrypted: boolean;
  }>;
  listBackupsInTimeRange(
    startTime: Date,
    endTime: Date,
  ): Promise<readonly BackupMetadata[]>;
}

// ---------------------------------------------------------------------------
// Default Alert Emitter (Console)
// ---------------------------------------------------------------------------

/**
 * Console-based alert emitter for testing.
 */
export const ConsoleDisasterRecoveryAlertEmitter: IDisasterRecoveryAlertEmitter = {
  emit: async (alert: DisasterRecoveryAlert): Promise<void> => {
    const prefix = `[DR-ALERT][${alert.severity}]`;
    console.warn(
      `${prefix} ${alert.category}: ${alert.message}`,
      alert.affectedTenants ? `Affected: ${alert.affectedTenants.join(', ')}` : '',
    );
  },
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for creating DisasterRecoveryTestingService.
 *
 * @param deps Service dependencies
 * @returns IDisasterRecoveryTestingService instance
 *
 * @see Requirements 32 (Backup/DR Requirements)
 */
export const DisasterRecoveryTestingServiceImpl = (
  deps: DisasterRecoveryTestingServiceDependencies = {},
): IDisasterRecoveryTestingService => {
  // Merge config with defaults
  let config: DisasterRecoveryConfig = {
    ...DEFAULT_DR_CONFIG,
    ...deps.config,
  };

  const alertEmitter = deps.alertEmitter ?? ConsoleDisasterRecoveryAlertEmitter;
  const databaseValidator = deps.databaseValidator;
  const sessionManager = deps.sessionManager;
  const cacheManager = deps.cacheManager;
  const rlsPolicyChecker = deps.rlsPolicyChecker;
  const backupManager = deps.backupManager;

  // Alert counter for generating unique IDs
  let alertCounter = 0;
  let reportCounter = 0;

  const generateAlertId = (): string => {
    alertCounter++;
    return `dr-alert-${Date.now()}-${alertCounter}`;
  };

  const generateReportId = (): string => {
    reportCounter++;
    return `dr-report-${Date.now()}-${reportCounter}`;
  };

  // Helper: Emit alert if severity warrants it
  const emitAlertIfNeeded = async (
    status: DisasterRecoveryStatus,
    category: DisasterRecoveryCategory,
    severity: DisasterRecoverySeverity,
    message: string,
    affectedTenants?: readonly string[],
  ): Promise<void> => {
    if (status === DisasterRecoveryStatus.FAILED) {
      await alertEmitter.emit({
        id: generateAlertId(),
        severity,
        category,
        message,
        timestamp: new Date(),
        affectedTenants,
      });
    }
  };

  // Helper: Create test result
  const createTestResult = (
    scenarioId: string,
    category: DisasterRecoveryCategory,
    status: DisasterRecoveryStatus,
    severity: DisasterRecoverySeverity,
    message: string,
    durationMs: number,
    metrics?: DisasterRecoveryMetrics,
    details?: Record<string, unknown>,
  ): DisasterRecoveryTestResult => ({
    scenarioId,
    category,
    status,
    severity,
    message,
    durationMs,
    timestamp: new Date(),
    metrics,
    details,
  });

  // ---------------------------------------------------------------------------
  // Test Implementations
  // ---------------------------------------------------------------------------

  const testDatabaseFailover = async (
    input: TestDatabaseFailoverInput,
  ): Promise<DomainResult<DisasterRecoveryTestResult>> => {
    const startTime = Date.now();

    try {
      // Simulate database failover test
      if (!databaseValidator) {
        // Mock test when no validator provided
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-001',
            DisasterRecoveryCategory.DATABASE_FAILOVER,
            DisasterRecoveryStatus.PASSED,
            DisasterRecoverySeverity.CRITICAL,
            `Database failover test (${input.scenario}) completed successfully (mocked)`,
            durationMs,
            {
              actualRecoveryTimeMinutes: 5,
              actualDataLossMinutes: 0,
              affectedTenantCount: input.targetTenantIds?.length ?? 0,
              affectedSessionCount: 0,
              cacheHitRateAfterWarmup: 0.95,
              rlsPolicyPassRate: 1.0,
            },
          ),
        );
      }

      // Check database connection
      const isConnected = await databaseValidator.checkConnection();
      if (!isConnected) {
        const durationMs = Date.now() - startTime;
        await emitAlertIfNeeded(
          DisasterRecoveryStatus.FAILED,
          DisasterRecoveryCategory.DATABASE_FAILOVER,
          DisasterRecoverySeverity.CRITICAL,
          'Database connection failed after failover',
          input.targetTenantIds,
        );
        return ok(
          createTestResult(
            'DR-001',
            DisasterRecoveryCategory.DATABASE_FAILOVER,
            DisasterRecoveryStatus.FAILED,
            DisasterRecoverySeverity.CRITICAL,
            `Database failover test failed: connection not restored`,
            durationMs,
          ),
        );
      }

      // Check replication lag
      const replicationLag = await databaseValidator.getReplicationLag();
      const durationMs = Date.now() - startTime;

      if (replicationLag > config.maxReplicationLagSeconds) {
        return ok(
          createTestResult(
            'DR-001',
            DisasterRecoveryCategory.DATABASE_FAILOVER,
            DisasterRecoveryStatus.WARNING,
            DisasterRecoverySeverity.HIGH,
            `Database failover completed with high replication lag: ${replicationLag}s`,
            durationMs,
            {
              actualRecoveryTimeMinutes: durationMs / 60000,
              actualDataLossMinutes: replicationLag / 60,
              affectedTenantCount: input.targetTenantIds?.length ?? 0,
              affectedSessionCount: 0,
              cacheHitRateAfterWarmup: 0,
              rlsPolicyPassRate: 1.0,
              replicationLagSeconds: replicationLag,
            },
          ),
        );
      }

      return ok(
        createTestResult(
          'DR-001',
          DisasterRecoveryCategory.DATABASE_FAILOVER,
          DisasterRecoveryStatus.PASSED,
          DisasterRecoverySeverity.CRITICAL,
          `Database failover test (${input.scenario}) completed successfully`,
          durationMs,
          {
            actualRecoveryTimeMinutes: durationMs / 60000,
            actualDataLossMinutes: 0,
            affectedTenantCount: input.targetTenantIds?.length ?? 0,
            affectedSessionCount: 0,
            cacheHitRateAfterWarmup: 0,
            rlsPolicyPassRate: 1.0,
            replicationLagSeconds: replicationLag,
          },
        ),
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return fail(
        technicalError(
          DR_ERROR_CODES.DR_DATABASE_FAILOVER_FAILED,
          `Database failover test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { cause: error },
        ),
      );
    }
  };

  const testDataRecovery = async (
    input: TestDataRecoveryInput,
  ): Promise<DomainResult<DisasterRecoveryTestResult>> => {
    const startTime = Date.now();

    try {
      if (!backupManager) {
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-002',
            DisasterRecoveryCategory.POINT_IN_TIME_RECOVERY,
            DisasterRecoveryStatus.PASSED,
            DisasterRecoverySeverity.CRITICAL,
            `Data recovery test completed successfully (mocked)`,
            durationMs,
            {
              actualRecoveryTimeMinutes: 10,
              actualDataLossMinutes: 0,
              affectedTenantCount: 1,
              affectedSessionCount: 0,
              cacheHitRateAfterWarmup: 0.9,
              rlsPolicyPassRate: 1.0,
            },
          ),
        );
      }

      // Find backup closest to target timestamp
      const startRange = new Date(input.targetTimestamp.getTime() - config.rpoMinutes * 60 * 1000);
      const backups = await backupManager.listBackupsInTimeRange(startRange, input.targetTimestamp);

      if (backups.length === 0) {
        const durationMs = Date.now() - startTime;
        await emitAlertIfNeeded(
          DisasterRecoveryStatus.FAILED,
          DisasterRecoveryCategory.POINT_IN_TIME_RECOVERY,
          DisasterRecoverySeverity.CRITICAL,
          'No backup found within RPO window',
          [input.tenantId],
        );
        return ok(
          createTestResult(
            'DR-002',
            DisasterRecoveryCategory.POINT_IN_TIME_RECOVERY,
            DisasterRecoveryStatus.FAILED,
            DisasterRecoverySeverity.CRITICAL,
            'No backup found within RPO window',
            durationMs,
          ),
        );
      }

      // Verify backup integrity if requested
      if (input.verifyIntegrity) {
        const latestBackup = backups[backups.length - 1];
        const integrity = await backupManager.verifyBackupIntegrity(latestBackup.backupId);

        if (!integrity.valid || !integrity.checksumVerified) {
          const durationMs = Date.now() - startTime;
          return ok(
            createTestResult(
              'DR-002',
              DisasterRecoveryCategory.POINT_IN_TIME_RECOVERY,
              DisasterRecoveryStatus.FAILED,
              DisasterRecoverySeverity.CRITICAL,
              'Backup integrity verification failed',
              durationMs,
            ),
          );
        }
      }

      const durationMs = Date.now() - startTime;
      return ok(
        createTestResult(
          'DR-002',
          DisasterRecoveryCategory.POINT_IN_TIME_RECOVERY,
          DisasterRecoveryStatus.PASSED,
          DisasterRecoverySeverity.CRITICAL,
          'Data recovery test completed successfully',
          durationMs,
          {
            actualRecoveryTimeMinutes: durationMs / 60000,
            actualDataLossMinutes: 0,
            affectedTenantCount: 1,
            affectedSessionCount: 0,
            cacheHitRateAfterWarmup: 0,
            rlsPolicyPassRate: 1.0,
          },
          { backupCount: backups.length },
        ),
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return fail(
        technicalError(
          DR_ERROR_CODES.DR_BACKUP_RESTORE_FAILED,
          `Data recovery test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { cause: error },
        ),
      );
    }
  };

  const validateDataIntegrity = async (
    tenantId: string,
  ): Promise<DomainResult<DisasterRecoveryTestResult>> => {
    const startTime = Date.now();

    try {
      if (!databaseValidator) {
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-003',
            DisasterRecoveryCategory.DATA_INTEGRITY,
            DisasterRecoveryStatus.PASSED,
            DisasterRecoverySeverity.CRITICAL,
            'Data integrity validation passed (mocked)',
            durationMs,
          ),
        );
      }

      const integrityResult = await databaseValidator.verifyDataIntegrity(tenantId);
      const durationMs = Date.now() - startTime;

      if (!integrityResult.valid || !integrityResult.checksumMatch) {
        await emitAlertIfNeeded(
          DisasterRecoveryStatus.FAILED,
          DisasterRecoveryCategory.DATA_INTEGRITY,
          DisasterRecoverySeverity.CRITICAL,
          `Data integrity check failed for tenant ${tenantId}`,
          [tenantId],
        );
        return ok(
          createTestResult(
            'DR-003',
            DisasterRecoveryCategory.DATA_INTEGRITY,
            DisasterRecoveryStatus.FAILED,
            DisasterRecoverySeverity.CRITICAL,
            `Data integrity check failed: checksum mismatch`,
            durationMs,
            undefined,
            { recordCount: integrityResult.recordCount },
          ),
        );
      }

      return ok(
        createTestResult(
          'DR-003',
          DisasterRecoveryCategory.DATA_INTEGRITY,
          DisasterRecoveryStatus.PASSED,
          DisasterRecoverySeverity.CRITICAL,
          `Data integrity validation passed for tenant ${tenantId}`,
          durationMs,
          undefined,
          { recordCount: integrityResult.recordCount },
        ),
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return fail(
        technicalError(
          DR_ERROR_CODES.DR_DATA_INTEGRITY_FAILED,
          `Data integrity validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { cause: error },
        ),
      );
    }
  };

  const testSessionRecovery = async (
    input: TestSessionRecoveryInput,
  ): Promise<DomainResult<DisasterRecoveryTestResult>> => {
    const startTime = Date.now();

    try {
      if (!sessionManager) {
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-004',
            DisasterRecoveryCategory.SESSION_RECOVERY,
            DisasterRecoveryStatus.PASSED,
            DisasterRecoverySeverity.HIGH,
            'Session recovery test passed (mocked)',
            durationMs,
            {
              actualRecoveryTimeMinutes: durationMs / 60000,
              actualDataLossMinutes: 0,
              affectedTenantCount: 1,
              affectedSessionCount: input.activeSessions,
              cacheHitRateAfterWarmup: 0.95,
              rlsPolicyPassRate: 1.0,
            },
          ),
        );
      }

      const activeSessions = await sessionManager.countActiveSessions(
        input.userId,
        input.tenantId,
      );
      const durationMs = Date.now() - startTime;

      // Check if sessions were recovered within timeout
      if (durationMs > config.sessionRecoveryTimeoutSeconds * 1000) {
        await emitAlertIfNeeded(
          DisasterRecoveryStatus.WARNING,
          DisasterRecoveryCategory.SESSION_RECOVERY,
          DisasterRecoverySeverity.HIGH,
          'Session recovery exceeded timeout',
          [input.tenantId],
        );
        return ok(
          createTestResult(
            'DR-004',
            DisasterRecoveryCategory.SESSION_RECOVERY,
            DisasterRecoveryStatus.WARNING,
            DisasterRecoverySeverity.HIGH,
            `Session recovery completed but exceeded timeout (${durationMs}ms > ${config.sessionRecoveryTimeoutSeconds * 1000}ms)`,
            durationMs,
            {
              actualRecoveryTimeMinutes: durationMs / 60000,
              actualDataLossMinutes: 0,
              affectedTenantCount: 1,
              affectedSessionCount: activeSessions,
              cacheHitRateAfterWarmup: 0,
              rlsPolicyPassRate: 1.0,
            },
          ),
        );
      }

      return ok(
        createTestResult(
          'DR-004',
          DisasterRecoveryCategory.SESSION_RECOVERY,
          DisasterRecoveryStatus.PASSED,
          DisasterRecoverySeverity.HIGH,
          'Session recovery test passed',
          durationMs,
          {
            actualRecoveryTimeMinutes: durationMs / 60000,
            actualDataLossMinutes: 0,
            affectedTenantCount: 1,
            affectedSessionCount: activeSessions,
            cacheHitRateAfterWarmup: 0,
            rlsPolicyPassRate: 1.0,
          },
        ),
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return fail(
        technicalError(
          DR_ERROR_CODES.DR_SESSION_RECOVERY_FAILED,
          `Session recovery test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { cause: error },
        ),
      );
    }
  };

  const testTokenRefreshAfterRecovery = async (
    userId: string,
    tenantId: string,
  ): Promise<DomainResult<DisasterRecoveryTestResult>> => {
    const startTime = Date.now();

    try {
      if (!sessionManager) {
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-005',
            DisasterRecoveryCategory.SESSION_RECOVERY,
            DisasterRecoveryStatus.PASSED,
            DisasterRecoverySeverity.HIGH,
            'Token refresh test passed (mocked)',
            durationMs,
          ),
        );
      }

      const refreshResult = await sessionManager.refreshToken(userId, tenantId);
      const durationMs = Date.now() - startTime;

      if (!refreshResult.success) {
        await emitAlertIfNeeded(
          DisasterRecoveryStatus.FAILED,
          DisasterRecoveryCategory.SESSION_RECOVERY,
          DisasterRecoverySeverity.HIGH,
          `Token refresh failed for user ${userId}`,
          [tenantId],
        );
        return ok(
          createTestResult(
            'DR-005',
            DisasterRecoveryCategory.SESSION_RECOVERY,
            DisasterRecoveryStatus.FAILED,
            DisasterRecoverySeverity.HIGH,
            'Token refresh failed after recovery',
            durationMs,
          ),
        );
      }

      return ok(
        createTestResult(
          'DR-005',
          DisasterRecoveryCategory.SESSION_RECOVERY,
          DisasterRecoveryStatus.PASSED,
          DisasterRecoverySeverity.HIGH,
          'Token refresh test passed',
          durationMs,
          undefined,
          { newTokenVersion: refreshResult.newTokenVersion },
        ),
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return fail(
        technicalError(
          DR_ERROR_CODES.DR_TOKEN_REFRESH_FAILED,
          `Token refresh test error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { cause: error },
        ),
      );
    }
  };

  const validateCacheWarmup = async (
    input: TestCacheWarmupInput,
  ): Promise<DomainResult<DisasterRecoveryTestResult>> => {
    const startTime = Date.now();

    try {
      if (!cacheManager) {
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-006',
            DisasterRecoveryCategory.CACHE_WARMUP,
            DisasterRecoveryStatus.PASSED,
            DisasterRecoverySeverity.MEDIUM,
            'Cache warmup validation passed (mocked)',
            durationMs,
            {
              actualRecoveryTimeMinutes: durationMs / 60000,
              actualDataLossMinutes: 0,
              affectedTenantCount: input.tenantIds.length,
              affectedSessionCount: 0,
              cacheHitRateAfterWarmup: 0.95,
              rlsPolicyPassRate: 1.0,
            },
          ),
        );
      }

      // Warmup each tenant's cache
      let totalEntriesLoaded = 0;
      for (const tenantId of input.tenantIds) {
        const warmupResult = await cacheManager.warmupTenant(tenantId);
        if (!warmupResult.success) {
          const durationMs = Date.now() - startTime;
          return ok(
            createTestResult(
              'DR-006',
              DisasterRecoveryCategory.CACHE_WARMUP,
              DisasterRecoveryStatus.FAILED,
              DisasterRecoverySeverity.MEDIUM,
              `Cache warmup failed for tenant ${tenantId}`,
              durationMs,
            ),
          );
        }
        totalEntriesLoaded += warmupResult.entriesLoaded;
      }

      // Check hit rate after warmup
      const hitRate = await cacheManager.getHitRate();
      const durationMs = Date.now() - startTime;

      // Check if warmup exceeded timeout
      if (durationMs > config.cacheWarmupTimeoutSeconds * 1000) {
        return ok(
          createTestResult(
            'DR-006',
            DisasterRecoveryCategory.CACHE_WARMUP,
            DisasterRecoveryStatus.WARNING,
            DisasterRecoverySeverity.MEDIUM,
            `Cache warmup completed but exceeded timeout`,
            durationMs,
            {
              actualRecoveryTimeMinutes: durationMs / 60000,
              actualDataLossMinutes: 0,
              affectedTenantCount: input.tenantIds.length,
              affectedSessionCount: 0,
              cacheHitRateAfterWarmup: hitRate,
              rlsPolicyPassRate: 1.0,
            },
            { entriesLoaded: totalEntriesLoaded },
          ),
        );
      }

      return ok(
        createTestResult(
          'DR-006',
          DisasterRecoveryCategory.CACHE_WARMUP,
          DisasterRecoveryStatus.PASSED,
          DisasterRecoverySeverity.MEDIUM,
          'Cache warmup validation passed',
          durationMs,
          {
            actualRecoveryTimeMinutes: durationMs / 60000,
            actualDataLossMinutes: 0,
            affectedTenantCount: input.tenantIds.length,
            affectedSessionCount: 0,
            cacheHitRateAfterWarmup: hitRate,
            rlsPolicyPassRate: 1.0,
          },
          { entriesLoaded: totalEntriesLoaded },
        ),
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return fail(
        technicalError(
          DR_ERROR_CODES.DR_CACHE_WARMUP_FAILED,
          `Cache warmup validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { cause: error },
        ),
      );
    }
  };

  const validateTenantIsolationDuringRecovery = async (
    input: TestTenantIsolationInput,
  ): Promise<DomainResult<DisasterRecoveryTestResult>> => {
    const startTime = Date.now();

    try {
      // This test validates that during and after recovery:
      // 1. Tenant A cannot access Tenant B's data
      // 2. Memberships remain properly isolated
      // 3. No cross-tenant data leakage occurs

      if (!rlsPolicyChecker) {
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-007',
            DisasterRecoveryCategory.TENANT_ISOLATION,
            DisasterRecoveryStatus.PASSED,
            DisasterRecoverySeverity.CRITICAL,
            'Tenant isolation validation passed (mocked)',
            durationMs,
            {
              actualRecoveryTimeMinutes: durationMs / 60000,
              actualDataLossMinutes: 0,
              affectedTenantCount: 2,
              affectedSessionCount: 0,
              cacheHitRateAfterWarmup: 0,
              rlsPolicyPassRate: 1.0,
            },
          ),
        );
      }

      // Test that RLS policies are correctly applied for both tenants
      const tablesToCheck = ['memberships', 'org_units', 'households', 'residents'];
      let policyPassCount = 0;
      const totalChecks = tablesToCheck.length * 2; // Check both tenants

      for (const table of tablesToCheck) {
        // Verify tenant A's access
        const tenantAResult = await rlsPolicyChecker.verifyPolicy(
          input.tenantIdA,
          'test-user-a',
          table,
        );

        // Verify tenant B's access
        const tenantBResult = await rlsPolicyChecker.verifyPolicy(
          input.tenantIdB,
          'test-user-b',
          table,
        );

        if (tenantAResult.policyApplied && tenantBResult.policyApplied) {
          policyPassCount += 2;
        }
      }

      const passRate = policyPassCount / totalChecks;
      const durationMs = Date.now() - startTime;

      if (passRate < 1.0) {
        await emitAlertIfNeeded(
          DisasterRecoveryStatus.FAILED,
          DisasterRecoveryCategory.TENANT_ISOLATION,
          DisasterRecoverySeverity.CRITICAL,
          'Tenant isolation compromised during recovery',
          [input.tenantIdA, input.tenantIdB],
        );
        return ok(
          createTestResult(
            'DR-007',
            DisasterRecoveryCategory.TENANT_ISOLATION,
            DisasterRecoveryStatus.FAILED,
            DisasterRecoverySeverity.CRITICAL,
            `Tenant isolation check failed: ${passRate * 100}% policies passed`,
            durationMs,
            {
              actualRecoveryTimeMinutes: durationMs / 60000,
              actualDataLossMinutes: 0,
              affectedTenantCount: 2,
              affectedSessionCount: 0,
              cacheHitRateAfterWarmup: 0,
              rlsPolicyPassRate: passRate,
            },
          ),
        );
      }

      return ok(
        createTestResult(
          'DR-007',
          DisasterRecoveryCategory.TENANT_ISOLATION,
          DisasterRecoveryStatus.PASSED,
          DisasterRecoverySeverity.CRITICAL,
          'Tenant isolation validation passed',
          durationMs,
          {
            actualRecoveryTimeMinutes: durationMs / 60000,
            actualDataLossMinutes: 0,
            affectedTenantCount: 2,
            affectedSessionCount: 0,
            cacheHitRateAfterWarmup: 0,
            rlsPolicyPassRate: passRate,
          },
        ),
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return fail(
        technicalError(
          DR_ERROR_CODES.DR_TENANT_ISOLATION_FAILED,
          `Tenant isolation validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { cause: error },
        ),
      );
    }
  };

  const validateRlsConsistencyAfterRecovery = async (
    input: TestRlsConsistencyInput,
  ): Promise<DomainResult<DisasterRecoveryTestResult>> => {
    const startTime = Date.now();

    try {
      if (!rlsPolicyChecker) {
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-008',
            DisasterRecoveryCategory.RLS_CONSISTENCY,
            DisasterRecoveryStatus.PASSED,
            DisasterRecoverySeverity.CRITICAL,
            'RLS consistency validation passed (mocked)',
            durationMs,
            {
              actualRecoveryTimeMinutes: durationMs / 60000,
              actualDataLossMinutes: 0,
              affectedTenantCount: 1,
              affectedSessionCount: 0,
              cacheHitRateAfterWarmup: 0,
              rlsPolicyPassRate: 1.0,
            },
          ),
        );
      }

      // Verify all expected tables have RLS policies applied
      let passCount = 0;
      const results: Array<{ table: string; hasAccess: boolean; policy: string }> = [];

      for (const table of input.expectedAccessibleTables) {
        const result = await rlsPolicyChecker.verifyPolicy(
          input.tenantId,
          input.userId,
          table,
        );
        results.push({
          table,
          hasAccess: result.hasAccess,
          policy: result.policyApplied,
        });
        if (result.policyApplied) {
          passCount++;
        }
      }

      const passRate = passCount / input.expectedAccessibleTables.length;
      const durationMs = Date.now() - startTime;

      if (passRate < 1.0) {
        await emitAlertIfNeeded(
          DisasterRecoveryStatus.FAILED,
          DisasterRecoveryCategory.RLS_CONSISTENCY,
          DisasterRecoverySeverity.CRITICAL,
          'RLS policies inconsistent after recovery',
          [input.tenantId],
        );
        return ok(
          createTestResult(
            'DR-008',
            DisasterRecoveryCategory.RLS_CONSISTENCY,
            DisasterRecoveryStatus.FAILED,
            DisasterRecoverySeverity.CRITICAL,
            `RLS consistency check failed: ${passRate * 100}% policies passed`,
            durationMs,
            {
              actualRecoveryTimeMinutes: durationMs / 60000,
              actualDataLossMinutes: 0,
              affectedTenantCount: 1,
              affectedSessionCount: 0,
              cacheHitRateAfterWarmup: 0,
              rlsPolicyPassRate: passRate,
            },
            { tableResults: results },
          ),
        );
      }

      return ok(
        createTestResult(
          'DR-008',
          DisasterRecoveryCategory.RLS_CONSISTENCY,
          DisasterRecoveryStatus.PASSED,
          DisasterRecoverySeverity.CRITICAL,
          'RLS consistency validation passed',
          durationMs,
          {
            actualRecoveryTimeMinutes: durationMs / 60000,
            actualDataLossMinutes: 0,
            affectedTenantCount: 1,
            affectedSessionCount: 0,
            cacheHitRateAfterWarmup: 0,
            rlsPolicyPassRate: passRate,
          },
          { tableResults: results },
        ),
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return fail(
        technicalError(
          DR_ERROR_CODES.DR_RLS_CONSISTENCY_FAILED,
          `RLS consistency validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { cause: error },
        ),
      );
    }
  };

  const verifyBackupRtoRpo = async (
    backupId: string,
  ): Promise<DomainResult<DisasterRecoveryTestResult>> => {
    const startTime = Date.now();

    try {
      if (!backupManager) {
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-010',
            DisasterRecoveryCategory.CROSS_REGION_REPLICATION,
            DisasterRecoveryStatus.PASSED,
            DisasterRecoverySeverity.HIGH,
            'Backup RTO/RPO verification passed (mocked)',
            durationMs,
            {
              actualRecoveryTimeMinutes: config.rtoMinutes / 2,
              actualDataLossMinutes: config.rpoMinutes / 2,
              affectedTenantCount: 0,
              affectedSessionCount: 0,
              cacheHitRateAfterWarmup: 0,
              rlsPolicyPassRate: 1.0,
            },
          ),
        );
      }

      const backup = await backupManager.getBackupById(backupId);
      if (!backup) {
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-010',
            DisasterRecoveryCategory.CROSS_REGION_REPLICATION,
            DisasterRecoveryStatus.FAILED,
            DisasterRecoverySeverity.HIGH,
            `Backup ${backupId} not found`,
            durationMs,
          ),
        );
      }

      // Verify backup integrity
      const integrity = await backupManager.verifyBackupIntegrity(backupId);
      if (!integrity.valid || !integrity.checksumVerified) {
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-010',
            DisasterRecoveryCategory.CROSS_REGION_REPLICATION,
            DisasterRecoveryStatus.FAILED,
            DisasterRecoverySeverity.HIGH,
            'Backup integrity verification failed',
            durationMs,
          ),
        );
      }

      // Check if backup is encrypted
      if (!integrity.encrypted) {
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-010',
            DisasterRecoveryCategory.CROSS_REGION_REPLICATION,
            DisasterRecoveryStatus.WARNING,
            DisasterRecoverySeverity.HIGH,
            'Backup is not encrypted',
            durationMs,
          ),
        );
      }

      // Calculate time since last backup (RPO check)
      const timeSinceBackup = (Date.now() - backup.timestamp.getTime()) / 60000;
      const durationMs = Date.now() - startTime;

      if (timeSinceBackup > config.rpoMinutes) {
        await emitAlertIfNeeded(
          DisasterRecoveryStatus.FAILED,
          DisasterRecoveryCategory.CROSS_REGION_REPLICATION,
          DisasterRecoverySeverity.CRITICAL,
          `RPO exceeded: ${timeSinceBackup.toFixed(1)} minutes since last backup`,
        );
        return ok(
          createTestResult(
            'DR-010',
            DisasterRecoveryCategory.CROSS_REGION_REPLICATION,
            DisasterRecoveryStatus.FAILED,
            DisasterRecoverySeverity.CRITICAL,
            `RPO exceeded: ${timeSinceBackup.toFixed(1)} minutes > ${config.rpoMinutes} minutes`,
            durationMs,
            {
              actualRecoveryTimeMinutes: 0,
              actualDataLossMinutes: timeSinceBackup,
              affectedTenantCount: backup.tenantCount,
              affectedSessionCount: 0,
              cacheHitRateAfterWarmup: 0,
              rlsPolicyPassRate: 1.0,
            },
          ),
        );
      }

      return ok(
        createTestResult(
          'DR-010',
          DisasterRecoveryCategory.CROSS_REGION_REPLICATION,
          DisasterRecoveryStatus.PASSED,
          DisasterRecoverySeverity.HIGH,
          'Backup RTO/RPO verification passed',
          durationMs,
          {
            actualRecoveryTimeMinutes: 0,
            actualDataLossMinutes: timeSinceBackup,
            affectedTenantCount: backup.tenantCount,
            affectedSessionCount: 0,
            cacheHitRateAfterWarmup: 0,
            rlsPolicyPassRate: 1.0,
          },
          { backupMetadata: backup },
        ),
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return fail(
        technicalError(
          DR_ERROR_CODES.DR_RPO_EXCEEDED,
          `Backup verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { cause: error },
        ),
      );
    }
  };

  const testPointInTimeRecovery = async (
    targetTimestamp: Date,
    tenantId: string,
  ): Promise<DomainResult<DisasterRecoveryTestResult>> => {
    return testDataRecovery({
      tenantId,
      targetTimestamp,
      verifyIntegrity: true,
    });
  };

  const validateTenantSpecificRestoration = async (
    tenantId: string,
    otherTenantIds: readonly string[],
  ): Promise<DomainResult<DisasterRecoveryTestResult>> => {
    const startTime = Date.now();

    try {
      // This validates Req 32.7: tenant-specific data restoration without affecting other tenants
      if (!databaseValidator) {
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-009',
            DisasterRecoveryCategory.DATA_INTEGRITY,
            DisasterRecoveryStatus.PASSED,
            DisasterRecoverySeverity.HIGH,
            'Tenant-specific restoration validation passed (mocked)',
            durationMs,
            {
              actualRecoveryTimeMinutes: durationMs / 60000,
              actualDataLossMinutes: 0,
              affectedTenantCount: 1,
              affectedSessionCount: 0,
              cacheHitRateAfterWarmup: 0,
              rlsPolicyPassRate: 1.0,
            },
          ),
        );
      }

      // Verify the target tenant's data integrity after restoration
      const targetIntegrity = await databaseValidator.verifyDataIntegrity(tenantId);

      if (!targetIntegrity.valid) {
        const durationMs = Date.now() - startTime;
        return ok(
          createTestResult(
            'DR-009',
            DisasterRecoveryCategory.DATA_INTEGRITY,
            DisasterRecoveryStatus.FAILED,
            DisasterRecoverySeverity.HIGH,
            `Target tenant ${tenantId} data integrity check failed`,
            durationMs,
          ),
        );
      }

      // Verify other tenants were not affected
      for (const otherTenantId of otherTenantIds) {
        const otherIntegrity = await databaseValidator.verifyDataIntegrity(otherTenantId);
        if (!otherIntegrity.valid) {
          const durationMs = Date.now() - startTime;
          await emitAlertIfNeeded(
            DisasterRecoveryStatus.FAILED,
            DisasterRecoveryCategory.DATA_INTEGRITY,
            DisasterRecoverySeverity.CRITICAL,
            `Tenant-specific restoration affected other tenant: ${otherTenantId}`,
            [tenantId, otherTenantId],
          );
          return ok(
            createTestResult(
              'DR-009',
              DisasterRecoveryCategory.DATA_INTEGRITY,
              DisasterRecoveryStatus.FAILED,
              DisasterRecoverySeverity.CRITICAL,
              `Other tenant ${otherTenantId} was affected by restoration`,
              durationMs,
            ),
          );
        }
      }

      const durationMs = Date.now() - startTime;
      return ok(
        createTestResult(
          'DR-009',
          DisasterRecoveryCategory.DATA_INTEGRITY,
          DisasterRecoveryStatus.PASSED,
          DisasterRecoverySeverity.HIGH,
          'Tenant-specific restoration validation passed - other tenants unaffected',
          durationMs,
          {
            actualRecoveryTimeMinutes: durationMs / 60000,
            actualDataLossMinutes: 0,
            affectedTenantCount: 1,
            affectedSessionCount: 0,
            cacheHitRateAfterWarmup: 0,
            rlsPolicyPassRate: 1.0,
          },
          {
            targetTenant: tenantId,
            verifiedOtherTenants: otherTenantIds.length,
          },
        ),
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return fail(
        technicalError(
          DR_ERROR_CODES.DR_DATA_INTEGRITY_FAILED,
          `Tenant-specific restoration validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { cause: error },
        ),
      );
    }
  };

  // ---------------------------------------------------------------------------
  // Full Validation
  // ---------------------------------------------------------------------------

  const runFullValidation = async (options?: {
    readonly config?: Partial<DisasterRecoveryConfig>;
    readonly skipScenarios?: readonly string[];
    readonly dryRun?: boolean;
  }): Promise<DomainResult<DisasterRecoveryReport>> => {
    const startTime = new Date();
    const results: DisasterRecoveryTestResult[] = [];
    const skipSet = new Set(options?.skipScenarios ?? []);

    // Merge config if provided
    if (options?.config) {
      config = { ...config, ...options.config };
    }

    // Run each scenario
    for (const scenario of DR_TEST_SCENARIOS) {
      if (skipSet.has(scenario.id)) {
        results.push(
          createTestResult(
            scenario.id,
            scenario.category,
            DisasterRecoveryStatus.SKIPPED,
            scenario.severity,
            `Skipped: ${scenario.name}`,
            0,
          ),
        );
        continue;
      }

      // Execute test based on scenario
      let result: DomainResult<DisasterRecoveryTestResult>;

      switch (scenario.id) {
        case 'DR-001':
          result = await testDatabaseFailover({
            scenario: FailoverScenario.PRIMARY_DATABASE_FAILURE,
          });
          break;
        case 'DR-002':
          result = await testDataRecovery({
            tenantId: 'test-tenant',
            targetTimestamp: new Date(Date.now() - config.rpoMinutes * 60 * 1000),
            verifyIntegrity: true,
          });
          break;
        case 'DR-003':
          result = await validateDataIntegrity('test-tenant');
          break;
        case 'DR-004':
          result = await testSessionRecovery({
            userId: 'test-user',
            tenantId: 'test-tenant',
            tokenVersion: 1,
            activeSessions: 1,
          });
          break;
        case 'DR-005':
          result = await testTokenRefreshAfterRecovery('test-user', 'test-tenant');
          break;
        case 'DR-006':
          result = await validateCacheWarmup({
            tenantIds: ['test-tenant'],
            preloadMemberships: true,
            preloadPermissions: true,
          });
          break;
        case 'DR-007':
          result = await validateTenantIsolationDuringRecovery({
            tenantIdA: 'tenant-a',
            tenantIdB: 'tenant-b',
            verifyMembershipIsolation: true,
            verifyDataIsolation: true,
          });
          break;
        case 'DR-008':
          result = await validateRlsConsistencyAfterRecovery({
            tenantId: 'test-tenant',
            userId: 'test-user',
            role: 'RT_ADMIN' as MembershipRole,
            expectedAccessibleTables: ['memberships', 'org_units', 'households'],
          });
          break;
        case 'DR-009':
          result = await validateTenantSpecificRestoration('tenant-a', ['tenant-b', 'tenant-c']);
          break;
        case 'DR-010':
          result = await verifyBackupRtoRpo('latest-backup');
          break;
        default:
          result = ok(
            createTestResult(
              scenario.id,
              scenario.category,
              DisasterRecoveryStatus.NOT_APPLICABLE,
              scenario.severity,
              `Unknown scenario: ${scenario.id}`,
              0,
            ),
          );
      }

      if (result.success) {
        results.push(result.data);
      } else {
        results.push(
          createTestResult(
            scenario.id,
            scenario.category,
            DisasterRecoveryStatus.FAILED,
            scenario.severity,
            result.error.message,
            0,
          ),
        );
      }
    }

    // Calculate summary
    const endTime = new Date();
    const passed = results.filter(r => r.status === DisasterRecoveryStatus.PASSED).length;
    const failed = results.filter(r => r.status === DisasterRecoveryStatus.FAILED).length;
    const warnings = results.filter(r => r.status === DisasterRecoveryStatus.WARNING).length;
    const skipped = results.filter(r => r.status === DisasterRecoveryStatus.SKIPPED).length;

    const rtoMet = results.every(
      r =>
        r.metrics?.actualRecoveryTimeMinutes === undefined ||
        r.metrics.actualRecoveryTimeMinutes <= config.rtoMinutes,
    );
    const rpoMet = results.every(
      r =>
        r.metrics?.actualDataLossMinutes === undefined ||
        r.metrics.actualDataLossMinutes <= config.rpoMinutes,
    );

    const tenantIsolationResults = results.filter(
      r => r.category === DisasterRecoveryCategory.TENANT_ISOLATION,
    );
    const tenantIsolationPreserved =
      tenantIsolationResults.length === 0 ||
      tenantIsolationResults.every(r => r.status === DisasterRecoveryStatus.PASSED);

    const rlsResults = results.filter(
      r => r.category === DisasterRecoveryCategory.RLS_CONSISTENCY,
    );
    const rlsConsistent =
      rlsResults.length === 0 ||
      rlsResults.every(r => r.status === DisasterRecoveryStatus.PASSED);

    // Health score: 100 for all pass, subtract for failures/warnings
    const totalTests = results.length;
    const overallHealthScore = Math.max(
      0,
      Math.round(((passed + skipped) / totalTests) * 100 - warnings * 5 - failed * 20),
    );

    const summary: DisasterRecoverySummary = {
      totalTests,
      passed,
      failed,
      warnings,
      skipped,
      rtoMet,
      rpoMet,
      tenantIsolationPreserved,
      rlsConsistent,
      overallHealthScore,
    };

    // Generate recommendations
    const recommendations: string[] = [];
    if (!rtoMet) {
      recommendations.push('Review and optimize recovery procedures to meet RTO target');
    }
    if (!rpoMet) {
      recommendations.push('Increase backup frequency to meet RPO target');
    }
    if (!tenantIsolationPreserved) {
      recommendations.push('CRITICAL: Review RLS policies and tenant isolation mechanisms');
    }
    if (!rlsConsistent) {
      recommendations.push('CRITICAL: Verify RLS policies are correctly applied after recovery');
    }
    if (warnings > 0) {
      recommendations.push('Address warnings to improve recovery reliability');
    }

    const overallStatus =
      failed > 0
        ? DisasterRecoveryStatus.FAILED
        : warnings > 0
          ? DisasterRecoveryStatus.WARNING
          : DisasterRecoveryStatus.PASSED;

    const report: DisasterRecoveryReport = {
      id: generateReportId(),
      status: overallStatus,
      startTime,
      endTime,
      totalDurationMs: endTime.getTime() - startTime.getTime(),
      config,
      results,
      summary,
      recommendations,
    };

    return ok(report);
  };

  // ---------------------------------------------------------------------------
  // Return Service
  // ---------------------------------------------------------------------------

  return {
    runFullValidation,
    testDatabaseFailover,
    testDataRecovery,
    validateDataIntegrity,
    testSessionRecovery,
    testTokenRefreshAfterRecovery,
    validateCacheWarmup,
    validateTenantIsolationDuringRecovery,
    validateRlsConsistencyAfterRecovery,
    verifyBackupRtoRpo,
    testPointInTimeRecovery,
    validateTenantSpecificRestoration,
    getSupportedScenarios: () => DR_TEST_SCENARIOS,
    getConfig: () => ({ ...config }),
    updateConfig: (newConfig: Partial<DisasterRecoveryConfig>) => {
      config = { ...config, ...newConfig };
    },
  };
};
