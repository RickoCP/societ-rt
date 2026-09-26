/**
 * Cutover Plan — Configuration for route-by-route authorization cutover.
 *
 * This module defines the cutover plan configuration for staged rollout of
 * the authorization migration. Routes can be organized into phases with
 * dependencies, allowing incremental cutover with clear ordering.
 *
 * **Key Features:**
 * - Route ordering with phases
 * - Inter-route dependencies
 * - Staged rollout support
 * - Validation before execution
 *
 * @see Task 26: Cutover Execution and Monitoring
 * @see Requirements 8 (AC 1-3)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Priority level for cutover routes.
 */
export enum CutoverPriority {
  /** Highest priority — cut over first (critical routes with proven stability) */
  CRITICAL = 'CRITICAL',
  /** High priority — cut over early */
  HIGH = 'HIGH',
  /** Normal priority — standard cutover order */
  NORMAL = 'NORMAL',
  /** Low priority — cut over later (less critical or more risky) */
  LOW = 'LOW',
}

/**
 * Configuration for a single route in the cutover plan.
 */
export interface CutoverRouteConfig {
  /** Unique route identifier (must match registered route) */
  readonly routeId: string;

  /** Human-readable route name */
  readonly routeName: string;

  /** Phase number (lower = earlier cutover) */
  readonly phase: number;

  /** Order within phase (lower = earlier within phase) */
  readonly order: number;

  /** Priority level for this route */
  readonly priority: CutoverPriority;

  /** Route IDs that must be cut over before this route */
  readonly dependsOn: readonly string[];

  /** Route IDs that must be rolled back if this route is rolled back */
  readonly cascadeRollback: readonly string[];

  /** Stability window in minutes required after cutover before proceeding */
  readonly stabilityWindowMinutes: number;

  /** Description/notes for this route */
  readonly description?: string;

  /** Tags for grouping/filtering */
  readonly tags?: readonly string[];
}

/**
 * Configuration for a cutover phase.
 */
export interface CutoverPhaseConfig {
  /** Phase number */
  readonly phase: number;

  /** Phase name */
  readonly name: string;

  /** Description of this phase */
  readonly description: string;

  /** Route configurations in this phase */
  readonly routes: readonly CutoverRouteConfig[];

  /** Minimum stability window before proceeding to next phase (minutes) */
  readonly phaseStabilityWindowMinutes: number;

  /** Whether to stop on first failure in this phase */
  readonly stopOnFailure: boolean;
}

/**
 * Complete cutover plan configuration.
 */
export interface CutoverPlanConfig {
  /** Plan version */
  readonly version: string;

  /** Plan name */
  readonly name: string;

  /** Creation timestamp */
  readonly createdAt: Date;

  /** Last update timestamp */
  readonly updatedAt: Date;

  /** Phases in order */
  readonly phases: readonly CutoverPhaseConfig[];

  /** Default stability window in minutes */
  readonly defaultStabilityWindowMinutes: number;

  /** Maximum routes to cut over in parallel within a phase */
  readonly maxParallelCutover: number;

  /** Global rollback threshold — rollback all if this % of routes fail */
  readonly globalRollbackThreshold: number;

  /** Notes/comments */
  readonly notes?: string;
}

/**
 * Result of plan validation.
 */
export interface CutoverPlanValidationResult {
  /** Whether the plan is valid */
  readonly valid: boolean;

  /** Validation errors (if any) */
  readonly errors: readonly string[];

  /** Validation warnings (if any) */
  readonly warnings: readonly string[];

  /** Total route count */
  readonly totalRoutes: number;

  /** Total phase count */
  readonly totalPhases: number;
}

/**
 * Route with computed execution order.
 */
export interface OrderedCutoverRoute extends CutoverRouteConfig {
  /** Computed global execution order (1 = first) */
  readonly executionOrder: number;

  /** Phase this route belongs to */
  readonly phaseName: string;

  /** Resolved dependencies (routes that must complete first) */
  readonly resolvedDependencies: readonly string[];
}

/**
 * Interface for the Cutover Plan Service.
 */
export interface ICutoverPlanService {
  /**
   * Get the current cutover plan configuration.
   */
  getPlan(): CutoverPlanConfig;

  /**
   * Validate the cutover plan.
   */
  validatePlan(): CutoverPlanValidationResult;

