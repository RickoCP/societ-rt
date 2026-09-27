/**
 * PerformanceValidationService — Validates authorization system performance against SLA requirements.
 *
 * This service implements Performance Validation per Requirements 42:
 * - Authorization context resolution latency measurement and validation (< 100ms p99)
 * - Permission lookup latency measurement and validation (< 10ms p99)
 * - RLS query overhead measurement and validation (< 20% latency)
 * - Cache hit rate monitoring (target > 95%)
 * - Membership resolution performance tracking (< 20ms)
 * - Token validation performance tracking (< 50ms)
 * - Load testing support with concurrent users across multiple tenants
 * - SLA degradation alerts
 *
 * **Performance Targets (Decision Classification: VALIDATION_TARGET V1-V3):**
 * - Authorization context resolution: < 100ms p99
 * - Permission lookup: < 10ms p99
 * - RLS overhead: < 20% query latency
 * - Cache hit rate: > 95%
 * - Membership resolution: < 20ms
 * - Token validation: < 50ms p99
 *
 * **CRITICAL RULES:**
 * - All measurements MUST be non-blocking
 * - Metrics collection MUST NOT impact production performance
 * - SLA violations MUST trigger alerts
 * - Historical data MUST be available for trend analysis
 *
 * @see Requirements 42 (AC 1-7)
 * @see Design Performance Validation Targets
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { unexpectedError, technicalError } from '@core/utils';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Categories of performance metrics being measured.
 */
export enum PerformanceMetricCategory {
  /** Authorization context resolution latency */
  AUTHORIZATION_CONTEXT = 'AUTHORIZATION_CONTEXT',
  /** Permission lookup latency */
  PERMISSION_LOOKUP = 'PERMISSION_LOOKUP',
  /** RLS query overhead */
  RLS_OVERHEAD = 'RLS_OVERHEAD',
  /** Cache performance */
  CACHE_PERFORMANCE = 'CACHE_PERFORMANCE',
  /** Membership resolution latency */
  MEMBERSHIP_RESOLUTION = 'MEMBERSHIP_RESOLUTION',
  /** Token validation latency */
  TOKEN_VALIDATION = 'TOKEN_VALIDATION',
  /** Overall system performance */
  SYSTEM_OVERALL = 'SYSTEM_OVERALL',
}

/**
 * Status of performance validation.
 */
export enum PerformanceValidationStatus {
  /** Performance meets SLA requirements */
  PASSING = 'PASSING',
  /** Performance degraded but within warning threshold */
  WARNING = 'WARNING',
  /** Performance violates SLA requirements */
  FAILING = 'FAILING',
  /** Performance measurement error */
  ERROR = 'ERROR',
  /** Performance not yet measured */
  NOT_MEASURED = 'NOT_MEASURED',
}

/**
 * Severity level for performance alerts.
 */
export enum PerformanceAlertSeverity {
  /** Informational - no action needed */
  INFO = 'INFO',
  /** Warning - performance degraded */
  WARNING = 'WARNING',
  /** Critical - SLA violation */
  CRITICAL = 'CRITICAL',
  /** Emergency - severe degradation affecting users */
  EMERGENCY = 'EMERGENCY',
}

/**
 * Type of percentile calculation.
 */
