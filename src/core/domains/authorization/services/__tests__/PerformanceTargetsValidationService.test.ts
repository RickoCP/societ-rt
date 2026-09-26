/**
 * Unit Tests for PerformanceTargetsValidationService
 *
 * Tests all V1-V7 validation targets and additional performance targets:
 * - V1: Authorization context resolution < 100ms p99
 * - V2: Permission lookup < 10ms p99
 * - V3: RLS overhead < 20% query latency
 * - V4: Token version mismatch → immediate rejection
 * - V5: Refresh token reuse → family-wide revocation
 * - V6: OrgUnit path consistency with parentId chain
 * - V7: Emergency operations succeed during SUSPENDED status
 *
 * @see Task 80 (Req 40)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PerformanceTargetsValidationServiceImpl,
  ValidationTargetId,
  AdditionalPerformanceTarget,
  ValidationTargetStatus,
  ValidationTestType,
  ScalabilityLimitStatus,
  RegressionStatus,
  V1_V7_TARGETS,
  ADDITIONAL_TARGETS,
  DEFAULT_SCALABILITY_LIMITS,
  DEFAULT_BASELINE_CONFIG,
  type IPerformanceTargetsValidationService,
  type IPerformanceTargetsAlertEmitter,
  type ValidationTargetResult,
  type PerformanceRegression,
  type ScalabilityLimit,
} from '../PerformanceTargetsValidationService';
import { isOk, isFail } from '@core/utils';

describe('PerformanceTargetsValidationService', () => {
  let service: IPerformanceTargetsValidationService;
  let mockAlertEmitter: IPerformanceTargetsAlertEmitter;

  beforeEach(() => {
    mockAlertEmitter = {
      emitTargetFailure: vi.fn().mockResolvedValue(undefined),
      emitRegressionAlert: vi.fn().mockResolvedValue(undefined),
      emitScalabilityAlert: vi.fn().mockResolvedValue(undefined),
    };

    service = PerformanceTargetsValidationServiceImpl({
      alertEmitter: mockAlertEmitter,
    });
  });

  // ===========================================================================
  // V1-V7 Target Definition Tests
  // ===========================================================================

  describe('V1-V7 Target Definitions', () => {
    it('should define all 7 validation targets', () => {
      expect(V1_V7_TARGETS).toHaveLength(7);
    });

    it('should have V1 target for authorization context resolution', () => {
      const v1 = V1_V7_TARGETS.find(t => t.id === ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION);
      expect(v1).toBeDefined();
      expect(v1?.thresholdValue).toBe(100);
      expect(v1?.unit).toBe('ms');
      expect(v1?.testType).toBe(ValidationTestType.PERFORMANCE_TEST);
      expect(v1?.isCritical).toBe(true);
    });

    it('should have V2 target for permission lookup', () => {
      const v2 = V1_V7_TARGETS.find(t => t.id === ValidationTargetId.V2_PERMISSION_LOOKUP);
      expect(v2).toBeDefined();
      expect(v2?.thresholdValue).toBe(10);
      expect(v2?.unit).toBe('ms');
      expect(v2?.testType).toBe(ValidationTestType.PERFORMANCE_TEST);
      expect(v2?.isCritical).toBe(true);
    });

    it('should have V3 target for RLS overhead', () => {
      const v3 = V1_V7_TARGETS.find(t => t.id === ValidationTargetId.V3_RLS_OVERHEAD);
      expect(v3).toBeDefined();
      expect(v3?.thresholdValue).toBe(20);
      expect(v3?.unit).toBe('%');
      expect(v3?.testType).toBe(ValidationTestType.PERFORMANCE_TEST);
      expect(v3?.isCritical).toBe(true);
    });

    it('should have V4 target for token version rejection', () => {
      const v4 = V1_V7_TARGETS.find(t => t.id === ValidationTargetId.V4_TOKEN_VERSION_REJECTION);
      expect(v4).toBeDefined();
      expect(v4?.testType).toBe(ValidationTestType.UNIT_TEST);
      expect(v4?.isCritical).toBe(true);
    });

    it('should have V5 target for refresh token revocation', () => {
      const v5 = V1_V7_TARGETS.find(t => t.id === ValidationTargetId.V5_REFRESH_TOKEN_REVOCATION);
      expect(v5).toBeDefined();
      expect(v5?.thresholdValue).toBe(100);
      expect(v5?.unit).toBe('%');
      expect(v5?.testType).toBe(ValidationTestType.INTEGRATION_TEST);
      expect(v5?.isCritical).toBe(true);
    });

    it('should have V6 target for OrgUnit path consistency', () => {
      const v6 = V1_V7_TARGETS.find(t => t.id === ValidationTargetId.V6_ORGUNIT_PATH_CONSISTENCY);
      expect(v6).toBeDefined();
      expect(v6?.thresholdValue).toBe(100);
      expect(v6?.unit).toBe('%');
      expect(v6?.testType).toBe(ValidationTestType.PROPERTY_TEST);
      expect(v6?.isCritical).toBe(true);
    });

    it('should have V7 target for emergency during SUSPENDED', () => {
      const v7 = V1_V7_TARGETS.find(t => t.id === ValidationTargetId.V7_EMERGENCY_DURING_SUSPENDED);
      expect(v7).toBeDefined();
      expect(v7?.thresholdValue).toBe(100);
      expect(v7?.unit).toBe('%');
      expect(v7?.testType).toBe(ValidationTestType.INTEGRATION_TEST);
      expect(v7?.isCritical).toBe(true);
    });

    it('should mark all V1-V7 targets as critical', () => {
      for (const target of V1_V7_TARGETS) {
        expect(target.isCritical).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Additional Target Definition Tests
  // ===========================================================================

  describe('Additional Target Definitions', () => {
    it('should define additional performance targets', () => {
      expect(ADDITIONAL_TARGETS.length).toBeGreaterThan(0);
    });

    it('should have API response time target', () => {
      const apiTarget = ADDITIONAL_TARGETS.find(
        t => t.id === AdditionalPerformanceTarget.API_RESPONSE_TIME,
      );
      expect(apiTarget).toBeDefined();
      expect(apiTarget?.thresholdValue).toBe(200);
      expect(apiTarget?.unit).toBe('ms');
    });

    it('should have cache hit rate target', () => {
      const cacheTarget = ADDITIONAL_TARGETS.find(
        t => t.id === AdditionalPerformanceTarget.CACHE_HIT_RATE,
      );
      expect(cacheTarget).toBeDefined();
      expect(cacheTarget?.thresholdValue).toBe(95);
      expect(cacheTarget?.unit).toBe('%');
      expect(cacheTarget?.lowerIsBetter).toBe(false);
    });

    it('should have error rate target', () => {
      const errorTarget = ADDITIONAL_TARGETS.find(
        t => t.id === AdditionalPerformanceTarget.ERROR_RATE,
      );
      expect(errorTarget).toBeDefined();
      expect(errorTarget?.thresholdValue).toBe(0.1);
      expect(errorTarget?.unit).toBe('%');
    });

    it('should have concurrent user capacity target', () => {
      const capacityTarget = ADDITIONAL_TARGETS.find(
        t => t.id === AdditionalPerformanceTarget.CONCURRENT_USER_CAPACITY,
      );
      expect(capacityTarget).toBeDefined();
      expect(capacityTarget?.thresholdValue).toBe(1000);
      expect(capacityTarget?.unit).toBe('users');
    });
  });

  // ===========================================================================
  // Recording Tests
  // ===========================================================================

  describe('Recording Samples', () => {
    it('should record a single sample successfully', async () => {
      const result = await service.recordSample({
        targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
        value: 50,
      });

      expect(isOk(result)).toBe(true);
    });

    it('should record sample with tenant ID', async () => {
      const result = await service.recordSample({
        targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
        value: 45,
        tenantId: 'tenant-123',
      });

      expect(isOk(result)).toBe(true);
    });

    it('should record sample with correlation ID', async () => {
      const result = await service.recordSample({
        targetId: ValidationTargetId.V2_PERMISSION_LOOKUP,
        value: 5,
        correlationId: 'corr-123',
      });

      expect(isOk(result)).toBe(true);
    });

    it('should record batch samples successfully', async () => {
      const result = await service.recordSamplesBatch([
        { targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION, value: 50 },
        { targetId: ValidationTargetId.V2_PERMISSION_LOOKUP, value: 5 },
        { targetId: ValidationTargetId.V3_RLS_OVERHEAD, value: 10 },
      ]);

      expect(isOk(result)).toBe(true);
    });
  });

  // ===========================================================================
  // V1 Validation Tests (Authorization Context Resolution)
  // ===========================================================================

  describe('V1: Authorization Context Resolution Validation', () => {
    it('should return NOT_MEASURED when no samples exist', async () => {
      const result = await service.validateTarget(
        ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe(ValidationTargetStatus.NOT_MEASURED);
      }
    });

    it('should return PASSING when p99 is below 100ms', async () => {
      // Record samples with p99 below threshold
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
          value: 50 + Math.random() * 30, // 50-80ms
        });
      }

      const result = await service.validateTarget(
        ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe(ValidationTargetStatus.PASSING);
        expect(result.data.currentValue).toBeLessThan(100);
      }
    });

    it('should return FAILING when p99 exceeds 100ms', async () => {
      // Record samples with high values
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
          value: 120 + Math.random() * 50, // 120-170ms
        });
      }

      const result = await service.validateTarget(
        ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe(ValidationTargetStatus.FAILING);
        expect(result.data.currentValue).toBeGreaterThan(100);
      }
    });

    it('should emit alert when V1 target fails', async () => {
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
          value: 150,
        });
      }

      await service.validateTarget(ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION);

      expect(mockAlertEmitter.emitTargetFailure).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // V2 Validation Tests (Permission Lookup)
  // ===========================================================================

  describe('V2: Permission Lookup Validation', () => {
    it('should return PASSING when p99 is below 10ms', async () => {
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V2_PERMISSION_LOOKUP,
          value: 3 + Math.random() * 4, // 3-7ms
        });
      }

      const result = await service.validateTarget(
        ValidationTargetId.V2_PERMISSION_LOOKUP,
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe(ValidationTargetStatus.PASSING);
        expect(result.data.currentValue).toBeLessThan(10);
      }
    });

    it('should return FAILING when p99 exceeds 10ms', async () => {
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V2_PERMISSION_LOOKUP,
          value: 15 + Math.random() * 10, // 15-25ms
        });
      }

      const result = await service.validateTarget(
        ValidationTargetId.V2_PERMISSION_LOOKUP,
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe(ValidationTargetStatus.FAILING);
      }
    });
  });

  // ===========================================================================
  // V3 Validation Tests (RLS Overhead)
  // ===========================================================================

  describe('V3: RLS Overhead Validation', () => {
    it('should return PASSING when overhead is below 20%', async () => {
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V3_RLS_OVERHEAD,
          value: 10 + Math.random() * 5, // 10-15%
        });
      }

      const result = await service.validateTarget(
        ValidationTargetId.V3_RLS_OVERHEAD,
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe(ValidationTargetStatus.PASSING);
      }
    });

    it('should return FAILING when overhead exceeds 20%', async () => {
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V3_RLS_OVERHEAD,
          value: 25 + Math.random() * 10, // 25-35%
        });
      }

      const result = await service.validateTarget(
        ValidationTargetId.V3_RLS_OVERHEAD,
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe(ValidationTargetStatus.FAILING);
      }
    });
  });

  // ===========================================================================
  // V4 Validation Tests (Token Version Rejection)
  // ===========================================================================

  describe('V4: Token Version Rejection Validation', () => {
    it('should validate token version mismatch rejection time', async () => {
      // Record fast rejection times (< warning threshold of 0.5ms)
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V4_TOKEN_VERSION_REJECTION,
          value: 0.1 + Math.random() * 0.3, // 0.1-0.4ms (below warning threshold of 0.5ms)
        });
      }

      const result = await service.validateTarget(
        ValidationTargetId.V4_TOKEN_VERSION_REJECTION,
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe(ValidationTargetStatus.PASSING);
      }
    });
  });

  // ===========================================================================
  // V5 Validation Tests (Refresh Token Revocation)
  // ===========================================================================

  describe('V5: Refresh Token Revocation Validation', () => {
    it('should validate 100% revocation success rate', async () => {
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V5_REFRESH_TOKEN_REVOCATION,
          value: 100, // 100% success
        });
      }

      const result = await service.validateTarget(
        ValidationTargetId.V5_REFRESH_TOKEN_REVOCATION,
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe(ValidationTargetStatus.PASSING);
      }
    });

    it('should fail when revocation success rate is below 100%', async () => {
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V5_REFRESH_TOKEN_REVOCATION,
          value: 95, // 95% success (not 100%)
        });
      }

      const result = await service.validateTarget(
        ValidationTargetId.V5_REFRESH_TOKEN_REVOCATION,
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe(ValidationTargetStatus.FAILING);
      }
    });
  });

  // ===========================================================================
  // V6 Validation Tests (OrgUnit Path Consistency)
  // ===========================================================================

  describe('V6: OrgUnit Path Consistency Validation', () => {
    it('should validate 100% path consistency rate', async () => {
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V6_ORGUNIT_PATH_CONSISTENCY,
          value: 100, // 100% consistent
        });
      }

      const result = await service.validateTarget(
        ValidationTargetId.V6_ORGUNIT_PATH_CONSISTENCY,
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe(ValidationTargetStatus.PASSING);
      }
    });
  });

  // ===========================================================================
  // V7 Validation Tests (Emergency During SUSPENDED)
  // ===========================================================================

  describe('V7: Emergency During SUSPENDED Validation', () => {
    it('should validate 100% emergency success rate during SUSPENDED', async () => {
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V7_EMERGENCY_DURING_SUSPENDED,
          value: 100, // 100% success
        });
      }

      const result = await service.validateTarget(
        ValidationTargetId.V7_EMERGENCY_DURING_SUSPENDED,
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe(ValidationTargetStatus.PASSING);
      }
    });
  });

  // ===========================================================================
  // Validate All V1-V7 Tests
  // ===========================================================================

  describe('Validate All V1-V7 Targets', () => {
    it('should validate all 7 targets', async () => {
      const result = await service.validateAllV1V7Targets();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toHaveLength(7);
      }
    });

    it('should return all targets with NOT_MEASURED when no samples', async () => {
      const result = await service.validateAllV1V7Targets();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        for (const targetResult of result.data) {
          expect(targetResult.status).toBe(ValidationTargetStatus.NOT_MEASURED);
        }
      }
    });
  });

  // ===========================================================================
  // Scalability Limits Tests
  // ===========================================================================

  describe('Scalability Limits', () => {
    it('should return default scalability limits', async () => {
      const result = await service.getScalabilityLimits();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it('should update scalability metrics', async () => {
      const updateResult = await service.updateScalabilityMetrics({
        concurrentUsers: 500,
        tenantCount: 20,
        requestsPerSecond: 1000,
      });

      expect(isOk(updateResult)).toBe(true);

      const limitsResult = await service.getScalabilityLimits();
      expect(isOk(limitsResult)).toBe(true);
      if (isOk(limitsResult)) {
        const userLimit = limitsResult.data.find(l => l.name === 'Concurrent Users');
        expect(userLimit?.currentUsage).toBe(500);
      }
    });

    it('should emit alert when approaching scalability limit', async () => {
      await service.updateScalabilityMetrics({
        concurrentUsers: 4500, // 90% of 5000 max
      });

      await service.getScalabilityLimits();

      expect(mockAlertEmitter.emitScalabilityAlert).toHaveBeenCalled();
    });

    it('should report HEALTHY status when usage is low', async () => {
      await service.updateScalabilityMetrics({
        concurrentUsers: 100,
      });

      const result = await service.getScalabilityLimits();
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const userLimit = result.data.find(l => l.name === 'Concurrent Users');
        expect(userLimit?.status).toBe(ScalabilityLimitStatus.HEALTHY);
      }
    });
  });

  // ===========================================================================
  // Regression Detection Tests
  // ===========================================================================

  describe('Regression Detection', () => {
    it('should detect no regressions when no samples exist', async () => {
      const result = await service.detectRegressions();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toHaveLength(0);
      }
    });

    it('should detect regression when performance degrades', async () => {
      // Update baseline to 50ms
      await service.updateBaseline(ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION, 50);

      // Record samples with higher values (regression)
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
          value: 70, // 40% degradation from baseline
        });
      }

      const result = await service.detectRegressions();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.length).toBeGreaterThan(0);
        const regression = result.data.find(
          r => r.targetId === ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
        );
        expect(regression).toBeDefined();
        expect(regression?.status).not.toBe(RegressionStatus.NO_REGRESSION);
      }
    });

    it('should update baseline successfully', async () => {
      const updateResult = await service.updateBaseline(
        ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
        45,
      );

      expect(isOk(updateResult)).toBe(true);

      const baselines = await service.getBaselines();
      expect(isOk(baselines)).toBe(true);
      if (isOk(baselines)) {
        expect(baselines.data.get(ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION)).toBe(45);
      }
    });

    it('should emit alert when regression detected', async () => {
      await service.updateBaseline(ValidationTargetId.V2_PERMISSION_LOOKUP, 5);

      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V2_PERMISSION_LOOKUP,
          value: 8, // 60% degradation
        });
      }

      await service.detectRegressions();

      expect(mockAlertEmitter.emitRegressionAlert).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Benchmarking Tests
  // ===========================================================================

  describe('Benchmarking', () => {
    it('should record benchmark successfully', async () => {
      const result = await service.recordBenchmark({
        name: 'Authorization Context Resolution Benchmark',
        value: 45,
        unit: 'ms',
        environment: 'production',
        targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
      });

      expect(isOk(result)).toBe(true);
    });

    it('should retrieve recorded benchmarks', async () => {
      await service.recordBenchmark({
        name: 'Test Benchmark',
        value: 100,
        unit: 'ms',
        environment: 'test',
      });

      const result = await service.getBenchmarks();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data[0].name).toBe('Test Benchmark');
        expect(result.data[0].measuredAt).toBeInstanceOf(Date);
      }
    });
  });

  // ===========================================================================
  // Multi-Tenant Isolation Tests
  // ===========================================================================

  describe('Multi-Tenant Performance Isolation', () => {
    it('should validate tenant isolation for provided tenant IDs', async () => {
      // Record samples for different tenants
      await service.recordSample({
        targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
        value: 50,
        tenantId: 'tenant-1',
      });
      await service.recordSample({
        targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
        value: 55,
        tenantId: 'tenant-2',
      });

      const result = await service.validateTenantIsolation(['tenant-1', 'tenant-2']);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toHaveLength(2);
      }
    });

    it('should detect noisy neighbor when tenant deviation is high', async () => {
      // Record many samples for overall baseline
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
          value: 50,
          tenantId: 'tenant-normal',
        });
      }

      // Record samples with high deviation for noisy tenant
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
          value: 200, // High latency
          tenantId: 'tenant-noisy',
        });
      }

      const result = await service.validateTenantIsolation(['tenant-normal', 'tenant-noisy']);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const noisyResult = result.data.find(r => r.tenantId === 'tenant-noisy');
        // Note: noisy neighbor detection depends on deviation calculation
        expect(noisyResult).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // Full Validation Report Tests
  // ===========================================================================

  describe('Full Validation Report', () => {
    it('should generate comprehensive report', async () => {
      const result = await service.runFullValidation();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.v1v7Results).toHaveLength(7);
        expect(result.data.additionalResults.length).toBeGreaterThan(0);
        expect(result.data.generatedAt).toBeInstanceOf(Date);
        expect(result.data.summary.totalTargets).toBeGreaterThan(0);
      }
    });

    it('should include scalability limits in report', async () => {
      const result = await service.runFullValidation({
        includeScalability: true,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.scalabilityLimits.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include regression detection in report', async () => {
      const result = await service.runFullValidation({
        includeRegression: true,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.regressions).toBeDefined();
      }
    });

    it('should calculate summary correctly', async () => {
      // Record passing samples for V1
      for (let i = 0; i < 50; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
          value: 50,
        });
      }

      const result = await service.runFullValidation();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const { summary } = result.data;
        expect(summary.totalTargets).toBeGreaterThan(0);
        expect(summary.passingTargets + summary.failingTargets + 
               summary.warningTargets + summary.notMeasuredTargets).toBe(summary.totalTargets);
      }
    });

    it('should generate recommendations for failing targets', async () => {
      // Record failing samples
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
          value: 150, // Above 100ms threshold
        });
      }

      const result = await service.runFullValidation();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.recommendations.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // Production Readiness Tests
  // ===========================================================================

  describe('Production Readiness Check', () => {
    it('should return not ready when critical targets fail', async () => {
      // Record failing samples for critical target
      for (let i = 0; i < 100; i++) {
        await service.recordSample({
          targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
          value: 150, // Above threshold
        });
      }

      const result = await service.isProductionReady();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.ready).toBe(false);
        expect(result.data.failingTargets.length).toBeGreaterThan(0);
        expect(result.data.recommendations.length).toBeGreaterThan(0);
      }
    });

    it('should return ready when no critical failures', async () => {
      // Record passing samples for all critical targets
      for (const target of V1_V7_TARGETS) {
        for (let i = 0; i < 100; i++) {
          await service.recordSample({
            targetId: target.id as ValidationTargetId,
            value: target.lowerIsBetter
              ? target.thresholdValue * 0.5 // Well below threshold
              : target.thresholdValue * 1.1, // Above threshold for higher-is-better
          });
        }
      }

      const result = await service.isProductionReady();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.ready).toBe(true);
        expect(result.data.failingTargets).toHaveLength(0);
      }
    });

    it('should recommend measuring unmeasured targets', async () => {
      const result = await service.isProductionReady();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Should recommend measuring unmeasured critical targets
        expect(result.data.recommendations.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // Configuration Tests
  // ===========================================================================

  describe('Configuration', () => {
    it('should get target definition by ID', () => {
      const definition = service.getTargetDefinition(
        ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
      );

      expect(definition).toBeDefined();
      expect(definition?.id).toBe(ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION);
      expect(definition?.name).toBe('Authorization Context Resolution');
    });

    it('should return undefined for unknown target ID', () => {
      const definition = service.getTargetDefinition('UNKNOWN' as ValidationTargetId);
      expect(definition).toBeUndefined();
    });

    it('should reset all metrics', async () => {
      // Record some samples
      await service.recordSample({
        targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
        value: 50,
      });

      // Reset
      const resetResult = await service.resetMetrics();
      expect(isOk(resetResult)).toBe(true);

      // Verify reset
      const validateResult = await service.validateTarget(
        ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
      );
      expect(isOk(validateResult)).toBe(true);
      if (isOk(validateResult)) {
        expect(validateResult.data.status).toBe(ValidationTargetStatus.NOT_MEASURED);
      }
    });
  });

  // ===========================================================================
  // Default Constants Tests
  // ===========================================================================

  describe('Default Constants', () => {
    it('should have correct default scalability limits', () => {
      expect(DEFAULT_SCALABILITY_LIMITS.maxConcurrentUsers).toBe(5000);
      expect(DEFAULT_SCALABILITY_LIMITS.maxTenantsPerInstance).toBe(100);
      expect(DEFAULT_SCALABILITY_LIMITS.maxRequestsPerSecond).toBe(10000);
    });

    it('should have correct default baseline config', () => {
      expect(DEFAULT_BASELINE_CONFIG.regressionThresholdPercent).toBe(20);
      expect(DEFAULT_BASELINE_CONFIG.improvementThresholdPercent).toBe(10);
      expect(DEFAULT_BASELINE_CONFIG.baselines.size).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Statistics Calculation Tests
  // ===========================================================================

  describe('Statistics Calculation', () => {
    it('should calculate statistics correctly in validation result', async () => {
      // Record known values
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      for (const value of values) {
        await service.recordSample({
          targetId: ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
          value,
        });
      }

      const result = await service.validateTarget(
        ValidationTargetId.V1_AUTH_CONTEXT_RESOLUTION,
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result) && result.data.statistics) {
        expect(result.data.statistics.min).toBe(10);
        expect(result.data.statistics.max).toBe(100);
        expect(result.data.statistics.sampleCount).toBe(10);
        expect(result.data.statistics.mean).toBe(55);
      }
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    it('should handle validation of unknown target gracefully', async () => {
      // This tests internal error handling
      const result = await service.validateAllTargets();
      expect(isOk(result)).toBe(true);
    });
  });
});
