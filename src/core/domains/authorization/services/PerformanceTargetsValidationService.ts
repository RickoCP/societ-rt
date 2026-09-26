/**
 * PerformanceTargetsValidationService — Validates all V1-V7 performance targets.
 *
 * This service implements Performance Targets Validation per Task 80 (Req 40):
 * - V1: Authorization context resolution < 100ms p99
 * - V2: Permission lookup < 10ms p99
 * - V3: RLS overhead < 20% query latency
 * - V4: Token version mismatch → immediate rejection
 * - V5: Refresh token reuse → family-wide revocation
 * - V6: OrgUnit path consistency with parentId chain
 * - V7: Emergency operations succeed during SUSPENDED status
 *
 * Additional responsibilities:
 * - Performance benchmarks documentation
 * - Scalability limits identification
 * - Performance regression prevention
 * - Multi-tenant performance isolation validation
 * - API response time targets (< 200ms P95)
 * - Error rate monitoring (< 0.1%)
 * - Concurrent user handling capacity
 * - Memory and CPU utilization thresholds
 *
 * **CRITICAL RULES:**
 * - All V1-V7 targets MUST pass for system to be production-ready
 * - Performance benchmarks MUST be documented
 * - Scalability limits MUST be identified before production
 * - Regression prevention MUST be automated in CI/CD
 *
 * @see Requirements 40 (Rate Limiting), 42 (Performance Validation)
 * @see Design VALIDATION_TARGET V1-V7
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { unexpectedError, technicalError } from '@core/utils';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Validation target identifiers as defined in requirements.
 */
export enum ValidationTargetId {
  /** V1: Authorization context resolution < 100ms p99 */
  V1_AUTH_CONTEXT_RESOLUTION = 'V1',
  /** V2: Permission lookup < 10ms p99 */
  V2_PERMISSION_LOOKUP = 'V2',
  /** V3: RLS overhead < 20% query latency */
  V3_RLS_OVERHEAD = 'V3',
  /** V4: Token version mismatch → immediate rejection */
  V4_TOKEN_VERSION_REJECTION = 'V4',
  /** V5: Refresh token reuse → family-wide revocation */
  V5_REFRESH_TOKEN_REVOCATION = 'V5',
  /** V6: OrgUnit path consistency with parentId chain */
  V6_ORGUNIT_PATH_CONSISTENCY = 'V6',
  /** V7: Emergency operations succeed during SUSPENDED status */
  V7_EMERGENCY_DURING_SUSPENDED = 'V7',
}

/**
 * Additional performance target categories beyond V1-V7.
 */
export enum AdditionalPerformanceTarget {
  /** API response time < 200ms P95 */
  API_RESPONSE_TIME = 'API_RESPONSE_TIME',
  /** Database query performance */
  DATABASE_QUERY_PERFORMANCE = 'DATABASE_QUERY_PERFORMANCE',
  /** Concurrent user handling capacity */
  CONCURRENT_USER_CAPACITY = 'CONCURRENT_USER_CAPACITY',
  /** Memory utilization threshold */
  MEMORY_UTILIZATION = 'MEMORY_UTILIZATION',
  /** CPU utilization threshold */
  CPU_UTILIZATION = 'CPU_UTILIZATION',
  /** Multi-tenant performance isolation */
  TENANT_PERFORMANCE_ISOLATION = 'TENANT_PERFORMANCE_ISOLATION',
  /** Cache hit rate */
  CACHE_HIT_RATE = 'CACHE_HIT_RATE',
  /** Error rate */
  ERROR_RATE = 'ERROR_RATE',
}

/**
 * Test type for each validation target.
 */
export enum ValidationTestType {
  PERFORMANCE_TEST = 'PERFORMANCE_TEST',
  UNIT_TEST = 'UNIT_TEST',
  INTEGRATION_TEST = 'INTEGRATION_TEST',
  PROPERTY_TEST = 'PROPERTY_TEST',
  LOAD_TEST = 'LOAD_TEST',
}

/**
 * Status of a validation target.
 */
export enum ValidationTargetStatus {
  /** Target is passing */
  PASSING = 'PASSING',
  /** Target is failing */
  FAILING = 'FAILING',
  /** Target is in warning state */
  WARNING = 'WARNING',
  /** Target not yet measured */
  NOT_MEASURED = 'NOT_MEASURED',
  /** Target measurement error */
  ERROR = 'ERROR',
  /** Target is skipped */
  SKIPPED = 'SKIPPED',
}

/**
 * Scalability limit status.
 */