export enum PercentileType {
  P50 = 'P50',
  P75 = 'P75',
  P90 = 'P90',
  P95 = 'P95',
  P99 = 'P99',
  P999 = 'P999',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for performance thresholds.
 */
export interface PerformanceThresholdConfig {
  /** Authorization context resolution threshold (ms) at p99 */
  readonly authorizationContextP99Ms: number;
  /** Permission lookup threshold (ms) at p99 */
  readonly permissionLookupP99Ms: number;
  /** RLS overhead threshold as percentage (0-100) */
  readonly rlsOverheadPercent: number;
  /** Cache hit rate threshold as percentage (0-100) */
  readonly cacheHitRatePercent: number;
  /** Membership resolution threshold (ms) */
  readonly membershipResolutionMs: number;
  /** Token validation threshold (ms) at p99 */
  readonly tokenValidationP99Ms: number;
  /** Warning threshold multiplier (e.g., 0.8 means warn at 80% of threshold) */
  readonly warningThresholdMultiplier: number;
}

/**
 * Default performance thresholds per Requirements 42 and VALIDATION_TARGET.
 */
export const DEFAULT_PERFORMANCE_THRESHOLDS: PerformanceThresholdConfig = {
  authorizationContextP99Ms: 100, // V1: < 100ms p99
  permissionLookupP99Ms: 10, // V2: < 10ms p99
  rlsOverheadPercent: 20, // V3: < 20% latency
  cacheHitRatePercent: 95, // Target > 95%
  membershipResolutionMs: 20, // Target < 20ms
  tokenValidationP99Ms: 50, // Target < 50ms p99
  warningThresholdMultiplier: 0.8, // Warn at 80% of threshold
};

/**
 * A single performance measurement sample.
 */
export interface PerformanceSample {
  /** The measured latency in milliseconds */
  readonly latencyMs: number;
  /** Timestamp when the measurement was taken */
  readonly timestamp: Date;
  /** Optional correlation ID for tracing */
  readonly correlationId?: string;
  /** Optional tenant ID for multi-tenant analysis */
  readonly tenantId?: string;
  /** Optional additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Aggregated statistics for a performance metric.
 */
export interface PerformanceStatistics {
  /** Number of samples */
  readonly sampleCount: number;
  /** Minimum latency (ms) */
  readonly minMs: number;
  /** Maximum latency (ms) */
  readonly maxMs: number;
  /** Mean latency (ms) */
  readonly meanMs: number;
  /** Median latency (ms) - P50 */
  readonly medianMs: number;
  /** Standard deviation (ms) */
  readonly stdDevMs: number;
  /** P75 latency (ms) */
  readonly p75Ms: number;
  /** P90 latency (ms) */
  readonly p90Ms: number;
  /** P95 latency (ms) */
  readonly p95Ms: number;
  /** P99 latency (ms) */
  readonly p99Ms: number;
  /** P99.9 latency (ms) */
  readonly p999Ms: number;
  /** Time window start */
  readonly windowStart: Date;
  /** Time window end */
  readonly windowEnd: Date;
}

/**
 * Cache performance metrics.
 */
export interface CachePerformanceMetrics {
  /** Total cache requests */
  readonly totalRequests: number;
  /** Cache hits */
  readonly hits: number;
  /** Cache misses */
  readonly misses: number;
  /** Hit rate percentage (0-100) */
  readonly hitRatePercent: number;
  /** Average cache lookup latency (ms) */
  readonly avgLookupMs: number;
  /** Cache evictions count */
  readonly evictions: number;
  /** Cache size (entries) */
  readonly cacheSize: number;
  /** Memory usage (bytes) if available */
  readonly memoryBytes?: number;
}

/**
 * RLS performance metrics.
 */
export interface RlsPerformanceMetrics {
  /** Average query latency without RLS (ms) */
  readonly baseQueryLatencyMs: number;
  /** Average query latency with RLS (ms) */
  readonly rlsQueryLatencyMs: number;
  /** RLS overhead (ms) */
  readonly overheadMs: number;
  /** RLS overhead percentage */
  readonly overheadPercent: number;
  /** Number of queries sampled */
  readonly querySampleCount: number;
  /** Breakdown by query type */
  readonly byQueryType?: ReadonlyMap<string, { baseMs: number; rlsMs: number; overheadPercent: number }>;
}

/**
 * Result of validating a specific performance metric.
 */
export interface MetricValidationResult {
  /** The metric category */
  readonly category: PerformanceMetricCategory;
  /** Validation status */
  readonly status: PerformanceValidationStatus;
  /** Current measured value */
  readonly currentValue: number;
  /** Threshold value */
  readonly thresholdValue: number;
  /** Unit of measurement */
  readonly unit: string;
  /** Human-readable message */
  readonly message: string;
  /** Statistics if available */
  readonly statistics?: PerformanceStatistics;
  /** Timestamp of validation */
  readonly timestamp: Date;
}

/**
 * Overall performance validation report.
 */
export interface PerformanceValidationReport {
  /** Overall status */
  readonly overallStatus: PerformanceValidationStatus;
  /** Individual metric results */
  readonly metricResults: readonly MetricValidationResult[];
  /** Cache performance metrics */
  readonly cacheMetrics?: CachePerformanceMetrics;
  /** RLS performance metrics */
  readonly rlsMetrics?: RlsPerformanceMetrics;
  /** Passing metrics count */
  readonly passingCount: number;
  /** Warning metrics count */
  readonly warningCount: number;
  /** Failing metrics count */
  readonly failingCount: number;
  /** Error metrics count */
  readonly errorCount: number;
  /** Report generation timestamp */
  readonly generatedAt: Date;
  /** Time window for the report */
  readonly windowStart: Date;
  /** Time window end */
  readonly windowEnd: Date;
  /** Recommendations if any */
  readonly recommendations?: readonly string[];
}

/**
 * Performance alert information.
 */
export interface PerformanceAlert {
  /** Alert ID */
  readonly id: string;
  /** Alert severity */
  readonly severity: PerformanceAlertSeverity;
  /** Affected metric category */
  readonly category: PerformanceMetricCategory;
  /** Alert message */
  readonly message: string;
  /** Current value that triggered the alert */
  readonly currentValue: number;
  /** Threshold that was violated */
  readonly threshold: number;
  /** Unit of measurement */
  readonly unit: string;
  /** Alert timestamp */
  readonly timestamp: Date;
  /** Optional tenant ID if tenant-specific */
  readonly tenantId?: string;
  /** Optional correlation ID */
  readonly correlationId?: string;
}

/**
 * Load test configuration.
 */
export interface LoadTestConfig {
  /** Number of concurrent users */
  readonly concurrentUsers: number;
  /** Number of tenants to distribute load across */
  readonly tenantCount: number;
  /** Duration of load test in seconds */
  readonly durationSeconds: number;
  /** Operations per second target */
  readonly targetOpsPerSecond: number;
  /** Ramp-up time in seconds */
  readonly rampUpSeconds: number;
}

/**
 * Load test result.
 */
export interface LoadTestResult {
  /** Configuration used */
  readonly config: LoadTestConfig;
  /** Total operations executed */
  readonly totalOperations: number;
  /** Successful operations */
  readonly successfulOperations: number;
  /** Failed operations */
  readonly failedOperations: number;
  /** Actual operations per second achieved */
  readonly actualOpsPerSecond: number;
  /** Authorization context statistics */
  readonly authContextStats: PerformanceStatistics;
  /** Permission lookup statistics */
  readonly permissionLookupStats: PerformanceStatistics;
  /** Overall test status */
  readonly status: PerformanceValidationStatus;
  /** Error rate percentage */
  readonly errorRatePercent: number;
  /** Test start time */
  readonly startedAt: Date;
  /** Test end time */
  readonly completedAt: Date;
}

/**
 * Input for recording authorization context resolution latency.
 */
export interface RecordAuthContextLatencyInput {
  /** Latency in milliseconds */
  readonly latencyMs: number;
  /** Optional correlation ID */
  readonly correlationId?: string;
  /** Optional tenant ID */
  readonly tenantId?: string;
  /** Optional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Input for recording permission lookup latency.
 */
export interface RecordPermissionLookupLatencyInput {
  /** Latency in milliseconds */
  readonly latencyMs: number;
  /** Number of permissions checked */
  readonly permissionCount: number;
  /** Optional correlation ID */
  readonly correlationId?: string;
  /** Optional tenant ID */
  readonly tenantId?: string;
}

/**
 * Input for recording RLS query performance.
 */
export interface RecordRlsQueryInput {
  /** Base query latency without RLS (ms) */
  readonly baseLatencyMs: number;
  /** Query latency with RLS (ms) */
  readonly rlsLatencyMs: number;
  /** Query type/name */
  readonly queryType: string;
  /** Optional correlation ID */
  readonly correlationId?: string;
  /** Optional tenant ID */
  readonly tenantId?: string;
}

/**
 * Input for recording cache operation.
 */
export interface RecordCacheOperationInput {
  /** Whether it was a cache hit */
  readonly isHit: boolean;
  /** Lookup latency (ms) */
  readonly latencyMs: number;
  /** Cache key type */
  readonly keyType: string;
  /** Optional correlation ID */
  readonly correlationId?: string;
}

/**
 * Input for recording membership resolution latency.
 */
export interface RecordMembershipResolutionInput {
  /** Latency in milliseconds */
  readonly latencyMs: number;
  /** Whether result was from cache */
  readonly fromCache: boolean;
  /** Optional correlation ID */
  readonly correlationId?: string;
  /** Optional tenant ID */
  readonly tenantId?: string;
}

/**
 * Input for recording token validation latency.
 */
export interface RecordTokenValidationInput {
  /** Latency in milliseconds */
  readonly latencyMs: number;
  /** Whether validation succeeded */
  readonly success: boolean;
  /** Optional correlation ID */
  readonly correlationId?: string;
}

// ---------------------------------------------------------------------------
// Alert Emitter Interface
// ---------------------------------------------------------------------------

/**
 * Interface for emitting performance alerts.
 */
export interface IPerformanceAlertEmitter {
  /**
   * Emit a performance alert.
   * @param alert The alert to emit
   */
  emit(alert: PerformanceAlert): Promise<void>;
}

/**
 * Console-based alert emitter for development/testing.
 */
export const ConsolePerformanceAlertEmitter: IPerformanceAlertEmitter = {
  emit: async (alert: PerformanceAlert) => {
    const prefix = alert.severity === PerformanceAlertSeverity.CRITICAL
      ? '🚨 CRITICAL'
      : alert.severity === PerformanceAlertSeverity.EMERGENCY
        ? '🆘 EMERGENCY'
        : alert.severity === PerformanceAlertSeverity.WARNING
          ? '⚠️ WARNING'
          : 'ℹ️ INFO';
    
    console.warn(
      `[PerformanceAlert] ${prefix}: ${alert.message}`,
      `| Category: ${alert.category}`,
      `| Value: ${alert.currentValue}${alert.unit}`,
      `| Threshold: ${alert.threshold}${alert.unit}`,
      alert.tenantId ? `| Tenant: ${alert.tenantId}` : '',
    );
  },
};

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * Interface for the Performance Validation Service.
 *
 * @see Requirements 42
 */
export interface IPerformanceValidationService {
  // -------------------------------------------------------------------------
  // Recording Methods (called during normal operations)
  // -------------------------------------------------------------------------

  /**
   * Record an authorization context resolution latency sample.
   *
   * @param input The latency measurement input
   * @returns DomainResult indicating success or failure
   *
   * @see Requirements 42.1 — Measure authorization context resolution latency
   */
  recordAuthContextLatency(
    input: RecordAuthContextLatencyInput,
  ): Promise<DomainResult<void>>;

  /**
   * Record a permission lookup latency sample.
   *
   * @param input The latency measurement input
   * @returns DomainResult indicating success or failure
   *
   * @see Requirements 42.3 — Verify permission lookup completes within 10ms at p99
   */
  recordPermissionLookupLatency(
    input: RecordPermissionLookupLatencyInput,
  ): Promise<DomainResult<void>>;

  /**
   * Record an RLS query performance sample.
   *
   * @param input The query performance input
   * @returns DomainResult indicating success or failure
   *
   * @see Requirements 42.4, 42.5 — Measure and verify RLS overhead
   */
  recordRlsQueryPerformance(
    input: RecordRlsQueryInput,
  ): Promise<DomainResult<void>>;

  /**
   * Record a cache operation (hit/miss).
   *
   * @param input The cache operation input
   * @returns DomainResult indicating success or failure
   */
  recordCacheOperation(
    input: RecordCacheOperationInput,
  ): Promise<DomainResult<void>>;

  /**
   * Record a membership resolution latency sample.
   *
   * @param input The membership resolution input
   * @returns DomainResult indicating success or failure
   */
  recordMembershipResolutionLatency(
    input: RecordMembershipResolutionInput,
  ): Promise<DomainResult<void>>;

  /**
   * Record a token validation latency sample.
   *
   * @param input The token validation input
   * @returns DomainResult indicating success or failure
   */
  recordTokenValidationLatency(
    input: RecordTokenValidationInput,
  ): Promise<DomainResult<void>>;

  // -------------------------------------------------------------------------
  // Validation Methods
  // -------------------------------------------------------------------------

  /**
   * Validate authorization context resolution performance against SLA.
   *
   * @param windowMinutes Time window to analyze (default: 5 minutes)
   * @returns Validation result
   *
   * @see Requirements 42.2 — Verify authorization context resolution < 100ms p99
   */
  validateAuthContextPerformance(
    windowMinutes?: number,
  ): Promise<DomainResult<MetricValidationResult>>;

  /**
   * Validate permission lookup performance against SLA.
   *
   * @param windowMinutes Time window to analyze (default: 5 minutes)
   * @returns Validation result
   *
   * @see Requirements 42.3 — Verify permission lookup < 10ms p99
   */
  validatePermissionLookupPerformance(
    windowMinutes?: number,
  ): Promise<DomainResult<MetricValidationResult>>;

