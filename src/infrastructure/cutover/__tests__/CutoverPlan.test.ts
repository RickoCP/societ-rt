/**
 * Unit Tests for Cutover Plan Service
 *
 * Tests the cutover plan configuration and validation:
 * - Plan validation (dependencies, phases, ordering)
 * - Route ordering computation
 * - Dependency resolution
 * - Cascade rollback detection
 *
 * @see Task 26: Cutover Execution and Monitoring
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCutoverPlanService,
  type ICutoverPlanService,
  type CutoverPlanConfig,
  type CutoverRouteConfig,
  CutoverPriority,
  DEFAULT_CUTOVER_PLAN,
} from '../CutoverPlan';

describe('CutoverPlanService', () => {
  let planService: ICutoverPlanService;

  beforeEach(() => {
    planService = createCutoverPlanService();
  });

  describe('getPlan', () => {
    it('should return the current plan configuration', () => {
      const plan = planService.getPlan();

      expect(plan).toBeDefined();
      expect(plan.version).toBe(DEFAULT_CUTOVER_PLAN.version);
      expect(plan.phases.length).toBeGreaterThan(0);
    });

    it('should return immutable plan copy', () => {
      const plan1 = planService.getPlan();
      const plan2 = planService.getPlan();

      expect(plan1).not.toBe(plan2);
      expect(plan1.phases).not.toBe(plan2.phases);
    });
  });

  describe('validatePlan', () => {
    it('should validate default plan successfully', () => {
      const result = planService.validatePlan();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.totalRoutes).toBeGreaterThan(0);
      expect(result.totalPhases).toBeGreaterThan(0);
    });

    it('should detect duplicate route IDs', () => {
      const customPlan: CutoverPlanConfig = {
        ...DEFAULT_CUTOVER_PLAN,
        phases: [
          {
            phase: 1,
            name: 'Test Phase',
            description: 'Test',
            phaseStabilityWindowMinutes: 30,
            stopOnFailure: true,
            routes: [
              {
                routeId: 'duplicate-route',
                routeName: 'Route 1',
                phase: 1,
                order: 1,
                priority: CutoverPriority.NORMAL,
                dependsOn: [],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
              {
                routeId: 'duplicate-route', // Duplicate!
                routeName: 'Route 2',
                phase: 1,
                order: 2,
                priority: CutoverPriority.NORMAL,
                dependsOn: [],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
            ],
          },
        ],
      };

      const service = createCutoverPlanService(customPlan);
      const result = service.validatePlan();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Duplicate route ID'))).toBe(true);
    });

    it('should detect missing dependencies', () => {
      const customPlan: CutoverPlanConfig = {
        ...DEFAULT_CUTOVER_PLAN,
        phases: [
          {
            phase: 1,
            name: 'Test Phase',
            description: 'Test',
            phaseStabilityWindowMinutes: 30,
            stopOnFailure: true,
            routes: [
              {
                routeId: 'route-a',
                routeName: 'Route A',
                phase: 1,
                order: 1,
                priority: CutoverPriority.NORMAL,
                dependsOn: ['non-existent-route'], // Missing dependency
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
            ],
          },
        ],
      };

      const service = createCutoverPlanService(customPlan);
      const result = service.validatePlan();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('non-existent route'))).toBe(true);
    });

    it('should detect circular dependencies', () => {
      const customPlan: CutoverPlanConfig = {
        ...DEFAULT_CUTOVER_PLAN,
        phases: [
          {
            phase: 1,
            name: 'Test Phase',
            description: 'Test',
            phaseStabilityWindowMinutes: 30,
            stopOnFailure: true,
            routes: [
              {
                routeId: 'route-a',
                routeName: 'Route A',
                phase: 1,
                order: 1,
                priority: CutoverPriority.NORMAL,
                dependsOn: ['route-b'], // Circular!
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
              {
                routeId: 'route-b',
                routeName: 'Route B',
                phase: 1,
                order: 2,
                priority: CutoverPriority.NORMAL,
                dependsOn: ['route-a'], // Circular!
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
            ],
          },
        ],
      };

      const service = createCutoverPlanService(customPlan);
      const result = service.validatePlan();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Circular dependency'))).toBe(true);
    });

    it('should detect cross-phase dependency violations', () => {
      const customPlan: CutoverPlanConfig = {
        ...DEFAULT_CUTOVER_PLAN,
        phases: [
          {
            phase: 1,
            name: 'Phase 1',
            description: 'Test',
            phaseStabilityWindowMinutes: 30,
            stopOnFailure: true,
            routes: [
              {
                routeId: 'route-a',
                routeName: 'Route A',
                phase: 1,
                order: 1,
                priority: CutoverPriority.NORMAL,
                dependsOn: ['route-b'], // Depends on later phase!
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
            ],
          },
          {
            phase: 2,
            name: 'Phase 2',
            description: 'Test',
            phaseStabilityWindowMinutes: 30,
            stopOnFailure: true,
            routes: [
              {
                routeId: 'route-b',
                routeName: 'Route B',
                phase: 2,
                order: 1,
                priority: CutoverPriority.NORMAL,
                dependsOn: [],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
            ],
          },
        ],
      };

      const service = createCutoverPlanService(customPlan);
      const result = service.validatePlan();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('later phase'))).toBe(true);
    });
  });

  describe('getRoutesInOrder', () => {
    it('should return routes in correct execution order', () => {
      const routes = planService.getRoutesInOrder();

      expect(routes.length).toBeGreaterThan(0);

      // Verify execution order is sequential
      for (let i = 0; i < routes.length; i++) {
        expect(routes[i]!.executionOrder).toBe(i + 1);
      }
    });

    it('should order routes by phase then by order within phase', () => {
      const routes = planService.getRoutesInOrder();

      // Verify phases are in order
      let lastPhase = 0;
      for (const route of routes) {
        expect(route.phase).toBeGreaterThanOrEqual(lastPhase);
        lastPhase = route.phase;
      }
    });

    it('should include resolved dependencies', () => {
      const routes = planService.getRoutesInOrder();

      for (const route of routes) {
        expect(route.resolvedDependencies).toBeDefined();
        expect(Array.isArray(route.resolvedDependencies)).toBe(true);
      }
    });
  });

  describe('getPhaseRoutes', () => {
    it('should return routes for a specific phase', () => {
      const phase1Routes = planService.getPhaseRoutes(1);

      expect(phase1Routes.length).toBeGreaterThan(0);
      expect(phase1Routes.every((r) => r.phase === 1)).toBe(true);
    });

    it('should return empty array for non-existent phase', () => {
      const routes = planService.getPhaseRoutes(999);

      expect(routes).toHaveLength(0);
    });
  });

  describe('getRouteConfig', () => {
    it('should return config for existing route', () => {
      const routes = planService.getRoutesInOrder();
      const firstRoute = routes[0]!;

      const config = planService.getRouteConfig(firstRoute.routeId);

      expect(config).toBeDefined();
      expect(config!.routeId).toBe(firstRoute.routeId);
    });

    it('should return undefined for non-existent route', () => {
      const config = planService.getRouteConfig('non-existent-route');

      expect(config).toBeUndefined();
    });
  });

  describe('areDependenciesSatisfied', () => {
    it('should return true when all dependencies are satisfied', () => {
      const customPlan: CutoverPlanConfig = {
        ...DEFAULT_CUTOVER_PLAN,
        phases: [
          {
            phase: 1,
            name: 'Test Phase',
            description: 'Test',
            phaseStabilityWindowMinutes: 30,
            stopOnFailure: true,
            routes: [
              {
                routeId: 'route-a',
                routeName: 'Route A',
                phase: 1,
                order: 1,
                priority: CutoverPriority.NORMAL,
                dependsOn: [],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
              {
                routeId: 'route-b',
                routeName: 'Route B',
                phase: 1,
                order: 2,
                priority: CutoverPriority.NORMAL,
                dependsOn: ['route-a'],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
            ],
          },
        ],
      };

      const service = createCutoverPlanService(customPlan);
      const cutoverRoutes = new Set(['route-a']);

      expect(service.areDependenciesSatisfied('route-b', cutoverRoutes)).toBe(true);
    });

    it('should return false when dependencies are not satisfied', () => {
      const customPlan: CutoverPlanConfig = {
        ...DEFAULT_CUTOVER_PLAN,
        phases: [
          {
            phase: 1,
            name: 'Test Phase',
            description: 'Test',
            phaseStabilityWindowMinutes: 30,
            stopOnFailure: true,
            routes: [
              {
                routeId: 'route-a',
                routeName: 'Route A',
                phase: 1,
                order: 1,
                priority: CutoverPriority.NORMAL,
                dependsOn: [],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
              {
                routeId: 'route-b',
                routeName: 'Route B',
                phase: 1,
                order: 2,
                priority: CutoverPriority.NORMAL,
                dependsOn: ['route-a'],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
            ],
          },
        ],
      };

      const service = createCutoverPlanService(customPlan);
      const cutoverRoutes = new Set<string>(); // Empty - no routes cut over

      expect(service.areDependenciesSatisfied('route-b', cutoverRoutes)).toBe(false);
    });

    it('should resolve transitive dependencies', () => {
      const customPlan: CutoverPlanConfig = {
        ...DEFAULT_CUTOVER_PLAN,
        phases: [
          {
            phase: 1,
            name: 'Test Phase',
            description: 'Test',
            phaseStabilityWindowMinutes: 30,
            stopOnFailure: true,
            routes: [
              {
                routeId: 'route-a',
                routeName: 'Route A',
                phase: 1,
                order: 1,
                priority: CutoverPriority.NORMAL,
                dependsOn: [],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
              {
                routeId: 'route-b',
                routeName: 'Route B',
                phase: 1,
                order: 2,
                priority: CutoverPriority.NORMAL,
                dependsOn: ['route-a'],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
              {
                routeId: 'route-c',
                routeName: 'Route C',
                phase: 1,
                order: 3,
                priority: CutoverPriority.NORMAL,
                dependsOn: ['route-b'], // Transitive: also needs route-a
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
            ],
          },
        ],
      };

      const service = createCutoverPlanService(customPlan);

      // Only route-b cut over, but route-c needs both a and b
      const cutoverRoutesPartial = new Set(['route-b']);
      expect(service.areDependenciesSatisfied('route-c', cutoverRoutesPartial)).toBe(false);

      // Both route-a and route-b cut over
      const cutoverRoutesComplete = new Set(['route-a', 'route-b']);
      expect(service.areDependenciesSatisfied('route-c', cutoverRoutesComplete)).toBe(true);
    });
  });

  describe('getCascadeRollbackRoutes', () => {
    it('should return routes that depend on rolled back route', () => {
      const customPlan: CutoverPlanConfig = {
        ...DEFAULT_CUTOVER_PLAN,
        phases: [
          {
            phase: 1,
            name: 'Test Phase',
            description: 'Test',
            phaseStabilityWindowMinutes: 30,
            stopOnFailure: true,
            routes: [
              {
                routeId: 'route-a',
                routeName: 'Route A',
                phase: 1,
                order: 1,
                priority: CutoverPriority.NORMAL,
                dependsOn: [],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
              {
                routeId: 'route-b',
                routeName: 'Route B',
                phase: 1,
                order: 2,
                priority: CutoverPriority.NORMAL,
                dependsOn: ['route-a'],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
              {
                routeId: 'route-c',
                routeName: 'Route C',
                phase: 1,
                order: 3,
                priority: CutoverPriority.NORMAL,
                dependsOn: ['route-a'],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
            ],
          },
        ],
      };

      const service = createCutoverPlanService(customPlan);
      const cascadeRoutes = service.getCascadeRollbackRoutes('route-a');

      expect(cascadeRoutes).toContain('route-b');
      expect(cascadeRoutes).toContain('route-c');
    });

    it('should include explicit cascade rollback routes', () => {
      const customPlan: CutoverPlanConfig = {
        ...DEFAULT_CUTOVER_PLAN,
        phases: [
          {
            phase: 1,
            name: 'Test Phase',
            description: 'Test',
            phaseStabilityWindowMinutes: 30,
            stopOnFailure: true,
            routes: [
              {
                routeId: 'route-a',
                routeName: 'Route A',
                phase: 1,
                order: 1,
                priority: CutoverPriority.NORMAL,
                dependsOn: [],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
              {
                routeId: 'route-b',
                routeName: 'Route B',
                phase: 1,
                order: 2,
                priority: CutoverPriority.NORMAL,
                dependsOn: [],
                cascadeRollback: ['route-a'], // Explicit cascade
                stabilityWindowMinutes: 15,
              },
            ],
          },
        ],
      };

      const service = createCutoverPlanService(customPlan);
      const cascadeRoutes = service.getCascadeRollbackRoutes('route-a');

      expect(cascadeRoutes).toContain('route-b');
    });
  });

  describe('getNextEligibleRoutes', () => {
    it('should return routes with satisfied dependencies', () => {
      const customPlan: CutoverPlanConfig = {
        ...DEFAULT_CUTOVER_PLAN,
        maxParallelCutover: 2,
        phases: [
          {
            phase: 1,
            name: 'Test Phase',
            description: 'Test',
            phaseStabilityWindowMinutes: 30,
            stopOnFailure: true,
            routes: [
              {
                routeId: 'route-a',
                routeName: 'Route A',
                phase: 1,
                order: 1,
                priority: CutoverPriority.NORMAL,
                dependsOn: [],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
              {
                routeId: 'route-b',
                routeName: 'Route B',
                phase: 1,
                order: 2,
                priority: CutoverPriority.NORMAL,
                dependsOn: [],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
              {
                routeId: 'route-c',
                routeName: 'Route C',
                phase: 1,
                order: 3,
                priority: CutoverPriority.NORMAL,
                dependsOn: ['route-a'],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
            ],
          },
        ],
      };

      const service = createCutoverPlanService(customPlan);

      // No routes cut over - should get first routes with no dependencies
      const eligibleRoutes = service.getNextEligibleRoutes(new Set());
      expect(eligibleRoutes).toContain('route-a');
      expect(eligibleRoutes).toContain('route-b');
      expect(eligibleRoutes).not.toContain('route-c');

      // After route-a cut over - route-c becomes eligible
      const eligibleAfterA = service.getNextEligibleRoutes(new Set(['route-a']));
      expect(eligibleAfterA).toContain('route-b');
      expect(eligibleAfterA).toContain('route-c');
    });

    it('should respect maxParallelCutover', () => {
      const customPlan: CutoverPlanConfig = {
        ...DEFAULT_CUTOVER_PLAN,
        maxParallelCutover: 1, // Only one at a time
        phases: [
          {
            phase: 1,
            name: 'Test Phase',
            description: 'Test',
            phaseStabilityWindowMinutes: 30,
            stopOnFailure: true,
            routes: [
              {
                routeId: 'route-a',
                routeName: 'Route A',
                phase: 1,
                order: 1,
                priority: CutoverPriority.NORMAL,
                dependsOn: [],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
              {
                routeId: 'route-b',
                routeName: 'Route B',
                phase: 1,
                order: 2,
                priority: CutoverPriority.NORMAL,
                dependsOn: [],
                cascadeRollback: [],
                stabilityWindowMinutes: 15,
              },
            ],
          },
        ],
      };

      const service = createCutoverPlanService(customPlan);
      const eligibleRoutes = service.getNextEligibleRoutes(new Set());

      expect(eligibleRoutes).toHaveLength(1);
    });
  });

  describe('addRoute', () => {
    it('should add route to existing phase', () => {
      const newRoute: CutoverRouteConfig = {
        routeId: 'new-route',
        routeName: 'New Route',
        phase: 1,
        order: 10,
        priority: CutoverPriority.LOW,
        dependsOn: [],
        cascadeRollback: [],
        stabilityWindowMinutes: 15,
      };

      planService.addRoute(newRoute);

      const config = planService.getRouteConfig('new-route');
      expect(config).toBeDefined();
      expect(config!.routeId).toBe('new-route');
    });

    it('should throw error for non-existent phase', () => {
      const newRoute: CutoverRouteConfig = {
        routeId: 'new-route',
        routeName: 'New Route',
        phase: 999, // Non-existent
        order: 1,
        priority: CutoverPriority.NORMAL,
        dependsOn: [],
        cascadeRollback: [],
        stabilityWindowMinutes: 15,
      };

      expect(() => planService.addRoute(newRoute)).toThrow('Phase 999 does not exist');
    });
  });

  describe('removeRoute', () => {
    it('should remove route from plan', () => {
      const routes = planService.getRoutesInOrder();
      const routeToRemove = routes[0]!.routeId;

      planService.removeRoute(routeToRemove);

      const config = planService.getRouteConfig(routeToRemove);
      expect(config).toBeUndefined();
    });
  });

  describe('updatePlan', () => {
    it('should update plan configuration', () => {
      planService.updatePlan({
        name: 'Updated Plan',
        maxParallelCutover: 5,
      });

      const plan = planService.getPlan();
      expect(plan.name).toBe('Updated Plan');
      expect(plan.maxParallelCutover).toBe(5);
    });

    it('should update updatedAt timestamp', () => {
      const beforeUpdate = planService.getPlan().updatedAt;

      // Small delay to ensure timestamp changes
      planService.updatePlan({ name: 'Updated' });

      const afterUpdate = planService.getPlan().updatedAt;
      expect(afterUpdate.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });
  });
});
