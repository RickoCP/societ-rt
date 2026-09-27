/**
 * Cutover Execution Service — Route-by-route cutover execution workflow.
 *
 * This service orchestrates the execution of the authorization cutover plan:
 * - Executes cutover route-by-route following the plan
 * - Monitors stability between cutover operations
 * - Handles rollback testing and execution
 * - Integrates with monitoring and alert services
 *
 * **Key Features:**
 * - Phased execution following cutover plan
 * - Automatic stability verification between routes
 * - Rollback testing before critical phases
 * - Comprehensive audit logging
 * - Support for manual and automated execution
 *
 * @see Task 26: Cutover Execution and Monitoring
 * @see Requirements 8 (AC 1-7)
 */

import type { DomainResult } from '@core/utils';
import { ok, fail, businessError } from '@core/utils';
import type {
  IAuthorizationCutoverService,
  CutoverOperationResult,
  RollbackOperationResult,
  CutoverStatus,
} from './types';
import type { ICutoverPlanService, OrderedCutoverRoute } from './CutoverPlan';
import type { ICutoverMonitoringService, StabilityCheckResult } from './CutoverMonitoringService';
import { HealthStatus } from './CutoverMonitoringService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Status of the cutover execution.
 */
export enum ExecutionStatus {
  /** Not started */
  NOT_STARTED = 'NOT_STARTED',
  /** Execution in progress */
  IN_PROGRESS = 'IN_PROGRESS',
  /** Paused (waiting for stability or manual approval) */
  PAUSED = 'PAUSED',
  /** Completed successfully */
  COMPLETED = 'COMPLETED',
  /** Failed (stopped due to errors) */
  FAILED = 'FAILED',
  /** Rolled back */
  ROLLED_BACK = 'ROLLED_BACK',
}

/**
 * Execution mode for cutover.
 */
export enum ExecutionMode {
  /** Execute all routes automatically with stability checks */
  AUTOMATIC = 'AUTOMATIC',
  /** Execute one route at a time with manual approval */
  MANUAL = 'MANUAL',
  /** Dry run — validate plan without executing */
  DRY_RUN = 'DRY_RUN',
}

/**
 * Result of a single route cutover execution.
 */
export interface RouteExecutionResult {
  /** Route identifier */
  readonly routeId: string;

  /** Whether cutover succeeded */
  readonly success: boolean;

  /** Cutover operation result */
  readonly cutoverResult: CutoverOperationResult | null;

  /** Stability check after cutover */
  readonly stabilityCheck: StabilityCheckResult | null;

  /** Whether stability was verified */
  readonly stabilityVerified: boolean;

  /** Execution timestamp */
  readonly executedAt: Date;

  /** Duration in milliseconds */
  readonly durationMs: number;

  /** Error message if failed */
  readonly errorMessage?: string;

  /** Recommendations for next steps */
  readonly recommendations: readonly string[];
}

/**
 * Result of a rollback test.
 */
export interface RollbackTestResult {
  /** Route tested */
  readonly routeId: string;

  /** Whether rollback test passed */
  readonly passed: boolean;

  /** Rollback operation result */
  readonly rollbackResult: RollbackOperationResult | null;

  /** Re-cutover result (to restore state) */
  readonly recutoverResult: CutoverOperationResult | null;

  /** Whether state was properly restored */
  readonly stateRestored: boolean;

  /** Test timestamp */
  readonly testedAt: Date;

  /** Duration in milliseconds */
  readonly durationMs: number;

  /** Error message if failed */
  readonly errorMessage?: string;
}

/**
 * Execution plan for the cutover.
 */
export interface ExecutionPlan {
  /** Plan version */
  readonly planVersion: string;

  /** Routes in execution order */
  readonly routes: readonly OrderedCutoverRoute[];

  /** Total routes */
  readonly totalRoutes: number;

  /** Estimated total duration in minutes */
  readonly estimatedDurationMinutes: number;

