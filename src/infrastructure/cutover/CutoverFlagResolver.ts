/**
 * CutoverFlagResolver — Granular Feature Flag Control for Authorization Cutover
 *
 * Provides hierarchical feature flag control for switching routes from legacy
 * authorization to new membership-based authorization. Supports:
 * - Global cutover flag (affects all routes)
 * - Domain-level flags (affects all routes in a domain)
 * - Route-specific flags (fine-grained control)
 *
 * **Flag Hierarchy:**
 * ```
 * auth.cutover.enabled (global)
 * ├── auth.cutover.domain.residents
 * │   ├── auth.cutover.route.residents.list
 * │   ├── auth.cutover.route.residents.create
 * │   └── auth.cutover.route.residents.import
 * ├── auth.cutover.domain.finance
 * │   ├── auth.cutover.route.finance.transactions
 * │   └── auth.cutover.route.finance.balance
 * └── ...
 * ```
 *
 * **Precedence Rule:** route-specific > domain-specific > global
 *
 * **Prerequisites for Cutover (ALL THREE REQUIRED):**
 * 1. Mismatch rate < 0.1% (necessary but not sufficient)
 * 2. Observation window >= 7 days
 * 3. Sample size >= 10,000 requests
 *
 * **Key Features:**
 * - Hot-reload: Flag changes take effect on next request without restart
 * - Audit logging: All flag changes logged with full context
 * - Instant rollback: Immediate flag rollback if errors exceed threshold
 *
 * @see Requirements 5 (AC 1-8) — Cutover Feature Flags
 * @see Design Cutover Feature Flags
 * @see 12-error-handling.md Steering
 */

import type { Logger } from '@infrastructure/logging/Logger';
import type { IShadowAuthExecutor, ShadowMetrics } from '@infrastructure/shadow/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Cutover flag types following the naming convention.
 */
export const CUTOVER_FLAG_NAMES = {
  GLOBAL: 'auth.cutover.enabled',
  DOMAIN_PREFIX: 'auth.cutover.domain.',
  ROUTE_PREFIX: 'auth.cutover.route.',
} as const;

/**
 * Configuration for cutover prerequisites.
 *
 * @see Requirements 5.6
 */
export interface CutoverPrerequisitesConfig {
  /** Maximum allowed mismatch rate (default 0.001 = 0.1%) */
  readonly mismatchRateThreshold: number;

  /** Minimum observation window in days (default 7) */
  readonly minObservationDays: number;

  /** Minimum sample size (default 10000) */
  readonly minSampleSize: number;
}

/**
 * Default prerequisites configuration.
 */
export const DEFAULT_PREREQUISITES_CONFIG: CutoverPrerequisitesConfig = {
  mismatchRateThreshold: 0.001, // 0.1%
  minObservationDays: 7,
  minSampleSize: 10000,
};

/**
 * Result of cutover prerequisites check.
 *
 * @see Requirements 5.6
 */
export interface CutoverFlagPrerequisitesResult {
  /** Whether cutover is allowed (ALL conditions must be met) */
  readonly allowed: boolean;

  /** Reason if not allowed */
  readonly reason?: string;

  /** Individual prerequisite statuses */
  readonly prerequisites: {
    /** Mismatch rate below threshold */
    readonly mismatchRateMet: boolean;
    readonly currentMismatchRate: number;
    readonly requiredMismatchRate: number;

    /** Observation window sufficient */
    readonly observationWindowMet: boolean;
    readonly currentObservationDays: number;
    readonly requiredObservationDays: number;

    /** Sample size sufficient */
    readonly sampleSizeMet: boolean;
    readonly currentSampleSize: number;
    readonly requiredSampleSize: number;
  };

  /** Timestamp of check */
  readonly checkedAt: Date;
}

/**
 * Audit log entry for cutover flag changes.
 *
 * @see Requirements 5.7
 */
export interface CutoverFlagAuditEntry {
  /** Unique ID for this audit entry */
  readonly id: string;

  /** Timestamp of the change */
  readonly timestamp: Date;

