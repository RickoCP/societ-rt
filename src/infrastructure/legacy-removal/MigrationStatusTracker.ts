/**
 * Migration Status Tracker — Tracks progress of User.tenantId migration.
 *
 * This service provides:
 * 1. Overall migration status tracking
 * 2. Progress metrics by category
 * 3. Completion checking for authorization-critical paths
 * 4. Blocking issue identification
 *
 * **Key Metrics:**
 * - Total code paths identified
 * - Paths by classification (authorization-critical, read-only, etc.)
 * - Paths by migration status (pending, migrated, etc.)
 * - Progress percentage
 *
 * @see Task 35: Code Path Analysis and Update
 * @see Requirement 12 (AC 1-6)
 */

import type {
  IMigrationStatusTracker,
  MigrationStatus,
  MigrationProgress,
  CodePathUsage,
  CodePathClassification,
  CodePathMigrationStatus,
  MigrationPriority,
  RouteAuthorizationValidation,
} from './types';

// ---------------------------------------------------------------------------
// Migration Status Tracker Implementation
// ---------------------------------------------------------------------------

/**
 * Dependencies for MigrationStatusTracker.
 */
export interface MigrationStatusTrackerDependencies {
  /**
   * Function to get all code path usages.
   */
  readonly getCodePathUsages: () => readonly CodePathUsage[];

  /**
   * Function to get route validations.
   */
  readonly getRouteValidations: () => readonly RouteAuthorizationValidation[];

  /**
   * Function to update a code path's migration status.
   */
  readonly updateCodePathStatus: (
    usageId: string,
    status: CodePathMigrationStatus,
    notes?: string,
  ) => void;
}

/**
 * Factory function to create a Migration Status Tracker.
 *
 * @param deps - Dependencies for the tracker
 * @returns Migration Status Tracker implementation
 *
 * @example
 * ```typescript
 * const tracker = MigrationStatusTrackerImpl({
 *   getCodePathUsages: () => analyzer.analyzeCodePaths(),
 *   getRouteValidations: () => validator.validateAllRoutes(),
 *   updateCodePathStatus: analyzer.updateMigrationStatus,
 * });
 *
 * const status = tracker.getStatus();
 * console.log(`Migration progress: ${status.progressPercentage}%`);
 * ```
 */