  /**
   * Get all routes in execution order.
   */
  getRoutesInOrder(): readonly OrderedCutoverRoute[];

  /**
   * Get routes for a specific phase.
   */
  getPhaseRoutes(phase: number): readonly CutoverRouteConfig[];

  /**
   * Get route configuration by ID.
   */
  getRouteConfig(routeId: string): CutoverRouteConfig | undefined;

  /**
   * Check if a route's dependencies are satisfied.
   */
  areDependenciesSatisfied(
    routeId: string,
    cutoverRoutes: ReadonlySet<string>,
  ): boolean;

  /**
   * Get routes that would need rollback if the given route is rolled back.
   */
  getCascadeRollbackRoutes(routeId: string): readonly string[];

  /**
   * Get the next routes eligible for cutover.
   */
  getNextEligibleRoutes(cutoverRoutes: ReadonlySet<string>): readonly string[];

  /**
   * Update the plan (for dynamic configuration).
   */
  updatePlan(updates: Partial<CutoverPlanConfig>): void;

  /**
   * Add a route to the plan.
   */
  addRoute(route: CutoverRouteConfig): void;

  /**
   * Remove a route from the plan.
   */
  removeRoute(routeId: string): void;
}

// ---------------------------------------------------------------------------
// Default Plan Configuration
// ---------------------------------------------------------------------------

/**
 * Default cutover plan with standard route organization.
 *
 * Routes are organized by risk/criticality:
 * - Phase 1: Read-only, low-risk routes
 * - Phase 2: Standard routes
 * - Phase 3: Write operations
 * - Phase 4: Critical/administrative routes
 */