  /** User/operator who made the change */
  readonly operator: string;

  /** Name of the flag that was changed */
  readonly flagName: string;

  /** Previous value of the flag */
  readonly oldValue: boolean | undefined;

  /** New value of the flag */
  readonly newValue: boolean;

  /** Reason for the change */
  readonly reason: string;

  /** Shadow metrics snapshot at the time of change */
  readonly shadowMetricsSnapshot: ShadowMetrics | null;

  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * Cutover flag state tracking.
 */
export interface CutoverFlagState {
  /** Global cutover flag */
  readonly globalEnabled: boolean;

  /** Domain-specific flags (domain name → enabled) */
  readonly domainFlags: ReadonlyMap<string, boolean>;

  /** Route-specific flags (routeId → enabled) */
  readonly routeFlags: ReadonlyMap<string, boolean>;

  /** Timestamp of last update */
  readonly lastUpdated: Date;

  /** Operator who made the last update */
  readonly updatedBy: string;

  /** Prerequisites status */
  readonly prerequisites: CutoverFlagPrerequisitesResult | null;
}

/**
 * Parameters for updating a cutover flag.
 */
export interface UpdateFlagParams {
  /** Name of the flag to update */
  readonly flagName: string;

  /** New value for the flag */
  readonly newValue: boolean;

  /** Operator performing the update */
  readonly operatorId: string;

  /** Reason for the change */
  readonly reason: string;

  /** Correlation ID for tracing */
  readonly correlationId?: string;

  /** Skip prerequisite check (for rollback only) */
  readonly skipPrerequisiteCheck?: boolean;
}

/**
 * Parameters for instant rollback.
 *
 * @see Requirements 5.8
 */
export interface RollbackParams {
  /** Flag(s) to rollback (defaults to global) */
  readonly flagNames?: readonly string[];

  /** Operator performing the rollback */
  readonly operatorId: string;

  /** Reason for rollback */
  readonly reason: string;

  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * Result of a rollback operation.
 */
export interface RollbackResult {
  /** Whether rollback succeeded */
  readonly success: boolean;

  /** Flags that were rolled back */
  readonly rolledBackFlags: readonly string[];

  /** Error message if failed */
  readonly errorMessage?: string;

  /** Audit entries created */
  readonly auditEntries: readonly CutoverFlagAuditEntry[];
}

/**
 * Interface for the Cutover Flag Resolver service.
 *
 * @see Requirements 5 (AC 1-8)
 */
export interface ICutoverFlagResolver {
  /**
   * Determine if a route should use new authorization.
   *
   * Applies precedence: route-specific > domain-specific > global
   *
   * @param routeId - Full route identifier (e.g., "residents.list")
   * @param domain - Domain name (e.g., "residents")
   * @returns true if new auth should be used, false for legacy
   *
   * @see Requirements 5.4
   */
  shouldUseNewAuth(routeId: string, domain: string): boolean;

  /**
   * Check if cutover is allowed based on prerequisites.
   *
   * ALL THREE conditions must be met:
   * 1. Mismatch rate < threshold (default 0.1%)
   * 2. Observation window >= minDays (default 7 days)
   * 3. Sample size >= minSize (default 10,000)
   *
   * @returns Prerequisites check result
   *
   * @see Requirements 5.6
   */
  canEnableCutover(): CutoverFlagPrerequisitesResult;

  /**
   * Update a cutover flag.
   *
   * Validates prerequisites if enabling cutover (unless skipped).
   * Logs the change with full audit context.
   *
   * @param params - Flag update parameters
   * @throws CutoverFlagError if update fails
   *
   * @see Requirements 5.5, 5.7
   */
  updateFlag(params: UpdateFlagParams): Promise<void>;

  /**
   * Perform instant rollback on cutover flags.
   *
   * Immediately disables specified flags (or all if none specified).
   *
   * @param params - Rollback parameters
   * @returns Rollback result
   *
   * @see Requirements 5.8
   */
  rollback(params: RollbackParams): Promise<RollbackResult>;

