/**
 * WritePathRetirementPolicy — Policy rules for write path retirement after cutover.
 *
 * This service defines and evaluates the conditions that must be met before a
 * dual-write path can be safely retired (transitioned to Membership-only).
 *
 * **POST-CUTOVER CONTEXT (Task 28):**
 * After FASE 1.10 cutover is stable:
 * - Membership is already authoritative for authorization reads
 * - Dual-write paths synchronize both legacy and Membership
 * - This policy determines when dual-write can be retired
 *
 * **RETIREMENT CONDITIONS:**
 * 1. Cutover Stability — Minimum hours since cutover without rollback
 * 2. Data Consistency — No inconsistencies between legacy and Membership
 * 3. Write Success — Minimum successful writes since cutover
 * 4. Rollback Window — Rollback capability maintained during stabilization
 *
 * **SECURITY CONSIDERATIONS:**
 * - Quarantine rules (PNA-01..PNA-05) must be preserved
 * - Rollback compatibility maintained during stabilization window
 * - Do NOT retire prematurely if rollback still depends on dual-write
 *
 * @see Task 28: Post-Cutover Write Path Finalization
 * @see Requirements 9 (AC 1-7), Req 48 (rollback safety)
 */

import type {
  IWritePathRetirementPolicyService,
  WritePathRetirementPolicyConfig,
  WritePathRetirementEvaluation,
  WritePathStabilityMetrics,
  RetirementCondition,
} from './types';
import {
  WritePathClassification,
  WritePathRetirementStatus,
} from './types';
import type { IWritePathInventoryService } from './types';

// ---------------------------------------------------------------------------
// Default Policy Configuration
// ---------------------------------------------------------------------------

/**
 * Default retirement policy configuration.
 *
 * These values represent conservative defaults for production safety.
 * They can be overridden via factory parameters.
 */
export const DEFAULT_RETIREMENT_POLICY: WritePathRetirementPolicyConfig = {
  /** Minimum 24 hours of stability after cutover */
  minimumStabilityHours: 24,

  /** Zero tolerance for data inconsistencies */
  maxInconsistencyRate: 0.0,

  /** Rollback capability required during stabilization */
  requireRollbackCapability: true,

  /** Minimum 10 successful writes to confirm path is working */
  minimumSuccessfulWrites: 10,
};

/**
 * Hours after which rollback capability is no longer required.
 * After this window, dual-write can be fully retired.
 */
export const ROLLBACK_WINDOW_HOURS = 48;

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a Write Path Retirement Policy service.
 *
 * This service evaluates whether write paths are eligible for retirement
 * based on stability metrics and policy rules.
 *
 * @param inventoryService - The write path inventory service
 * @param policyConfig - Optional custom policy configuration
 * @returns An implementation of IWritePathRetirementPolicyService
 *
 * @example
 * ```typescript
 * const policyService = createWritePathRetirementPolicyService({
 *   inventoryService,
 *   policyConfig: {
 *     minimumStabilityHours: 48, // Custom: 48 hours stability
 *     maxInconsistencyRate: 0.001, // Allow 0.1% inconsistency
 *     requireRollbackCapability: true,
 *     minimumSuccessfulWrites: 100,
 *   },
 * });
 *
 * const evaluation = policyService.evaluateRetirementEligibility(
 *   'WP-001',
 *   stabilityMetrics,
 * );
 *
 * if (evaluation.canRetire) {
 *   console.log('Write path can be safely retired');
 * }
 * ```
 */
