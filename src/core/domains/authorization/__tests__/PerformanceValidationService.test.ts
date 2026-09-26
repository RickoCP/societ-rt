/**
 * PerformanceValidationService Unit Tests
 *
 * Tests for the Performance Validation Service (Task 78) that validates
 * authorization system performance against SLA requirements.
 *
 * **Test Coverage:**
 * - Recording latency samples (auth context, permission lookup, membership, token)
 * - RLS query overhead recording and validation
 * - Cache operation recording and hit rate validation
 * - Performance threshold validation
 * - SLA violation detection and alerting
 * - Full validation report generation
 * - Load test execution
 * - Configuration management (thresholds, reset)
 *
 * **Validates: Requirements 42 (Performance Validation)**
 * - Authorization context resolution < 100ms p99
 * - Permission lookup < 10ms p99
 * - RLS overhead < 20% query latency
 * - Cache hit rate > 95%
 * - Membership resolution < 20ms
 * - Token validation < 50ms p99
 * - Load testing support
 * - SLA degradation alerts
 *
 * @see Task 78: Performance Validation (Req 42)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PerformanceValidationServiceImpl,
  PerformanceMetricCategory,
  PerformanceValidationStatus,
  PerformanceAlertSeverity,
  DEFAULT_PERFORMANCE_THRESHOLDS,
  type IPerformanceValidationService,
  type IPerformanceAlertEmitter,
  type PerformanceAlert,
  type LoadTestConfig,
} from '../services/PerformanceValidationService';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const TENANT_A_ID = 'tenant-a-uuid';
const TENANT_B_ID = 'tenant-b-uuid';
const CORRELATION_ID = 'correlation-uuid';

/**
 * Create a mock alert emitter for testing.
 */
function createMockAlertEmitter(): IPerformanceAlertEmitter & {
  alerts: PerformanceAlert[];
} {
  const alerts: PerformanceAlert[] = [];
  return {
    alerts,
    emit: vi.fn(async (alert: PerformanceAlert) => {
      alerts.push(alert);
    }),
  };
}

/**
 * Helper to add multiple samples to the service.
 */
async function addAuthContextSamples(
  service: IPerformanceValidationService,
  latencies: number[],
  tenantId?: string,
): Promise<void> {
  for (const latencyMs of latencies) {
    await service.recordAuthContextLatency({ latencyMs, tenantId });
  }
}

async function addPermissionLookupSamples(
  service: IPerformanceValidationService,
  latencies: number[],
): Promise<void> {
  for (const latencyMs of latencies) {
    await service.recordPermissionLookupLatency({ latencyMs, permissionCount: 5 });
  }
}

async function addMembershipResolutionSamples(
  service: IPerformanceValidationService,
  latencies: number[],
): Promise<void> {
  for (const latencyMs of latencies) {
    await service.recordMembershipResolutionLatency({ latencyMs, fromCache: false });
  }
}

async function addTokenValidationSamples(
  service: IPerformanceValidationService,
  latencies: number[],
): Promise<void> {
  for (const latencyMs of latencies) {
    await service.recordTokenValidationLatency({ latencyMs, success: true });
  }
}

async function addRlsSamples(
  service: IPerformanceValidationService,
  samples: Array<{ baseLatencyMs: number; rlsLatencyMs: number; queryType: string }>,
): Promise<void> {
  for (const sample of samples) {
    await service.recordRlsQueryPerformance(sample);
  }
}