  /** Phases in the plan */
  readonly phases: readonly ExecutionPhase[];
}

/**
 * Phase in the execution plan.
 */
export interface ExecutionPhase {
  /** Phase number */
  readonly phase: number;

  /** Phase name */
  readonly phaseName: string;

  /** Routes in this phase */
  readonly routes: readonly string[];

  /** Stability window for phase */
  readonly stabilityWindowMinutes: number;
}

/**
 * Progress of the cutover execution.
 */
export interface ExecutionProgress {
  /** Current execution status */
  readonly status: ExecutionStatus;

  /** Current phase (1-indexed) */
  readonly currentPhase: number;

  /** Total phases */
  readonly totalPhases: number;

  /** Routes completed */
  readonly routesCompleted: number;

  /** Total routes */
  readonly totalRoutes: number;

  /** Routes failed */
  readonly routesFailed: number;

  /** Current route being processed (if any) */
  readonly currentRoute: string | null;

  /** Progress percentage (0-100) */
  readonly progressPercent: number;

  /** Execution start time */
  readonly startedAt: Date | null;

  /** Last activity timestamp */
  readonly lastActivityAt: Date;

  /** Estimated time remaining in minutes */
  readonly estimatedRemainingMinutes: number | null;

  /** Route execution history */
  readonly executionHistory: readonly RouteExecutionResult[];

  /** Rollback tests performed */
  readonly rollbackTests: readonly RollbackTestResult[];

  /** Current issues/warnings */
  readonly issues: readonly string[];
}

/**
 * Options for executing cutover.
 */
export interface ExecuteCutoverOptions {
  /** Execution mode */
  readonly mode: ExecutionMode;

  /** Operator performing the cutover */
  readonly operatorId: string;

  /** Skip prerequisite check (for testing) */
  readonly skipPrerequisites?: boolean;

  /** Skip stability checks between routes */
  readonly skipStabilityChecks?: boolean;

  /** Test rollback before each phase */
  readonly testRollbackBeforePhase?: boolean;

  /** Max routes to process in this execution (for incremental execution) */
  readonly maxRoutes?: number;

  /** Specific routes to process (if not following full plan) */
  readonly specificRoutes?: readonly string[];

  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * Result of cutover execution.
 */
export interface ExecutionResult {
  /** Whether execution completed successfully */
  readonly success: boolean;

  /** Execution status */
  readonly status: ExecutionStatus;

  /** Final progress */
  readonly progress: ExecutionProgress;

  /** Summary message */
  readonly summary: string;

  /** Routes cut over */
  readonly cutoverRoutes: readonly string[];

  /** Routes failed */
  readonly failedRoutes: readonly string[];

  /** Routes remaining */
  readonly remainingRoutes: readonly string[];

  /** Recommendations */
  readonly recommendations: readonly string[];
}

/**
 * Interface for the Cutover Execution Service.
 */
export interface ICutoverExecutionService {
  /**
   * Get the current execution plan.
   */
  getExecutionPlan(): ExecutionPlan;

  /**
   * Get current execution progress.
   */
  getProgress(): ExecutionProgress;

  /**
   * Execute cutover according to plan.
   */
  executeCutover(options: ExecuteCutoverOptions): Promise<DomainResult<ExecutionResult>>;

  /**
   * Execute cutover for a single route.
   */
  executeSingleRoute(
    routeId: string,
    operatorId: string,
    options?: Partial<ExecuteCutoverOptions>,
  ): Promise<DomainResult<RouteExecutionResult>>;

  /**
   * Pause execution (for manual mode).
   */
  pauseExecution(): void;

  /**
   * Resume execution after pause.
   */
  resumeExecution(): Promise<DomainResult<ExecutionResult>>;

  /**
   * Test rollback for a route.
   */
  testRollback(routeId: string, operatorId: string): Promise<DomainResult<RollbackTestResult>>;