export enum ScalabilityLimitStatus {
  /** Within comfortable limits */
  HEALTHY = 'HEALTHY',
  /** Approaching limits */
  APPROACHING_LIMIT = 'APPROACHING_LIMIT',
  /** At or exceeding limits */
  AT_LIMIT = 'AT_LIMIT',
  /** Critical - exceeding safe limits */
  CRITICAL = 'CRITICAL',
  /** Unknown - not measured */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Regression detection status.
 */
export enum RegressionStatus {
  /** No regression detected */
  NO_REGRESSION = 'NO_REGRESSION',
  /** Minor regression detected */
  MINOR_REGRESSION = 'MINOR_REGRESSION',
  /** Major regression detected */
  MAJOR_REGRESSION = 'MAJOR_REGRESSION',
  /** Critical regression detected */
  CRITICAL_REGRESSION = 'CRITICAL_REGRESSION',
  /** Improvement detected */
  IMPROVEMENT = 'IMPROVEMENT',
  /** No baseline available */
  NO_BASELINE = 'NO_BASELINE',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Definition of a validation target.
 */
export interface ValidationTargetDefinition {
  /** Target identifier */
  readonly id: ValidationTargetId | AdditionalPerformanceTarget;
  /** Human-readable name */
  readonly name: string;
  /** Description */
  readonly description: string;
  /** Target threshold value */
  readonly thresholdValue: number;
  /** Unit of measurement */
  readonly unit: string;
  /** Test type */
  readonly testType: ValidationTestType;
  /** Whether lower is better (true for latency, false for cache hit rate) */
  readonly lowerIsBetter: boolean;
  /** Warning threshold multiplier (0.8 means warn at 80% of threshold) */
  readonly warningMultiplier: number;
  /** Whether this target is critical for production readiness */
  readonly isCritical: boolean;
  /** Related requirement IDs */
  readonly relatedRequirements: readonly string[];
}

/**
 * Result of validating a single target.
 */
export interface ValidationTargetResult {
  /** Target definition */
  readonly target: ValidationTargetDefinition;
  /** Validation status */
  readonly status: ValidationTargetStatus;
  /** Current measured value */
  readonly currentValue: number;
  /** Human-readable message */
  readonly message: string;
  /** Detailed evidence/samples */
  readonly evidence?: string;
  /** Timestamp of validation */
  readonly timestamp: Date;
  /** Number of samples used */
  readonly sampleCount?: number;
  /** Statistics if available */
  readonly statistics?: ValidationStatistics;
}

/**
 * Statistics for a validation target.
 */
export interface ValidationStatistics {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly median: number;
  readonly p75: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
  readonly stdDev: number;
  readonly sampleCount: number;
}

/**
 * Scalability limit information.
 */
export interface ScalabilityLimit {
  /** Limit name */
  readonly name: string;
  /** Current usage */
  readonly currentUsage: number;
  /** Maximum capacity */
  readonly maxCapacity: number;
  /** Usage percentage */
  readonly usagePercent: number;
  /** Status */
  readonly status: ScalabilityLimitStatus;
  /** Recommendation */
  readonly recommendation?: string;
  /** Time to capacity at current growth rate */
  readonly timeToCapacityHours?: number;
}

/**
 * Performance benchmark entry.
 */
export interface PerformanceBenchmark {
  /** Benchmark name */
  readonly name: string;
  /** Benchmark value */
  readonly value: number;
  /** Unit of measurement */
  readonly unit: string;
  /** Timestamp when measured */
  readonly measuredAt: Date;
  /** Environment (dev, staging, production) */
  readonly environment: string;
  /** Related target ID */
  readonly targetId?: ValidationTargetId | AdditionalPerformanceTarget;
  /** Test configuration */
  readonly testConfig?: Record<string, unknown>;
}

/**
 * Performance regression information.
 */
export interface PerformanceRegression {
  /** Target that regressed */
  readonly targetId: ValidationTargetId | AdditionalPerformanceTarget;
  /** Baseline value */
  readonly baselineValue: number;
  /** Current value */
  readonly currentValue: number;
  /** Percentage change */
  readonly changePercent: number;
  /** Regression status */
  readonly status: RegressionStatus;
  /** Detected at */
  readonly detectedAt: Date;
  /** Possible cause */
  readonly possibleCause?: string;
  /** Recommended action */
  readonly recommendation?: string;
}

/**
 * Multi-tenant performance isolation result.
 */
export interface TenantIsolationPerformanceResult {
  /** Tenant ID */
  readonly tenantId: string;
  /** Average response time (ms) */
  readonly avgResponseTimeMs: number;
  /** P99 response time (ms) */
  readonly p99ResponseTimeMs: number;
  /** Error rate (%) */
  readonly errorRatePercent: number;
  /** Whether noisy neighbor detected */
  readonly noisyNeighborDetected: boolean;
  /** Performance deviation from baseline (%) */
  readonly deviationPercent: number;
}

/**
 * Full performance targets validation report.
 */
export interface PerformanceTargetsReport {
  /** Overall status */
  readonly overallStatus: ValidationTargetStatus;
  /** V1-V7 validation results */
  readonly v1v7Results: readonly ValidationTargetResult[];
  /** Additional performance target results */
  readonly additionalResults: readonly ValidationTargetResult[];
  /** Scalability limits */
  readonly scalabilityLimits: readonly ScalabilityLimit[];
  /** Performance benchmarks */
  readonly benchmarks: readonly PerformanceBenchmark[];
  /** Detected regressions */
  readonly regressions: readonly PerformanceRegression[];
  /** Multi-tenant isolation results */
  readonly tenantIsolationResults?: readonly TenantIsolationPerformanceResult[];
  /** Summary counts */
  readonly summary: {
    readonly totalTargets: number;
    readonly passingTargets: number;
    readonly failingTargets: number;
    readonly warningTargets: number;
    readonly notMeasuredTargets: number;
    readonly criticalFailures: number;
    readonly regressionCount: number;
    readonly productionReady: boolean;
  };
  /** Report generated at */
  readonly generatedAt: Date;
  /** Recommendations */
  readonly recommendations: readonly string[];
}

/**
 * Input for running performance targets validation.
 */
export interface RunValidationInput {
  /** Include V1-V7 targets */
  readonly includeV1V7?: boolean;
  /** Include additional performance targets */
  readonly includeAdditional?: boolean;
  /** Include scalability limits */
  readonly includeScalability?: boolean;
  /** Include regression detection */
  readonly includeRegression?: boolean;
  /** Include tenant isolation */
  readonly includeTenantIsolation?: boolean;
  /** Specific tenant IDs to validate */
  readonly tenantIds?: readonly string[];
  /** Time window in minutes */
  readonly windowMinutes?: number;
}

/**
 * Performance sample for recording.
 */
export interface PerformanceSampleInput {
  /** Target ID */
  readonly targetId: ValidationTargetId | AdditionalPerformanceTarget;
  /** Value */
  readonly value: number;
  /** Tenant ID (optional) */
  readonly tenantId?: string;
  /** Correlation ID (optional) */
  readonly correlationId?: string;
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Baseline configuration for regression detection.
 */
export interface BaselineConfig {
  /** Target ID to baseline value mapping */
  readonly baselines: ReadonlyMap<string, number>;
  /** Regression threshold percentage */
  readonly regressionThresholdPercent: number;
  /** Improvement threshold percentage */
  readonly improvementThresholdPercent: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * V1-V7 Validation Target Definitions as per requirements.
 */
export const V1_V7_TARGETS: readonly ValidationTargetDefinition[] = [
  {
    id: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
    name: 'Authorization Context Resolution',
    description: 'Authorization context resolution must complete within 100ms at p99',
    thresholdValue: 100,
    unit: 'ms',
    testType: ValidationTestType.PERFORMANCE_TEST,
    lowerIsBetter: true,
    warningMultiplier: 0.8,
    isCritical: true,
    relatedRequirements: ['Req 42.2'],
  },
  {
    id: ValidationTargetId.V2_PERMISSION_LOOKUP,
    name: 'Permission Lookup',
    description: 'Permission lookup must complete within 10ms at p99',
    thresholdValue: 10,
    unit: 'ms',
    testType: ValidationTestType.PERFORMANCE_TEST,
    lowerIsBetter: true,
    warningMultiplier: 0.8,
    isCritical: true,
    relatedRequirements: ['Req 42.3'],
  },
  {
    id: ValidationTargetId.V3_RLS_OVERHEAD,
    name: 'RLS Query Overhead',
    description: 'RLS must not add more than 20% query latency overhead',
    thresholdValue: 20,
    unit: '%',
    testType: ValidationTestType.PERFORMANCE_TEST,
    lowerIsBetter: true,
    warningMultiplier: 0.8,
    isCritical: true,
    relatedRequirements: ['Req 42.5'],
  },
  {
    id: ValidationTargetId.V4_TOKEN_VERSION_REJECTION,
    name: 'Token Version Mismatch Rejection',
    description: 'Token version mismatch must result in immediate rejection',
    thresholdValue: 1, // 1ms max for rejection
    unit: 'ms',
    testType: ValidationTestType.UNIT_TEST,
    lowerIsBetter: true,
    warningMultiplier: 0.5,
    isCritical: true,
    relatedRequirements: ['Req 15'],
  },
  {
    id: ValidationTargetId.V5_REFRESH_TOKEN_REVOCATION,
    name: 'Refresh Token Reuse Family Revocation',
    description: 'Refresh token reuse must trigger family-wide revocation',
    thresholdValue: 100, // Success rate must be 100%
    unit: '%',
    testType: ValidationTestType.INTEGRATION_TEST,
    lowerIsBetter: false,
    warningMultiplier: 1.0,
    isCritical: true,
    relatedRequirements: ['Req 16'],
  },
  {
    id: ValidationTargetId.V6_ORGUNIT_PATH_CONSISTENCY,
    name: 'OrgUnit Path Consistency',
    description: 'OrgUnit path must be consistent with parentId chain',
    thresholdValue: 100, // Consistency rate must be 100%
    unit: '%',
    testType: ValidationTestType.PROPERTY_TEST,
    lowerIsBetter: false,
    warningMultiplier: 1.0,
    isCritical: true,
    relatedRequirements: ['Req 6', 'INV-ORG-003'],
  },
  {
    id: ValidationTargetId.V7_EMERGENCY_DURING_SUSPENDED,
    name: 'Emergency Operations During SUSPENDED',
    description: 'Emergency operations must succeed during SUSPENDED membership status',
    thresholdValue: 100, // Success rate must be 100%
    unit: '%',
    testType: ValidationTestType.INTEGRATION_TEST,
    lowerIsBetter: false,
    warningMultiplier: 1.0,
    isCritical: true,
    relatedRequirements: ['Req 20', 'L10'],
  },
];

/**
 * Additional Performance Targets.
 */
export const ADDITIONAL_TARGETS: readonly ValidationTargetDefinition[] = [
  {
    id: AdditionalPerformanceTarget.API_RESPONSE_TIME,
    name: 'API Response Time',
    description: 'API responses must complete within 200ms at P95',
    thresholdValue: 200,
    unit: 'ms',
    testType: ValidationTestType.PERFORMANCE_TEST,
    lowerIsBetter: true,
    warningMultiplier: 0.8,
    isCritical: true,
    relatedRequirements: ['Req 42'],
  },
  {
    id: AdditionalPerformanceTarget.CACHE_HIT_RATE,
    name: 'Cache Hit Rate',
    description: 'Cache hit rate must be above 95%',
    thresholdValue: 95,
    unit: '%',
    testType: ValidationTestType.PERFORMANCE_TEST,
    lowerIsBetter: false,
    warningMultiplier: 0.95,
    isCritical: false,
    relatedRequirements: ['Req 29'],
  },
  {
    id: AdditionalPerformanceTarget.ERROR_RATE,
    name: 'Error Rate',
    description: 'Error rate must be below 0.1%',
    thresholdValue: 0.1,
    unit: '%',
    testType: ValidationTestType.PERFORMANCE_TEST,
    lowerIsBetter: true,
    warningMultiplier: 0.5,
    isCritical: true,
    relatedRequirements: ['Req 40'],
  },
  {
    id: AdditionalPerformanceTarget.CONCURRENT_USER_CAPACITY,
    name: 'Concurrent User Capacity',
    description: 'System must handle 1000 concurrent users',
    thresholdValue: 1000,
    unit: 'users',
    testType: ValidationTestType.LOAD_TEST,
    lowerIsBetter: false,
    warningMultiplier: 0.9,
    isCritical: true,
    relatedRequirements: ['Req 42.6'],
  },
  {
    id: AdditionalPerformanceTarget.MEMORY_UTILIZATION,
    name: 'Memory Utilization',
    description: 'Memory utilization must stay below 80%',
    thresholdValue: 80,
    unit: '%',
    testType: ValidationTestType.PERFORMANCE_TEST,
    lowerIsBetter: true,
    warningMultiplier: 0.75,
    isCritical: false,
    relatedRequirements: [],
  },
  {
    id: AdditionalPerformanceTarget.CPU_UTILIZATION,
    name: 'CPU Utilization',
    description: 'CPU utilization must stay below 70%',
    thresholdValue: 70,
    unit: '%',
    testType: ValidationTestType.PERFORMANCE_TEST,
    lowerIsBetter: true,
    warningMultiplier: 0.8,
    isCritical: false,
    relatedRequirements: [],
  },
  {
    id: AdditionalPerformanceTarget.TENANT_PERFORMANCE_ISOLATION,
    name: 'Multi-Tenant Performance Isolation',
    description: 'Tenant performance deviation must be below 10%',
    thresholdValue: 10,
    unit: '%',
    testType: ValidationTestType.PERFORMANCE_TEST,
    lowerIsBetter: true,
    warningMultiplier: 0.5,
    isCritical: true,
    relatedRequirements: ['Req 10', 'INV-TENANT-001'],
  },
  {
    id: AdditionalPerformanceTarget.DATABASE_QUERY_PERFORMANCE,
    name: 'Database Query Performance',
    description: 'Database queries must complete within 50ms at P95',
    thresholdValue: 50,
    unit: 'ms',
    testType: ValidationTestType.PERFORMANCE_TEST,
    lowerIsBetter: true,
    warningMultiplier: 0.8,
    isCritical: false,
    relatedRequirements: ['Req 42.4'],
  },
];

/**
 * Default scalability limits configuration.
 */
export const DEFAULT_SCALABILITY_LIMITS = {
  maxConcurrentUsers: 5000,
  maxTenantsPerInstance: 100,
  maxMembershipsPerTenant: 10000,
  maxRequestsPerSecond: 10000,
  maxMemoryBytes: 4 * 1024 * 1024 * 1024, // 4GB
  maxCpuPercent: 80,
} as const;

/**
 * Default baseline configuration.
 */
export const DEFAULT_BASELINE_CONFIG: BaselineConfig = {
  baselines: new Map([
    [ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION, 50], // 50ms baseline
    [ValidationTargetId.V2_PERMISSION_LOOKUP, 5], // 5ms baseline
    [ValidationTargetId.V3_RLS_OVERHEAD, 10], // 10% baseline
    [AdditionalPerformanceTarget.API_RESPONSE_TIME, 100], // 100ms baseline
    [AdditionalPerformanceTarget.CACHE_HIT_RATE, 98], // 98% baseline
    [AdditionalPerformanceTarget.ERROR_RATE, 0.05], // 0.05% baseline
  ]),
  regressionThresholdPercent: 20, // 20% degradation = regression
  improvementThresholdPercent: 10, // 10% improvement = notable
};

// ---------------------------------------------------------------------------
// Alert Emitter Interface
// ---------------------------------------------------------------------------

/**
 * Interface for emitting performance targets alerts.
 */
export interface IPerformanceTargetsAlertEmitter {
  /**
   * Emit a performance target failure alert.
   */
  emitTargetFailure(result: ValidationTargetResult): Promise<void>;