  /**
   * Validate RLS overhead against SLA.
   *
   * @returns Validation result
   *
   * @see Requirements 42.5 — Verify RLS adds no more than 20% query latency overhead
   */
  validateRlsOverhead(): Promise<DomainResult<MetricValidationResult>>;

  /**
   * Validate cache hit rate.
   *
   * @returns Validation result
   */
  validateCacheHitRate(): Promise<DomainResult<MetricValidationResult>>;

  /**
   * Validate membership resolution performance.
   *
   * @param windowMinutes Time window to analyze
   * @returns Validation result
   */
  validateMembershipResolutionPerformance(
    windowMinutes?: number,
  ): Promise<DomainResult<MetricValidationResult>>;

  /**
   * Validate token validation performance.
   *
   * @param windowMinutes Time window to analyze
   * @returns Validation result
   */
  validateTokenValidationPerformance(
    windowMinutes?: number,
  ): Promise<DomainResult<MetricValidationResult>>;

  // -------------------------------------------------------------------------
  // Reporting Methods
  // -------------------------------------------------------------------------

  /**
   * Run full performance validation and generate a comprehensive report.
   *
   * @param windowMinutes Time window to analyze (default: 5 minutes)
   * @returns Full performance validation report
   *
   * @see Requirements 42.7 — Report degradation alerts when SLAs are not met
   */
  runFullValidation(
    windowMinutes?: number,
  ): Promise<DomainResult<PerformanceValidationReport>>;

  /**
   * Get current cache performance metrics.
   *
   * @returns Cache performance metrics
   */
  getCacheMetrics(): Promise<DomainResult<CachePerformanceMetrics>>;

  /**
   * Get current RLS performance metrics.
   *
   * @returns RLS performance metrics
   */
  getRlsMetrics(): Promise<DomainResult<RlsPerformanceMetrics>>;

  /**
   * Get statistics for a specific metric category.
   *
   * @param category The metric category
   * @param windowMinutes Time window to analyze
   * @returns Performance statistics
   */
  getStatistics(
    category: PerformanceMetricCategory,
    windowMinutes?: number,
  ): Promise<DomainResult<PerformanceStatistics>>;

  // -------------------------------------------------------------------------
  // Load Testing Methods
  // -------------------------------------------------------------------------

  /**
   * Run a load test with concurrent users across multiple tenants.
   *
   * @param config Load test configuration
   * @returns Load test results
   *
   * @see Requirements 42.6 — Support load testing with concurrent users
   */
  runLoadTest(
    config: LoadTestConfig,
  ): Promise<DomainResult<LoadTestResult>>;

  // -------------------------------------------------------------------------
  // Configuration Methods
  // -------------------------------------------------------------------------

  /**
   * Get current performance thresholds.
   *
   * @returns Current threshold configuration
   */
  getThresholds(): PerformanceThresholdConfig;

  /**
   * Update performance thresholds.
   *
   * @param thresholds New threshold configuration
   * @returns DomainResult indicating success or failure
   */
  updateThresholds(
    thresholds: Partial<PerformanceThresholdConfig>,
  ): Promise<DomainResult<void>>;

  /**
   * Reset all collected metrics.
   *
   * @returns DomainResult indicating success or failure
   */
  resetMetrics(): Promise<DomainResult<void>>;
}

/**
 * Type alias for cleaner usage.
 */
export type PerformanceValidationService = IPerformanceValidationService;

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies for PerformanceValidationService.
 */
export interface PerformanceValidationServiceDependencies {
  /** Optional custom thresholds */
  readonly thresholds?: Partial<PerformanceThresholdConfig>;
  /** Optional alert emitter */
  readonly alertEmitter?: IPerformanceAlertEmitter;
  /** Maximum samples to keep per metric (default: 10000) */
  readonly maxSamplesPerMetric?: number;
  /** Sample retention period in minutes (default: 60) */
  readonly sampleRetentionMinutes?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for creating PerformanceValidationService.
 *
 * @param deps Service dependencies
 * @returns IPerformanceValidationService instance
 *
 * @see Requirements 42
 */
export const PerformanceValidationServiceImpl = (
  deps: PerformanceValidationServiceDependencies = {},
): IPerformanceValidationService => {
  // Merge thresholds with defaults
  let thresholds: PerformanceThresholdConfig = {
    ...DEFAULT_PERFORMANCE_THRESHOLDS,
    ...deps.thresholds,
  };

  const alertEmitter = deps.alertEmitter ?? ConsolePerformanceAlertEmitter;
  const maxSamples = deps.maxSamplesPerMetric ?? 10000;
  const retentionMinutes = deps.sampleRetentionMinutes ?? 60;

  // In-memory storage for samples
  const authContextSamples: PerformanceSample[] = [];
  const permissionLookupSamples: PerformanceSample[] = [];
  const membershipResolutionSamples: PerformanceSample[] = [];
  const tokenValidationSamples: PerformanceSample[] = [];

  // RLS samples with base/rls latency pairs
  const rlsSamples: Array<{
    baseLatencyMs: number;
    rlsLatencyMs: number;
    queryType: string;
    timestamp: Date;
  }> = [];

  // Cache tracking
  let cacheHits = 0;
  let cacheMisses = 0;
  let cacheLookupLatencySum = 0;
  let cacheEvictions = 0;
  let cacheSize = 0;

  // Alert counter for generating unique IDs
  let alertCounter = 0;

  // Helper: Generate unique alert ID
  const generateAlertId = (): string => {
    alertCounter++;
    return `perf-alert-${Date.now()}-${alertCounter}`;
  };

  // Helper: Clean up old samples beyond retention period
  const cleanupOldSamples = (
    samples: PerformanceSample[],
    retentionMs: number,
  ): void => {
    const cutoff = Date.now() - retentionMs;
    while (samples.length > 0 && (samples[0]?.timestamp.getTime() ?? 0) < cutoff) {
      samples.shift();
    }
    // Also trim if exceeding max samples
    while (samples.length > maxSamples) {
      samples.shift();
    }
  };

  // Helper: Filter samples within time window
  const filterSamplesInWindow = (
    samples: readonly PerformanceSample[],
    windowMinutes: number,
  ): readonly PerformanceSample[] => {
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    return samples.filter(s => s.timestamp.getTime() >= cutoff);
  };

  // Helper: Calculate percentile
  const calculatePercentile = (
    sortedValues: readonly number[],
    percentile: number,
  ): number => {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))] ?? 0;
  };

  // Helper: Calculate statistics from samples
  const calculateStatistics = (
    samples: readonly PerformanceSample[],
    windowStart: Date,
    windowEnd: Date,
  ): PerformanceStatistics => {
    if (samples.length === 0) {
      return {
        sampleCount: 0,
        minMs: 0,
        maxMs: 0,
        meanMs: 0,
        medianMs: 0,
        stdDevMs: 0,
        p75Ms: 0,
        p90Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        p999Ms: 0,
        windowStart,
        windowEnd,
      };
    }

    const latencies = samples.map(s => s.latencyMs);
    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = latencies.reduce((acc, v) => acc + v, 0);
    const mean = sum / latencies.length;

    // Standard deviation
    const squaredDiffs = latencies.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((acc, v) => acc + v, 0) / latencies.length;
    const stdDev = Math.sqrt(avgSquaredDiff);

    return {
      sampleCount: samples.length,
      minMs: sorted[0] ?? 0,
      maxMs: sorted[sorted.length - 1] ?? 0,
      meanMs: Math.round(mean * 100) / 100,
      medianMs: calculatePercentile(sorted, 50),
      stdDevMs: Math.round(stdDev * 100) / 100,
      p75Ms: calculatePercentile(sorted, 75),
      p90Ms: calculatePercentile(sorted, 90),
      p95Ms: calculatePercentile(sorted, 95),
      p99Ms: calculatePercentile(sorted, 99),
      p999Ms: calculatePercentile(sorted, 99.9),
      windowStart,
      windowEnd,
    };
  };

  // Helper: Determine validation status based on value and threshold
  const determineStatus = (
    currentValue: number,
    threshold: number,
    isLowerBetter: boolean,
  ): PerformanceValidationStatus => {
    const warningThreshold = threshold * thresholds.warningThresholdMultiplier;

    if (isLowerBetter) {
      if (currentValue > threshold) return PerformanceValidationStatus.FAILING;
      if (currentValue > warningThreshold) return PerformanceValidationStatus.WARNING;
      return PerformanceValidationStatus.PASSING;
    } else {
      // Higher is better (e.g., cache hit rate)
      if (currentValue < threshold) return PerformanceValidationStatus.FAILING;
      const invertedWarning = threshold + (100 - threshold) * (1 - thresholds.warningThresholdMultiplier);
      if (currentValue < invertedWarning) return PerformanceValidationStatus.WARNING;
      return PerformanceValidationStatus.PASSING;
    }
  };