  /**
   * Get current cutover flag state.
   */
  getFlagState(): CutoverFlagState;

  /**
   * Get value of a specific flag.
   *
   * @param flagName - Flag name (e.g., "auth.cutover.enabled")
   * @returns Flag value or undefined if not set
   */
  getFlagValue(flagName: string): boolean | undefined;

  /**
   * Get audit log of all flag changes.
   *
   * @param limit - Maximum entries to return (default 100)
   * @returns Audit log entries
   *
   * @see Requirements 5.7
   */
  getAuditLog(limit?: number): readonly CutoverFlagAuditEntry[];

  /**
   * Update prerequisites configuration.
   *
   * @param config - New prerequisites configuration
   */
  updatePrerequisitesConfig(config: Partial<CutoverPrerequisitesConfig>): void;
}

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

/**
 * Error codes for cutover flag operations.
 */
export enum CutoverFlagErrorCode {
  PREREQUISITES_NOT_MET = 'CUTOVER_PREREQUISITES_NOT_MET',
  INVALID_FLAG_NAME = 'CUTOVER_INVALID_FLAG_NAME',
  OPERATION_FAILED = 'CUTOVER_OPERATION_FAILED',
}

/**
 * Custom error for cutover flag operations.
 */
export class CutoverFlagError extends Error {
  constructor(
    public readonly code: CutoverFlagErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CutoverFlagError';
  }
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a CutoverFlagResolver instance.
 *
 * This pattern follows Clean Architecture DI principles — dependencies are
 * injected via the factory parameter, making the service testable and
 * decoupled from concrete implementations.
 *
 * @param logger - Logger instance for audit logging
 * @param shadowAuthExecutor - Shadow auth executor for metrics (optional)
 * @returns An implementation of ICutoverFlagResolver
 *
 * @example
 * ```typescript
 * // DI Registration (in container setup)
 * container.register({
 *   cutoverFlagResolver: asFunction(CutoverFlagResolverImpl).singleton(),
 * });
 *
 * // Usage in middleware
 * const flagResolver = DI.resolve('cutoverFlagResolver');
 * if (flagResolver.shouldUseNewAuth('residents.list', 'residents')) {
 *   // Use new authorization
 * } else {
 *   // Use legacy authorization
 * }
 * ```
 *
 * @see Requirements 5 (AC 1-8)
 */
export const CutoverFlagResolverImpl = ({
  logger,
  shadowAuthExecutor,
}: {
  logger: Logger;
  shadowAuthExecutor?: IShadowAuthExecutor;
}): ICutoverFlagResolver => {
  // -------------------------------------------------------------------------
  // Internal State (mutable for hot-reload support)
  // -------------------------------------------------------------------------

  /**
   * Global cutover flag state.
   * Changes take effect on next request (hot-reload).
   *
   * @see Requirements 5.1, 5.5
   */
  let globalEnabled = false;

  /**
   * Domain-specific cutover flags.
   * Key: domain name (e.g., "residents", "finance")
   * Value: enabled state
   *
   * @see Requirements 5.2
   */
  let domainFlags: Map<string, boolean> = new Map();

  /**
   * Route-specific cutover flags.
   * Key: routeId (e.g., "residents.list", "finance.transactions")
   * Value: enabled state
   *
   * @see Requirements 5.3
   */
  let routeFlags: Map<string, boolean> = new Map();

  /**
   * Last update metadata.
   */
  let lastUpdated = new Date();
  let updatedBy = 'system';

  /**
   * Prerequisites configuration.
   */
  let prerequisitesConfig: CutoverPrerequisitesConfig = {
    ...DEFAULT_PREREQUISITES_CONFIG,
  };

  /**
   * Audit log of all flag changes.
   *
   * @see Requirements 5.7
   */
  const auditLog: CutoverFlagAuditEntry[] = [];

  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Generate unique ID for audit entries.
   */
  const generateAuditId = (): string => {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  };

  /**
   * Parse flag name to determine type and identifier.
   */
  const parseFlagName = (
    flagName: string,
  ): { type: 'global' | 'domain' | 'route'; identifier?: string } => {
    if (flagName === CUTOVER_FLAG_NAMES.GLOBAL) {
      return { type: 'global' };
    }

    if (flagName.startsWith(CUTOVER_FLAG_NAMES.DOMAIN_PREFIX)) {
      const domain = flagName.slice(CUTOVER_FLAG_NAMES.DOMAIN_PREFIX.length);
      return { type: 'domain', identifier: domain };
    }

    if (flagName.startsWith(CUTOVER_FLAG_NAMES.ROUTE_PREFIX)) {
      const routeId = flagName.slice(CUTOVER_FLAG_NAMES.ROUTE_PREFIX.length);
      return { type: 'route', identifier: routeId };
    }

    throw new CutoverFlagError(
      CutoverFlagErrorCode.INVALID_FLAG_NAME,
      `Invalid flag name: ${flagName}. Must be '${CUTOVER_FLAG_NAMES.GLOBAL}', '${CUTOVER_FLAG_NAMES.DOMAIN_PREFIX}<domain>', or '${CUTOVER_FLAG_NAMES.ROUTE_PREFIX}<routeId>'`,
      { flagName },
    );
  };

  /**
   * Get current shadow metrics from executor.
   */
  const getShadowMetrics = (): ShadowMetrics | null => {
    if (!shadowAuthExecutor) {
      return null;
    }
    return shadowAuthExecutor.getMetrics();
  };

  /**
   * Create audit log entry and log to structured logger.
   *
   * @see Requirements 5.7
   */
  const createAuditEntry = (
    operator: string,
    flagName: string,
    oldValue: boolean | undefined,
    newValue: boolean,
    reason: string,
    correlationId?: string,
  ): CutoverFlagAuditEntry => {
    const entry: CutoverFlagAuditEntry = {
      id: generateAuditId(),
      timestamp: new Date(),
      operator,
      flagName,
      oldValue,
      newValue,
      reason,
      shadowMetricsSnapshot: getShadowMetrics(),
      correlationId,
    };

    // Add to audit log
    auditLog.push(entry);

    // Log to structured logger
    logger.info('Cutover flag changed', {
      audit_id: entry.id,
      operator: entry.operator,
      flag_name: entry.flagName,
      old_value: entry.oldValue,
      new_value: entry.newValue,
      reason: entry.reason,
      correlation_id: entry.correlationId,
      shadow_metrics: entry.shadowMetricsSnapshot
        ? {
            mismatch_rate: entry.shadowMetricsSnapshot.mismatchRate,
            total_requests: entry.shadowMetricsSnapshot.totalRequests,
            window_days: entry.shadowMetricsSnapshot.windowDays,
          }
        : null,
    });

    return entry;
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    /**
     * Determine if a route should use new authorization.
     *
     * Precedence: route-specific > domain-specific > global
     *
     * @see Requirements 5.4
     */
    shouldUseNewAuth(routeId: string, domain: string): boolean {
      // 1. Check route-specific flag (highest precedence)
      const routeFlag = routeFlags.get(routeId);
      if (routeFlag !== undefined) {
        return routeFlag;
      }

      // 2. Check domain-specific flag (medium precedence)
      const domainFlag = domainFlags.get(domain);
      if (domainFlag !== undefined) {
        return domainFlag;
      }

      // 3. Fall back to global flag (lowest precedence)
      return globalEnabled;
    },

    /**
     * Check if cutover is allowed based on prerequisites.
     *
     * ALL THREE conditions must be met:
     * 1. Mismatch rate < threshold
     * 2. Observation window >= minDays
     * 3. Sample size >= minSize
     *
     * @see Requirements 5.6
     */
    canEnableCutover(): CutoverFlagPrerequisitesResult {
      const metrics = getShadowMetrics();
      const checkedAt = new Date();

      // If no metrics available, return not allowed
      if (!metrics) {
        return {
          allowed: false,
          reason: 'Shadow mode metrics not available. Enable shadow mode to collect metrics.',
          prerequisites: {
            mismatchRateMet: false,
            currentMismatchRate: 0,
            requiredMismatchRate: prerequisitesConfig.mismatchRateThreshold,
            observationWindowMet: false,
            currentObservationDays: 0,
            requiredObservationDays: prerequisitesConfig.minObservationDays,
            sampleSizeMet: false,
            currentSampleSize: 0,
            requiredSampleSize: prerequisitesConfig.minSampleSize,
          },
          checkedAt,
        };
      }

      // Check each prerequisite
      const mismatchRateMet =
        metrics.mismatchRate < prerequisitesConfig.mismatchRateThreshold;
      const observationWindowMet =
        metrics.windowDays >= prerequisitesConfig.minObservationDays;
      const sampleSizeMet =
        metrics.totalRequests >= prerequisitesConfig.minSampleSize;

      // ALL THREE must be met
      const allowed = mismatchRateMet && observationWindowMet && sampleSizeMet;

      // Build reason if not allowed
      let reason: string | undefined;
      if (!allowed) {
        const failedConditions: string[] = [];
        if (!mismatchRateMet) {
          failedConditions.push(
            `Mismatch rate ${(metrics.mismatchRate * 100).toFixed(3)}% exceeds threshold ${(prerequisitesConfig.mismatchRateThreshold * 100).toFixed(1)}%`,
          );
        }
        if (!observationWindowMet) {
          failedConditions.push(
            `Observation window ${metrics.windowDays.toFixed(1)} days is less than required ${prerequisitesConfig.minObservationDays} days`,
          );
        }
        if (!sampleSizeMet) {
          failedConditions.push(
            `Sample size ${metrics.totalRequests} is less than required ${prerequisitesConfig.minSampleSize}`,
          );
        }
        reason = `Prerequisites not met: ${failedConditions.join('; ')}`;
      }

      return {
        allowed,
        reason,
        prerequisites: {
          mismatchRateMet,
          currentMismatchRate: metrics.mismatchRate,
          requiredMismatchRate: prerequisitesConfig.mismatchRateThreshold,
          observationWindowMet,
          currentObservationDays: metrics.windowDays,
          requiredObservationDays: prerequisitesConfig.minObservationDays,
          sampleSizeMet,
          currentSampleSize: metrics.totalRequests,
          requiredSampleSize: prerequisitesConfig.minSampleSize,
        },
        checkedAt,
      };
    },

    /**
     * Update a cutover flag.
     *
     * Hot-reload: Changes take effect immediately on next request.
     *
     * @see Requirements 5.5, 5.7
     */
    async updateFlag(params: UpdateFlagParams): Promise<void> {
      const { flagName, newValue, operatorId, reason, correlationId, skipPrerequisiteCheck } =
        params;

      // Parse and validate flag name
      const { type, identifier } = parseFlagName(flagName);

      // If enabling cutover, check prerequisites (unless explicitly skipped)
      if (newValue && !skipPrerequisiteCheck) {
        const prerequisites = this.canEnableCutover();
        if (!prerequisites.allowed) {
          throw new CutoverFlagError(
            CutoverFlagErrorCode.PREREQUISITES_NOT_MET,
            prerequisites.reason ?? 'Cutover prerequisites not met',
            {
              flagName,
              prerequisites: prerequisites.prerequisites,
            },
          );
        }
      }

      // Get old value for audit
      let oldValue: boolean | undefined;
      switch (type) {
        case 'global':
          oldValue = globalEnabled;
          break;
        case 'domain':
          oldValue = domainFlags.get(identifier!);
          break;
        case 'route':
          oldValue = routeFlags.get(identifier!);
          break;
      }

      // Update flag (hot-reload - takes effect immediately)
      switch (type) {
        case 'global':
          globalEnabled = newValue;
          break;
        case 'domain':
          domainFlags.set(identifier!, newValue);
          break;
        case 'route':
          routeFlags.set(identifier!, newValue);
          break;
      }

      // Update metadata
      lastUpdated = new Date();
      updatedBy = operatorId;

      // Create audit entry
      createAuditEntry(operatorId, flagName, oldValue, newValue, reason, correlationId);
    },

    /**
     * Perform instant rollback on cutover flags.
     *
     * @see Requirements 5.8
     */
    async rollback(params: RollbackParams): Promise<RollbackResult> {
      const { flagNames, operatorId, reason, correlationId } = params;

      const rolledBackFlags: string[] = [];
      const auditEntries: CutoverFlagAuditEntry[] = [];

      try {
        // If no specific flags provided, rollback global
        const flagsToRollback = flagNames ?? [CUTOVER_FLAG_NAMES.GLOBAL];

        for (const flagName of flagsToRollback) {
          const { type, identifier } = parseFlagName(flagName);

          let oldValue: boolean | undefined;

          // Get old value and set to false
          switch (type) {
            case 'global':
              oldValue = globalEnabled;
              if (oldValue) {
                globalEnabled = false;
                rolledBackFlags.push(flagName);
              }
              break;
            case 'domain':
              oldValue = domainFlags.get(identifier!);
              if (oldValue) {
                domainFlags.set(identifier!, false);
                rolledBackFlags.push(flagName);
              }
              break;
            case 'route':
              oldValue = routeFlags.get(identifier!);
              if (oldValue) {
                routeFlags.set(identifier!, false);
                rolledBackFlags.push(flagName);
              }
              break;
          }

          // Create audit entry for this rollback
          if (oldValue) {
            const entry = createAuditEntry(
              operatorId,
              flagName,
              oldValue,
              false,
              `ROLLBACK: ${reason}`,
              correlationId,
            );
            auditEntries.push(entry);
          }
        }

        // Update metadata
        lastUpdated = new Date();
        updatedBy = operatorId;

        // Log rollback event
        logger.warn('Cutover flag rollback executed', {
          operator: operatorId,
          rolled_back_flags: rolledBackFlags,
          reason,
          correlation_id: correlationId,
        });

        return {
          success: true,
          rolledBackFlags,
          auditEntries,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error during rollback';

        logger.error('Cutover flag rollback failed', {
          operator: operatorId,
          reason,
          error: errorMessage,
          correlation_id: correlationId,
        });

        return {
          success: false,
          rolledBackFlags,
          errorMessage,
          auditEntries,
        };
      }
    },

    /**
     * Get current cutover flag state.
     */
    getFlagState(): CutoverFlagState {
      return {
        globalEnabled,
        domainFlags: new Map(domainFlags),
        routeFlags: new Map(routeFlags),
        lastUpdated,
        updatedBy,
        prerequisites: this.canEnableCutover(),
      };
    },

    /**
     * Get value of a specific flag.
     */
    getFlagValue(flagName: string): boolean | undefined {
      const { type, identifier } = parseFlagName(flagName);

      switch (type) {
        case 'global':
          return globalEnabled;
        case 'domain':
          return domainFlags.get(identifier!);
        case 'route':
          return routeFlags.get(identifier!);
        default:
          return undefined;
      }
    },

    /**
     * Get audit log of all flag changes.
     *
     * @see Requirements 5.7
     */
    getAuditLog(limit: number = 100): readonly CutoverFlagAuditEntry[] {
      // Return most recent entries first
      return [...auditLog]
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, limit);
    },

    /**
     * Update prerequisites configuration.
     */
    updatePrerequisitesConfig(config: Partial<CutoverPrerequisitesConfig>): void {
      prerequisitesConfig = {
        ...prerequisitesConfig,
        ...config,
      };

      logger.info('Cutover prerequisites config updated', {
        mismatch_rate_threshold: prerequisitesConfig.mismatchRateThreshold,
        min_observation_days: prerequisitesConfig.minObservationDays,
        min_sample_size: prerequisitesConfig.minSampleSize,
      });
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type CutoverFlagResolver = ICutoverFlagResolver;