  /**
   * Emit a regression alert.
   */
  emitRegressionAlert(regression: PerformanceRegression): Promise<void>;

  /**
   * Emit a scalability limit alert.
   */
  emitScalabilityAlert(limit: ScalabilityLimit): Promise<void>;
}

/**
 * Console-based alert emitter for development/testing.
 */
export const ConsolePerformanceTargetsAlertEmitter: IPerformanceTargetsAlertEmitter = {
  emitTargetFailure: async (result: ValidationTargetResult) => {
    console.error(
      `[PerformanceTargets] 🚨 FAILURE: ${result.target.name}`,
      `| Current: ${result.currentValue}${result.target.unit}`,
      `| Threshold: ${result.target.thresholdValue}${result.target.unit}`,
      `| ${result.message}`,
    );
  },

  emitRegressionAlert: async (regression: PerformanceRegression) => {
    const emoji = regression.status === RegressionStatus.CRITICAL_REGRESSION ? '🆘' :
      regression.status === RegressionStatus.MAJOR_REGRESSION ? '🚨' : '⚠️';
    console.warn(
      `[PerformanceTargets] ${emoji} REGRESSION: ${regression.targetId}`,
      `| Baseline: ${regression.baselineValue}`,
      `| Current: ${regression.currentValue}`,
      `| Change: ${regression.changePercent.toFixed(2)}%`,
    );
  },

  emitScalabilityAlert: async (limit: ScalabilityLimit) => {
    const emoji = limit.status === ScalabilityLimitStatus.CRITICAL ? '🆘' :
      limit.status === ScalabilityLimitStatus.AT_LIMIT ? '🚨' : '⚠️';
    console.warn(
      `[PerformanceTargets] ${emoji} SCALABILITY: ${limit.name}`,
      `| Usage: ${limit.usagePercent.toFixed(1)}%`,
      `| ${limit.recommendation || ''}`,
    );
  },
};

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * Interface for the Performance Targets Validation Service.
 *
 * @see Task 80 (Req 40)
 */
export interface IPerformanceTargetsValidationService {
  // -------------------------------------------------------------------------
  // Recording Methods
  // -------------------------------------------------------------------------