export const MigrationStatusTrackerImpl = (
  deps: MigrationStatusTrackerDependencies,
): IMigrationStatusTracker => {
  const { getCodePathUsages, getRouteValidations, updateCodePathStatus } = deps;

  /**
   * Count items by a classifier function.
   */
  function countBy<T, K extends string>(
    items: readonly T[],
    classifier: (item: T) => K,
  ): Record<K, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const key = classifier(item);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts as Record<K, number>;
  }

  /**
   * Ensure all enum values are present in counts.
   */
  function ensureAllKeys<K extends string>(
    counts: Record<string, number>,
    allKeys: readonly K[],
  ): Record<K, number> {
    const result: Record<string, number> = { ...counts };
    for (const key of allKeys) {
      if (!(key in result)) {
        result[key] = 0;
      }
    }
    return result as Record<K, number>;
  }

  /**
   * Get blocking issues from current state.
   */
  function identifyBlockingIssues(
    usages: readonly CodePathUsage[],
    routeValidations: readonly RouteAuthorizationValidation[],
  ): string[] {
    const issues: string[] = [];

    // Check for authorization-critical paths still pending
    const criticalPending = usages.filter(
      (u) =>
        u.classification === 'authorization-critical' &&
        (u.status === 'pending' || u.status === 'in-progress'),
    );
    if (criticalPending.length > 0) {
      issues.push(
        `${criticalPending.length} authorization-critical code paths not yet migrated`,
      );
    }

    // Check for routes still using legacy authorization
    const legacyRoutes = routeValidations.filter(
      (r) =>
        r.validationStatus === 'legacy' || r.validationStatus === 'partial',
    );
    if (legacyRoutes.length > 0) {
      issues.push(
        `${legacyRoutes.length} route handlers still using legacy authorization`,
      );
    }

    // Check for critical priority items
    const criticalItems = usages.filter(
      (u) => u.priority === 'critical' && u.status === 'pending',
    );
    if (criticalItems.length > 0) {
      issues.push(
        `${criticalItems.length} critical priority items still pending`,
      );
    }

    return issues;
  }

  return {
    getStatus(): MigrationStatus {
      const usages = getCodePathUsages();
      const routeValidations = getRouteValidations();

      const totalPaths = usages.length;

      // Count by classification
      const classificationCounts = countBy(usages, (u) => u.classification);
      const byClassification = ensureAllKeys<CodePathClassification>(
        classificationCounts,
        ['authorization-critical', 'read-only', 'backward-compat', 'non-authorization'],
      );

      // Count by status
      const statusCounts = countBy(usages, (u) => u.status);
      const byStatus = ensureAllKeys<CodePathMigrationStatus>(
        statusCounts,
        ['pending', 'in-progress', 'migrated', 'deprecated', 'removed'],
      );

      // Count by priority
      const priorityCounts = countBy(usages, (u) => u.priority);
      const byPriority = ensureAllKeys<MigrationPriority>(
        priorityCounts,
        ['critical', 'high', 'medium', 'low'],
      );

      // Calculate progress
      const migratedOrDeprecated =
        (byStatus['migrated'] ?? 0) +
        (byStatus['deprecated'] ?? 0) +
        (byStatus['removed'] ?? 0);
      const progressPercentage =
        totalPaths > 0
          ? Math.round((migratedOrDeprecated / totalPaths) * 100)
          : 100;

      // Check completion (all authorization-critical paths migrated)
      const authCriticalTotal = byClassification['authorization-critical'] ?? 0;
      const authCriticalMigrated = usages.filter(
        (u) =>
          u.classification === 'authorization-critical' &&
          (u.status === 'migrated' || u.status === 'removed'),
      ).length;
      const isComplete = authCriticalMigrated === authCriticalTotal;

      // Identify blocking issues
      const blockingIssues = identifyBlockingIssues(usages, routeValidations);

      return {
        checkedAt: new Date(),
        totalPaths,
        byClassification,
        byStatus,
        byPriority,
        progressPercentage,
        isComplete,
        blockingIssues,
      };
    },

    getProgress(category: string): MigrationProgress {
      const usages = getCodePathUsages();

      // Filter by category (classification or priority)
      let filtered: readonly CodePathUsage[];
      if (
        ['authorization-critical', 'read-only', 'backward-compat', 'non-authorization'].includes(
          category,
        )
      ) {
        filtered = usages.filter(
          (u) => u.classification === category,
        );
      } else if (['critical', 'high', 'medium', 'low'].includes(category)) {
        filtered = usages.filter((u) => u.priority === category);
      } else {
        // Unknown category - return empty progress
        return {
          category,
          total: 0,
          completed: 0,
          inProgress: 0,
          pending: 0,
          percentage: 100,
        };
      }

      const total = filtered.length;
      const completed = filtered.filter(
        (u) =>
          u.status === 'migrated' ||
          u.status === 'deprecated' ||
          u.status === 'removed',
      ).length;
      const inProgress = filtered.filter(
        (u) => u.status === 'in-progress',
      ).length;
      const pending = filtered.filter((u) => u.status === 'pending').length;

      const percentage =
        total > 0 ? Math.round((completed / total) * 100) : 100;

      return {
        category,
        total,
        completed,
        inProgress,
        pending,
        percentage,
      };
    },

    recordMigrated(usageId: string): void {
      updateCodePathStatus(usageId, 'migrated');
    },

    isMigrationComplete(): boolean {
      const status = this.getStatus();
      return status.isComplete && status.blockingIssues.length === 0;
    },

    getBlockingIssues(): readonly string[] {
      const status = this.getStatus();
      return status.blockingIssues;
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type MigrationStatusTracker = IMigrationStatusTracker;

// ---------------------------------------------------------------------------
// Standalone Tracker Factory
// ---------------------------------------------------------------------------

/**
 * Create a standalone migration status tracker with internal state.
 *
 * This is useful for testing or when you need a self-contained tracker
 * that doesn't depend on external analyzer/validator instances.
 *
 * @example
 * ```typescript
 * const tracker = createStandaloneMigrationStatusTracker();
 * tracker.addUsages(usages);
 * tracker.addRouteValidations(validations);
 * const status = tracker.getStatus();
 * ```
 */
export interface StandaloneMigrationStatusTracker extends IMigrationStatusTracker {
  /**
   * Add code path usages to track.
   */
  addUsages(usages: readonly CodePathUsage[]): void;

  /**
   * Add route validations to track.
   */
  addRouteValidations(validations: readonly RouteAuthorizationValidation[]): void;

  /**
   * Clear all tracked data.
   */
  clear(): void;
}

export function createStandaloneMigrationStatusTracker(): StandaloneMigrationStatusTracker {
  const usages: Map<string, CodePathUsage> = new Map();
  const routeValidations: Map<string, RouteAuthorizationValidation> = new Map();

  const baseTracker = MigrationStatusTrackerImpl({
    getCodePathUsages: () => Array.from(usages.values()),
    getRouteValidations: () => Array.from(routeValidations.values()),
    updateCodePathStatus: (usageId, status, notes) => {
      const usage = usages.get(usageId);
      if (usage) {
        usages.set(usageId, { ...usage, status, notes: notes ?? usage.notes });
      }
    },
  });

  return {
    ...baseTracker,

    addUsages(newUsages: readonly CodePathUsage[]): void {
      for (const usage of newUsages) {
        usages.set(usage.id, usage);
      }
    },

    addRouteValidations(validations: readonly RouteAuthorizationValidation[]): void {
      for (const validation of validations) {
        routeValidations.set(validation.routeId, validation);
      }
    },

    clear(): void {
      usages.clear();
      routeValidations.clear();
    },
  };
}
