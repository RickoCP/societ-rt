/**
 * Unit Tests for Cutover Execution Service
 *
 * Tests the route-by-route cutover execution workflow:
 * - Execution plan generation
 * - Single route cutover
 * - Rollback testing
 * - Emergency rollback
 * - Prerequisites verification
 *
 * @see Task 26: Cutover Execution and Monitoring
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createCutoverExecutionService,
  type ICutoverExecutionService,
  ExecutionStatus,
  ExecutionMode,
  ExecutionErrorCodes,
} from '../CutoverExecutionService';
import {
  createCutoverPlanService,
  type ICutoverPlanService,
  type CutoverPlanConfig,
  CutoverPriority,
} from '../CutoverPlan';
import {
  createCutoverMonitoringService,
  type ICutoverMonitoringService,
  HealthStatus,
} from '../CutoverMonitoringService';
import type {
  IAuthorizationCutoverService,
  CutoverOperationResult,
  RollbackOperationResult,
  CutoverPrerequisitesResult,
  CutoverStatusResponse,
  RouteCutoverConfig,
} from '../types';
import { CutoverStatus, CutoverAuditAction } from '../types';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

const createMockCutoverService = (
  overrides: Partial<IAuthorizationCutoverService> = {},
): IAuthorizationCutoverService => {
  const registeredRoutes = new Set<string>();
  const cutoverRoutes = new Set<string>();

  return {
    verifyCutoverPrerequisites: vi.fn().mockResolvedValue({
      allMet: true,
      verifiedAt: new Date(),
      writeCompatibilityGate: { name: 'Write Gate', met: true, message: 'OK' },
      mismatchRateGate: { name: 'Mismatch Gate', met: true, message: 'OK' },
      legacyWritersGate: { name: 'Legacy Gate', met: true, message: 'OK' },
      summary: 'All prerequisites met',
      blockingIssues: [],
    } as CutoverPrerequisitesResult),

    initiateRouteCutover: vi.fn().mockImplementation(async (params) => {
      cutoverRoutes.add(params.routeId);
      return {
        success: true,
        routeId: params.routeId,
        newStatus: CutoverStatus.MEMBERSHIP_AUTHORITATIVE,
        auditEntry: {
          id: 'audit-1',
          timestamp: new Date(),
          action: CutoverAuditAction.CUTOVER_COMPLETED,
          operatorId: params.operatorId,
          routesAffected: [params.routeId],
          reason: params.reason,
          success: true,
        },
      } as CutoverOperationResult;
    }),

    rollbackRouteCutover: vi.fn().mockImplementation(async (params) => {
      cutoverRoutes.delete(params.routeId);
      return {
        success: true,
        routeId: params.routeId,
        newStatus: CutoverStatus.ROLLED_BACK,
        alertEmitted: params.isEmergency ?? false,
        auditEntry: {
          id: 'audit-2',
          timestamp: new Date(),
          action: CutoverAuditAction.ROLLBACK_COMPLETED,
          operatorId: params.operatorId,
          routesAffected: [params.routeId],
          reason: params.reason,
          success: true,
        },
      } as RollbackOperationResult;
    }),

    getCutoverStatus: vi.fn().mockImplementation(() => ({
      globalStatus: cutoverRoutes.size > 0
        ? CutoverStatus.MEMBERSHIP_AUTHORITATIVE
        : CutoverStatus.LEGACY,
      routes: [],
      statusCounts: {
        [CutoverStatus.LEGACY]: 0,
        [CutoverStatus.TRANSITIONING]: 0,
        [CutoverStatus.MEMBERSHIP_AUTHORITATIVE]: cutoverRoutes.size,
        [CutoverStatus.ROLLED_BACK]: 0,
      },
      isFullyCutOver: false,
      hasRolledBackRoutes: false,
      lastUpdated: new Date(),
    } as CutoverStatusResponse)),

    getRouteCutoverStatus: vi.fn().mockImplementation((routeId: string) => {
      if (!registeredRoutes.has(routeId)) return undefined;
      return {
        routeId,
        routeName: routeId,
        status: cutoverRoutes.has(routeId)
          ? CutoverStatus.MEMBERSHIP_AUTHORITATIVE
          : CutoverStatus.LEGACY,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as RouteCutoverConfig;
    }),

    isRouteCutOver: vi.fn().mockImplementation((routeId: string) => {
      return cutoverRoutes.has(routeId);
    }),

    getAuditLog: vi.fn().mockReturnValue([]),

    registerRoute: vi.fn().mockImplementation((routeId: string) => {
      registeredRoutes.add(routeId);
    }),

    getRegisteredRoutes: vi.fn().mockImplementation(() => {
      return Array.from(registeredRoutes);
    }),

    ...overrides,
  };
};

const createSimplePlan = (): CutoverPlanConfig => ({
  version: '1.0.0',
  name: 'Test Plan',
  createdAt: new Date(),
  updatedAt: new Date(),
  defaultStabilityWindowMinutes: 1,
  maxParallelCutover: 1,
  globalRollbackThreshold: 0.2,
  phases: [
    {
      phase: 1,
      name: 'Phase 1',
      description: 'Test phase 1',
      phaseStabilityWindowMinutes: 1,
      stopOnFailure: true,
      routes: [
        {
          routeId: 'route-a',
          routeName: 'Route A',
          phase: 1,
          order: 1,
          priority: CutoverPriority.HIGH,
          dependsOn: [],
          cascadeRollback: [],
          stabilityWindowMinutes: 1,
        },
        {
          routeId: 'route-b',
          routeName: 'Route B',
          phase: 1,
          order: 2,
          priority: CutoverPriority.NORMAL,
          dependsOn: ['route-a'],
          cascadeRollback: [],
          stabilityWindowMinutes: 1,
        },
      ],
    },
    {
      phase: 2,
      name: 'Phase 2',
      description: 'Test phase 2',
      phaseStabilityWindowMinutes: 1,
      stopOnFailure: true,
      routes: [
        {
          routeId: 'route-c',
          routeName: 'Route C',
          phase: 2,
          order: 1,
          priority: CutoverPriority.NORMAL,
          dependsOn: ['route-b'],
          cascadeRollback: [],
          stabilityWindowMinutes: 1,
        },
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CutoverExecutionService', () => {
  let executionService: ICutoverExecutionService;
  let cutoverService: IAuthorizationCutoverService;
  let planService: ICutoverPlanService;
  let monitoringService: ICutoverMonitoringService;

  beforeEach(() => {
    cutoverService = createMockCutoverService();
    planService = createCutoverPlanService(createSimplePlan());
    monitoringService = createCutoverMonitoringService({
      maxMismatchRate: 0.1,
      maxErrorRate: 0.1,
      minRequestCount: 1, // Low for testing
      stabilityWindowMinutes: 0,
      consecutiveStableChecksRequired: 1,
    });

    executionService = createCutoverExecutionService({
      cutoverService,
      planService,
      monitoringService,
    });
  });

  describe('getExecutionPlan', () => {
    it('should return execution plan with routes in order', () => {
      const plan = executionService.getExecutionPlan();

      expect(plan).toBeDefined();
      expect(plan.routes.length).toBe(3);
      expect(plan.phases.length).toBe(2);
    });

    it('should compute execution order', () => {
      const plan = executionService.getExecutionPlan();

      expect(plan.routes[0]!.routeId).toBe('route-a');
      expect(plan.routes[0]!.executionOrder).toBe(1);
      expect(plan.routes[1]!.routeId).toBe('route-b');
      expect(plan.routes[1]!.executionOrder).toBe(2);
      expect(plan.routes[2]!.routeId).toBe('route-c');
      expect(plan.routes[2]!.executionOrder).toBe(3);
    });
  });

  describe('getProgress', () => {
    it('should return initial progress', () => {
      const progress = executionService.getProgress();

      expect(progress.status).toBe(ExecutionStatus.NOT_STARTED);
      expect(progress.routesCompleted).toBe(0);
      expect(progress.totalRoutes).toBe(3);
      expect(progress.progressPercent).toBe(0);
    });
  });

  describe('verifyPrerequisites', () => {
    it('should verify prerequisites successfully', async () => {
      const result = await executionService.verifyPrerequisites();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.verified).toBe(true);
        expect(result.data.issues).toHaveLength(0);
      }
    });

    it('should fail when cutover prerequisites not met', async () => {
      const failingCutoverService = createMockCutoverService({
        verifyCutoverPrerequisites: vi.fn().mockResolvedValue({
          allMet: false,
          verifiedAt: new Date(),
          writeCompatibilityGate: { name: 'Write Gate', met: false, message: 'Failed' },
          mismatchRateGate: { name: 'Mismatch Gate', met: true, message: 'OK' },
          legacyWritersGate: { name: 'Legacy Gate', met: true, message: 'OK' },
          summary: 'Prerequisites not met',
          blockingIssues: ['Write compatibility gate failed'],
        }),
      });

      const service = createCutoverExecutionService({
        cutoverService: failingCutoverService,
        planService,
        monitoringService,
      });

      const result = await service.verifyPrerequisites();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.verified).toBe(false);
        expect(result.data.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('executeSingleRoute', () => {
    it('should execute cutover for a single route', async () => {
      const result = await executionService.executeSingleRoute(
        'route-a',
        'admin-1',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.routeId).toBe('route-a');
        expect(result.data.success).toBe(true);
      }
      expect(cutoverService.initiateRouteCutover).toHaveBeenCalledWith(
        expect.objectContaining({
          routeId: 'route-a',
          operatorId: 'admin-1',
        }),
      );
    });

    it('should fail if dependencies not satisfied', async () => {
      const result = await executionService.executeSingleRoute(
        'route-b', // Depends on route-a
        'admin-1',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ExecutionErrorCodes.DEPENDENCIES_NOT_SATISFIED);
      }
    });

    it('should succeed if dependencies are satisfied', async () => {
      // First cut over route-a
      await executionService.executeSingleRoute('route-a', 'admin-1');

      // Now route-b should work
      const result = await executionService.executeSingleRoute(
        'route-b',
        'admin-1',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
      }
    });

    it('should fail for non-existent route', async () => {
      const result = await executionService.executeSingleRoute(
        'non-existent',
        'admin-1',
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ExecutionErrorCodes.ROUTE_NOT_FOUND);
      }
    });
  });

  describe('executeCutover', () => {
    it('should execute cutover in DRY_RUN mode', async () => {
      const result = await executionService.executeCutover({
        mode: ExecutionMode.DRY_RUN,
        operatorId: 'admin-1',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(ExecutionStatus.COMPLETED);
        expect(result.data.cutoverRoutes).toHaveLength(0); // No actual cutover
        expect(result.data.remainingRoutes.length).toBeGreaterThan(0);
      }
    });

    it('should execute cutover in AUTOMATIC mode', async () => {
      const result = await executionService.executeCutover({
        mode: ExecutionMode.AUTOMATIC,
        operatorId: 'admin-1',
        skipPrerequisites: true,
        skipStabilityChecks: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cutoverRoutes).toContain('route-a');
      }
    });

    it('should execute cutover in MANUAL mode and pause', async () => {
      const result = await executionService.executeCutover({
        mode: ExecutionMode.MANUAL,
        operatorId: 'admin-1',
        skipPrerequisites: true,
        skipStabilityChecks: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(ExecutionStatus.PAUSED);
        expect(result.data.cutoverRoutes).toHaveLength(1); // Only first route
      }
    });

    it('should respect maxRoutes option', async () => {
      const result = await executionService.executeCutover({
        mode: ExecutionMode.AUTOMATIC,
        operatorId: 'admin-1',
        skipPrerequisites: true,
        skipStabilityChecks: true,
        maxRoutes: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cutoverRoutes.length).toBeLessThanOrEqual(1);
      }
    });

    it('should handle specific routes option', async () => {
      const result = await executionService.executeCutover({
        mode: ExecutionMode.AUTOMATIC,
        operatorId: 'admin-1',
        skipPrerequisites: true,
        skipStabilityChecks: true,
        specificRoutes: ['route-a'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cutoverRoutes).toContain('route-a');
        expect(result.data.cutoverRoutes).not.toContain('route-b');
      }
    });

    it('should fail when prerequisites not met', async () => {
      const failingCutoverService = createMockCutoverService({
        verifyCutoverPrerequisites: vi.fn().mockResolvedValue({
          allMet: false,
          verifiedAt: new Date(),
          writeCompatibilityGate: { name: 'Write Gate', met: false, message: 'Failed' },
          mismatchRateGate: { name: 'Mismatch Gate', met: true, message: 'OK' },
          legacyWritersGate: { name: 'Legacy Gate', met: true, message: 'OK' },
          summary: 'Prerequisites not met',
          blockingIssues: ['Write compatibility gate failed'],
        }),
      });

      const service = createCutoverExecutionService({
        cutoverService: failingCutoverService,
        planService,
        monitoringService,
      });

      const result = await service.executeCutover({
        mode: ExecutionMode.AUTOMATIC,
        operatorId: 'admin-1',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ExecutionErrorCodes.PREREQUISITES_NOT_MET);
      }
    });
  });

  describe('pauseExecution / resumeExecution', () => {
    it('should pause and resume execution', async () => {
      // Start execution in manual mode
      await executionService.executeCutover({
        mode: ExecutionMode.MANUAL,
        operatorId: 'admin-1',
        skipPrerequisites: true,
        skipStabilityChecks: true,
      });

      const progressAfterPause = executionService.getProgress();
      expect(progressAfterPause.status).toBe(ExecutionStatus.PAUSED);

      // Resume
      const resumeResult = await executionService.resumeExecution();
      expect(resumeResult.success).toBe(true);
    });

    it('should fail resumeExecution if not paused', async () => {
      const result = await executionService.resumeExecution();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ExecutionErrorCodes.EXECUTION_PAUSED);
      }
    });
  });

  describe('testRollback', () => {
    it('should test rollback successfully', async () => {
      // First cut over a route
      await executionService.executeSingleRoute('route-a', 'admin-1');

      // Test rollback
      const result = await executionService.testRollback('route-a', 'admin-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.passed).toBe(true);
        expect(result.data.stateRestored).toBe(true);
      }
      expect(cutoverService.rollbackRouteCutover).toHaveBeenCalled();
      expect(cutoverService.initiateRouteCutover).toHaveBeenCalledTimes(2); // Original + restore
    });

    it('should fail if route not cut over', async () => {
      const result = await executionService.testRollback('route-a', 'admin-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ExecutionErrorCodes.ROLLBACK_TEST_FAILED);
      }
    });
  });

  describe('emergencyRollback', () => {
    it('should execute emergency rollback', async () => {
      // First cut over a route
      await executionService.executeSingleRoute('route-a', 'admin-1');

      // Emergency rollback
      const result = await executionService.emergencyRollback(
        'route-a',
        'admin-1',
        'System instability detected',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
      }
      expect(cutoverService.rollbackRouteCutover).toHaveBeenCalledWith(
        expect.objectContaining({
          routeId: 'route-a',
          isEmergency: true,
          reason: expect.stringContaining('EMERGENCY'),
        }),
      );
    });
  });

  describe('fullSystemRollback', () => {
    it('should rollback all cut over routes', async () => {
      // Cut over multiple routes
      await executionService.executeSingleRoute('route-a', 'admin-1');

      // Full rollback
      const result = await executionService.fullSystemRollback(
        'admin-1',
        'Critical system failure',
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rolledBackRoutes).toContain('route-a');
      }
    });
  });

  describe('canProceedWithNextRoute', () => {
    it('should return can proceed when routes are eligible', () => {
      const result = executionService.canProceedWithNextRoute();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.canProceed).toBe(true);
      }
    });

    it('should return cannot proceed when no eligible routes', async () => {
      // Cut over all routes
      await executionService.executeSingleRoute('route-a', 'admin-1');
      await executionService.executeSingleRoute('route-b', 'admin-1');
      await executionService.executeSingleRoute('route-c', 'admin-1');

      const result = executionService.canProceedWithNextRoute();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.canProceed).toBe(false);
      }
    });
  });

  describe('getReadyRoutes', () => {
    it('should return routes with satisfied dependencies', async () => {
      const readyRoutes = executionService.getReadyRoutes();

      // Initially only route-a is ready (no dependencies)
      expect(readyRoutes).toContain('route-a');
      expect(readyRoutes).not.toContain('route-b');
      expect(readyRoutes).not.toContain('route-c');
    });

    it('should update as routes are cut over', async () => {
      await executionService.executeSingleRoute('route-a', 'admin-1');

      const readyRoutes = executionService.getReadyRoutes();

      // After route-a, route-b becomes ready
      expect(readyRoutes).toContain('route-b');
    });
  });

  describe('resetExecution', () => {
    it('should reset execution state', async () => {
      // Execute some cutover
      await executionService.executeCutover({
        mode: ExecutionMode.MANUAL,
        operatorId: 'admin-1',
        skipPrerequisites: true,
        skipStabilityChecks: true,
      });

      // Reset
      executionService.resetExecution();

      const progress = executionService.getProgress();
      expect(progress.status).toBe(ExecutionStatus.NOT_STARTED);
      expect(progress.routesCompleted).toBe(0);
      expect(progress.executionHistory).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle cutover operation failure', async () => {
      const failingCutoverService = createMockCutoverService({
        initiateRouteCutover: vi.fn().mockResolvedValue({
          success: false,
          routeId: 'route-a',
          newStatus: CutoverStatus.LEGACY,
          auditEntry: {
            id: 'audit-fail',
            timestamp: new Date(),
            action: CutoverAuditAction.CUTOVER_FAILED,
            operatorId: 'admin-1',
            routesAffected: ['route-a'],
            reason: 'Test failure',
            success: false,
            errorMessage: 'Cutover failed',
          },
          errorMessage: 'Cutover failed',
        }),
      });

      const service = createCutoverExecutionService({
        cutoverService: failingCutoverService,
        planService,
        monitoringService,
      });

      const result = await service.executeSingleRoute('route-a', 'admin-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(false);
        expect(result.data.errorMessage).toBe('Cutover failed');
      }
    });

    it('should stop on failure in AUTOMATIC mode', async () => {
      const failingCutoverService = createMockCutoverService({
        initiateRouteCutover: vi.fn().mockResolvedValue({
          success: false,
          routeId: 'route-a',
          newStatus: CutoverStatus.LEGACY,
          auditEntry: {
            id: 'audit-fail',
            timestamp: new Date(),
            action: CutoverAuditAction.CUTOVER_FAILED,
            operatorId: 'admin-1',
            routesAffected: ['route-a'],
            reason: 'Test failure',
            success: false,
          },
          errorMessage: 'Cutover failed',
        }),
      });

      const service = createCutoverExecutionService({
        cutoverService: failingCutoverService,
        planService,
        monitoringService,
      });

      const result = await service.executeCutover({
        mode: ExecutionMode.AUTOMATIC,
        operatorId: 'admin-1',
        skipPrerequisites: true,
        skipStabilityChecks: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(ExecutionStatus.FAILED);
        expect(result.data.failedRoutes).toContain('route-a');
      }
    });
  });
});