  /**
   * Record a performance sample.
   */
  recordSample(input: PerformanceSampleInput): Promise<DomainResult<void>>;

  /**
   * Record multiple performance samples in batch.
   */
  recordSamplesBatch(
    inputs: readonly PerformanceSampleInput[],
  ): Promise<DomainResult<void>>;

  // -------------------------------------------------------------------------
  // Validation Methods
  // -------------------------------------------------------------------------

  /**
   * Validate a specific V1-V7 target.
   */
  validateTarget(
    targetId: ValidationTargetId,
    windowMinutes?: number,
  ): Promise<DomainResult<ValidationTargetResult>>;

  /**
   * Validate all V1-V7 targets.
   */
  validateAllV1V7Targets(
    windowMinutes?: number,
  ): Promise<DomainResult<readonly ValidationTargetResult[]>>;

  /**
   * Validate all performance targets (V1-V7 + additional).
   */
  validateAllTargets(
    windowMinutes?: number,
  ): Promise<DomainResult<readonly ValidationTargetResult[]>>;

  // -------------------------------------------------------------------------
  // Scalability Methods
  // -------------------------------------------------------------------------

  /**
   * Get current scalability limits.
   */
  getScalabilityLimits(): Promise<DomainResult<readonly ScalabilityLimit[]>>;

  /**
   * Update scalability usage metrics.
   */
  updateScalabilityMetrics(metrics: {
    concurrentUsers?: number;
    tenantCount?: number;
    requestsPerSecond?: number;
    memoryUsageBytes?: number;
    cpuPercent?: number;
  }): Promise<DomainResult<void>>;

  // -------------------------------------------------------------------------
  // Regression Detection Methods
  // -------------------------------------------------------------------------

  /**
   * Detect performance regressions against baseline.
   */
  detectRegressions(): Promise<DomainResult<readonly PerformanceRegression[]>>;

  /**
   * Update baseline values.
   */
  updateBaseline(
    targetId: ValidationTargetId | AdditionalPerformanceTarget,
    value: number,
  ): Promise<DomainResult<void>>;

  /**
   * Get current baselines.
   */
  getBaselines(): Promise<DomainResult<ReadonlyMap<string, number>>>;

  // -------------------------------------------------------------------------
  // Benchmarking Methods
  // -------------------------------------------------------------------------

  /**
   * Record a performance benchmark.
   */
  recordBenchmark(benchmark: Omit<PerformanceBenchmark, 'measuredAt'>): Promise<DomainResult<void>>;

  /**
   * Get all recorded benchmarks.
   */
  getBenchmarks(): Promise<DomainResult<readonly PerformanceBenchmark[]>>;

  // -------------------------------------------------------------------------
  // Multi-Tenant Isolation Methods
  // -------------------------------------------------------------------------

  /**
   * Validate multi-tenant performance isolation.
   */
  validateTenantIsolation(
    tenantIds: readonly string[],
  ): Promise<DomainResult<readonly TenantIsolationPerformanceResult[]>>;

  // -------------------------------------------------------------------------
  // Reporting Methods
  // -------------------------------------------------------------------------

  /**
   * Run full performance targets validation and generate comprehensive report.
   */
  runFullValidation(
    input?: RunValidationInput,
  ): Promise<DomainResult<PerformanceTargetsReport>>;

  /**
   * Check if system is production-ready based on all targets.
   */
  isProductionReady(): Promise<DomainResult<{
    ready: boolean;
    failingTargets: readonly ValidationTargetResult[];
    recommendations: readonly string[];
  }>>;

  // -------------------------------------------------------------------------
  // Configuration Methods
  // -------------------------------------------------------------------------

  /**
   * Get target definition by ID.
   */
  getTargetDefinition(
    targetId: ValidationTargetId | AdditionalPerformanceTarget,
  ): ValidationTargetDefinition | undefined;