  /**
   * Execute emergency rollback for a route.
   */
  emergencyRollback(
    routeId: string,
    operatorId: string,
    reason: string,
  ): Promise<DomainResult<RollbackOperationResult>>;

  /**
   * Execute full system rollback.
   */
  fullSystemRollback(
    operatorId: string,
    reason: string,
  ): Promise<DomainResult<{ rolledBackRoutes: string[]; failedRoutes: string[] }>>;

  /**
   * Check if next route can proceed.
   */
  canProceedWithNextRoute(): DomainResult<{ canProceed: boolean; reason: string }>;

  /**
   * Get routes ready for cutover.
   */
  getReadyRoutes(): readonly string[];

  /**
   * Verify all prerequisites for execution.
   */
  verifyPrerequisites(): Promise<
    DomainResult<{ verified: boolean; issues: string[] }>
  >;

  /**
   * Reset execution state (for retry).
   */
  resetExecution(): void;
}

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const ExecutionErrorCodes = {
  PREREQUISITES_NOT_MET: 'CUTOVER_PREREQUISITES_NOT_MET',
  ROUTE_NOT_FOUND: 'CUTOVER_ROUTE_NOT_FOUND',
  DEPENDENCIES_NOT_SATISFIED: 'CUTOVER_DEPENDENCIES_NOT_SATISFIED',
  STABILITY_CHECK_FAILED: 'CUTOVER_STABILITY_CHECK_FAILED',
  ROLLBACK_TEST_FAILED: 'CUTOVER_ROLLBACK_TEST_FAILED',
  EXECUTION_ALREADY_RUNNING: 'CUTOVER_EXECUTION_ALREADY_RUNNING',
  EXECUTION_PAUSED: 'CUTOVER_EXECUTION_PAUSED',
  CUTOVER_FAILED: 'CUTOVER_OPERATION_FAILED',
  ROLLBACK_FAILED: 'CUTOVER_ROLLBACK_FAILED',
} as const;

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a Cutover Execution Service.
 *
 * @param cutoverService - Authorization cutover service
 * @param planService - Cutover plan service
 * @param monitoringService - Cutover monitoring service
 * @returns Cutover Execution Service implementation
 *
 * @example
 * ```typescript
 * const executionService = createCutoverExecutionService({
 *   cutoverService,
 *   planService,
 *   monitoringService,
 * });
 *
 * // Verify prerequisites
 * const prereqs = await executionService.verifyPrerequisites();
 * if (!prereqs.success) {
 *   console.error('Cannot proceed:', prereqs.error);
 *   return;
 * }
 *
 * // Execute cutover
 * const result = await executionService.executeCutover({
 *   mode: ExecutionMode.MANUAL,
 *   operatorId: 'admin-123',
 * });
 * ```
 */
export const createCutoverExecutionService = ({
  cutoverService,
  planService,
  monitoringService,
}: {
  cutoverService: IAuthorizationCutoverService;
  planService: ICutoverPlanService;
  monitoringService: ICutoverMonitoringService;
}): ICutoverExecutionService => {
  // Internal state
  let executionStatus = ExecutionStatus.NOT_STARTED;
  let currentPhase = 1;
  let currentRoute: string | null = null;
  let startedAt: Date | null = null;
  let lastActivityAt = new Date();
  const executionHistory: RouteExecutionResult[] = [];
  const rollbackTests: RollbackTestResult[] = [];
  let savedOptions: ExecuteCutoverOptions | null = null;
  const completedRoutes = new Set<string>();
  const failedRoutes = new Set<string>();

  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Build execution plan from plan service.
   */
  const buildExecutionPlan = (): ExecutionPlan => {
    const plan = planService.getPlan();
    const routes = planService.getRoutesInOrder();

    const phases: ExecutionPhase[] = plan.phases.map((p) => ({
      phase: p.phase,
      phaseName: p.name,
      routes: p.routes.map((r) => r.routeId),
      stabilityWindowMinutes: p.phaseStabilityWindowMinutes,
    }));

    // Estimate duration: sum of stability windows + 5 min per route
    const estimatedDuration = routes.reduce(
      (sum, r) => sum + r.stabilityWindowMinutes + 5,
      0,
    );

    return {
      planVersion: plan.version,
      routes,
      totalRoutes: routes.length,
      estimatedDurationMinutes: estimatedDuration,
      phases,
    };
  };

  /**
   * Build current progress.
   */
  const buildProgress = (): ExecutionProgress => {
    const plan = buildExecutionPlan();

    const routesCompleted = completedRoutes.size;
    const totalRoutes = plan.totalRoutes;
    const progressPercent =
      totalRoutes > 0 ? Math.round((routesCompleted / totalRoutes) * 100) : 0;

    // Calculate estimated remaining time
    const remainingRoutes = plan.routes.filter(
      (r) => !completedRoutes.has(r.routeId) && !failedRoutes.has(r.routeId),
    );
    const estimatedRemainingMinutes =
      remainingRoutes.reduce((sum, r) => sum + r.stabilityWindowMinutes + 5, 0);

    // Collect current issues
    const issues: string[] = [];
    const unstableRoutes = monitoringService.getUnstableRoutes();
    for (const routeId of unstableRoutes) {
      issues.push(`Route "${routeId}" is unstable`);
    }
    if (failedRoutes.size > 0) {
      issues.push(`${failedRoutes.size} route(s) failed cutover`);
    }

    return {
      status: executionStatus,
      currentPhase,
      totalPhases: plan.phases.length,
      routesCompleted,
      totalRoutes,
      routesFailed: failedRoutes.size,
      currentRoute,
      progressPercent,
      startedAt,
      lastActivityAt,
      estimatedRemainingMinutes:
        executionStatus === ExecutionStatus.IN_PROGRESS
          ? estimatedRemainingMinutes
          : null,
      executionHistory: [...executionHistory],
      rollbackTests: [...rollbackTests],
      issues,
    };
  };

  /**
   * Register routes in monitoring service.
   */
  const registerRoutesForMonitoring = (): void => {
    const routes = planService.getRoutesInOrder();
    for (const route of routes) {
      const cutoverStatus = cutoverService.getRouteCutoverStatus(route.routeId);
      monitoringService.registerRoute(
        route.routeId,
        cutoverStatus?.status ?? ('LEGACY' as CutoverStatus),
      );
    }
  };

  /**
   * Execute stability wait if needed.
   */
  const waitForStability = async (
    routeId: string,
    _stabilityWindowMinutes: number,
  ): Promise<StabilityCheckResult> => {
    // In a real implementation, this would wait and poll
    // For now, just perform a stability check
    return monitoringService.checkRouteStability(routeId);
  };

  /**
   * Get routes that are cut over.
   */
  const getCutoverRouteIds = (): Set<string> => {
    const cutover = new Set<string>();
    // Check all routes in the plan, not just registered ones
    const planRoutes = planService.getRoutesInOrder();
    for (const route of planRoutes) {
      if (cutoverService.isRouteCutOver(route.routeId)) {
        cutover.add(route.routeId);
      }
    }
    return cutover;
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    getExecutionPlan(): ExecutionPlan {
      return buildExecutionPlan();
    },

    getProgress(): ExecutionProgress {
      return buildProgress();
    },

    async executeCutover(
      options: ExecuteCutoverOptions,
    ): Promise<DomainResult<ExecutionResult>> {
      const startTime = Date.now();

      // Check if already running
      if (executionStatus === ExecutionStatus.IN_PROGRESS) {
        return fail(
          businessError(
            ExecutionErrorCodes.EXECUTION_ALREADY_RUNNING,
            'Cutover execution is already in progress',
          ),
        );
      }

      // Verify prerequisites unless skipped
      if (!options.skipPrerequisites) {
        const prereqs = await this.verifyPrerequisites();
        if (!prereqs.success) {
          return fail(prereqs.error);
        }
        if (!prereqs.data.verified) {
          return fail(
            businessError(
              ExecutionErrorCodes.PREREQUISITES_NOT_MET,
              `Prerequisites not met: ${prereqs.data.issues.join('; ')}`,
            ),
          );
        }
      }

      // Validate plan
      const validation = planService.validatePlan();
      if (!validation.valid) {
        return fail(
          businessError(
            ExecutionErrorCodes.PREREQUISITES_NOT_MET,
            `Plan validation failed: ${validation.errors.join('; ')}`,
          ),
        );
      }

      // Initialize execution
      executionStatus = ExecutionStatus.IN_PROGRESS;
      startedAt = new Date();
      lastActivityAt = startedAt;
      savedOptions = options;

      // Register routes for monitoring
      registerRoutesForMonitoring();

      // Determine routes to process
      const plan = buildExecutionPlan();
      let routesToProcess: readonly OrderedCutoverRoute[];

      if (options.specificRoutes && options.specificRoutes.length > 0) {
        routesToProcess = plan.routes.filter((r) =>
          options.specificRoutes!.includes(r.routeId),
        );
      } else {
        routesToProcess = plan.routes;
      }

      if (options.maxRoutes && options.maxRoutes > 0) {
        routesToProcess = routesToProcess.slice(0, options.maxRoutes);
      }

      // Handle dry run
      if (options.mode === ExecutionMode.DRY_RUN) {
        executionStatus = ExecutionStatus.COMPLETED;
        return ok({
          success: true,
          status: ExecutionStatus.COMPLETED,
          progress: buildProgress(),
          summary: `Dry run completed. ${routesToProcess.length} routes would be processed.`,
          cutoverRoutes: [],
          failedRoutes: [],
          remainingRoutes: routesToProcess.map((r) => r.routeId),
          recommendations: ['Execute in MANUAL or AUTOMATIC mode to perform actual cutover'],
        });
      }

      // Process routes
      const cutoverRoutes: string[] = [];
      const failedRoutesResult: string[] = [];
      const recommendations: string[] = [];

      for (const route of routesToProcess) {
        currentRoute = route.routeId;
        currentPhase = route.phase;
        lastActivityAt = new Date();

        // Skip if already completed or failed
        if (completedRoutes.has(route.routeId) || failedRoutes.has(route.routeId)) {
          continue;
        }

        // Check if paused (for manual mode)
        // Note: executionStatus can be changed by pauseExecution() called externally
        if ((executionStatus as ExecutionStatus) === ExecutionStatus.PAUSED) {
          break;
        }

        // Check dependencies
        const cutoverSet = getCutoverRouteIds();
        if (!planService.areDependenciesSatisfied(route.routeId, cutoverSet)) {
          // Skip this route for now — dependencies not met
          recommendations.push(
            `Skipped "${route.routeId}": dependencies not yet satisfied`,
          );
          continue;
        }

        // Test rollback before phase if configured
        if (
          options.testRollbackBeforePhase &&
          route.order === 1 &&
          cutoverSet.size > 0
        ) {
          // Pick a representative cut over route to test rollback
          const testRouteId = [...cutoverSet][0]!;
          const rollbackTest = await this.testRollback(testRouteId, options.operatorId);
          if (!rollbackTest.success || !rollbackTest.data.passed) {
            recommendations.push(
              `Rollback test failed for "${testRouteId}" before phase ${route.phase}. Consider investigating before proceeding.`,
            );
          }
        }

        // Execute cutover for this route
        const routeResult = await this.executeSingleRoute(
          route.routeId,
          options.operatorId,
          options,
        );

        if (routeResult.success && routeResult.data.success) {
          cutoverRoutes.push(route.routeId);
          completedRoutes.add(route.routeId);
        } else {
          failedRoutesResult.push(route.routeId);
          failedRoutes.add(route.routeId);

          // For automatic mode, stop on failure
          if (options.mode === ExecutionMode.AUTOMATIC) {
            executionStatus = ExecutionStatus.FAILED;
            break;
          }
        }

        // For manual mode, pause after each route
        if (options.mode === ExecutionMode.MANUAL) {
          executionStatus = ExecutionStatus.PAUSED;
          break;
        }
      }

      // Determine final status
      if (executionStatus === ExecutionStatus.IN_PROGRESS) {
        const remainingCount =
          plan.totalRoutes - completedRoutes.size - failedRoutes.size;
        if (remainingCount === 0) {
          executionStatus = ExecutionStatus.COMPLETED;
        }
      }

      currentRoute = null;
      lastActivityAt = new Date();

      const durationMs = Date.now() - startTime;
      const remainingRoutes = plan.routes
        .filter(
          (r) => !completedRoutes.has(r.routeId) && !failedRoutes.has(r.routeId),
        )
        .map((r) => r.routeId);

      return ok({
        success:
          executionStatus === ExecutionStatus.COMPLETED ||
          executionStatus === ExecutionStatus.PAUSED,
        status: executionStatus,
        progress: buildProgress(),
        summary: `Cutover executed in ${(durationMs / 1000).toFixed(1)}s. ${cutoverRoutes.length} succeeded, ${failedRoutesResult.length} failed, ${remainingRoutes.length} remaining.`,
        cutoverRoutes,
        failedRoutes: failedRoutesResult,
        remainingRoutes,
        recommendations,
      });
    },

    async executeSingleRoute(
      routeId: string,
      operatorId: string,
      options?: Partial<ExecuteCutoverOptions>,
    ): Promise<DomainResult<RouteExecutionResult>> {
      const startTime = Date.now();
      const executedAt = new Date();
      const recommendations: string[] = [];

      // Get route config
      const routeConfig = planService.getRouteConfig(routeId);
      if (!routeConfig) {
        return fail(
          businessError(
            ExecutionErrorCodes.ROUTE_NOT_FOUND,
            `Route "${routeId}" not found in cutover plan`,
          ),
        );
      }

      // Check dependencies
      const cutoverSet = getCutoverRouteIds();
      if (!planService.areDependenciesSatisfied(routeId, cutoverSet)) {
        const deps = routeConfig.dependsOn.filter((d) => !cutoverSet.has(d));
        return fail(
          businessError(
            ExecutionErrorCodes.DEPENDENCIES_NOT_SATISFIED,
            `Dependencies not satisfied for "${routeId}": ${deps.join(', ')}`,
          ),
        );
      }

      // Register route in cutover service if not already
      const registeredRoutes = cutoverService.getRegisteredRoutes();
      if (!registeredRoutes.includes(routeId)) {
        cutoverService.registerRoute(routeId, routeConfig.routeName);
      }

      // Execute cutover
      const cutoverResult = await cutoverService.initiateRouteCutover({
        routeId,
        operatorId,
        reason: `Planned cutover execution - Phase ${routeConfig.phase}`,
        skipPrerequisiteCheck: options?.skipPrerequisites,
        correlationId: options?.correlationId,
      });

      if (!cutoverResult.success) {
        const result: RouteExecutionResult = {
          routeId,
          success: false,
          cutoverResult,
          stabilityCheck: null,
          stabilityVerified: false,
          executedAt,
          durationMs: Date.now() - startTime,
          errorMessage: cutoverResult.errorMessage,
          recommendations: [`Investigate failure and retry: ${cutoverResult.errorMessage}`],
        };
        executionHistory.push(result);
        return ok(result);
      }

      // Update monitoring
      monitoringService.updateRouteCutoverStatus(
        routeId,
        cutoverResult.newStatus,
        new Date(),
      );

      // Check stability if not skipped
      let stabilityCheck: StabilityCheckResult | null = null;
      let stabilityVerified = false;

      if (!options?.skipStabilityChecks) {
        stabilityCheck = await waitForStability(
          routeId,
          routeConfig.stabilityWindowMinutes,
        );

        stabilityVerified =
          stabilityCheck.passed &&
          stabilityCheck.healthStatus === HealthStatus.HEALTHY;

        if (!stabilityVerified) {
          recommendations.push(
            `Route "${routeId}" stability not yet confirmed: ${stabilityCheck.recommendation}`,
          );
        }
      }

      const result: RouteExecutionResult = {
        routeId,
        success: true,
        cutoverResult,
        stabilityCheck,
        stabilityVerified,
        executedAt,
        durationMs: Date.now() - startTime,
        recommendations,
      };

      executionHistory.push(result);
      lastActivityAt = new Date();

      return ok(result);
    },

    pauseExecution(): void {
      if (executionStatus === ExecutionStatus.IN_PROGRESS) {
        executionStatus = ExecutionStatus.PAUSED;
        lastActivityAt = new Date();
      }
    },

    async resumeExecution(): Promise<DomainResult<ExecutionResult>> {
      if (executionStatus !== ExecutionStatus.PAUSED) {
        return fail(
          businessError(
            ExecutionErrorCodes.EXECUTION_PAUSED,
            'Execution is not paused',
          ),
        );
      }

      if (!savedOptions) {
        return fail(
          businessError(
            ExecutionErrorCodes.PREREQUISITES_NOT_MET,
            'No saved execution options found',
          ),
        );
      }

      // Don't set IN_PROGRESS here - executeCutover will handle it
      // But we need to reset PAUSED so executeCutover's "already running" check passes
      executionStatus = ExecutionStatus.NOT_STARTED;
      return this.executeCutover(savedOptions);
    },

    async testRollback(
      routeId: string,
      operatorId: string,
    ): Promise<DomainResult<RollbackTestResult>> {
      const startTime = Date.now();
      const testedAt = new Date();

      // Check if route is cut over
      if (!cutoverService.isRouteCutOver(routeId)) {
        return fail(
          businessError(
            ExecutionErrorCodes.ROLLBACK_TEST_FAILED,
            `Route "${routeId}" is not cut over — cannot test rollback`,
          ),
        );
      }

      // Execute rollback
      const rollbackResult = await cutoverService.rollbackRouteCutover({
        routeId,
        operatorId,
        reason: 'ROLLBACK_TEST: Validating rollback capability',
        isEmergency: false,
      });

      if (!rollbackResult.success) {
        const result: RollbackTestResult = {
          routeId,
          passed: false,
          rollbackResult,
          recutoverResult: null,
          stateRestored: false,
          testedAt,
          durationMs: Date.now() - startTime,
          errorMessage: `Rollback failed: ${rollbackResult.errorMessage}`,
        };
        rollbackTests.push(result);
        return ok(result);
      }

      // Re-execute cutover to restore state
      const recutoverResult = await cutoverService.initiateRouteCutover({
        routeId,
        operatorId,
        reason: 'ROLLBACK_TEST: Restoring state after test',
        skipPrerequisiteCheck: true,
      });

      const stateRestored = recutoverResult.success;

      const result: RollbackTestResult = {
        routeId,
        passed: stateRestored,
        rollbackResult,
        recutoverResult,
        stateRestored,
        testedAt,
        durationMs: Date.now() - startTime,
        errorMessage: stateRestored
          ? undefined
          : `State restoration failed: ${recutoverResult.errorMessage}`,
      };

      rollbackTests.push(result);
      return ok(result);
    },

    async emergencyRollback(
      routeId: string,
      operatorId: string,
      reason: string,
    ): Promise<DomainResult<RollbackOperationResult>> {
      const result = await cutoverService.rollbackRouteCutover({
        routeId,
        operatorId,
        reason: `EMERGENCY: ${reason}`,
        isEmergency: true,
      });

      if (result.success) {
        monitoringService.updateRouteCutoverStatus(routeId, result.newStatus);
        monitoringService.resetRouteMetrics(routeId);
        completedRoutes.delete(routeId);
      }

      return ok(result);
    },

    async fullSystemRollback(
      operatorId: string,
      reason: string,
    ): Promise<DomainResult<{ rolledBackRoutes: string[]; failedRoutes: string[] }>> {
      const rolledBackRoutes: string[] = [];
      const failedRoutesList: string[] = [];

      // Get all cut over routes
      const cutoverSet = getCutoverRouteIds();

      // Rollback in reverse order (most recently cut over first)
      const orderedRoutes = [...planService.getRoutesInOrder()].reverse();

      for (const route of orderedRoutes) {
        if (!cutoverSet.has(route.routeId)) continue;

        const rollbackResult = await this.emergencyRollback(
          route.routeId,
          operatorId,
          reason,
        );

        if (rollbackResult.success && rollbackResult.data.success) {
          rolledBackRoutes.push(route.routeId);
        } else {
          failedRoutesList.push(route.routeId);
        }
      }

      executionStatus = ExecutionStatus.ROLLED_BACK;
      lastActivityAt = new Date();

      return ok({
        rolledBackRoutes,
        failedRoutes: failedRoutesList,
      });
    },

    canProceedWithNextRoute(): DomainResult<{ canProceed: boolean; reason: string }> {
      // Check for unhealthy routes
      const unhealthyRoutes = monitoringService.getUnstableRoutes();
      if (unhealthyRoutes.length > 0) {
        return ok({
          canProceed: false,
          reason: `Unhealthy routes detected: ${unhealthyRoutes.join(', ')}`,
        });
      }

      // Check if any routes are ready
      const cutoverSet = getCutoverRouteIds();
      const eligibleRoutes = planService.getNextEligibleRoutes(cutoverSet);

      if (eligibleRoutes.length === 0) {
        const plan = buildExecutionPlan();
        const remainingCount = plan.totalRoutes - cutoverSet.size;
        if (remainingCount === 0) {
          return ok({
            canProceed: false,
            reason: 'All routes have been cut over',
          });
        }
        return ok({
          canProceed: false,
          reason: 'No routes ready — dependencies not satisfied',
        });
      }

      return ok({
        canProceed: true,
        reason: `Ready to proceed: ${eligibleRoutes.join(', ')}`,
      });
    },

    getReadyRoutes(): readonly string[] {
      const cutoverSet = getCutoverRouteIds();
      return planService.getNextEligibleRoutes(cutoverSet);
    },

    async verifyPrerequisites(): Promise<
      DomainResult<{ verified: boolean; issues: string[] }>
    > {
      const issues: string[] = [];

      // Verify cutover service prerequisites
      const prereqs = await cutoverService.verifyCutoverPrerequisites();
      if (!prereqs.allMet) {
        issues.push(...prereqs.blockingIssues);
      }

      // Validate plan
      const planValidation = planService.validatePlan();
      if (!planValidation.valid) {
        issues.push(...planValidation.errors);
      }

      return ok({
        verified: issues.length === 0,
        issues,
      });
    },

    resetExecution(): void {
      executionStatus = ExecutionStatus.NOT_STARTED;
      currentPhase = 1;
      currentRoute = null;
      startedAt = null;
      lastActivityAt = new Date();
      executionHistory.length = 0;
      rollbackTests.length = 0;
      savedOptions = null;
      completedRoutes.clear();
      failedRoutes.clear();
      monitoringService.resetAllMetrics();
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type CutoverExecutionService = ICutoverExecutionService;