export const DEFAULT_CUTOVER_PLAN: CutoverPlanConfig = {
  version: '1.0.0',
  name: 'Authorization Cutover Plan v1',
  createdAt: new Date(),
  updatedAt: new Date(),
  defaultStabilityWindowMinutes: 30,
  maxParallelCutover: 1, // Sequential by default for safety
  globalRollbackThreshold: 0.2, // Rollback all if 20% of routes fail
  phases: [
    {
      phase: 1,
      name: 'Read-Only Routes',
      description: 'Low-risk read-only routes for initial validation',
      phaseStabilityWindowMinutes: 30,
      stopOnFailure: true,
      routes: [
        {
          routeId: 'get-announcements',
          routeName: 'Get Announcements List',
          phase: 1,
          order: 1,
          priority: CutoverPriority.HIGH,
          dependsOn: [],
          cascadeRollback: [],
          stabilityWindowMinutes: 15,
          description: 'Public announcements list - lowest risk',
          tags: ['read', 'public'],
        },
        {
          routeId: 'get-events',
          routeName: 'Get Events List',
          phase: 1,
          order: 2,
          priority: CutoverPriority.HIGH,
          dependsOn: [],
          cascadeRollback: [],
          stabilityWindowMinutes: 15,
          description: 'Events list - low risk',
          tags: ['read', 'public'],
        },
        {
          routeId: 'get-emergency-contacts',
          routeName: 'Get Emergency Contacts',
          phase: 1,
          order: 3,
          priority: CutoverPriority.CRITICAL,
          dependsOn: [],
          cascadeRollback: [],
          stabilityWindowMinutes: 15,
          description: 'Emergency contacts - safety critical read',
          tags: ['read', 'safety'],
        },
      ],
    },
    {
      phase: 2,
      name: 'Standard Read Routes',
      description: 'Standard authenticated read operations',
      phaseStabilityWindowMinutes: 30,
      stopOnFailure: true,
      routes: [
        {
          routeId: 'get-residents',
          routeName: 'Get Residents List',
          phase: 2,
          order: 1,
          priority: CutoverPriority.NORMAL,
          dependsOn: ['get-announcements'],
          cascadeRollback: [],
          stabilityWindowMinutes: 20,
          description: 'Residents list - requires phase 1 stability',
          tags: ['read', 'residents'],
        },
        {
          routeId: 'get-households',
          routeName: 'Get Households List',
          phase: 2,
          order: 2,
          priority: CutoverPriority.NORMAL,
          dependsOn: ['get-residents'],
          cascadeRollback: [],
          stabilityWindowMinutes: 20,
          description: 'Households list - depends on residents',
          tags: ['read', 'households'],
        },
        {
          routeId: 'get-finance-reports',
          routeName: 'Get Finance Reports',
          phase: 2,
          order: 3,
          priority: CutoverPriority.NORMAL,
          dependsOn: [],
          cascadeRollback: [],
          stabilityWindowMinutes: 20,
          description: 'Finance reports - requires admin auth',
          tags: ['read', 'finance', 'admin'],
        },
      ],
    },
    {
      phase: 3,
      name: 'Write Operations',
      description: 'Standard write operations with state changes',
      phaseStabilityWindowMinutes: 45,
      stopOnFailure: true,
      routes: [
        {
          routeId: 'create-announcement',
          routeName: 'Create Announcement',
          phase: 3,
          order: 1,
          priority: CutoverPriority.NORMAL,
          dependsOn: ['get-announcements'],
          cascadeRollback: [],
          stabilityWindowMinutes: 30,
          description: 'Create announcements - write with low risk',
          tags: ['write', 'announcements'],
        },
        {
          routeId: 'update-resident',
          routeName: 'Update Resident',
          phase: 3,
          order: 2,
          priority: CutoverPriority.NORMAL,
          dependsOn: ['get-residents'],
          cascadeRollback: [],
          stabilityWindowMinutes: 30,
          description: 'Update resident info',
          tags: ['write', 'residents'],
        },
        {
          routeId: 'create-finance-transaction',
          routeName: 'Create Finance Transaction',
          phase: 3,
          order: 3,
          priority: CutoverPriority.HIGH,
          dependsOn: ['get-finance-reports'],
          cascadeRollback: ['update-resident'],
          stabilityWindowMinutes: 30,
          description: 'Financial transactions - higher risk',
          tags: ['write', 'finance'],
        },
      ],
    },
    {
      phase: 4,
      name: 'Critical/Administrative Routes',
      description: 'High-risk administrative and safety-critical operations',
      phaseStabilityWindowMinutes: 60,
      stopOnFailure: true,
      routes: [
        {
          routeId: 'trigger-emergency',
          routeName: 'Trigger Emergency Alert',
          phase: 4,
          order: 1,
          priority: CutoverPriority.CRITICAL,
          dependsOn: ['get-emergency-contacts'],
          cascadeRollback: [],
          stabilityWindowMinutes: 30,
          description: 'Emergency alert - safety critical',
          tags: ['write', 'safety', 'critical'],
        },
        {
          routeId: 'admin-user-management',
          routeName: 'User Management Admin',
          phase: 4,
          order: 2,
          priority: CutoverPriority.HIGH,
          dependsOn: ['get-residents', 'update-resident'],
          cascadeRollback: ['create-finance-transaction'],
          stabilityWindowMinutes: 45,
          description: 'Admin user management - high privilege',
          tags: ['write', 'admin', 'users'],
        },
        {
          routeId: 'admin-tenant-config',
          routeName: 'Tenant Configuration',
          phase: 4,
          order: 3,
          priority: CutoverPriority.CRITICAL,
          dependsOn: ['admin-user-management'],
          cascadeRollback: ['admin-user-management'],
          stabilityWindowMinutes: 60,
          description: 'Tenant config - highest privilege',
          tags: ['write', 'admin', 'tenant'],
        },
      ],
    },
  ],
  notes: 'Default cutover plan with 4 phases, increasing risk',
};

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a Cutover Plan Service.
 *
 * @param initialPlan - Initial plan configuration (defaults to DEFAULT_CUTOVER_PLAN)
 * @returns Cutover Plan Service implementation
 *
 * @example
 * ```typescript
 * const planService = createCutoverPlanService();
 * const validation = planService.validatePlan();
 * if (validation.valid) {
 *   const orderedRoutes = planService.getRoutesInOrder();
 *   // Execute cutover in order
 * }
 * ```
 */