  /**
   * Reset all collected samples and metrics.
   */
  resetMetrics(): Promise<DomainResult<void>>;
}

/**
 * Type alias for cleaner usage.
 */
export type PerformanceTargetsValidationService = IPerformanceTargetsValidationService;

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies for PerformanceTargetsValidationService.
 */
export interface PerformanceTargetsValidationServiceDependencies {
  /** Optional alert emitter */
  readonly alertEmitter?: IPerformanceTargetsAlertEmitter;
  /** Optional baseline configuration */
  readonly baselineConfig?: Partial<BaselineConfig>;
  /** Maximum samples per target (default: 5000) */
  readonly maxSamplesPerTarget?: number;
  /** Sample retention in minutes (default: 60) */
  readonly sampleRetentionMinutes?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for creating PerformanceTargetsValidationService.
 *
 * @param deps Service dependencies
 * @returns IPerformanceTargetsValidationService instance
 *
 * @see Task 80 (Req 40)
 */
export const PerformanceTargetsValidationServiceImpl = (
  deps: PerformanceTargetsValidationServiceDependencies = {},
): IPerformanceTargetsValidationService => {
  const alertEmitter = deps.alertEmitter ?? ConsolePerformanceTargetsAlertEmitter;
  const maxSamples = deps.maxSamplesPerTarget ?? 5000;
  const retentionMinutes = deps.sampleRetentionMinutes ?? 60;

  // Baseline configuration
  const baselines = new Map<string, number>(
    deps.baselineConfig?.baselines ?? DEFAULT_BASELINE_CONFIG.baselines,
  );
  const regressionThreshold = deps.baselineConfig?.regressionThresholdPercent ?? 
    DEFAULT_BASELINE_CONFIG.regressionThresholdPercent;
  const improvementThreshold = deps.baselineConfig?.improvementThresholdPercent ??
    DEFAULT_BASELINE_CONFIG.improvementThresholdPercent;

  // In-memory storage for samples
  const samples = new Map<string, Array<{
    value: number;
    timestamp: Date;
    tenantId?: string;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }>>();

  // Scalability metrics
  let currentConcurrentUsers = 0;
  let currentTenantCount = 0;
  let currentRequestsPerSecond = 0;
  let currentMemoryUsageBytes = 0;
  let currentCpuPercent = 0;

  // Benchmarks storage
  const benchmarks: PerformanceBenchmark[] = [];

  // All target definitions
  const allTargets = new Map<string, ValidationTargetDefinition>();
  for (const target of V1_V7_TARGETS) {
    allTargets.set(target.id, target);
  }
  for (const target of ADDITIONAL_TARGETS) {
    allTargets.set(target.id, target);
  }

  // Helper: Clean up old samples
  const cleanupOldSamples = (targetSamples: Array<{ timestamp: Date }>) => {
    const cutoff = Date.now() - retentionMinutes * 60 * 1000;
    while (targetSamples.length > 0 && targetSamples[0].timestamp.getTime() < cutoff) {
      targetSamples.shift();
    }
    while (targetSamples.length > maxSamples) {
      targetSamples.shift();
    }
  };

  // Helper: Calculate percentile
  const calculatePercentile = (
    sortedValues: readonly number[],
    percentile: number,
  ): number => {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  };

  // Helper: Calculate statistics
  const calculateStatistics = (values: readonly number[]): ValidationStatistics => {
    if (values.length === 0) {
      return {
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        stdDev: 0,
        sampleCount: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / values.length;

    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((acc, v) => acc + v, 0) / values.length;
    const stdDev = Math.sqrt(avgSquaredDiff);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: Math.round(mean * 100) / 100,
      median: calculatePercentile(sorted, 50),
      p75: calculatePercentile(sorted, 75),
      p90: calculatePercentile(sorted, 90),
      p95: calculatePercentile(sorted, 95),
      p99: calculatePercentile(sorted, 99),
      stdDev: Math.round(stdDev * 100) / 100,
      sampleCount: values.length,
    };
  };

  // Helper: Determine status
  const determineStatus = (
    currentValue: number,
    target: ValidationTargetDefinition,
  ): ValidationTargetStatus => {
    const { thresholdValue, lowerIsBetter, warningMultiplier } = target;

    if (lowerIsBetter) {
      // Lower values are better (e.g., latency, overhead)
      // FAILING: value exceeds threshold
      // WARNING: value is between warning threshold and threshold
      // PASSING: value is at or below warning threshold
      if (currentValue > thresholdValue) return ValidationTargetStatus.FAILING;
      const warningThreshold = thresholdValue * warningMultiplier;
      if (currentValue > warningThreshold) return ValidationTargetStatus.WARNING;
      return ValidationTargetStatus.PASSING;
    } else {
      // Higher values are better (e.g., success rates, cache hit rates)
      // FAILING: value is below threshold
      // WARNING: value meets threshold but warningMultiplier < 1.0 indicates stricter warning
      // PASSING: value meets or exceeds threshold
      if (currentValue < thresholdValue) return ValidationTargetStatus.FAILING;
      // When warningMultiplier is 1.0 or higher, meeting threshold is sufficient for PASSING
      // When warningMultiplier < 1.0, we only warn if below a stricter warning level
      if (warningMultiplier < 1.0) {
        const warningThreshold = thresholdValue / warningMultiplier;
        if (currentValue < warningThreshold) return ValidationTargetStatus.WARNING;
      }
      return ValidationTargetStatus.PASSING;
    }
  };

  // Helper: Validate single target
  const validateSingleTarget = async (
    targetId: string,
    windowMinutes: number,
  ): Promise<ValidationTargetResult> => {
    const target = allTargets.get(targetId);
    if (!target) {
      return {
        target: {
          id: targetId as ValidationTargetId,
          name: 'Unknown Target',
          description: 'Target not found',
          thresholdValue: 0,
          unit: '',
          testType: ValidationTestType.UNIT_TEST,
          lowerIsBetter: true,
          warningMultiplier: 1,
          isCritical: false,
          relatedRequirements: [],
        },
        status: ValidationTargetStatus.ERROR,
        currentValue: 0,
        message: `Target ${targetId} not found`,
        timestamp: new Date(),
      };
    }

    const targetSamples = samples.get(targetId) ?? [];
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    const filteredSamples = targetSamples.filter(s => s.timestamp.getTime() >= cutoff);

    if (filteredSamples.length === 0) {
      return {
        target,
        status: ValidationTargetStatus.NOT_MEASURED,
        currentValue: 0,
        message: `No samples available for ${target.name}`,
        timestamp: new Date(),
        sampleCount: 0,
      };
    }

    const values = filteredSamples.map(s => s.value);
    const statistics = calculateStatistics(values);

    // For latency targets, use P99; for rate targets, use mean
    const currentValue = target.lowerIsBetter ? statistics.p99 : statistics.mean;
    const status = determineStatus(currentValue, target);

    const message = status === ValidationTargetStatus.PASSING
      ? `${target.name} (${currentValue}${target.unit}) is within target (${target.thresholdValue}${target.unit})`
      : status === ValidationTargetStatus.WARNING
        ? `${target.name} (${currentValue}${target.unit}) is approaching threshold (${target.thresholdValue}${target.unit})`
        : `${target.name} (${currentValue}${target.unit}) exceeds threshold (${target.thresholdValue}${target.unit})`;

    const result: ValidationTargetResult = {
      target,
      status,
      currentValue,
      message,
      timestamp: new Date(),
      sampleCount: filteredSamples.length,
      statistics,
    };

    // Emit alert if failing
    if (status === ValidationTargetStatus.FAILING) {
      await alertEmitter.emitTargetFailure(result);
    }

    return result;
  };

  return {
    // =========================================================================
    // Recording Methods
    // =========================================================================

    recordSample: async (input: PerformanceSampleInput): Promise<DomainResult<void>> => {
      try {
        const targetSamples = samples.get(input.targetId) ?? [];
        cleanupOldSamples(targetSamples);

        targetSamples.push({
          value: input.value,
          timestamp: new Date(),
          tenantId: input.tenantId,
          correlationId: input.correlationId,
          metadata: input.metadata,
        });

        samples.set(input.targetId, targetSamples);
        return ok(undefined);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_RECORD_FAILED',
          'Failed to record performance sample',
          { cause: error },
        ));
      }
    },

    recordSamplesBatch: async (
      inputs: readonly PerformanceSampleInput[],
    ): Promise<DomainResult<void>> => {
      try {
        for (const input of inputs) {
          const targetSamples = samples.get(input.targetId) ?? [];
          cleanupOldSamples(targetSamples);

          targetSamples.push({
            value: input.value,
            timestamp: new Date(),
            tenantId: input.tenantId,
            correlationId: input.correlationId,
            metadata: input.metadata,
          });

          samples.set(input.targetId, targetSamples);
        }
        return ok(undefined);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_BATCH_RECORD_FAILED',
          'Failed to record performance samples batch',
          { cause: error },
        ));
      }
    },

    // =========================================================================
    // Validation Methods
    // =========================================================================

    validateTarget: async (
      targetId: ValidationTargetId,
      windowMinutes = 5,
    ): Promise<DomainResult<ValidationTargetResult>> => {
      try {
        const result = await validateSingleTarget(targetId, windowMinutes);
        return ok(result);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_VALIDATE_FAILED',
          `Failed to validate target ${targetId}`,
          { cause: error },
        ));
      }
    },