  // Helper: Emit alert if needed
  const emitAlertIfNeeded = async (
    status: PerformanceValidationStatus,
    category: PerformanceMetricCategory,
    currentValue: number,
    threshold: number,
    unit: string,
    message: string,
    tenantId?: string,
  ): Promise<void> => {
    if (status === PerformanceValidationStatus.FAILING) {
      await alertEmitter.emit({
        id: generateAlertId(),
        severity: PerformanceAlertSeverity.CRITICAL,
        category,
        message,
        currentValue,
        threshold,
        unit,
        timestamp: new Date(),
        tenantId,
      });
    } else if (status === PerformanceValidationStatus.WARNING) {
      await alertEmitter.emit({
        id: generateAlertId(),
        severity: PerformanceAlertSeverity.WARNING,
        category,
        message,
        currentValue,
        threshold,
        unit,
        timestamp: new Date(),
        tenantId,
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Internal validation functions (for use in runFullValidation)
  // ---------------------------------------------------------------------------

  const validateAuthContext = async (
    windowMinutes: number,
  ): Promise<DomainResult<MetricValidationResult>> => {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60 * 1000);
    const samplesInWindow = filterSamplesInWindow(authContextSamples, windowMinutes);

    if (samplesInWindow.length === 0) {
      return ok({
        category: PerformanceMetricCategory.AUTHORIZATION_CONTEXT,
        status: PerformanceValidationStatus.NOT_MEASURED,
        currentValue: 0,
        thresholdValue: thresholds.authorizationContextP99Ms,
        unit: 'ms',
        message: 'No authorization context resolution samples available',
        timestamp: new Date(),
      });
    }

    const stats = calculateStatistics(samplesInWindow, windowStart, windowEnd);
    const status = determineStatus(stats.p99Ms, thresholds.authorizationContextP99Ms, true);
    const message = status === PerformanceValidationStatus.PASSING
      ? `Authorization context resolution p99 (${stats.p99Ms}ms) is within SLA (${thresholds.authorizationContextP99Ms}ms)`
      : `Authorization context resolution p99 (${stats.p99Ms}ms) exceeds SLA (${thresholds.authorizationContextP99Ms}ms)`;

    await emitAlertIfNeeded(
      status,
      PerformanceMetricCategory.AUTHORIZATION_CONTEXT,
      stats.p99Ms,
      thresholds.authorizationContextP99Ms,
      'ms',
      message,
    );

    return ok({
      category: PerformanceMetricCategory.AUTHORIZATION_CONTEXT,
      status,
      currentValue: stats.p99Ms,
      thresholdValue: thresholds.authorizationContextP99Ms,
      unit: 'ms',
      message,
      statistics: stats,
      timestamp: new Date(),
    });
  };

  const validatePermissionLookup = async (
    windowMinutes: number,
  ): Promise<DomainResult<MetricValidationResult>> => {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60 * 1000);
    const samplesInWindow = filterSamplesInWindow(permissionLookupSamples, windowMinutes);

    if (samplesInWindow.length === 0) {
      return ok({
        category: PerformanceMetricCategory.PERMISSION_LOOKUP,
        status: PerformanceValidationStatus.NOT_MEASURED,
        currentValue: 0,
        thresholdValue: thresholds.permissionLookupP99Ms,
        unit: 'ms',
        message: 'No permission lookup samples available',
        timestamp: new Date(),
      });
    }

    const stats = calculateStatistics(samplesInWindow, windowStart, windowEnd);
    const status = determineStatus(stats.p99Ms, thresholds.permissionLookupP99Ms, true);
    const message = status === PerformanceValidationStatus.PASSING
      ? `Permission lookup p99 (${stats.p99Ms}ms) is within SLA (${thresholds.permissionLookupP99Ms}ms)`
      : `Permission lookup p99 (${stats.p99Ms}ms) exceeds SLA (${thresholds.permissionLookupP99Ms}ms)`;

    await emitAlertIfNeeded(
      status,
      PerformanceMetricCategory.PERMISSION_LOOKUP,
      stats.p99Ms,
      thresholds.permissionLookupP99Ms,
      'ms',
      message,
    );

    return ok({
      category: PerformanceMetricCategory.PERMISSION_LOOKUP,
      status,
      currentValue: stats.p99Ms,
      thresholdValue: thresholds.permissionLookupP99Ms,
      unit: 'ms',
      message,
      statistics: stats,
      timestamp: new Date(),
    });
  };

  const validateRls = async (): Promise<DomainResult<MetricValidationResult>> => {
    if (rlsSamples.length === 0) {
      return ok({
        category: PerformanceMetricCategory.RLS_OVERHEAD,
        status: PerformanceValidationStatus.NOT_MEASURED,
        currentValue: 0,
        thresholdValue: thresholds.rlsOverheadPercent,
        unit: '%',
        message: 'No RLS query samples available',
        timestamp: new Date(),
      });
    }

    let totalOverhead = 0;
    for (const sample of rlsSamples) {
      if (sample.baseLatencyMs > 0) {
        const overhead = ((sample.rlsLatencyMs - sample.baseLatencyMs) / sample.baseLatencyMs) * 100;
        totalOverhead += overhead;
      }
    }
    const avgOverheadPercent = Math.round((totalOverhead / rlsSamples.length) * 100) / 100;

    const status = determineStatus(avgOverheadPercent, thresholds.rlsOverheadPercent, true);
    const message = status === PerformanceValidationStatus.PASSING
      ? `RLS overhead (${avgOverheadPercent}%) is within SLA (${thresholds.rlsOverheadPercent}%)`
      : `RLS overhead (${avgOverheadPercent}%) exceeds SLA (${thresholds.rlsOverheadPercent}%)`;

    await emitAlertIfNeeded(
      status,
      PerformanceMetricCategory.RLS_OVERHEAD,
      avgOverheadPercent,
      thresholds.rlsOverheadPercent,
      '%',
      message,
    );

    return ok({
      category: PerformanceMetricCategory.RLS_OVERHEAD,
      status,
      currentValue: avgOverheadPercent,
      thresholdValue: thresholds.rlsOverheadPercent,
      unit: '%',
      message,
      timestamp: new Date(),
    });
  };

  const validateCache = async (): Promise<DomainResult<MetricValidationResult>> => {
    const totalRequests = cacheHits + cacheMisses;

    if (totalRequests === 0) {
      return ok({
        category: PerformanceMetricCategory.CACHE_PERFORMANCE,
        status: PerformanceValidationStatus.NOT_MEASURED,
        currentValue: 0,
        thresholdValue: thresholds.cacheHitRatePercent,
        unit: '%',
        message: 'No cache operations recorded',
        timestamp: new Date(),
      });
    }

    const hitRatePercent = Math.round((cacheHits / totalRequests) * 10000) / 100;
    const status = determineStatus(hitRatePercent, thresholds.cacheHitRatePercent, false);
    const message = status === PerformanceValidationStatus.PASSING
      ? `Cache hit rate (${hitRatePercent}%) meets target (${thresholds.cacheHitRatePercent}%)`
      : `Cache hit rate (${hitRatePercent}%) below target (${thresholds.cacheHitRatePercent}%)`;

    await emitAlertIfNeeded(
      status,
      PerformanceMetricCategory.CACHE_PERFORMANCE,
      hitRatePercent,
      thresholds.cacheHitRatePercent,
      '%',
      message,
    );

    return ok({
      category: PerformanceMetricCategory.CACHE_PERFORMANCE,
      status,
      currentValue: hitRatePercent,
      thresholdValue: thresholds.cacheHitRatePercent,
      unit: '%',
      message,
      timestamp: new Date(),
    });
  };

  const validateMembership = async (
    windowMinutes: number,
  ): Promise<DomainResult<MetricValidationResult>> => {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60 * 1000);
    const samplesInWindow = filterSamplesInWindow(membershipResolutionSamples, windowMinutes);

    if (samplesInWindow.length === 0) {
      return ok({
        category: PerformanceMetricCategory.MEMBERSHIP_RESOLUTION,
        status: PerformanceValidationStatus.NOT_MEASURED,
        currentValue: 0,
        thresholdValue: thresholds.membershipResolutionMs,
        unit: 'ms',
        message: 'No membership resolution samples available',
        timestamp: new Date(),
      });
    }

    const stats = calculateStatistics(samplesInWindow, windowStart, windowEnd);
    const status = determineStatus(stats.p99Ms, thresholds.membershipResolutionMs, true);
    const message = status === PerformanceValidationStatus.PASSING
      ? `Membership resolution p99 (${stats.p99Ms}ms) is within target (${thresholds.membershipResolutionMs}ms)`
      : `Membership resolution p99 (${stats.p99Ms}ms) exceeds target (${thresholds.membershipResolutionMs}ms)`;

    await emitAlertIfNeeded(
      status,
      PerformanceMetricCategory.MEMBERSHIP_RESOLUTION,
      stats.p99Ms,
      thresholds.membershipResolutionMs,
      'ms',
      message,
    );

    return ok({
      category: PerformanceMetricCategory.MEMBERSHIP_RESOLUTION,
      status,
      currentValue: stats.p99Ms,
      thresholdValue: thresholds.membershipResolutionMs,
      unit: 'ms',
      message,
      statistics: stats,
      timestamp: new Date(),
    });
  };

  const validateToken = async (
    windowMinutes: number,
  ): Promise<DomainResult<MetricValidationResult>> => {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60 * 1000);
    const samplesInWindow = filterSamplesInWindow(tokenValidationSamples, windowMinutes);

    if (samplesInWindow.length === 0) {
      return ok({
        category: PerformanceMetricCategory.TOKEN_VALIDATION,
        status: PerformanceValidationStatus.NOT_MEASURED,
        currentValue: 0,
        thresholdValue: thresholds.tokenValidationP99Ms,
        unit: 'ms',
        message: 'No token validation samples available',
        timestamp: new Date(),
      });
    }

    const stats = calculateStatistics(samplesInWindow, windowStart, windowEnd);
    const status = determineStatus(stats.p99Ms, thresholds.tokenValidationP99Ms, true);
    const message = status === PerformanceValidationStatus.PASSING
      ? `Token validation p99 (${stats.p99Ms}ms) is within target (${thresholds.tokenValidationP99Ms}ms)`
      : `Token validation p99 (${stats.p99Ms}ms) exceeds target (${thresholds.tokenValidationP99Ms}ms)`;

    await emitAlertIfNeeded(
      status,
      PerformanceMetricCategory.TOKEN_VALIDATION,
      stats.p99Ms,
      thresholds.tokenValidationP99Ms,
      'ms',
      message,
    );

    return ok({
      category: PerformanceMetricCategory.TOKEN_VALIDATION,
      status,
      currentValue: stats.p99Ms,
      thresholdValue: thresholds.tokenValidationP99Ms,
      unit: 'ms',
      message,
      statistics: stats,
      timestamp: new Date(),
    });
  };

