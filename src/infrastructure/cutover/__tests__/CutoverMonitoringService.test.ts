/**
 * Unit Tests for Cutover Monitoring Service
 *
 * Tests the stability monitoring for authorization cutover:
 * - Mismatch rate tracking
 * - Error rate tracking
 * - Stability window checking
 * - Health status determination
 * - Stability change events
 *
 * @see Task 26: Cutover Execution and Monitoring
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createCutoverMonitoringService,
  type ICutoverMonitoringService,
  type StabilityCriteria,
  HealthStatus,
  DEFAULT_STABILITY_CRITERIA,
} from '../CutoverMonitoringService';
import { CutoverStatus } from '../types';

describe('CutoverMonitoringService', () => {
  let monitoringService: ICutoverMonitoringService;

  beforeEach(() => {
    monitoringService = createCutoverMonitoringService();
  });

  describe('registerRoute', () => {
    it('should register a route for monitoring', () => {
      monitoringService.registerRoute('test-route', CutoverStatus.LEGACY);

      const metrics = monitoringService.getRouteMetrics('test-route');
      expect(metrics).toBeDefined();
      expect(metrics!.routeId).toBe('test-route');
      expect(metrics!.cutoverStatus).toBe(CutoverStatus.LEGACY);
    });

    it('should not duplicate registration', () => {
      monitoringService.registerRoute('test-route', CutoverStatus.LEGACY);
      monitoringService.registerRoute('test-route', CutoverStatus.LEGACY);

      const allMetrics = monitoringService.getAllRouteMetrics();
      expect(allMetrics.size).toBe(1);
    });
  });

  describe('updateRouteCutoverStatus', () => {
    it('should update route cutover status', () => {
      monitoringService.registerRoute('test-route', CutoverStatus.LEGACY);
      const cutoverAt = new Date();

      monitoringService.updateRouteCutoverStatus(
        'test-route',
        CutoverStatus.MEMBERSHIP_AUTHORITATIVE,
        cutoverAt,
      );

      const metrics = monitoringService.getRouteMetrics('test-route');
      expect(metrics!.cutoverStatus).toBe(CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
      expect(metrics!.cutoverAt).toEqual(cutoverAt);
    });

    it('should auto-register route if not registered', () => {
      monitoringService.updateRouteCutoverStatus(
        'new-route',
        CutoverStatus.MEMBERSHIP_AUTHORITATIVE,
      );

      const metrics = monitoringService.getRouteMetrics('new-route');
      expect(metrics).toBeDefined();
    });
  });

  describe('recordRequest', () => {
    beforeEach(() => {
      monitoringService.registerRoute('test-route', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
    });

    it('should record successful request', () => {
      monitoringService.recordRequest('test-route', true, false);

      const metrics = monitoringService.getRouteMetrics('test-route');
      expect(metrics!.totalRequests).toBe(1);
      expect(metrics!.successCount).toBe(1);
      expect(metrics!.errorCount).toBe(0);
      expect(metrics!.mismatchCount).toBe(0);
    });

    it('should record failed request', () => {
      monitoringService.recordRequest('test-route', false, false);

      const metrics = monitoringService.getRouteMetrics('test-route');
      expect(metrics!.totalRequests).toBe(1);
      expect(metrics!.successCount).toBe(0);
      expect(metrics!.errorCount).toBe(1);
    });

    it('should record mismatch', () => {
      monitoringService.recordRequest('test-route', true, true);

      const metrics = monitoringService.getRouteMetrics('test-route');
      expect(metrics!.mismatchCount).toBe(1);
    });

    it('should calculate error rate correctly', () => {
      // 2 successes, 1 failure = 33.33% error rate
      monitoringService.recordRequest('test-route', true, false);
      monitoringService.recordRequest('test-route', true, false);
      monitoringService.recordRequest('test-route', false, false);

      const metrics = monitoringService.getRouteMetrics('test-route');
      expect(metrics!.errorRate).toBeCloseTo(1 / 3);
    });

    it('should calculate mismatch rate correctly', () => {
      // 4 requests, 1 mismatch = 25% mismatch rate
      monitoringService.recordRequest('test-route', true, false);
      monitoringService.recordRequest('test-route', true, false);
      monitoringService.recordRequest('test-route', true, true);
      monitoringService.recordRequest('test-route', true, false);

      const metrics = monitoringService.getRouteMetrics('test-route');
      expect(metrics!.mismatchRate).toBe(0.25);
    });
  });

  describe('Health Status Determination', () => {
    beforeEach(() => {
      // Use lower thresholds for testing
      monitoringService.setCriteria({
        maxMismatchRate: 0.1, // 10%
        maxErrorRate: 0.1, // 10%
        minRequestCount: 10,
        stabilityWindowMinutes: 1,
        consecutiveStableChecksRequired: 2,
      });
      monitoringService.registerRoute('test-route', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
    });

    it('should return UNKNOWN when insufficient requests', () => {
      monitoringService.recordRequest('test-route', true, false);

      const metrics = monitoringService.getRouteMetrics('test-route');
      expect(metrics!.healthStatus).toBe(HealthStatus.UNKNOWN);
    });

    it('should return HEALTHY when within thresholds', () => {
      // 15 requests, all successful, no mismatches
      for (let i = 0; i < 15; i++) {
        monitoringService.recordRequest('test-route', true, false);
      }

      const metrics = monitoringService.getRouteMetrics('test-route');
      expect(metrics!.healthStatus).toBe(HealthStatus.HEALTHY);
    });

    it('should return DEGRADED when approaching thresholds', () => {
      // 10 requests, 9% error rate (below 10% threshold but above 80% of it)
      for (let i = 0; i < 91; i++) {
        monitoringService.recordRequest('test-route', true, false);
      }
      for (let i = 0; i < 9; i++) {
        monitoringService.recordRequest('test-route', false, false);
      }

      const metrics = monitoringService.getRouteMetrics('test-route');
      expect(metrics!.healthStatus).toBe(HealthStatus.DEGRADED);
    });

    it('should return UNHEALTHY when exceeding thresholds significantly', () => {
      // 20% error rate (exceeds 10% threshold by >50%)
      for (let i = 0; i < 8; i++) {
        monitoringService.recordRequest('test-route', true, false);
      }
      for (let i = 0; i < 2; i++) {
        monitoringService.recordRequest('test-route', false, false);
      }

      const metrics = monitoringService.getRouteMetrics('test-route');
      expect(metrics!.healthStatus).toBe(HealthStatus.UNHEALTHY);
    });
  });

  describe('checkRouteStability', () => {
    beforeEach(() => {
      monitoringService.setCriteria({
        maxMismatchRate: 0.1,
        maxErrorRate: 0.1,
        minRequestCount: 10,
        stabilityWindowMinutes: 0, // Immediate for testing
        consecutiveStableChecksRequired: 2,
      });
      monitoringService.registerRoute('test-route', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
      monitoringService.updateRouteCutoverStatus(
        'test-route',
        CutoverStatus.MEMBERSHIP_AUTHORITATIVE,
        new Date(Date.now() - 60000), // 1 minute ago
      );
    });

    it('should return stability check result with all checks', () => {
      for (let i = 0; i < 15; i++) {
        monitoringService.recordRequest('test-route', true, false);
      }

      const result = monitoringService.checkRouteStability('test-route');

      expect(result.routeId).toBe('test-route');
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.checks.some((c) => c.name === 'Minimum Request Count')).toBe(true);
      expect(result.checks.some((c) => c.name === 'Mismatch Rate')).toBe(true);
      expect(result.checks.some((c) => c.name === 'Error Rate')).toBe(true);
    });

    it('should fail when request count is insufficient', () => {
      monitoringService.recordRequest('test-route', true, false);

      const result = monitoringService.checkRouteStability('test-route');

      expect(result.passed).toBe(false);
      const requestCheck = result.checks.find(
        (c) => c.name === 'Minimum Request Count',
      );
      expect(requestCheck?.passed).toBe(false);
    });

    it('should fail when mismatch rate exceeds threshold', () => {
      for (let i = 0; i < 8; i++) {
        monitoringService.recordRequest('test-route', true, false);
      }
      for (let i = 0; i < 3; i++) {
        monitoringService.recordRequest('test-route', true, true);
      }

      const result = monitoringService.checkRouteStability('test-route');

      const mismatchCheck = result.checks.find((c) => c.name === 'Mismatch Rate');
      expect(mismatchCheck?.passed).toBe(false);
    });

    it('should return UNKNOWN for unregistered route', () => {
      const result = monitoringService.checkRouteStability('non-existent');

      expect(result.passed).toBe(false);
      expect(result.healthStatus).toBe(HealthStatus.UNKNOWN);
    });
  });

  describe('System Stability', () => {
    beforeEach(() => {
      monitoringService.setCriteria({
        maxMismatchRate: 0.1,
        maxErrorRate: 0.1,
        minRequestCount: 5,
        stabilityWindowMinutes: 0,
        consecutiveStableChecksRequired: 1,
      });
    });

    it('should aggregate system metrics correctly', () => {
      monitoringService.registerRoute('route-1', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
      monitoringService.registerRoute('route-2', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);

      for (let i = 0; i < 10; i++) {
        monitoringService.recordRequest('route-1', true, false);
        monitoringService.recordRequest('route-2', true, false);
      }

      const systemMetrics = monitoringService.getSystemMetrics();

      expect(systemMetrics.totalRoutes).toBe(2);
      expect(systemMetrics.cutoverRoutes).toBe(2);
    });

    it('should detect unhealthy routes in system metrics', () => {
      monitoringService.registerRoute('route-1', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
      monitoringService.registerRoute('route-2', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);

      // Route 1: healthy
      for (let i = 0; i < 10; i++) {
        monitoringService.recordRequest('route-1', true, false);
      }

      // Route 2: unhealthy (high error rate)
      for (let i = 0; i < 5; i++) {
        monitoringService.recordRequest('route-2', true, false);
      }
      for (let i = 0; i < 5; i++) {
        monitoringService.recordRequest('route-2', false, false);
      }

      const systemMetrics = monitoringService.getSystemMetrics();

      expect(systemMetrics.unhealthyRoutes).toBe(1);
      expect(systemMetrics.healthStatus).toBe(HealthStatus.UNHEALTHY);
    });

    it('should return HEALTHY when all routes are healthy', () => {
      monitoringService.registerRoute('route-1', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
      monitoringService.registerRoute('route-2', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);

      for (let i = 0; i < 10; i++) {
        monitoringService.recordRequest('route-1', true, false);
        monitoringService.recordRequest('route-2', true, false);
      }

      const systemMetrics = monitoringService.getSystemMetrics();

      expect(systemMetrics.healthStatus).toBe(HealthStatus.HEALTHY);
    });
  });

  describe('Stability Change Events', () => {
    it('should emit event when route becomes unhealthy', () => {
      const callback = vi.fn();
      monitoringService.onStabilityChange(callback);

      monitoringService.setCriteria({
        maxMismatchRate: 0.1,
        maxErrorRate: 0.1,
        minRequestCount: 5,
        stabilityWindowMinutes: 0,
        consecutiveStableChecksRequired: 1,
      });

      monitoringService.registerRoute('test-route', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);

      // First, make it healthy
      for (let i = 0; i < 10; i++) {
        monitoringService.recordRequest('test-route', true, false);
      }

      // Then make it unhealthy
      for (let i = 0; i < 10; i++) {
        monitoringService.recordRequest('test-route', false, false);
      }

      expect(callback).toHaveBeenCalled();
      const lastCall = callback.mock.calls[callback.mock.calls.length - 1][0];
      expect(lastCall.type).toBe('BECAME_UNSTABLE');
    });
  });

  describe('getStableRoutes / getUnstableRoutes', () => {
    beforeEach(() => {
      monitoringService.setCriteria({
        maxMismatchRate: 0.1,
        maxErrorRate: 0.1,
        minRequestCount: 5,
        stabilityWindowMinutes: 0,
        consecutiveStableChecksRequired: 1,
      });
    });

    it('should return stable routes', () => {
      monitoringService.registerRoute('stable-route', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
      monitoringService.updateRouteCutoverStatus(
        'stable-route',
        CutoverStatus.MEMBERSHIP_AUTHORITATIVE,
        new Date(Date.now() - 60000),
      );

      for (let i = 0; i < 10; i++) {
        monitoringService.recordRequest('stable-route', true, false);
      }

      const stableRoutes = monitoringService.getStableRoutes();

      expect(stableRoutes).toContain('stable-route');
    });

    it('should return unstable routes', () => {
      monitoringService.registerRoute('unstable-route', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);

      // Make it unhealthy
      for (let i = 0; i < 5; i++) {
        monitoringService.recordRequest('unstable-route', true, false);
      }
      for (let i = 0; i < 5; i++) {
        monitoringService.recordRequest('unstable-route', false, false);
      }

      const unstableRoutes = monitoringService.getUnstableRoutes();

      expect(unstableRoutes).toContain('unstable-route');
    });
  });

  describe('Criteria Management', () => {
    it('should get current criteria', () => {
      const criteria = monitoringService.getCriteria();

      expect(criteria).toEqual(DEFAULT_STABILITY_CRITERIA);
    });

    it('should update criteria', () => {
      monitoringService.setCriteria({
        maxMismatchRate: 0.05,
        minRequestCount: 100,
      });

      const criteria = monitoringService.getCriteria();

      expect(criteria.maxMismatchRate).toBe(0.05);
      expect(criteria.minRequestCount).toBe(100);
      // Other values should remain unchanged
      expect(criteria.maxErrorRate).toBe(DEFAULT_STABILITY_CRITERIA.maxErrorRate);
    });
  });

  describe('Reset Functions', () => {
    it('should reset route metrics', () => {
      monitoringService.registerRoute('test-route', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);

      for (let i = 0; i < 10; i++) {
        monitoringService.recordRequest('test-route', true, false);
      }

      monitoringService.resetRouteMetrics('test-route');

      const metrics = monitoringService.getRouteMetrics('test-route');
      expect(metrics!.totalRequests).toBe(0);
      expect(metrics!.successCount).toBe(0);
    });

    it('should reset all metrics', () => {
      monitoringService.registerRoute('route-1', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
      monitoringService.registerRoute('route-2', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);

      for (let i = 0; i < 10; i++) {
        monitoringService.recordRequest('route-1', true, false);
        monitoringService.recordRequest('route-2', true, false);
      }

      monitoringService.resetAllMetrics();

      const metrics1 = monitoringService.getRouteMetrics('route-1');
      const metrics2 = monitoringService.getRouteMetrics('route-2');

      expect(metrics1!.totalRequests).toBe(0);
      expect(metrics2!.totalRequests).toBe(0);
    });
  });

  describe('exportMetrics', () => {
    it('should export metrics for dashboard', () => {
      monitoringService.registerRoute('test-route', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);
      monitoringService.recordRequest('test-route', true, false);

      const exported = monitoringService.exportMetrics();

      expect(exported.timestamp).toBeDefined();
      expect(exported.system).toBeDefined();
      expect(exported.criteria).toBeDefined();
      expect(exported.routes).toBeDefined();
    });

    it('should include system-level metrics in export', () => {
      monitoringService.registerRoute('test-route', CutoverStatus.MEMBERSHIP_AUTHORITATIVE);

      const exported = monitoringService.exportMetrics();
      const system = exported.system as Record<string, unknown>;

      expect(system.healthStatus).toBeDefined();
      expect(system.totalRoutes).toBeDefined();
      expect(system.isSystemStable).toBeDefined();
    });
  });
});