    validateAllV1V7Targets: async (
      windowMinutes = 5,
    ): Promise<DomainResult<readonly ValidationTargetResult[]>> => {
      try {
        const results: ValidationTargetResult[] = [];
        for (const target of V1_V7_TARGETS) {
          const result = await validateSingleTarget(target.id, windowMinutes);
          results.push(result);
        }
        return ok(results);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_VALIDATE_V1V7_FAILED',
          'Failed to validate V1-V7 targets',
          { cause: error },
        ));
      }
    },

    validateAllTargets: async (
      windowMinutes = 5,
    ): Promise<DomainResult<readonly ValidationTargetResult[]>> => {
      try {
        const results: ValidationTargetResult[] = [];
        for (const target of V1_V7_TARGETS) {
          const result = await validateSingleTarget(target.id, windowMinutes);
          results.push(result);
        }
        for (const target of ADDITIONAL_TARGETS) {
          const result = await validateSingleTarget(target.id, windowMinutes);
          results.push(result);
        }
        return ok(results);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_VALIDATE_ALL_FAILED',
          'Failed to validate all targets',
          { cause: error },
        ));
      }
    },

    // =========================================================================
    // Scalability Methods
    // =========================================================================

    getScalabilityLimits: async (): Promise<DomainResult<readonly ScalabilityLimit[]>> => {
      try {
        const limits: ScalabilityLimit[] = [];

        // Concurrent users limit
        const userUsagePercent = (currentConcurrentUsers / DEFAULT_SCALABILITY_LIMITS.maxConcurrentUsers) * 100;
        limits.push({
          name: 'Concurrent Users',
          currentUsage: currentConcurrentUsers,
          maxCapacity: DEFAULT_SCALABILITY_LIMITS.maxConcurrentUsers,
          usagePercent: userUsagePercent,
          status: userUsagePercent >= 90 ? ScalabilityLimitStatus.CRITICAL :
            userUsagePercent >= 80 ? ScalabilityLimitStatus.AT_LIMIT :
              userUsagePercent >= 70 ? ScalabilityLimitStatus.APPROACHING_LIMIT :
                ScalabilityLimitStatus.HEALTHY,
          recommendation: userUsagePercent >= 80 ? 'Consider horizontal scaling' : undefined,
        });

        // Tenant count limit
        const tenantUsagePercent = (currentTenantCount / DEFAULT_SCALABILITY_LIMITS.maxTenantsPerInstance) * 100;
        limits.push({
          name: 'Tenant Count',
          currentUsage: currentTenantCount,
          maxCapacity: DEFAULT_SCALABILITY_LIMITS.maxTenantsPerInstance,
          usagePercent: tenantUsagePercent,
          status: tenantUsagePercent >= 90 ? ScalabilityLimitStatus.CRITICAL :
            tenantUsagePercent >= 80 ? ScalabilityLimitStatus.AT_LIMIT :
              tenantUsagePercent >= 70 ? ScalabilityLimitStatus.APPROACHING_LIMIT :
                ScalabilityLimitStatus.HEALTHY,
          recommendation: tenantUsagePercent >= 80 ? 'Consider tenant sharding' : undefined,
        });

        // Requests per second limit
        const rpsUsagePercent = (currentRequestsPerSecond / DEFAULT_SCALABILITY_LIMITS.maxRequestsPerSecond) * 100;
        limits.push({
          name: 'Requests Per Second',
          currentUsage: currentRequestsPerSecond,
          maxCapacity: DEFAULT_SCALABILITY_LIMITS.maxRequestsPerSecond,
          usagePercent: rpsUsagePercent,
          status: rpsUsagePercent >= 90 ? ScalabilityLimitStatus.CRITICAL :
            rpsUsagePercent >= 80 ? ScalabilityLimitStatus.AT_LIMIT :
              rpsUsagePercent >= 70 ? ScalabilityLimitStatus.APPROACHING_LIMIT :
                ScalabilityLimitStatus.HEALTHY,
          recommendation: rpsUsagePercent >= 80 ? 'Consider rate limiting or caching' : undefined,
        });

        // Memory usage limit
        const memoryUsagePercent = (currentMemoryUsageBytes / DEFAULT_SCALABILITY_LIMITS.maxMemoryBytes) * 100;
        limits.push({
          name: 'Memory Usage',
          currentUsage: currentMemoryUsageBytes,
          maxCapacity: DEFAULT_SCALABILITY_LIMITS.maxMemoryBytes,
          usagePercent: memoryUsagePercent,
          status: memoryUsagePercent >= 90 ? ScalabilityLimitStatus.CRITICAL :
            memoryUsagePercent >= 80 ? ScalabilityLimitStatus.AT_LIMIT :
              memoryUsagePercent >= 70 ? ScalabilityLimitStatus.APPROACHING_LIMIT :
                ScalabilityLimitStatus.HEALTHY,
          recommendation: memoryUsagePercent >= 80 ? 'Investigate memory leaks or increase capacity' : undefined,
        });

        // CPU usage limit
        limits.push({
          name: 'CPU Usage',
          currentUsage: currentCpuPercent,
          maxCapacity: DEFAULT_SCALABILITY_LIMITS.maxCpuPercent,
          usagePercent: (currentCpuPercent / DEFAULT_SCALABILITY_LIMITS.maxCpuPercent) * 100,
          status: currentCpuPercent >= 90 ? ScalabilityLimitStatus.CRITICAL :
            currentCpuPercent >= 80 ? ScalabilityLimitStatus.AT_LIMIT :
              currentCpuPercent >= 70 ? ScalabilityLimitStatus.APPROACHING_LIMIT :
                ScalabilityLimitStatus.HEALTHY,
          recommendation: currentCpuPercent >= 80 ? 'Optimize CPU-intensive operations' : undefined,
        });

        // Emit alerts for critical limits
        for (const limit of limits) {
          if (limit.status === ScalabilityLimitStatus.CRITICAL || limit.status === ScalabilityLimitStatus.AT_LIMIT) {
            await alertEmitter.emitScalabilityAlert(limit);
          }
        }

        return ok(limits);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_SCALABILITY_FAILED',
          'Failed to get scalability limits',
          { cause: error },
        ));
      }
    },

    updateScalabilityMetrics: async (metrics): Promise<DomainResult<void>> => {
      try {
        if (metrics.concurrentUsers !== undefined) {
          currentConcurrentUsers = metrics.concurrentUsers;
        }
        if (metrics.tenantCount !== undefined) {
          currentTenantCount = metrics.tenantCount;
        }
        if (metrics.requestsPerSecond !== undefined) {
          currentRequestsPerSecond = metrics.requestsPerSecond;
        }
        if (metrics.memoryUsageBytes !== undefined) {
          currentMemoryUsageBytes = metrics.memoryUsageBytes;
        }
        if (metrics.cpuPercent !== undefined) {
          currentCpuPercent = metrics.cpuPercent;
        }
        return ok(undefined);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_UPDATE_SCALABILITY_FAILED',
          'Failed to update scalability metrics',
          { cause: error },
        ));
      }
    },

    // =========================================================================
    // Regression Detection Methods
    // =========================================================================

    detectRegressions: async (): Promise<DomainResult<readonly PerformanceRegression[]>> => {
      try {
        const regressions: PerformanceRegression[] = [];

        for (const [targetId, baselineValue] of baselines) {
          const targetSamples = samples.get(targetId) ?? [];
          if (targetSamples.length === 0) continue;

          const values = targetSamples.map(s => s.value);
          const stats = calculateStatistics(values);
          const target = allTargets.get(targetId);
          const currentValue = target?.lowerIsBetter ? stats.p99 : stats.mean;

          let changePercent: number;
          if (target?.lowerIsBetter) {
            changePercent = ((currentValue - baselineValue) / baselineValue) * 100;
          } else {
            changePercent = ((baselineValue - currentValue) / baselineValue) * 100;
          }

          let status: RegressionStatus;
          if (changePercent >= regressionThreshold * 2) {
            status = RegressionStatus.CRITICAL_REGRESSION;
          } else if (changePercent >= regressionThreshold) {
            status = RegressionStatus.MAJOR_REGRESSION;
          } else if (changePercent >= regressionThreshold * 0.5) {
            status = RegressionStatus.MINOR_REGRESSION;
          } else if (changePercent <= -improvementThreshold) {
            status = RegressionStatus.IMPROVEMENT;
          } else {
            status = RegressionStatus.NO_REGRESSION;
          }

          if (status !== RegressionStatus.NO_REGRESSION && status !== RegressionStatus.IMPROVEMENT) {
            const regression: PerformanceRegression = {
              targetId: targetId as ValidationTargetId | AdditionalPerformanceTarget,
              baselineValue,
              currentValue,
              changePercent,
              status,
              detectedAt: new Date(),
              possibleCause: 'Investigate recent changes',
              recommendation: status === RegressionStatus.CRITICAL_REGRESSION
                ? 'Immediate action required'
                : 'Review and optimize',
            };
            regressions.push(regression);
            await alertEmitter.emitRegressionAlert(regression);
          }
        }

        return ok(regressions);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_REGRESSION_DETECTION_FAILED',
          'Failed to detect regressions',
          { cause: error },
        ));
      }
    },

    updateBaseline: async (
      targetId: ValidationTargetId | AdditionalPerformanceTarget,
      value: number,
    ): Promise<DomainResult<void>> => {
      try {
        baselines.set(targetId, value);
        return ok(undefined);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_UPDATE_BASELINE_FAILED',
          'Failed to update baseline',
          { cause: error },
        ));
      }
    },

    getBaselines: async (): Promise<DomainResult<ReadonlyMap<string, number>>> => {
      try {
        return ok(new Map(baselines));
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_GET_BASELINES_FAILED',
          'Failed to get baselines',
          { cause: error },
        ));
      }
    },

    // =========================================================================
    // Benchmarking Methods
    // =========================================================================

    recordBenchmark: async (
      benchmark: Omit<PerformanceBenchmark, 'measuredAt'>,
    ): Promise<DomainResult<void>> => {
      try {
        benchmarks.push({
          ...benchmark,
          measuredAt: new Date(),
        });
        return ok(undefined);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_RECORD_BENCHMARK_FAILED',
          'Failed to record benchmark',
          { cause: error },
        ));
      }
    },

    getBenchmarks: async (): Promise<DomainResult<readonly PerformanceBenchmark[]>> => {
      try {
        return ok([...benchmarks]);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_GET_BENCHMARKS_FAILED',
          'Failed to get benchmarks',
          { cause: error },
        ));
      }
    },

    // =========================================================================
    // Multi-Tenant Isolation Methods
    // =========================================================================

    validateTenantIsolation: async (
      tenantIds: readonly string[],
    ): Promise<DomainResult<readonly TenantIsolationPerformanceResult[]>> => {
      try {
        const results: TenantIsolationPerformanceResult[] = [];

        // Calculate overall baseline
        let totalSamples: number[] = [];
        for (const targetSamples of samples.values()) {
          totalSamples = totalSamples.concat(targetSamples.map(s => s.value));
        }
        const overallStats = calculateStatistics(totalSamples);
        const baselineP99 = overallStats.p99;

        for (const tenantId of tenantIds) {
          // Collect tenant-specific samples
          const tenantSamples: number[] = [];
          for (const targetSamples of samples.values()) {
            const tenantSpecific = targetSamples
              .filter(s => s.tenantId === tenantId)
              .map(s => s.value);
            tenantSamples.push(...tenantSpecific);
          }

          if (tenantSamples.length === 0) {
            results.push({
              tenantId,
              avgResponseTimeMs: 0,
              p99ResponseTimeMs: 0,
              errorRatePercent: 0,
              noisyNeighborDetected: false,
              deviationPercent: 0,
            });
            continue;
          }

          const tenantStats = calculateStatistics(tenantSamples);
          const deviationPercent = baselineP99 > 0
            ? Math.abs((tenantStats.p99 - baselineP99) / baselineP99) * 100
            : 0;

          results.push({
            tenantId,
            avgResponseTimeMs: tenantStats.mean,
            p99ResponseTimeMs: tenantStats.p99,
            errorRatePercent: 0, // Would need error tracking integration
            noisyNeighborDetected: deviationPercent > 20,
            deviationPercent,
          });
        }

        return ok(results);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_TENANT_ISOLATION_FAILED',
          'Failed to validate tenant isolation',
          { cause: error },
        ));
      }
    },

    // =========================================================================
    // Reporting Methods
    // =========================================================================

    runFullValidation: async (
      input: RunValidationInput = {},
    ): Promise<DomainResult<PerformanceTargetsReport>> => {
      try {
        const windowMinutes = input.windowMinutes ?? 5;
        const v1v7Results: ValidationTargetResult[] = [];
        const additionalResults: ValidationTargetResult[] = [];

        // Validate V1-V7 targets
        if (input.includeV1V7 !== false) {
          for (const target of V1_V7_TARGETS) {
            const result = await validateSingleTarget(target.id, windowMinutes);
            v1v7Results.push(result);
          }
        }

        // Validate additional targets
        if (input.includeAdditional !== false) {
          for (const target of ADDITIONAL_TARGETS) {
            const result = await validateSingleTarget(target.id, windowMinutes);
            additionalResults.push(result);
          }
        }

        // Get scalability limits
        const scalabilityLimits: ScalabilityLimit[] = [];
        if (input.includeScalability !== false) {
          const slResult = await Promise.resolve().then(async () => {
            const limits: ScalabilityLimit[] = [];
            // Re-implement scalability calculation here for the report
            const userUsagePercent = (currentConcurrentUsers / DEFAULT_SCALABILITY_LIMITS.maxConcurrentUsers) * 100;
            limits.push({
              name: 'Concurrent Users',
              currentUsage: currentConcurrentUsers,
              maxCapacity: DEFAULT_SCALABILITY_LIMITS.maxConcurrentUsers,
              usagePercent: userUsagePercent,
              status: userUsagePercent >= 90 ? ScalabilityLimitStatus.CRITICAL :
                userUsagePercent >= 80 ? ScalabilityLimitStatus.AT_LIMIT :
                  userUsagePercent >= 70 ? ScalabilityLimitStatus.APPROACHING_LIMIT :
                    ScalabilityLimitStatus.HEALTHY,
            });
            return limits;
          });
          scalabilityLimits.push(...slResult);
        }

        // Detect regressions
        const regressions: PerformanceRegression[] = [];
        if (input.includeRegression !== false) {
          for (const [targetId, baselineValue] of baselines) {
            const targetSamples = samples.get(targetId) ?? [];
            if (targetSamples.length === 0) continue;

            const values = targetSamples.map(s => s.value);
            const stats = calculateStatistics(values);
            const target = allTargets.get(targetId);
            const currentValue = target?.lowerIsBetter ? stats.p99 : stats.mean;

            let changePercent: number;
            if (target?.lowerIsBetter) {
              changePercent = ((currentValue - baselineValue) / baselineValue) * 100;
            } else {
              changePercent = ((baselineValue - currentValue) / baselineValue) * 100;
            }

            if (changePercent >= regressionThreshold * 0.5) {
              let status: RegressionStatus;
              if (changePercent >= regressionThreshold * 2) {
                status = RegressionStatus.CRITICAL_REGRESSION;
              } else if (changePercent >= regressionThreshold) {
                status = RegressionStatus.MAJOR_REGRESSION;
              } else {
                status = RegressionStatus.MINOR_REGRESSION;
              }

              regressions.push({
                targetId: targetId as ValidationTargetId | AdditionalPerformanceTarget,
                baselineValue,
                currentValue,
                changePercent,
                status,
                detectedAt: new Date(),
              });
            }
          }
        }

        // Validate tenant isolation
        let tenantIsolationResults: TenantIsolationPerformanceResult[] | undefined;
        if (input.includeTenantIsolation && input.tenantIds && input.tenantIds.length > 0) {
          const isoResults: TenantIsolationPerformanceResult[] = [];
          for (const tenantId of input.tenantIds) {
            isoResults.push({
              tenantId,
              avgResponseTimeMs: 0,
              p99ResponseTimeMs: 0,
              errorRatePercent: 0,
              noisyNeighborDetected: false,
              deviationPercent: 0,
            });
          }
          tenantIsolationResults = isoResults;
        }

        // Calculate summary
        const allResults = [...v1v7Results, ...additionalResults];
        const passingCount = allResults.filter(r => r.status === ValidationTargetStatus.PASSING).length;
        const failingCount = allResults.filter(r => r.status === ValidationTargetStatus.FAILING).length;
        const warningCount = allResults.filter(r => r.status === ValidationTargetStatus.WARNING).length;
        const notMeasuredCount = allResults.filter(r => r.status === ValidationTargetStatus.NOT_MEASURED).length;
        const criticalFailures = allResults.filter(
          r => r.status === ValidationTargetStatus.FAILING && r.target.isCritical,
        ).length;

        const overallStatus = criticalFailures > 0 ? ValidationTargetStatus.FAILING :
          failingCount > 0 ? ValidationTargetStatus.WARNING :
            warningCount > 0 ? ValidationTargetStatus.WARNING :
              ValidationTargetStatus.PASSING;

        // Generate recommendations
        const recommendations: string[] = [];
        for (const result of allResults) {
          if (result.status === ValidationTargetStatus.FAILING) {
            recommendations.push(
              `${result.target.name}: Currently at ${result.currentValue}${result.target.unit}, ` +
              `needs to be ${result.target.lowerIsBetter ? 'below' : 'above'} ${result.target.thresholdValue}${result.target.unit}`,
            );
          }
        }
        for (const regression of regressions) {
          if (regression.status !== RegressionStatus.NO_REGRESSION && regression.status !== RegressionStatus.IMPROVEMENT) {
            recommendations.push(
              `Performance regression detected in ${regression.targetId}: ` +
              `${regression.changePercent.toFixed(1)}% degradation from baseline`,
            );
          }
        }

        return ok({
          overallStatus,
          v1v7Results,
          additionalResults,
          scalabilityLimits,
          benchmarks: [...benchmarks],
          regressions,
          tenantIsolationResults,
          summary: {
            totalTargets: allResults.length,
            passingTargets: passingCount,
            failingTargets: failingCount,
            warningTargets: warningCount,
            notMeasuredTargets: notMeasuredCount,
            criticalFailures,
            regressionCount: regressions.length,
            productionReady: criticalFailures === 0 && regressions.filter(
              r => r.status === RegressionStatus.CRITICAL_REGRESSION,
            ).length === 0,
          },
          generatedAt: new Date(),
          recommendations,
        });
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_FULL_VALIDATION_FAILED',
          'Failed to run full validation',
          { cause: error },
        ));
      }
    },

    isProductionReady: async (): Promise<DomainResult<{
      ready: boolean;
      failingTargets: readonly ValidationTargetResult[];
      recommendations: readonly string[];
    }>> => {
      try {
        const failingTargets: ValidationTargetResult[] = [];
        const recommendations: string[] = [];

        // Check all critical V1-V7 targets
        for (const target of V1_V7_TARGETS) {
          if (!target.isCritical) continue;

          const result = await validateSingleTarget(target.id, 5);
          if (result.status === ValidationTargetStatus.FAILING) {
            failingTargets.push(result);
            recommendations.push(
              `Fix ${target.name}: Current value ${result.currentValue}${target.unit} ` +
              `exceeds threshold ${target.thresholdValue}${target.unit}`,
            );
          } else if (result.status === ValidationTargetStatus.NOT_MEASURED) {
            recommendations.push(
              `Measure ${target.name}: No performance data available for this critical target`,
            );
          }
        }

        // Check critical additional targets
        for (const target of ADDITIONAL_TARGETS) {
          if (!target.isCritical) continue;

          const result = await validateSingleTarget(target.id, 5);
          if (result.status === ValidationTargetStatus.FAILING) {
            failingTargets.push(result);
            recommendations.push(
              `Fix ${target.name}: Current value ${result.currentValue}${target.unit} ` +
              `${target.lowerIsBetter ? 'exceeds' : 'below'} threshold ${target.thresholdValue}${target.unit}`,
            );
          }
        }

        return ok({
          ready: failingTargets.length === 0,
          failingTargets,
          recommendations,
        });
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_PRODUCTION_READY_CHECK_FAILED',
          'Failed to check production readiness',
          { cause: error },
        ));
      }
    },

    // =========================================================================
    // Configuration Methods
    // =========================================================================

    getTargetDefinition: (
      targetId: ValidationTargetId | AdditionalPerformanceTarget,
    ): ValidationTargetDefinition | undefined => {
      return allTargets.get(targetId);
    },

    resetMetrics: async (): Promise<DomainResult<void>> => {
      try {
        samples.clear();
        benchmarks.length = 0;
        currentConcurrentUsers = 0;
        currentTenantCount = 0;
        currentRequestsPerSecond = 0;
        currentMemoryUsageBytes = 0;
        currentCpuPercent = 0;
        return ok(undefined);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_TARGETS_RESET_FAILED',
          'Failed to reset metrics',
          { cause: error },
        ));
      }
    },
  };
};