export const createWritePathRetirementPolicyService = ({
  inventoryService,
  policyConfig = DEFAULT_RETIREMENT_POLICY,
}: {
  inventoryService: IWritePathInventoryService;
  policyConfig?: WritePathRetirementPolicyConfig;
}): IWritePathRetirementPolicyService => {
  /**
   * Evaluate stability window condition.
   */
  function evaluateStabilityWindow(
    metrics: WritePathStabilityMetrics,
  ): RetirementCondition {
    const { hoursSinceCutover } = metrics;
    const required = policyConfig.minimumStabilityHours;
    const met = hoursSinceCutover >= required;

    return {
      id: 'COND-001',
      name: 'Stability Window',
      met,
      message: met
        ? `Stability window passed: ${hoursSinceCutover.toFixed(1)} hours since cutover (required: ${required}h)`
        : `Stability window NOT passed: ${hoursSinceCutover.toFixed(1)} hours since cutover (required: ${required}h)`,
      required: true,
    };
  }

  /**
   * Evaluate data consistency condition.
   */
  function evaluateDataConsistency(
    metrics: WritePathStabilityMetrics,
  ): RetirementCondition {
    const { inconsistencyRate, inconsistencyCount } = metrics;
    const maxAllowed = policyConfig.maxInconsistencyRate;
    const met = inconsistencyRate <= maxAllowed;

    return {
      id: 'COND-002',
      name: 'Data Consistency',
      met,
      message: met
        ? `Data consistency verified: ${inconsistencyCount} inconsistencies (rate: ${(inconsistencyRate * 100).toFixed(3)}%)`
        : `Data inconsistency detected: ${inconsistencyCount} inconsistencies (rate: ${(inconsistencyRate * 100).toFixed(3)}%, max: ${(maxAllowed * 100).toFixed(3)}%)`,
      required: true,
    };
  }

  /**
   * Evaluate minimum successful writes condition.
   */
  function evaluateSuccessfulWrites(
    metrics: WritePathStabilityMetrics,
  ): RetirementCondition {
    const { successfulWrites, failedWrites } = metrics;
    const required = policyConfig.minimumSuccessfulWrites;
    const met = successfulWrites >= required;

    const successRate =
      successfulWrites + failedWrites > 0
        ? successfulWrites / (successfulWrites + failedWrites)
        : 1;

    return {
      id: 'COND-003',
      name: 'Minimum Successful Writes',
      met,
      message: met
        ? `Write volume satisfied: ${successfulWrites} successful writes (required: ${required}, success rate: ${(successRate * 100).toFixed(1)}%)`
        : `Insufficient writes: ${successfulWrites} successful writes (required: ${required})`,
      required: true,
    };
  }

  /**
   * Evaluate rollback window condition.
   */
  function evaluateRollbackWindow(
    metrics: WritePathStabilityMetrics,
  ): RetirementCondition {
    const { hoursSinceCutover, rollbackTriggered } = metrics;

    // If rollback was triggered, retirement is blocked
    if (rollbackTriggered) {
      return {
        id: 'COND-004',
        name: 'Rollback Window',
        met: false,
        message: 'Rollback was triggered since cutover — retirement blocked until investigation complete',
        required: true,
      };
    }

    // Check if rollback window has passed
    const rollbackWindowPassed = hoursSinceCutover >= ROLLBACK_WINDOW_HOURS;

    if (!policyConfig.requireRollbackCapability) {
      return {
        id: 'COND-004',
        name: 'Rollback Window',
        met: true,
        message: 'Rollback capability requirement disabled in policy',
        required: false,
      };
    }

    return {
      id: 'COND-004',
      name: 'Rollback Window',
      met: rollbackWindowPassed,
      message: rollbackWindowPassed
        ? `Rollback window passed: ${hoursSinceCutover.toFixed(1)} hours since cutover (window: ${ROLLBACK_WINDOW_HOURS}h)`
        : `Within rollback window: ${hoursSinceCutover.toFixed(1)} hours since cutover (window: ${ROLLBACK_WINDOW_HOURS}h) — maintain dual-write for rollback safety`,
      required: true,
    };
  }

  /**
   * Evaluate write path classification condition.
   */
  function evaluateClassification(
    writePathEntry: { classification: WritePathClassification },
  ): RetirementCondition {
    const { classification } = writePathEntry;

    // MEMBERSHIP_AUTHORITATIVE paths are already retired (no dual-write)
    if (classification === WritePathClassification.MEMBERSHIP_AUTHORITATIVE) {
      return {
        id: 'COND-005',
        name: 'Classification',
        met: true,
        message: 'Write path is already MEMBERSHIP_AUTHORITATIVE — no retirement needed',
        required: false,
      };
    }

    // DUAL_WRITE paths can be retired
    if (classification === WritePathClassification.DUAL_WRITE) {
      return {
        id: 'COND-005',
        name: 'Classification',
        met: true,
        message: 'Write path is DUAL_WRITE — eligible for retirement to MEMBERSHIP_ONLY',
        required: true,
      };
    }

    // LEGACY_ONLY should not exist post-cutover (Task 24 ensures this)
    if (classification === WritePathClassification.LEGACY_ONLY) {
      return {
        id: 'COND-005',
        name: 'Classification',
        met: false,
        message: 'CRITICAL: Write path is LEGACY_ONLY — this should not exist post-cutover',
        required: true,
      };
    }

    // DISABLED paths don't need retirement
    return {
      id: 'COND-005',
      name: 'Classification',
      met: true,
      message: 'Write path is DISABLED — no retirement needed',
      required: false,
    };
  }

  return {
    getPolicyConfig(): WritePathRetirementPolicyConfig {
      return { ...policyConfig };
    },

    evaluateRetirementEligibility(
      writePathId: string,
      metrics: WritePathStabilityMetrics,
    ): WritePathRetirementEvaluation {
      const evaluatedAt = new Date();

      // Get write path from inventory
      const allPaths = inventoryService.getAllWritePaths();
      const writePathEntry = allPaths.find((wp) => wp.id === writePathId);

      if (!writePathEntry) {
        return {
          writePathId,
          writePathName: 'Unknown',
          currentClassification: WritePathClassification.LEGACY_ONLY,
          retirementStatus: WritePathRetirementStatus.DUAL_WRITE,
          canRetire: false,
          conditions: [],
          blockingConditions: [
            {
              id: 'COND-000',
              name: 'Write Path Exists',
              met: false,
              message: `Write path "${writePathId}" not found in inventory`,
              required: true,
            },
          ],
          evaluatedAt,
          recommendation: `Write path "${writePathId}" not found. Verify the write path ID.`,
        };
      }

      // Evaluate all conditions
      const conditions: RetirementCondition[] = [
        evaluateClassification(writePathEntry),
        evaluateStabilityWindow(metrics),
        evaluateDataConsistency(metrics),
        evaluateSuccessfulWrites(metrics),
        evaluateRollbackWindow(metrics),
      ];

      // Identify blocking conditions
      const blockingConditions = conditions.filter((c) => c.required && !c.met);

      // Determine if can retire
      const canRetire =
        blockingConditions.length === 0 &&
        writePathEntry.classification === WritePathClassification.DUAL_WRITE;

      // Determine current retirement status based on classification
      let retirementStatus: WritePathRetirementStatus;
      if (writePathEntry.classification === WritePathClassification.MEMBERSHIP_AUTHORITATIVE) {
        retirementStatus = WritePathRetirementStatus.MEMBERSHIP_ONLY;
      } else if (writePathEntry.classification === WritePathClassification.DUAL_WRITE) {
        retirementStatus = WritePathRetirementStatus.DUAL_WRITE;
      } else {
        retirementStatus = WritePathRetirementStatus.RETIRED;
      }

      // Generate recommendation
      let recommendation: string;
      if (canRetire) {
        recommendation =
          'Write path is ready for retirement. Proceed with caution and monitor for issues.';
      } else if (
        writePathEntry.classification === WritePathClassification.MEMBERSHIP_AUTHORITATIVE
      ) {
        recommendation =
          'Write path is already Membership-authoritative. No retirement action needed.';
      } else if (
        writePathEntry.classification === WritePathClassification.DISABLED
      ) {
        recommendation = 'Write path is disabled. No retirement action needed.';
      } else if (blockingConditions.length > 0) {
        const blockers = blockingConditions.map((c) => c.name).join(', ');
        recommendation = `Write path cannot be retired yet. Blocking conditions: ${blockers}. Wait for conditions to be met.`;
      } else {
        recommendation = 'Write path retirement status is unclear. Review manually.';
      }

      return {
        writePathId,
        writePathName: writePathEntry.name,
        currentClassification: writePathEntry.classification,
        retirementStatus,
        canRetire,
        conditions,
        blockingConditions,
        evaluatedAt,
        recommendation,
      };
    },

    hasStabilityWindowPassed(metrics: WritePathStabilityMetrics): boolean {
      return metrics.hoursSinceCutover >= policyConfig.minimumStabilityHours;
    },

    isDataConsistent(metrics: WritePathStabilityMetrics): boolean {
      return metrics.inconsistencyRate <= policyConfig.maxInconsistencyRate;
    },

    isRollbackStillRequired(cutoverAt: Date): boolean {
      if (!policyConfig.requireRollbackCapability) {
        return false;
      }

      const hoursSinceCutover =
        (Date.now() - cutoverAt.getTime()) / (1000 * 60 * 60);

      return hoursSinceCutover < ROLLBACK_WINDOW_HOURS;
    },
  };
};

// ---------------------------------------------------------------------------
// Convenience Exports
// ---------------------------------------------------------------------------

/**
 * Get the default policy configuration.
 */
export const getDefaultRetirementPolicy = (): WritePathRetirementPolicyConfig => ({
  ...DEFAULT_RETIREMENT_POLICY,
});

/**
 * Get the rollback window duration in hours.
 */
export const getRollbackWindowHours = (): number => ROLLBACK_WINDOW_HOURS;