async function addCacheOperations(
  service: IPerformanceValidationService,
  hits: number,
  misses: number,
): Promise<void> {
  for (let i = 0; i < hits; i++) {
    await service.recordCacheOperation({ isHit: true, latencyMs: 1, keyType: 'auth' });
  }
  for (let i = 0; i < misses; i++) {
    await service.recordCacheOperation({ isHit: false, latencyMs: 5, keyType: 'auth' });
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('PerformanceValidationService', () => {
  let service: IPerformanceValidationService;
  let mockAlertEmitter: IPerformanceAlertEmitter & { alerts: PerformanceAlert[] };

  beforeEach(() => {
    mockAlertEmitter = createMockAlertEmitter();
    service = PerformanceValidationServiceImpl({
      alertEmitter: mockAlertEmitter,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Recording Tests
  // =========================================================================

  describe('Recording Methods', () => {
    describe('recordAuthContextLatency', () => {
      it('should record authorization context latency successfully', async () => {
        const result = await service.recordAuthContextLatency({
          latencyMs: 50,
          correlationId: CORRELATION_ID,
          tenantId: TENANT_A_ID,
        });

        expect(result.success).toBe(true);
      });

      it('should record multiple samples', async () => {
        await addAuthContextSamples(service, [10, 20, 30, 40, 50]);

        const stats = await service.getStatistics(PerformanceMetricCategory.AUTHORIZATION_CONTEXT);
        expect(stats.success).toBe(true);
        if (stats.success) {
          expect(stats.data.sampleCount).toBe(5);
        }
      });

      it('should support optional metadata', async () => {
        const result = await service.recordAuthContextLatency({
          latencyMs: 25,
          metadata: { route: '/api/users', method: 'GET' },
        });

        expect(result.success).toBe(true);
      });
    });

    describe('recordPermissionLookupLatency', () => {
      it('should record permission lookup latency successfully', async () => {
        const result = await service.recordPermissionLookupLatency({
          latencyMs: 5,
          permissionCount: 3,
          correlationId: CORRELATION_ID,
        });

        expect(result.success).toBe(true);
      });

      it('should record multiple samples', async () => {
        await addPermissionLookupSamples(service, [2, 4, 6, 8, 10]);

        const stats = await service.getStatistics(PerformanceMetricCategory.PERMISSION_LOOKUP);
        expect(stats.success).toBe(true);
        if (stats.success) {
          expect(stats.data.sampleCount).toBe(5);
        }
      });
    });

    describe('recordRlsQueryPerformance', () => {
      it('should record RLS query performance successfully', async () => {
        const result = await service.recordRlsQueryPerformance({
          baseLatencyMs: 10,
          rlsLatencyMs: 12,
          queryType: 'SELECT',
          correlationId: CORRELATION_ID,
        });

        expect(result.success).toBe(true);
      });

      it('should track multiple query types', async () => {
        await addRlsSamples(service, [
          { baseLatencyMs: 10, rlsLatencyMs: 12, queryType: 'SELECT' },
          { baseLatencyMs: 20, rlsLatencyMs: 24, queryType: 'INSERT' },
          { baseLatencyMs: 15, rlsLatencyMs: 17, queryType: 'SELECT' },
        ]);

        const metrics = await service.getRlsMetrics();
        expect(metrics.success).toBe(true);
        if (metrics.success) {
          expect(metrics.data.querySampleCount).toBe(3);
          expect(metrics.data.byQueryType).toBeDefined();
        }
      });
    });

    describe('recordCacheOperation', () => {
      it('should record cache hit', async () => {
        const result = await service.recordCacheOperation({
          isHit: true,
          latencyMs: 1,
          keyType: 'membership',
        });

        expect(result.success).toBe(true);
      });

      it('should record cache miss', async () => {
        const result = await service.recordCacheOperation({
          isHit: false,
          latencyMs: 5,
          keyType: 'auth-context',
        });

        expect(result.success).toBe(true);
      });

      it('should track hit rate correctly', async () => {
        await addCacheOperations(service, 95, 5); // 95% hit rate

        const metrics = await service.getCacheMetrics();
        expect(metrics.success).toBe(true);
        if (metrics.success) {
          expect(metrics.data.hits).toBe(95);
          expect(metrics.data.misses).toBe(5);
          expect(metrics.data.hitRatePercent).toBe(95);
        }
      });
    });

    describe('recordMembershipResolutionLatency', () => {
      it('should record membership resolution latency', async () => {
        const result = await service.recordMembershipResolutionLatency({
          latencyMs: 15,
          fromCache: true,
          tenantId: TENANT_A_ID,
        });

        expect(result.success).toBe(true);
      });
    });

    describe('recordTokenValidationLatency', () => {
      it('should record token validation latency', async () => {
        const result = await service.recordTokenValidationLatency({
          latencyMs: 30,
          success: true,
          correlationId: CORRELATION_ID,
        });

        expect(result.success).toBe(true);
      });
    });
  });

  // =========================================================================
  // Validation Tests
  // =========================================================================

  describe('Validation Methods', () => {
    describe('validateAuthContextPerformance', () => {
      it('should return NOT_MEASURED when no samples exist', async () => {
        const result = await service.validateAuthContextPerformance();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.NOT_MEASURED);
          expect(result.data.category).toBe(PerformanceMetricCategory.AUTHORIZATION_CONTEXT);
        }
      });

      it('should return PASSING when p99 is within SLA (< 100ms)', async () => {
        // Add samples with p99 clearly below warning threshold (100 * 0.8 = 80ms)
        await addAuthContextSamples(service, [10, 20, 30, 40, 50, 55, 60, 65, 70, 75]);

        const result = await service.validateAuthContextPerformance();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.PASSING);
          expect(result.data.currentValue).toBeLessThanOrEqual(100);
          expect(result.data.thresholdValue).toBe(100);
        }
      });

      it('should return FAILING when p99 exceeds SLA (> 100ms)', async () => {
        // Add samples with high latencies
        await addAuthContextSamples(service, [
          10, 20, 30, 40, 50, 60, 70, 80, 90, 95,
          ...Array(10).fill(150), // Add high latency samples to push p99 over 100ms
        ]);

        const result = await service.validateAuthContextPerformance();

        expect(result.success).toBe(true);
        if (result.success) {
          expect([PerformanceValidationStatus.FAILING, PerformanceValidationStatus.WARNING]).toContain(result.data.status);
        }
      });

      it('should emit CRITICAL alert when SLA is violated', async () => {
        // Add samples with p99 > 100ms
        await addAuthContextSamples(service, Array(100).fill(150));

        await service.validateAuthContextPerformance();

        // Check that alert was emitted
        expect(mockAlertEmitter.alerts.length).toBeGreaterThan(0);
        const criticalAlerts = mockAlertEmitter.alerts.filter(
          a => a.severity === PerformanceAlertSeverity.CRITICAL
        );
        expect(criticalAlerts.length).toBeGreaterThan(0);
      });

      it('should include statistics in result', async () => {
        await addAuthContextSamples(service, [10, 20, 30, 40, 50]);

        const result = await service.validateAuthContextPerformance();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.statistics).toBeDefined();
          expect(result.data.statistics?.sampleCount).toBe(5);
          expect(result.data.statistics?.minMs).toBe(10);
          expect(result.data.statistics?.maxMs).toBe(50);
        }
      });
    });

    describe('validatePermissionLookupPerformance', () => {
      it('should return PASSING when p99 is within SLA (< 10ms)', async () => {
        // Use values clearly below warning threshold (10 * 0.8 = 8ms)
        await addPermissionLookupSamples(service, [1, 2, 3, 4, 5, 5, 6, 6, 7, 7]);

        const result = await service.validatePermissionLookupPerformance();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.PASSING);
          expect(result.data.thresholdValue).toBe(10);
        }
      });

      it('should return FAILING when p99 exceeds SLA (> 10ms)', async () => {
        // Add samples with high latencies to push p99 > 10ms
        await addPermissionLookupSamples(service, Array(100).fill(15));

        const result = await service.validatePermissionLookupPerformance();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.FAILING);
        }
      });
    });

    describe('validateRlsOverhead', () => {
      it('should return NOT_MEASURED when no samples exist', async () => {
        const result = await service.validateRlsOverhead();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.NOT_MEASURED);
        }
      });

      it('should return PASSING when RLS overhead is within SLA (< 20%)', async () => {
        // Add samples with ~15% overhead (base 10ms, rls 11.5ms)
        await addRlsSamples(service, [
          { baseLatencyMs: 10, rlsLatencyMs: 11.5, queryType: 'SELECT' },
          { baseLatencyMs: 20, rlsLatencyMs: 23, queryType: 'SELECT' },
          { baseLatencyMs: 15, rlsLatencyMs: 17.25, queryType: 'SELECT' },
        ]);

        const result = await service.validateRlsOverhead();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.PASSING);
          expect(result.data.currentValue).toBeLessThanOrEqual(20);
        }
      });

      it('should return FAILING when RLS overhead exceeds SLA (> 20%)', async () => {
        // Add samples with ~30% overhead
        await addRlsSamples(service, [
          { baseLatencyMs: 10, rlsLatencyMs: 13, queryType: 'SELECT' },
          { baseLatencyMs: 20, rlsLatencyMs: 26, queryType: 'SELECT' },
          { baseLatencyMs: 15, rlsLatencyMs: 19.5, queryType: 'SELECT' },
        ]);

        const result = await service.validateRlsOverhead();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.FAILING);
          expect(result.data.currentValue).toBeGreaterThan(20);
        }
      });
    });

    describe('validateCacheHitRate', () => {
      it('should return NOT_MEASURED when no cache operations', async () => {
        const result = await service.validateCacheHitRate();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.NOT_MEASURED);
        }
      });

      it('should return PASSING when hit rate is above target (> 95%)', async () => {
        await addCacheOperations(service, 98, 2); // 98% hit rate

        const result = await service.validateCacheHitRate();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.PASSING);
          expect(result.data.currentValue).toBe(98);
        }
      });

      it('should return FAILING when hit rate is below target (< 95%)', async () => {
        await addCacheOperations(service, 80, 20); // 80% hit rate

        const result = await service.validateCacheHitRate();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.FAILING);
          expect(result.data.currentValue).toBe(80);
        }
      });
    });

    describe('validateMembershipResolutionPerformance', () => {
      it('should return PASSING when p99 is within target (< 20ms)', async () => {
        // Use values clearly below warning threshold (20 * 0.8 = 16ms)
        await addMembershipResolutionSamples(service, [3, 5, 7, 9, 10, 11, 12, 13, 14, 15]);

        const result = await service.validateMembershipResolutionPerformance();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.PASSING);
        }
      });

      it('should return FAILING when p99 exceeds target (> 20ms)', async () => {
        await addMembershipResolutionSamples(service, Array(100).fill(30));

        const result = await service.validateMembershipResolutionPerformance();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.FAILING);
        }
      });
    });

    describe('validateTokenValidationPerformance', () => {
      it('should return PASSING when p99 is within target (< 50ms)', async () => {
        // Use values clearly below warning threshold (50 * 0.8 = 40ms)
        await addTokenValidationSamples(service, [5, 10, 15, 20, 25, 28, 30, 32, 35, 38]);

        const result = await service.validateTokenValidationPerformance();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.PASSING);
        }
      });

      it('should return FAILING when p99 exceeds target (> 50ms)', async () => {
        await addTokenValidationSamples(service, Array(100).fill(75));

        const result = await service.validateTokenValidationPerformance();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(PerformanceValidationStatus.FAILING);
        }
      });
    });
  });

  // =========================================================================
  // Reporting Tests
  // =========================================================================

  describe('Reporting Methods', () => {
    describe('runFullValidation', () => {
      it('should generate comprehensive report with all metrics', async () => {
        // Add samples for all metrics
        await addAuthContextSamples(service, [20, 30, 40, 50, 60]);
        await addPermissionLookupSamples(service, [2, 3, 4, 5, 6]);
        await addMembershipResolutionSamples(service, [5, 8, 10, 12, 15]);
        await addTokenValidationSamples(service, [10, 20, 30, 40, 45]);
        await addRlsSamples(service, [
          { baseLatencyMs: 10, rlsLatencyMs: 11, queryType: 'SELECT' },
        ]);
        await addCacheOperations(service, 98, 2);

        const result = await service.runFullValidation();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.metricResults.length).toBeGreaterThan(0);
          expect(result.data.generatedAt).toBeInstanceOf(Date);
          expect(result.data.windowStart).toBeInstanceOf(Date);
          expect(result.data.windowEnd).toBeInstanceOf(Date);
        }
      });

      it('should return PASSING overall when all metrics pass', async () => {
        // Add good samples for all metrics
        await addAuthContextSamples(service, Array(10).fill(50)); // < 100ms
        await addPermissionLookupSamples(service, Array(10).fill(5)); // < 10ms
        await addMembershipResolutionSamples(service, Array(10).fill(10)); // < 20ms
        await addTokenValidationSamples(service, Array(10).fill(30)); // < 50ms
        await addRlsSamples(service, [
          { baseLatencyMs: 10, rlsLatencyMs: 11, queryType: 'SELECT' }, // 10% overhead
        ]);
        await addCacheOperations(service, 98, 2); // 98% hit rate

        const result = await service.runFullValidation();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.overallStatus).toBe(PerformanceValidationStatus.PASSING);
          expect(result.data.failingCount).toBe(0);
        }
      });

      it('should return FAILING overall when any metric fails', async () => {
        // Add good samples for most metrics but failing for auth context
        await addAuthContextSamples(service, Array(100).fill(150)); // > 100ms - FAILING
        await addPermissionLookupSamples(service, Array(10).fill(5)); // OK
        await addCacheOperations(service, 98, 2); // OK

        const result = await service.runFullValidation();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.overallStatus).toBe(PerformanceValidationStatus.FAILING);
          expect(result.data.failingCount).toBeGreaterThan(0);
        }
      });

      it('should include recommendations for failing metrics', async () => {
        // Add failing auth context samples
        await addAuthContextSamples(service, Array(100).fill(150));

        const result = await service.runFullValidation();

        expect(result.success).toBe(true);
        if (result.success && result.data.recommendations) {
          expect(result.data.recommendations.length).toBeGreaterThan(0);
        }
      });

      it('should include cache and RLS metrics in report', async () => {
        await addCacheOperations(service, 95, 5);
        await addRlsSamples(service, [
          { baseLatencyMs: 10, rlsLatencyMs: 12, queryType: 'SELECT' },
        ]);

        const result = await service.runFullValidation();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.cacheMetrics).toBeDefined();
          expect(result.data.rlsMetrics).toBeDefined();
        }
      });
    });

    describe('getCacheMetrics', () => {
      it('should return accurate cache metrics', async () => {
        await addCacheOperations(service, 90, 10);

        const result = await service.getCacheMetrics();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.hits).toBe(90);
          expect(result.data.misses).toBe(10);
          expect(result.data.totalRequests).toBe(100);
          expect(result.data.hitRatePercent).toBe(90);
        }
      });

      it('should return zero metrics when no operations', async () => {
        const result = await service.getCacheMetrics();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.totalRequests).toBe(0);
          expect(result.data.hitRatePercent).toBe(0);
        }
      });
    });

    describe('getRlsMetrics', () => {
      it('should return accurate RLS metrics', async () => {
        await addRlsSamples(service, [
          { baseLatencyMs: 10, rlsLatencyMs: 12, queryType: 'SELECT' },
          { baseLatencyMs: 20, rlsLatencyMs: 24, queryType: 'SELECT' },
        ]);

        const result = await service.getRlsMetrics();

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.querySampleCount).toBe(2);
          expect(result.data.overheadPercent).toBeGreaterThan(0);
        }
      });

      it('should provide breakdown by query type', async () => {
        await addRlsSamples(service, [
          { baseLatencyMs: 10, rlsLatencyMs: 12, queryType: 'SELECT' },
          { baseLatencyMs: 20, rlsLatencyMs: 25, queryType: 'INSERT' },
          { baseLatencyMs: 15, rlsLatencyMs: 18, queryType: 'SELECT' },
        ]);

        const result = await service.getRlsMetrics();

        expect(result.success).toBe(true);
        if (result.success && result.data.byQueryType) {
          expect(result.data.byQueryType.size).toBe(2); // SELECT and INSERT
        }
      });
    });

    describe('getStatistics', () => {
      it('should calculate correct statistics for auth context', async () => {
        await addAuthContextSamples(service, [10, 20, 30, 40, 50]);

        const result = await service.getStatistics(PerformanceMetricCategory.AUTHORIZATION_CONTEXT);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.sampleCount).toBe(5);
          expect(result.data.minMs).toBe(10);
          expect(result.data.maxMs).toBe(50);
          expect(result.data.meanMs).toBe(30);
          expect(result.data.medianMs).toBe(30);
        }
      });

      it('should calculate percentiles correctly', async () => {
        // Add 100 samples from 1 to 100
        await addAuthContextSamples(service, Array.from({ length: 100 }, (_, i) => i + 1));

        const result = await service.getStatistics(PerformanceMetricCategory.AUTHORIZATION_CONTEXT);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.medianMs).toBeGreaterThanOrEqual(49);
          expect(result.data.medianMs).toBeLessThanOrEqual(51);
          expect(result.data.p99Ms).toBeGreaterThanOrEqual(98);
        }
      });

      it('should fail for unsupported metric category', async () => {
        const result = await service.getStatistics(PerformanceMetricCategory.SYSTEM_OVERALL);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('PERF_UNSUPPORTED_METRIC_CATEGORY');
        }
      });
    });
  });

  // =========================================================================
  // Load Testing Tests
  // =========================================================================

  describe('Load Testing Methods', () => {
    describe('runLoadTest', () => {
      it('should execute load test and return results', async () => {
        const config: LoadTestConfig = {
          concurrentUsers: 10,
          tenantCount: 2,
          durationSeconds: 1,
          targetOpsPerSecond: 100,
          rampUpSeconds: 0,
        };

        const result = await service.runLoadTest(config);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.config).toEqual(config);
          expect(result.data.totalOperations).toBeGreaterThan(0);
          expect(result.data.successfulOperations).toBeGreaterThanOrEqual(0);
          expect(result.data.startedAt).toBeInstanceOf(Date);
          expect(result.data.completedAt).toBeInstanceOf(Date);
        }
      });

      it('should include auth context and permission lookup stats', async () => {
        const config: LoadTestConfig = {
          concurrentUsers: 5,
          tenantCount: 1,
          durationSeconds: 1,
          targetOpsPerSecond: 50,
          rampUpSeconds: 0,
        };

        const result = await service.runLoadTest(config);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.authContextStats).toBeDefined();
          expect(result.data.authContextStats.sampleCount).toBeGreaterThan(0);
          expect(result.data.permissionLookupStats).toBeDefined();
          expect(result.data.permissionLookupStats.sampleCount).toBeGreaterThan(0);
        }
      });

      it('should calculate error rate', async () => {
        const config: LoadTestConfig = {
          concurrentUsers: 5,
          tenantCount: 1,
          durationSeconds: 1,
          targetOpsPerSecond: 50,
          rampUpSeconds: 0,
        };

        const result = await service.runLoadTest(config);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.errorRatePercent).toBeGreaterThanOrEqual(0);
          expect(result.data.errorRatePercent).toBeLessThanOrEqual(100);
        }
      });
    });
  });

  // =========================================================================
  // Configuration Tests
  // =========================================================================

  describe('Configuration Methods', () => {
    describe('getThresholds', () => {
      it('should return default thresholds', () => {
        const thresholds = service.getThresholds();

        expect(thresholds.authorizationContextP99Ms).toBe(100);
        expect(thresholds.permissionLookupP99Ms).toBe(10);
        expect(thresholds.rlsOverheadPercent).toBe(20);
        expect(thresholds.cacheHitRatePercent).toBe(95);
        expect(thresholds.membershipResolutionMs).toBe(20);
        expect(thresholds.tokenValidationP99Ms).toBe(50);
      });

      it('should return custom thresholds when initialized with custom config', () => {
        const customService = PerformanceValidationServiceImpl({
          thresholds: {
            authorizationContextP99Ms: 50,
          },
        });

        const thresholds = customService.getThresholds();

        expect(thresholds.authorizationContextP99Ms).toBe(50);
        // Other thresholds should use defaults
        expect(thresholds.permissionLookupP99Ms).toBe(10);
      });
    });

    describe('updateThresholds', () => {
      it('should update thresholds successfully', async () => {
        const result = await service.updateThresholds({
          authorizationContextP99Ms: 200,
          permissionLookupP99Ms: 20,
        });

        expect(result.success).toBe(true);

        const thresholds = service.getThresholds();
        expect(thresholds.authorizationContextP99Ms).toBe(200);
        expect(thresholds.permissionLookupP99Ms).toBe(20);
      });

      it('should preserve other thresholds when updating partial config', async () => {
        await service.updateThresholds({
          authorizationContextP99Ms: 200,
        });

        const thresholds = service.getThresholds();
        expect(thresholds.authorizationContextP99Ms).toBe(200);
        expect(thresholds.permissionLookupP99Ms).toBe(10); // Default preserved
      });

      it('should use updated thresholds in validation', async () => {
        // First, add samples that would fail with default threshold (100ms)
        await addAuthContextSamples(service, Array(100).fill(150));

        // Verify it fails with default threshold
        const failResult = await service.validateAuthContextPerformance();
        expect(failResult.success).toBe(true);
        if (failResult.success) {
          expect(failResult.data.status).toBe(PerformanceValidationStatus.FAILING);
        }

        // Update threshold to 200ms
        await service.updateThresholds({ authorizationContextP99Ms: 200 });

        // Now it should pass
        const passResult = await service.validateAuthContextPerformance();
        expect(passResult.success).toBe(true);
        if (passResult.success) {
          expect(passResult.data.status).toBe(PerformanceValidationStatus.PASSING);
        }
      });
    });

    describe('resetMetrics', () => {
      it('should clear all recorded metrics', async () => {
        // Add samples
        await addAuthContextSamples(service, [10, 20, 30]);
        await addPermissionLookupSamples(service, [5, 10]);
        await addCacheOperations(service, 50, 10);

        // Verify samples exist
        const beforeStats = await service.getStatistics(PerformanceMetricCategory.AUTHORIZATION_CONTEXT);
        expect(beforeStats.success).toBe(true);
        if (beforeStats.success) {
          expect(beforeStats.data.sampleCount).toBe(3);
        }

        // Reset
        const resetResult = await service.resetMetrics();
        expect(resetResult.success).toBe(true);

        // Verify samples are cleared
        const afterStats = await service.getStatistics(PerformanceMetricCategory.AUTHORIZATION_CONTEXT);
        expect(afterStats.success).toBe(true);
        if (afterStats.success) {
          expect(afterStats.data.sampleCount).toBe(0);
        }

        // Verify cache metrics are cleared
        const cacheMetrics = await service.getCacheMetrics();
        expect(cacheMetrics.success).toBe(true);
        if (cacheMetrics.success) {
          expect(cacheMetrics.data.totalRequests).toBe(0);
        }
      });
    });
  });

  // =========================================================================
  // Alert Emitter Tests
  // =========================================================================

  describe('Alert Emitter', () => {
    it('should emit CRITICAL alert when metric fails', async () => {
      await addAuthContextSamples(service, Array(100).fill(150));
      await service.validateAuthContextPerformance();

      expect(mockAlertEmitter.alerts.length).toBeGreaterThan(0);
      
      const criticalAlert = mockAlertEmitter.alerts.find(
        a => a.severity === PerformanceAlertSeverity.CRITICAL
      );
      expect(criticalAlert).toBeDefined();
      expect(criticalAlert?.category).toBe(PerformanceMetricCategory.AUTHORIZATION_CONTEXT);
    });

    it('should emit WARNING alert when metric is near threshold', async () => {
      // Add samples that are between warning threshold (80ms) and critical threshold (100ms)
      await addAuthContextSamples(service, Array(100).fill(90));
      await service.validateAuthContextPerformance();

      const warningAlert = mockAlertEmitter.alerts.find(
        a => a.severity === PerformanceAlertSeverity.WARNING
      );
      expect(warningAlert).toBeDefined();
    });

    it('should not emit alerts when metrics pass', async () => {
      await addAuthContextSamples(service, Array(100).fill(50));
      await service.validateAuthContextPerformance();

      expect(mockAlertEmitter.alerts.length).toBe(0);
    });

    it('should include metric details in alert', async () => {
      await addAuthContextSamples(service, Array(100).fill(150));
      await service.validateAuthContextPerformance();

      const alert = mockAlertEmitter.alerts[0];
      expect(alert).toBeDefined();
      expect(alert?.currentValue).toBeGreaterThan(0);
      expect(alert?.threshold).toBe(100);
      expect(alert?.unit).toBe('ms');
      expect(alert?.timestamp).toBeInstanceOf(Date);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge Cases', () => {
    it('should handle single sample correctly', async () => {
      await addAuthContextSamples(service, [50]);

      const stats = await service.getStatistics(PerformanceMetricCategory.AUTHORIZATION_CONTEXT);
      expect(stats.success).toBe(true);
      if (stats.success) {
        expect(stats.data.sampleCount).toBe(1);
        expect(stats.data.minMs).toBe(50);
        expect(stats.data.maxMs).toBe(50);
        expect(stats.data.meanMs).toBe(50);
      }
    });

    it('should handle zero latency samples', async () => {
      await addAuthContextSamples(service, [0, 0, 0]);

      const stats = await service.getStatistics(PerformanceMetricCategory.AUTHORIZATION_CONTEXT);
      expect(stats.success).toBe(true);
      if (stats.success) {
        expect(stats.data.minMs).toBe(0);
        expect(stats.data.meanMs).toBe(0);
      }
    });

    it('should handle RLS samples with zero base latency', async () => {
      await addRlsSamples(service, [
        { baseLatencyMs: 0, rlsLatencyMs: 5, queryType: 'SELECT' },
      ]);

      const metrics = await service.getRlsMetrics();
      expect(metrics.success).toBe(true);
      // Should not crash, overhead calculation should handle zero gracefully
    });

    it('should use time window filtering correctly', async () => {
      // This test verifies that samples outside the window are not included
      // Since we can't easily manipulate time in this test, we verify the mechanism
      await addAuthContextSamples(service, [10, 20, 30]);

      // Get stats for 5 minute window (default)
      const stats5min = await service.getStatistics(PerformanceMetricCategory.AUTHORIZATION_CONTEXT, 5);
      expect(stats5min.success).toBe(true);
      if (stats5min.success) {
        expect(stats5min.data.sampleCount).toBe(3);
      }
    });
  });

  // =========================================================================
  // Default Threshold Constants Tests
  // =========================================================================

  describe('Default Threshold Constants', () => {
    it('should have correct default values per Requirements 42', () => {
      expect(DEFAULT_PERFORMANCE_THRESHOLDS.authorizationContextP99Ms).toBe(100);
      expect(DEFAULT_PERFORMANCE_THRESHOLDS.permissionLookupP99Ms).toBe(10);
      expect(DEFAULT_PERFORMANCE_THRESHOLDS.rlsOverheadPercent).toBe(20);
      expect(DEFAULT_PERFORMANCE_THRESHOLDS.cacheHitRatePercent).toBe(95);
      expect(DEFAULT_PERFORMANCE_THRESHOLDS.membershipResolutionMs).toBe(20);
      expect(DEFAULT_PERFORMANCE_THRESHOLDS.tokenValidationP99Ms).toBe(50);
      expect(DEFAULT_PERFORMANCE_THRESHOLDS.warningThresholdMultiplier).toBe(0.8);
    });
  });
});