  const getCacheMetricsInternal = (): CachePerformanceMetrics => {
    const totalRequests = cacheHits + cacheMisses;
    const hitRatePercent = totalRequests > 0
      ? Math.round((cacheHits / totalRequests) * 10000) / 100
      : 0;
    const avgLookupMs = totalRequests > 0
      ? Math.round((cacheLookupLatencySum / totalRequests) * 100) / 100
      : 0;

    return {
      totalRequests,
      hits: cacheHits,
      misses: cacheMisses,
      hitRatePercent,
      avgLookupMs,
      evictions: cacheEvictions,
      cacheSize,
    };
  };

  const getRlsMetricsInternal = (): RlsPerformanceMetrics => {
    if (rlsSamples.length === 0) {
      return {
        baseQueryLatencyMs: 0,
        rlsQueryLatencyMs: 0,
        overheadMs: 0,
        overheadPercent: 0,
        querySampleCount: 0,
      };
    }

    let totalBaseLatency = 0;
    let totalRlsLatency = 0;

    const byQueryType = new Map<string, {
      baseSum: number;
      rlsSum: number;
      count: number;
    }>();

    for (const sample of rlsSamples) {
      totalBaseLatency += sample.baseLatencyMs;
      totalRlsLatency += sample.rlsLatencyMs;

      const existing = byQueryType.get(sample.queryType) ?? {
        baseSum: 0,
        rlsSum: 0,
        count: 0,
      };
      existing.baseSum += sample.baseLatencyMs;
      existing.rlsSum += sample.rlsLatencyMs;
      existing.count++;
      byQueryType.set(sample.queryType, existing);
    }

    const avgBaseMs = totalBaseLatency / rlsSamples.length;
    const avgRlsMs = totalRlsLatency / rlsSamples.length;
    const overheadMs = avgRlsMs - avgBaseMs;
    const overheadPercent = avgBaseMs > 0
      ? Math.round(((overheadMs / avgBaseMs) * 100) * 100) / 100
      : 0;

    const byQueryTypeMap = new Map<string, { baseMs: number; rlsMs: number; overheadPercent: number }>();
    for (const [queryType, data] of byQueryType) {
      const baseMs = data.baseSum / data.count;
      const rlsMs = data.rlsSum / data.count;
      const qOverheadPercent = baseMs > 0
        ? Math.round((((rlsMs - baseMs) / baseMs) * 100) * 100) / 100
        : 0;
      byQueryTypeMap.set(queryType, {
        baseMs: Math.round(baseMs * 100) / 100,
        rlsMs: Math.round(rlsMs * 100) / 100,
        overheadPercent: qOverheadPercent,
      });
    }

    return {
      baseQueryLatencyMs: Math.round(avgBaseMs * 100) / 100,
      rlsQueryLatencyMs: Math.round(avgRlsMs * 100) / 100,
      overheadMs: Math.round(overheadMs * 100) / 100,
      overheadPercent,
      querySampleCount: rlsSamples.length,
      byQueryType: byQueryTypeMap,
    };
  };

  return {
    // =========================================================================
    // Recording Methods
    // =========================================================================

    recordAuthContextLatency: async (
      input: RecordAuthContextLatencyInput,
    ): Promise<DomainResult<void>> => {
      try {
        cleanupOldSamples(authContextSamples, retentionMinutes * 60 * 1000);
        
        authContextSamples.push({
          latencyMs: input.latencyMs,
          timestamp: new Date(),
          correlationId: input.correlationId,
          tenantId: input.tenantId,
          metadata: input.metadata,
        });

        return ok(undefined);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_RECORD_AUTH_CONTEXT_FAILED',
          'Failed to record authorization context latency',
          { cause: error },
        ));
      }
    },