export const createCutoverPlanService = (
  initialPlan: CutoverPlanConfig = DEFAULT_CUTOVER_PLAN,
): ICutoverPlanService => {
  // Internal mutable state
  let plan = { ...initialPlan };
  let routeMap = new Map<string, CutoverRouteConfig>();

  // Build route map
  const rebuildRouteMap = (): void => {
    routeMap.clear();
    for (const phase of plan.phases) {
      for (const route of phase.routes) {
        routeMap.set(route.routeId, route);
      }
    }
  };

  rebuildRouteMap();

  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Compute execution order for all routes.
   */
  const computeExecutionOrder = (): OrderedCutoverRoute[] => {
    const orderedRoutes: OrderedCutoverRoute[] = [];
    let executionOrder = 1;

    // Process phases in order
    const sortedPhases = [...plan.phases].sort((a, b) => a.phase - b.phase);

    for (const phase of sortedPhases) {
      // Sort routes within phase by order
      const sortedRoutes = [...phase.routes].sort((a, b) => a.order - b.order);

      for (const route of sortedRoutes) {
        // Resolve transitive dependencies
        const resolvedDeps = resolveTransitiveDependencies(route.routeId);

        orderedRoutes.push({
          ...route,
          executionOrder: executionOrder++,
          phaseName: phase.name,
          resolvedDependencies: resolvedDeps,
        });
      }
    }

    return orderedRoutes;
  };

  /**
   * Resolve transitive dependencies for a route.
   */
  const resolveTransitiveDependencies = (routeId: string): string[] => {
    const resolved = new Set<string>();
    const toProcess = new Set<string>();

    const route = routeMap.get(routeId);
    if (!route) return [];

    // Add direct dependencies
    for (const dep of route.dependsOn) {
      toProcess.add(dep);
    }

    // Process transitively
    while (toProcess.size > 0) {
      const dep = [...toProcess][0]!;
      toProcess.delete(dep);

      if (resolved.has(dep)) continue;
      resolved.add(dep);

      const depRoute = routeMap.get(dep);
      if (depRoute) {
        for (const transitiveDep of depRoute.dependsOn) {
          if (!resolved.has(transitiveDep)) {
            toProcess.add(transitiveDep);
          }
        }
      }
    }

    return [...resolved];
  };

  /**
   * Detect circular dependencies.
   */
  const detectCircularDependencies = (): string[] => {
    const errors: string[] = [];

    for (const [routeId] of routeMap) {
      const visited = new Set<string>();
      const path: string[] = [];

      const hasCycle = (currentId: string): boolean => {
        if (path.includes(currentId)) {
          const cycleStart = path.indexOf(currentId);
          const cycle = path.slice(cycleStart).join(' -> ') + ' -> ' + currentId;
          errors.push(`Circular dependency detected: ${cycle}`);
          return true;
        }

        if (visited.has(currentId)) return false;
        visited.add(currentId);
        path.push(currentId);

        const route = routeMap.get(currentId);
        if (route) {
          for (const dep of route.dependsOn) {
            if (hasCycle(dep)) return true;
          }
        }

        path.pop();
        return false;
      };

      hasCycle(routeId);
    }

    return errors;
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    getPlan(): CutoverPlanConfig {
      // Return deep copy to ensure immutability
      return {
        ...plan,
        phases: plan.phases.map(phase => ({
          ...phase,
          routes: phase.routes.map(route => ({
            ...route,
            dependsOn: route.dependsOn ? [...route.dependsOn] : [],
            cascadeRollback: route.cascadeRollback ? [...route.cascadeRollback] : [],
            tags: route.tags ? [...route.tags] : undefined,
          })),
        })),
      };
    },

    validatePlan(): CutoverPlanValidationResult {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check for duplicate route IDs
      const routeIds = new Set<string>();
      for (const phase of plan.phases) {
        for (const route of phase.routes) {
          if (routeIds.has(route.routeId)) {
            errors.push(`Duplicate route ID: ${route.routeId}`);
          }
          routeIds.add(route.routeId);
        }
      }

      // Check for missing dependencies
      for (const [routeId, route] of routeMap) {
        for (const dep of route.dependsOn) {
          if (!routeMap.has(dep)) {
            errors.push(
              `Route "${routeId}" depends on non-existent route "${dep}"`,
            );
          }
        }

        for (const cascade of route.cascadeRollback) {
          if (!routeMap.has(cascade)) {
            warnings.push(
              `Route "${routeId}" has cascade rollback for non-existent route "${cascade}"`,
            );
          }
        }
      }

      // Check for circular dependencies
      const circularErrors = detectCircularDependencies();
      errors.push(...circularErrors);

      // Check phase ordering
      const phaseNumbers = plan.phases.map((p) => p.phase);
      const uniquePhases = new Set(phaseNumbers);
      if (uniquePhases.size !== phaseNumbers.length) {
        errors.push('Duplicate phase numbers detected');
      }

      // Check for cross-phase dependencies that violate order
      for (const phase of plan.phases) {
        for (const route of phase.routes) {
          for (const dep of route.dependsOn) {
            const depRoute = routeMap.get(dep);
            if (depRoute && depRoute.phase > route.phase) {
              errors.push(
                `Route "${route.routeId}" (phase ${route.phase}) depends on "${dep}" (phase ${depRoute.phase}) which is in a later phase`,
              );
            }
          }
        }
      }

      // Warnings for empty phases
      for (const phase of plan.phases) {
        if (phase.routes.length === 0) {
          warnings.push(`Phase ${phase.phase} "${phase.name}" has no routes`);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        totalRoutes: routeMap.size,
        totalPhases: plan.phases.length,
      };
    },

    getRoutesInOrder(): readonly OrderedCutoverRoute[] {
      return computeExecutionOrder();
    },

    getPhaseRoutes(phase: number): readonly CutoverRouteConfig[] {
      const phaseConfig = plan.phases.find((p) => p.phase === phase);
      return phaseConfig?.routes ?? [];
    },

    getRouteConfig(routeId: string): CutoverRouteConfig | undefined {
      return routeMap.get(routeId);
    },

    areDependenciesSatisfied(
      routeId: string,
      cutoverRoutes: ReadonlySet<string>,
    ): boolean {
      const route = routeMap.get(routeId);
      if (!route) return false;

      // Check all dependencies (including transitive) are cut over
      const allDeps = resolveTransitiveDependencies(routeId);
      return allDeps.every((dep) => cutoverRoutes.has(dep));
    },

    getCascadeRollbackRoutes(routeId: string): readonly string[] {
      const result: string[] = [];
      const processed = new Set<string>();

      const collectCascade = (currentId: string): void => {
        if (processed.has(currentId)) return;
        processed.add(currentId);

        // Find routes that depend on this route or have cascade rollback to it
        for (const [id, route] of routeMap) {
          if (id === routeId) continue;

          // Routes that depend on the rolled back route need rollback
          if (route.dependsOn.includes(currentId) && !result.includes(id)) {
            result.push(id);
            collectCascade(id);
          }

          // Explicit cascade rollback
          if (route.cascadeRollback.includes(currentId) && !result.includes(id)) {
            result.push(id);
            collectCascade(id);
          }
        }
      };

      collectCascade(routeId);
      return result;
    },

    getNextEligibleRoutes(cutoverRoutes: ReadonlySet<string>): readonly string[] {
      const eligible: string[] = [];
      const orderedRoutes = computeExecutionOrder();

      for (const route of orderedRoutes) {
        // Skip already cut over routes
        if (cutoverRoutes.has(route.routeId)) continue;

        // Check if dependencies are satisfied
        if (this.areDependenciesSatisfied(route.routeId, cutoverRoutes)) {
          eligible.push(route.routeId);

          // Respect maxParallelCutover
          if (eligible.length >= plan.maxParallelCutover) {
            break;
          }
        }
      }

      return eligible;
    },

    updatePlan(updates: Partial<CutoverPlanConfig>): void {
      plan = {
        ...plan,
        ...updates,
        updatedAt: new Date(),
      };
      if (updates.phases) {
        rebuildRouteMap();
      }
    },

    addRoute(route: CutoverRouteConfig): void {
      // Find the phase
      const phaseIndex = plan.phases.findIndex((p) => p.phase === route.phase);
      if (phaseIndex === -1) {
        throw new Error(`Phase ${route.phase} does not exist`);
      }

      // Add to phase
      const mutablePhases = [...plan.phases] as CutoverPhaseConfig[];
      const phase = mutablePhases[phaseIndex]!;
      const mutableRoutes = [...phase.routes, route];

      mutablePhases[phaseIndex] = {
        ...phase,
        routes: mutableRoutes,
      };

      plan = {
        ...plan,
        phases: mutablePhases,
        updatedAt: new Date(),
      };

      rebuildRouteMap();
    },

    removeRoute(routeId: string): void {
      const mutablePhases = plan.phases.map((phase) => ({
        ...phase,
        routes: phase.routes.filter((r) => r.routeId !== routeId),
      }));

      plan = {
        ...plan,
        phases: mutablePhases,
        updatedAt: new Date(),
      };

      rebuildRouteMap();
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type CutoverPlanService = ICutoverPlanService;