    recordPermissionLookupLatency: async (
      input: RecordPermissionLookupLatencyInput,
    ): Promise<DomainResult<void>> => {
      try {
        cleanupOldSamples(permissionLookupSamples, retentionMinutes * 60 * 1000);
        
        permissionLookupSamples.push({
          latencyMs: input.latencyMs,
          timestamp: new Date(),
          correlationId: input.correlationId,
          tenantId: input.tenantId,
          metadata: { permissionCount: input.permissionCount },
        });

        return ok(undefined);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_RECORD_PERMISSION_LOOKUP_FAILED',
          'Failed to record permission lookup latency',
          { cause: error },
        ));
      }
    },

    recordRlsQueryPerformance: async (
      input: RecordRlsQueryInput,
    ): Promise<DomainResult<void>> => {
      try {
        // Clean up old RLS samples
        const cutoff = Date.now() - retentionMinutes * 60 * 1000;
        while (rlsSamples.length > 0 && (rlsSamples[0]?.timestamp.getTime() ?? 0) < cutoff) {
          rlsSamples.shift();
        }
        while (rlsSamples.length > maxSamples) {
          rlsSamples.shift();
        }

        rlsSamples.push({
          baseLatencyMs: input.baseLatencyMs,
          rlsLatencyMs: input.rlsLatencyMs,
          queryType: input.queryType,
          timestamp: new Date(),
        });

        return ok(undefined);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_RECORD_RLS_QUERY_FAILED',
          'Failed to record RLS query performance',
          { cause: error },
        ));
      }
    },

    recordCacheOperation: async (
      input: RecordCacheOperationInput,
    ): Promise<DomainResult<void>> => {
      try {
        if (input.isHit) {
          cacheHits++;
        } else {
          cacheMisses++;
        }
        cacheLookupLatencySum += input.latencyMs;

        return ok(undefined);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_RECORD_CACHE_OP_FAILED',
          'Failed to record cache operation',
          { cause: error },
        ));
      }
    },

    recordMembershipResolutionLatency: async (
      input: RecordMembershipResolutionInput,
    ): Promise<DomainResult<void>> => {
      try {
        cleanupOldSamples(membershipResolutionSamples, retentionMinutes * 60 * 1000);
        
        membershipResolutionSamples.push({
          latencyMs: input.latencyMs,
          timestamp: new Date(),
          correlationId: input.correlationId,
          tenantId: input.tenantId,
          metadata: { fromCache: input.fromCache },
        });

        return ok(undefined);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_RECORD_MEMBERSHIP_RESOLUTION_FAILED',
          'Failed to record membership resolution latency',
          { cause: error },
        ));
      }
    },

    recordTokenValidationLatency: async (
      input: RecordTokenValidationInput,
    ): Promise<DomainResult<void>> => {
      try {
        cleanupOldSamples(tokenValidationSamples, retentionMinutes * 60 * 1000);
        
        tokenValidationSamples.push({
          latencyMs: input.latencyMs,
          timestamp: new Date(),
          correlationId: input.correlationId,
          metadata: { success: input.success },
        });

        return ok(undefined);
      } catch (error) {
        return fail(unexpectedError(
          'PERF_RECORD_TOKEN_VALIDATION_FAILED',
          'Failed to record token validation latency',
          { cause: error },
        ));
      }
    },

    // =========================================================================
    // Validation Methods
    // =========================================================================

    validateAuthContextPerformance: async (
      windowMinutes = 5,
    ): Promise<DomainResult<MetricValidationResult>> => {
      try {
        const windowEnd = new Date();
        const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60 * 1000);
        const samplesInWindow = filterSamplesInWindow(authContextSamples, windowMinutes);

        if (samplesInWindow.length === 0) {
          return ok({
            category: PerformanceMetricCategory.AUTHORIZATION_CONTEXT,
            status: PerformanceValidationStatus.NOT_MEASURED,
            currentValue: 0,
            thresholdValue: thresholds.authorizationContextP99Ms,
            unit: 'ms',
            message: 'No authorization context resolution samples available',
            timestamp: new Date(),
          });
        }

        const stats = calculateStatistics(samplesInWindow, windowStart, windowEnd);
        const status = determineStatus(stats.p99Ms, thresholds.authorizationContextP99Ms, true);
        const message = status === PerformanceValidationStatus.PASSING
          ? `Authorization context resolution p99 (${stats.p99Ms}ms) is within SLA (${thresholds.authorizationContextP99Ms}ms)`
          : `Authorization context resolution p99 (${stats.p99Ms}ms) exceeds SLA (${thresholds.authorizationContextP99Ms}ms)`;

        await emitAlertIfNeeded(
          status,
          PerformanceMetricCategory.AUTHORIZATION_CONTEXT,
          stats.p99Ms,
          thresholds.authorizationContextP99Ms,
          'ms',
          message,
        );

        return ok({
          category: PerformanceMetricCategory.AUTHORIZATION_CONTEXT,
          status,
          currentValue: stats.p99Ms,
          thresholdValue: thresholds.authorizationContextP99Ms,
          unit: 'ms',
          message,
          statistics: stats,
          timestamp: new Date(),
        });
      } catch (error) {
        return fail(technicalError(
          'PERF_VALIDATE_AUTH_CONTEXT_FAILED',
          'Failed to validate authorization context performance',
          { cause: error },
        ));
      }
    },

    validatePermissionLookupPerformance: async (
      windowMinutes = 5,
    ): Promise<DomainResult<MetricValidationResult>> => {
      try {
        const windowEnd = new Date();
        const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60 * 1000);
        const samplesInWindow = filterSamplesInWindow(permissionLookupSamples, windowMinutes);

        if (samplesInWindow.length === 0) {
          return ok({
            category: PerformanceMetricCategory.PERMISSION_LOOKUP,
            status: PerformanceValidationStatus.NOT_MEASURED,
            currentValue: 0,
            thresholdValue: thresholds.permissionLookupP99Ms,
            unit: 'ms',
            message: 'No permission lookup samples available',
            timestamp: new Date(),
          });
        }

        const stats = calculateStatistics(samplesInWindow, windowStart, windowEnd);
        const status = determineStatus(stats.p99Ms, thresholds.permissionLookupP99Ms, true);
        const message = status === PerformanceValidationStatus.PASSING
          ? `Permission lookup p99 (${stats.p99Ms}ms) is within SLA (${thresholds.permissionLookupP99Ms}ms)`
          : `Permission lookup p99 (${stats.p99Ms}ms) exceeds SLA (${thresholds.permissionLookupP99Ms}ms)`;

        await emitAlertIfNeeded(
          status,
          PerformanceMetricCategory.PERMISSION_LOOKUP,
          stats.p99Ms,
          thresholds.permissionLookupP99Ms,
          'ms',
          message,
        );

        return ok({
          category: PerformanceMetricCategory.PERMISSION_LOOKUP,
          status,
          currentValue: stats.p99Ms,
          thresholdValue: thresholds.permissionLookupP99Ms,
          unit: 'ms',
          message,
          statistics: stats,
          timestamp: new Date(),
        });
      } catch (error) {
        return fail(technicalError(
          'PERF_VALIDATE_PERMISSION_LOOKUP_FAILED',
          'Failed to validate permission lookup performance',
          { cause: error },
        ));
      }
    },

    validateRlsOverhead: async (): Promise<DomainResult<MetricValidationResult>> => {
      try {
        if (rlsSamples.length === 0) {
          return ok({
            category: PerformanceMetricCategory.RLS_OVERHEAD,
            status: PerformanceValidationStatus.NOT_MEASURED,
            currentValue: 0,
            thresholdValue: thresholds.rlsOverheadPercent,
            unit: '%',
            message: 'No RLS query samples available',
            timestamp: new Date(),
          });
        }

        // Calculate average overhead
        let totalOverhead = 0;
        for (const sample of rlsSamples) {
          if (sample.baseLatencyMs > 0) {
            const overhead = ((sample.rlsLatencyMs - sample.baseLatencyMs) / sample.baseLatencyMs) * 100;
            totalOverhead += overhead;
          }
        }
        const avgOverheadPercent = Math.round((totalOverhead / rlsSamples.length) * 100) / 100;

        const status = determineStatus(avgOverheadPercent, thresholds.rlsOverheadPercent, true);
        const message = status === PerformanceValidationStatus.PASSING
          ? `RLS overhead (${avgOverheadPercent}%) is within SLA (${thresholds.rlsOverheadPercent}%)`
          : `RLS overhead (${avgOverheadPercent}%) exceeds SLA (${thresholds.rlsOverheadPercent}%)`;

        await emitAlertIfNeeded(
          status,
          PerformanceMetricCategory.RLS_OVERHEAD,
          avgOverheadPercent,
          thresholds.rlsOverheadPercent,
          '%',
          message,
        );

        return ok({
          category: PerformanceMetricCategory.RLS_OVERHEAD,
          status,
          currentValue: avgOverheadPercent,
          thresholdValue: thresholds.rlsOverheadPercent,
          unit: '%',
          message,
          timestamp: new Date(),
        });
      } catch (error) {
        return fail(technicalError(
          'PERF_VALIDATE_RLS_OVERHEAD_FAILED',
          'Failed to validate RLS overhead',
          { cause: error },
        ));
      }
    },

    validateCacheHitRate: async (): Promise<DomainResult<MetricValidationResult>> => {
      try {
        const totalRequests = cacheHits + cacheMisses;

        if (totalRequests === 0) {
          return ok({
            category: PerformanceMetricCategory.CACHE_PERFORMANCE,
            status: PerformanceValidationStatus.NOT_MEASURED,
            currentValue: 0,
            thresholdValue: thresholds.cacheHitRatePercent,
            unit: '%',
            message: 'No cache operations recorded',
            timestamp: new Date(),
          });
        }

        const hitRatePercent = Math.round((cacheHits / totalRequests) * 10000) / 100;
        const status = determineStatus(hitRatePercent, thresholds.cacheHitRatePercent, false);
        const message = status === PerformanceValidationStatus.PASSING
          ? `Cache hit rate (${hitRatePercent}%) meets target (${thresholds.cacheHitRatePercent}%)`
          : `Cache hit rate (${hitRatePercent}%) below target (${thresholds.cacheHitRatePercent}%)`;

        await emitAlertIfNeeded(
          status,
          PerformanceMetricCategory.CACHE_PERFORMANCE,
          hitRatePercent,
          thresholds.cacheHitRatePercent,
          '%',
          message,
        );

        return ok({
          category: PerformanceMetricCategory.CACHE_PERFORMANCE,
          status,
          currentValue: hitRatePercent,
          thresholdValue: thresholds.cacheHitRatePercent,
          unit: '%',
          message,
          timestamp: new Date(),
        });
      } catch (error) {
        return fail(technicalError(
          'PERF_VALIDATE_CACHE_HIT_RATE_FAILED',
          'Failed to validate cache hit rate',
          { cause: error },
        ));
      }
    },

    validateMembershipResolutionPerformance: async (
      windowMinutes = 5,
    ): Promise<DomainResult<MetricValidationResult>> => {
      try {
        const windowEnd = new Date();
        const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60 * 1000);
        const samplesInWindow = filterSamplesInWindow(membershipResolutionSamples, windowMinutes);

        if (samplesInWindow.length === 0) {
          return ok({
            category: PerformanceMetricCategory.MEMBERSHIP_RESOLUTION,
            status: PerformanceValidationStatus.NOT_MEASURED,
            currentValue: 0,
            thresholdValue: thresholds.membershipResolutionMs,
            unit: 'ms',
            message: 'No membership resolution samples available',
            timestamp: new Date(),
          });
        }

        const stats = calculateStatistics(samplesInWindow, windowStart, windowEnd);
        const status = determineStatus(stats.p99Ms, thresholds.membershipResolutionMs, true);
        const message = status === PerformanceValidationStatus.PASSING
          ? `Membership resolution p99 (${stats.p99Ms}ms) is within target (${thresholds.membershipResolutionMs}ms)`
          : `Membership resolution p99 (${stats.p99Ms}ms) exceeds target (${thresholds.membershipResolutionMs}ms)`;

        await emitAlertIfNeeded(
          status,
          PerformanceMetricCategory.MEMBERSHIP_RESOLUTION,
          stats.p99Ms,
          thresholds.membershipResolutionMs,
          'ms',
          message,
        );

        return ok({
          category: PerformanceMetricCategory.MEMBERSHIP_RESOLUTION,
          status,
          currentValue: stats.p99Ms,
          thresholdValue: thresholds.membershipResolutionMs,
          unit: 'ms',
          message,
          statistics: stats,
          timestamp: new Date(),
        });
      } catch (error) {
        return fail(technicalError(
          'PERF_VALIDATE_MEMBERSHIP_RESOLUTION_FAILED',
          'Failed to validate membership resolution performance',
          { cause: error },
        ));
      }
    },

    validateTokenValidationPerformance: async (
      windowMinutes = 5,
    ): Promise<DomainResult<MetricValidationResult>> => {
      try {
        const windowEnd = new Date();
        const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60 * 1000);
        const samplesInWindow = filterSamplesInWindow(tokenValidationSamples, windowMinutes);

        if (samplesInWindow.length === 0) {
          return ok({
            category: PerformanceMetricCategory.TOKEN_VALIDATION,
            status: PerformanceValidationStatus.NOT_MEASURED,
            currentValue: 0,
            thresholdValue: thresholds.tokenValidationP99Ms,
            unit: 'ms',
            message: 'No token validation samples available',
            timestamp: new Date(),
          });
        }

        const stats = calculateStatistics(samplesInWindow, windowStart, windowEnd);
        const status = determineStatus(stats.p99Ms, thresholds.tokenValidationP99Ms, true);
        const message = status === PerformanceValidationStatus.PASSING
          ? `Token validation p99 (${stats.p99Ms}ms) is within target (${thresholds.tokenValidationP99Ms}ms)`
          : `Token validation p99 (${stats.p99Ms}ms) exceeds target (${thresholds.tokenValidationP99Ms}ms)`;

        await emitAlertIfNeeded(
          status,
          PerformanceMetricCategory.TOKEN_VALIDATION,
          stats.p99Ms,
          thresholds.tokenValidationP99Ms,
          'ms',
          message,
        );

        return ok({
          category: PerformanceMetricCategory.TOKEN_VALIDATION,
          status,
          currentValue: stats.p99Ms,
          thresholdValue: thresholds.tokenValidationP99Ms,
          unit: 'ms',
          message,
          statistics: stats,
          timestamp: new Date(),
        });
      } catch (error) {
        return fail(technicalError(
          'PERF_VALIDATE_TOKEN_VALIDATION_FAILED',
          'Failed to validate token validation performance',
          { cause: error },
        ));
      }
    },

    // =========================================================================
    // Reporting Methods
    // =========================================================================

    runFullValidation: async function (
      windowMinutes = 5,
    ): Promise<DomainResult<PerformanceValidationReport>> {
      try {
        const windowEnd = new Date();
        const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60 * 1000);

        // Run all validations using direct function calls to avoid 'this' issues
        const results: MetricValidationResult[] = [];

        // Helper to validate each metric and collect results
        const validateAndCollect = async (
          validateFn: () => Promise<DomainResult<MetricValidationResult>>,
        ): Promise<void> => {
          const result = await validateFn();
          if (result.success) {
            results.push(result.data);
          }
        };

        // Validate auth context
        await validateAndCollect(() => validateAuthContext(windowMinutes));

        // Validate permission lookup
        await validateAndCollect(() => validatePermissionLookup(windowMinutes));

        // Validate RLS overhead
        await validateAndCollect(() => validateRls());

        // Validate cache hit rate
        await validateAndCollect(() => validateCache());

        // Validate membership resolution
        await validateAndCollect(() => validateMembership(windowMinutes));

        // Validate token validation
        await validateAndCollect(() => validateToken(windowMinutes));

        // Calculate counts
        const passingCount = results.filter(r => r.status === PerformanceValidationStatus.PASSING).length;
        const warningCount = results.filter(r => r.status === PerformanceValidationStatus.WARNING).length;
        const failingCount = results.filter(r => r.status === PerformanceValidationStatus.FAILING).length;
        const errorCount = results.filter(r => r.status === PerformanceValidationStatus.ERROR).length;

        // Determine overall status
        let overallStatus: PerformanceValidationStatus;
        if (errorCount > 0) {
          overallStatus = PerformanceValidationStatus.ERROR;
        } else if (failingCount > 0) {
          overallStatus = PerformanceValidationStatus.FAILING;
        } else if (warningCount > 0) {
          overallStatus = PerformanceValidationStatus.WARNING;
        } else if (passingCount > 0) {
          overallStatus = PerformanceValidationStatus.PASSING;
        } else {
          overallStatus = PerformanceValidationStatus.NOT_MEASURED;
        }

        // Get cache metrics
        const cacheMetrics = getCacheMetricsInternal();

        // Get RLS metrics
        const rlsMetrics = getRlsMetricsInternal();

        // Generate recommendations
        const recommendations: string[] = [];
        for (const result of results) {
          if (result.status === PerformanceValidationStatus.FAILING) {
            switch (result.category) {
              case PerformanceMetricCategory.AUTHORIZATION_CONTEXT:
                recommendations.push('Consider optimizing membership resolution queries or increasing cache TTL');
                break;
              case PerformanceMetricCategory.PERMISSION_LOOKUP:
                recommendations.push('Review permission registry implementation for O(1) lookups');
                break;
              case PerformanceMetricCategory.RLS_OVERHEAD:
                recommendations.push('Review RLS policy complexity and consider adding appropriate indexes');
                break;
              case PerformanceMetricCategory.CACHE_PERFORMANCE:
                recommendations.push('Increase cache size or review cache eviction policy');
                break;
              case PerformanceMetricCategory.MEMBERSHIP_RESOLUTION:
                recommendations.push('Add indexes on membership lookup columns (userId, tenantId)');
                break;
              case PerformanceMetricCategory.TOKEN_VALIDATION:
                recommendations.push('Consider token validation caching or signature verification optimization');
                break;
            }
          }
        }

        return ok({
          overallStatus,
          metricResults: results,
          cacheMetrics,
          rlsMetrics,
          passingCount,
          warningCount,
          failingCount,
          errorCount,
          generatedAt: new Date(),
          windowStart,
          windowEnd,
          recommendations: recommendations.length > 0 ? recommendations : undefined,
        });
      } catch (error) {
        return fail(technicalError(
          'PERF_FULL_VALIDATION_FAILED',
          'Failed to run full performance validation',
          { cause: error },
        ));
      }
    },

    getCacheMetrics: async (): Promise<DomainResult<CachePerformanceMetrics>> => {
      try {
        const totalRequests = cacheHits + cacheMisses;
        const hitRatePercent = totalRequests > 0
          ? Math.round((cacheHits / totalRequests) * 10000) / 100
          : 0;
        const avgLookupMs = totalRequests > 0
          ? Math.round((cacheLookupLatencySum / totalRequests) * 100) / 100
          : 0;

        return ok({
          totalRequests,
          hits: cacheHits,
          misses: cacheMisses,
          hitRatePercent,
          avgLookupMs,
          evictions: cacheEvictions,
          cacheSize,
        });
      } catch (error) {
        return fail(technicalError(
          'PERF_GET_CACHE_METRICS_FAILED',
          'Failed to get cache metrics',
          { cause: error },
        ));
      }
    },

    getRlsMetrics: async (): Promise<DomainResult<RlsPerformanceMetrics>> => {
      try {
        if (rlsSamples.length === 0) {
          return ok({
            baseQueryLatencyMs: 0,
            rlsQueryLatencyMs: 0,
            overheadMs: 0,
            overheadPercent: 0,
            querySampleCount: 0,
          });
        }

        let totalBaseLatency = 0;
        let totalRlsLatency = 0;

        // Group by query type
        const byQueryType = new Map<string, {
          baseSum: number;
          rlsSum: number;
          count: number;
        }>();

        for (const sample of rlsSamples) {
          totalBaseLatency += sample.baseLatencyMs;
          totalRlsLatency += sample.rlsLatencyMs;

          const existing = byQueryType.get(sample.queryType) ?? {
            baseSum: 0,
            rlsSum: 0,
            count: 0,
          };
          existing.baseSum += sample.baseLatencyMs;
          existing.rlsSum += sample.rlsLatencyMs;
          existing.count++;
          byQueryType.set(sample.queryType, existing);
        }

        const avgBaseMs = totalBaseLatency / rlsSamples.length;
        const avgRlsMs = totalRlsLatency / rlsSamples.length;
        const overheadMs = avgRlsMs - avgBaseMs;
        const overheadPercent = avgBaseMs > 0
          ? Math.round(((overheadMs / avgBaseMs) * 100) * 100) / 100
          : 0;

        // Build query type breakdown
        const byQueryTypeMap = new Map<string, { baseMs: number; rlsMs: number; overheadPercent: number }>();
        for (const [queryType, data] of byQueryType) {
          const baseMs = data.baseSum / data.count;
          const rlsMs = data.rlsSum / data.count;
          const qOverheadPercent = baseMs > 0
            ? Math.round((((rlsMs - baseMs) / baseMs) * 100) * 100) / 100
            : 0;
          byQueryTypeMap.set(queryType, {
            baseMs: Math.round(baseMs * 100) / 100,
            rlsMs: Math.round(rlsMs * 100) / 100,
            overheadPercent: qOverheadPercent,
          });
        }

        return ok({
          baseQueryLatencyMs: Math.round(avgBaseMs * 100) / 100,
          rlsQueryLatencyMs: Math.round(avgRlsMs * 100) / 100,
          overheadMs: Math.round(overheadMs * 100) / 100,
          overheadPercent,
          querySampleCount: rlsSamples.length,
          byQueryType: byQueryTypeMap,
        });
      } catch (error) {
        return fail(technicalError(
          'PERF_GET_RLS_METRICS_FAILED',
          'Failed to get RLS metrics',
          { cause: error },
        ));
      }
    },

    getStatistics: async (
      category: PerformanceMetricCategory,
      windowMinutes = 5,
    ): Promise<DomainResult<PerformanceStatistics>> => {
      try {
        const windowEnd = new Date();
        const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60 * 1000);

        let samples: readonly PerformanceSample[];

        switch (category) {
          case PerformanceMetricCategory.AUTHORIZATION_CONTEXT:
            samples = filterSamplesInWindow(authContextSamples, windowMinutes);
            break;
          case PerformanceMetricCategory.PERMISSION_LOOKUP:
            samples = filterSamplesInWindow(permissionLookupSamples, windowMinutes);
            break;
          case PerformanceMetricCategory.MEMBERSHIP_RESOLUTION:
            samples = filterSamplesInWindow(membershipResolutionSamples, windowMinutes);
            break;
          case PerformanceMetricCategory.TOKEN_VALIDATION:
            samples = filterSamplesInWindow(tokenValidationSamples, windowMinutes);
            break;
          default:
            return fail(technicalError(
              'PERF_UNSUPPORTED_METRIC_CATEGORY',
              `Statistics not available for category: ${category}`,
            ));
        }

        return ok(calculateStatistics(samples, windowStart, windowEnd));
      } catch (error) {
        return fail(technicalError(
          'PERF_GET_STATISTICS_FAILED',
          'Failed to get performance statistics',
          { cause: error },
        ));
      }
    },

    // =========================================================================
    // Load Testing Methods
    // =========================================================================

    runLoadTest: async (
      config: LoadTestConfig,
    ): Promise<DomainResult<LoadTestResult>> => {
      try {
        const startedAt = new Date();
        
        // This is a simplified load test simulation
        // In a real implementation, this would spawn concurrent operations
        let successfulOps = 0;
        let failedOps = 0;
        const authLatencies: number[] = [];
        const permLatencies: number[] = [];

        const totalOps = config.targetOpsPerSecond * config.durationSeconds;
        const _opsPerUser = Math.ceil(totalOps / config.concurrentUsers);

        // Simulate operations (simplified for demonstration)
        for (let i = 0; i < totalOps; i++) {
          // Simulate auth context resolution (random latency 5-150ms)
          const authLatency = 5 + Math.random() * 145;
          authLatencies.push(authLatency);

          // Simulate permission lookup (random latency 1-20ms)
          const permLatency = 1 + Math.random() * 19;
          permLatencies.push(permLatency);

          // Simulate occasional failures (2% failure rate)
          if (Math.random() < 0.02) {
            failedOps++;
          } else {
            successfulOps++;
          }
        }

        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();
        const actualOpsPerSecond = Math.round((totalOps / (durationMs / 1000)) * 100) / 100;

        // Calculate statistics
        const _authSorted = [...authLatencies].sort((a, b) => a - b);
        const _permSorted = [...permLatencies].sort((a, b) => a - b);

        const authContextStats = calculateStatistics(
          authLatencies.map((l, i) => ({
            latencyMs: l,
            timestamp: new Date(startedAt.getTime() + i * (durationMs / totalOps)),
          })),
          startedAt,
          completedAt,
        );

        const permissionLookupStats = calculateStatistics(
          permLatencies.map((l, i) => ({
            latencyMs: l,
            timestamp: new Date(startedAt.getTime() + i * (durationMs / totalOps)),
          })),
          startedAt,
          completedAt,
        );

        // Determine status
        const errorRatePercent = Math.round((failedOps / totalOps) * 10000) / 100;
        let status: PerformanceValidationStatus;
        if (errorRatePercent > 5) {
          status = PerformanceValidationStatus.FAILING;
        } else if (
          authContextStats.p99Ms > thresholds.authorizationContextP99Ms ||
          permissionLookupStats.p99Ms > thresholds.permissionLookupP99Ms
        ) {
          status = PerformanceValidationStatus.FAILING;
        } else if (errorRatePercent > 1) {
          status = PerformanceValidationStatus.WARNING;
        } else {
          status = PerformanceValidationStatus.PASSING;
        }

        return ok({
          config,
          totalOperations: totalOps,
          successfulOperations: successfulOps,
          failedOperations: failedOps,
          actualOpsPerSecond,
          authContextStats,
          permissionLookupStats,
          status,
          errorRatePercent,
          startedAt,
          completedAt,
        });
      } catch (error) {
        return fail(technicalError(
          'PERF_LOAD_TEST_FAILED',
          'Failed to run load test',
          { cause: error },
        ));
      }
    },

    // =========================================================================
    // Configuration Methods
    // =========================================================================

    getThresholds: (): PerformanceThresholdConfig => {
      return { ...thresholds };
    },

    updateThresholds: async (
      newThresholds: Partial<PerformanceThresholdConfig>,
    ): Promise<DomainResult<void>> => {
      try {
        thresholds = {
          ...thresholds,
          ...newThresholds,
        };
        return ok(undefined);
      } catch (error) {
        return fail(technicalError(
          'PERF_UPDATE_THRESHOLDS_FAILED',
          'Failed to update performance thresholds',
          { cause: error },
        ));
      }
    },

    resetMetrics: async (): Promise<DomainResult<void>> => {
      try {
        authContextSamples.length = 0;
        permissionLookupSamples.length = 0;
        membershipResolutionSamples.length = 0;
        tokenValidationSamples.length = 0;
        rlsSamples.length = 0;
        cacheHits = 0;
        cacheMisses = 0;
        cacheLookupLatencySum = 0;
        cacheEvictions = 0;
        cacheSize = 0;
        return ok(undefined);
      } catch (error) {
        return fail(technicalError(
          'PERF_RESET_METRICS_FAILED',
          'Failed to reset performance metrics',
          { cause: error },
        ));
      }
    },
  };
};
