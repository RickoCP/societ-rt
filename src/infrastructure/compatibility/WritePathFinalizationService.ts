/**
 * WritePathFinalizationService — Post-cutover write path retirement orchestration.
 *
 * This service manages the finalization of write paths after FASE 1.10 cutover,
 * transitioning dual-write paths to Membership-only when stability is confirmed.
 *
 * **POST-CUTOVER CONTEXT (Task 28):**
 * After FASE 1.10 cutover is stable (Task 27 complete):
 * - Membership is authoritative for all authorization reads (since cutover)
 * - Authorization-critical writes were synchronized since Task 24
 * - This service completes the transition by retiring dual-write mechanisms
 *
 * **FINALIZATION RESPONSIBILITIES:**
 * 1. Verify Membership-authoritative write path operational
 * 2. Migrate remaining non-critical compatibility write paths
 * 3. Progressively retire temporary dual-write mechanisms
 * 4. Remove obsolete legacy-only writes when safe
 * 5. Ensure new writes use Membership as authoritative model
 * 6. Verify no data inconsistency between legacy and Membership
 * 7. Preserve quarantine rules (PNA-01..PNA-05 unchanged)
 *
 * **SECURITY CONSIDERATIONS:**
 * - Verify Membership is authoritative for all authorization writes
 * - Maintain rollback compatibility for required stabilization window
 * - Exclude quarantined anomalies (PNA-01..PNA-05)
 * - Do NOT stop compatibility behavior prematurely
 *
 * @see Task 28: Post-Cutover Write Path Finalization
 * @see Requirements 9 (AC 1-7), Req 48 (rollback safety)
 */

import { randomUUID } from 'crypto';
import type {
  IWritePathFinalizationService,
  IWritePathRetirementPolicyService,
  IWritePathInventoryService,
  WritePathFinalizationResult,
  WritePathStabilityMetrics,
  WritePathRetirementEvaluation,
  InitiateRetirementParams,
  RetirementOperationResult,
  WritePathRetirementAuditEntry,
} from './types';
import {
  WritePathClassification,
  WritePathRetirementStatus,
} from './types';
import type { IQuarantineManifestService } from '@infrastructure/quarantine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Expected count of quarantined users (PNA-01 through PNA-05).
 */
const EXPECTED_QUARANTINE_COUNT = 5;

// ---------------------------------------------------------------------------
// Internal State Types
// ---------------------------------------------------------------------------

/**
 * Internal state for tracking write path metrics.
 */
interface WritePathMetricsState {
  writePathId: string;
  cutoverAt: Date;
  successfulWrites: number;
  failedWrites: number;
  inconsistencyCount: number;
  rollbackTriggered: boolean;
  lastSuccessfulWriteAt?: Date;
  retirementStatus: WritePathRetirementStatus;
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a Write Path Finalization Service.
 *
 * This service orchestrates the post-cutover write path retirement process,
 * ensuring safe transition from dual-write to Membership-only.
 *
 * @param inventoryService - The write path inventory service
 * @param policyService - The retirement policy service
 * @param quarantineService - The quarantine manifest service
 * @param cutoverTimestamp - When cutover was completed (from FASE 1.10)
 * @returns An implementation of IWritePathFinalizationService
 *
 * @example
 * ```typescript
 * const finalizationService = createWritePathFinalizationService({
 *   inventoryService,
 *   policyService,
 *   quarantineService,
 *   cutoverTimestamp: new Date('2024-01-15T10:00:00Z'),
 * });
 *
 * // Evaluate all paths
 * const result = await finalizationService.evaluateAllWritePaths();
 *
 * // Retire eligible paths
 * for (const pathId of result.readyForRetirement) {
 *   await finalizationService.initiateRetirement({
 *     writePathId: pathId,
 *     operatorId: 'admin-123',
 *     reason: 'Stability confirmed',
 *   });
 * }
 * ```
 */
export const createWritePathFinalizationService = ({
  inventoryService,
  policyService,
  quarantineService,
  cutoverTimestamp = new Date(),
}: {
  inventoryService: IWritePathInventoryService;
  policyService: IWritePathRetirementPolicyService;
  quarantineService: IQuarantineManifestService;
  cutoverTimestamp?: Date;
}): IWritePathFinalizationService => {
  // Internal state for tracking metrics and retirement status
  const metricsState = new Map<string, WritePathMetricsState>();
  const auditLog: WritePathRetirementAuditEntry[] = [];

  /**
   * Initialize metrics state for all write paths.
   */
  function initializeMetricsState(): void {
    const allPaths = inventoryService.getAllWritePaths();

    for (const path of allPaths) {
      if (!metricsState.has(path.id)) {
        // Determine initial retirement status based on classification
        let initialStatus: WritePathRetirementStatus;
        if (path.classification === WritePathClassification.MEMBERSHIP_AUTHORITATIVE) {
          initialStatus = WritePathRetirementStatus.MEMBERSHIP_ONLY;
        } else if (path.classification === WritePathClassification.DUAL_WRITE) {
          initialStatus = WritePathRetirementStatus.DUAL_WRITE;
        } else if (path.classification === WritePathClassification.DISABLED) {
          initialStatus = WritePathRetirementStatus.RETIRED;
        } else {
          // LEGACY_ONLY should not exist post-cutover
          initialStatus = WritePathRetirementStatus.DUAL_WRITE;
        }

        metricsState.set(path.id, {
          writePathId: path.id,
          cutoverAt: cutoverTimestamp,
          successfulWrites: 0,
          failedWrites: 0,
          inconsistencyCount: 0,
          rollbackTriggered: false,
          retirementStatus: initialStatus,
        });
      }
    }
  }

  // Initialize on creation
  initializeMetricsState();

  /**
   * Calculate hours since cutover.
   */
  function calculateHoursSinceCutover(): number {
    return (Date.now() - cutoverTimestamp.getTime()) / (1000 * 60 * 60);
  }

  /**
   * Build stability metrics for a write path.
   */
  function buildStabilityMetrics(state: WritePathMetricsState): WritePathStabilityMetrics {
    const totalWrites = state.successfulWrites + state.failedWrites;
    const inconsistencyRate =
      totalWrites > 0 ? state.inconsistencyCount / totalWrites : 0;

    return {
      writePathId: state.writePathId,
      cutoverAt: state.cutoverAt,
      hoursSinceCutover: calculateHoursSinceCutover(),
      successfulWrites: state.successfulWrites,
      failedWrites: state.failedWrites,
      inconsistencyCount: state.inconsistencyCount,
      inconsistencyRate,
      rollbackTriggered: state.rollbackTriggered,
      lastSuccessfulWriteAt: state.lastSuccessfulWriteAt,
    };
  }

  /**
   * Create an audit entry.
   */
  function createAuditEntry(
    action: WritePathRetirementAuditEntry['action'],
    writePathId: string,
    operatorId: string,
    previousStatus: WritePathRetirementStatus,
    newStatus: WritePathRetirementStatus,
    reason: string,
    success: boolean,
    options?: {
      errorMessage?: string;
      correlationId?: string;
    },
  ): WritePathRetirementAuditEntry {
    const entry: WritePathRetirementAuditEntry = {
      id: `retire-audit-${randomUUID()}`,
      timestamp: new Date(),
      action,
      writePathId,
      operatorId,
      previousStatus,
      newStatus,
      reason,
      success,
      errorMessage: options?.errorMessage,
      correlationId: options?.correlationId,
    };

    auditLog.push(entry);
    return entry;
  }

  /**
   * Log finalization operation.
   */
  function logFinalizationOperation(
    operation: string,
    writePathId: string,
    success: boolean,
    details?: Record<string, unknown>,
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'WRITE_PATH_FINALIZATION',
      operation,
      writePathId,
      success,
      hoursSinceCutover: calculateHoursSinceCutover().toFixed(2),
      ...details,
    };

    if (success) {
      console.info('[WritePathFinalization]', JSON.stringify(logEntry));
    } else {
      console.error('[WritePathFinalization] FAILED', JSON.stringify(logEntry));
    }
  }

  return {
    async evaluateAllWritePaths(): Promise<WritePathFinalizationResult> {
      const evaluatedAt = new Date();
      const allPaths = inventoryService.getAllWritePaths();

      // Verify quarantine is preserved
      const quarantineVerified =
        quarantineService.getQuarantinedCount() === EXPECTED_QUARANTINE_COUNT;

      // Evaluate each write path
      const evaluations: WritePathRetirementEvaluation[] = [];
      const readyForRetirement: string[] = [];
      const blockedFromRetirement: string[] = [];
      const statusCounts: Record<WritePathRetirementStatus, number> = {
        [WritePathRetirementStatus.DUAL_WRITE]: 0,
        [WritePathRetirementStatus.RETIREMENT_PENDING]: 0,
        [WritePathRetirementStatus.MEMBERSHIP_ONLY]: 0,
        [WritePathRetirementStatus.RETIRED]: 0,
      };

      for (const path of allPaths) {
        // Ensure state exists
        if (!metricsState.has(path.id)) {
          initializeMetricsState();
        }

        const state = metricsState.get(path.id)!;
        const metrics = buildStabilityMetrics(state);
        const evaluation = policyService.evaluateRetirementEligibility(path.id, metrics);

        // Use the actual tracked retirement status from our state, not the policy evaluation
        // The policy service derives status from inventory classification which doesn't change
        // after retirement. Our metricsState tracks the actual retirement progression.
        const actualRetirementStatus = state.retirementStatus;

        // Override the evaluation's retirement status with our tracked state
        const evaluationWithTrackedStatus: WritePathRetirementEvaluation = {
          ...evaluation,
          retirementStatus: actualRetirementStatus,
        };

        evaluations.push(evaluationWithTrackedStatus);
        statusCounts[actualRetirementStatus]++;

        // Only consider for retirement if still in DUAL_WRITE state
        if (evaluation.canRetire && actualRetirementStatus === WritePathRetirementStatus.DUAL_WRITE) {
          readyForRetirement.push(path.id);
        } else if (actualRetirementStatus === WritePathRetirementStatus.DUAL_WRITE) {
          blockedFromRetirement.push(path.id);
        }
      }

      // Determine if finalization is complete
      const allRetired =
        statusCounts[WritePathRetirementStatus.DUAL_WRITE] === 0 &&
        statusCounts[WritePathRetirementStatus.RETIREMENT_PENDING] === 0;

      const isComplete = allRetired && quarantineVerified;

      // Build summary
      let summary: string;
      if (isComplete) {
        summary =
          'POST-CUTOVER FINALIZATION: COMPLETE — All write paths are Membership-authoritative or retired.';
      } else if (!quarantineVerified) {
        summary =
          `POST-CUTOVER FINALIZATION: BLOCKED — Quarantine verification failed. Expected ${EXPECTED_QUARANTINE_COUNT} quarantined users.`;
      } else {
        const dualWriteCount = statusCounts[WritePathRetirementStatus.DUAL_WRITE];
        const pendingCount = statusCounts[WritePathRetirementStatus.RETIREMENT_PENDING];
        summary =
          `POST-CUTOVER FINALIZATION: IN PROGRESS — ${dualWriteCount} dual-write paths remain, ${pendingCount} pending retirement, ${readyForRetirement.length} ready for retirement.`;
      }

      logFinalizationOperation('EVALUATE_ALL', 'all', true, {
        totalPaths: allPaths.length,
        readyCount: readyForRetirement.length,
        blockedCount: blockedFromRetirement.length,
        isComplete,
        quarantineVerified,
      });

      return {
        isComplete,
        evaluatedAt,
        evaluations,
        statusCounts,
        readyForRetirement,
        blockedFromRetirement,
        summary,
        quarantineVerified,
      };
    },

    getWritePathRetirementStatus(writePathId: string): WritePathRetirementStatus {
      const state = metricsState.get(writePathId);
      if (!state) {
        // Check inventory for default status
        const path = inventoryService
          .getAllWritePaths()
          .find((p) => p.id === writePathId);

        if (!path) {
          return WritePathRetirementStatus.DUAL_WRITE;
        }

        if (path.classification === WritePathClassification.MEMBERSHIP_AUTHORITATIVE) {
          return WritePathRetirementStatus.MEMBERSHIP_ONLY;
        }
        if (path.classification === WritePathClassification.DISABLED) {
          return WritePathRetirementStatus.RETIRED;
        }

        return WritePathRetirementStatus.DUAL_WRITE;
      }

      return state.retirementStatus;
    },

    async initiateRetirement(
      params: InitiateRetirementParams,
    ): Promise<RetirementOperationResult> {
      const { writePathId, operatorId, reason, skipStabilityCheck, correlationId } =
        params;

      // Get current state
      const state = metricsState.get(writePathId);
      if (!state) {
        logFinalizationOperation('INITIATE_RETIREMENT', writePathId, false, {
          error: 'Write path not found',
        });

        return {
          success: false,
          writePathId,
          newStatus: WritePathRetirementStatus.DUAL_WRITE,
          errorMessage: `Write path "${writePathId}" not found in finalization tracking.`,
        };
      }

      const previousStatus = state.retirementStatus;

      // Check if already retired
      if (
        state.retirementStatus === WritePathRetirementStatus.MEMBERSHIP_ONLY ||
        state.retirementStatus === WritePathRetirementStatus.RETIRED
      ) {
        return {
          success: true,
          writePathId,
          newStatus: state.retirementStatus,
          auditEntry: createAuditEntry(
            'RETIREMENT_COMPLETED',
            writePathId,
            operatorId,
            previousStatus,
            state.retirementStatus,
            `Already retired: ${reason}`,
            true,
            { correlationId },
          ),
        };
      }

      // Evaluate retirement eligibility
      if (!skipStabilityCheck) {
        const metrics = buildStabilityMetrics(state);
        const evaluation = policyService.evaluateRetirementEligibility(
          writePathId,
          metrics,
        );

        if (!evaluation.canRetire) {
          const blockers = evaluation.blockingConditions
            .map((c) => c.name)
            .join(', ');

          const auditEntry = createAuditEntry(
            'RETIREMENT_FAILED',
            writePathId,
            operatorId,
            previousStatus,
            previousStatus,
            reason,
            false,
            {
              errorMessage: `Blocking conditions: ${blockers}`,
              correlationId,
            },
          );

          logFinalizationOperation('INITIATE_RETIREMENT', writePathId, false, {
            error: 'Conditions not met',
            blockers,
          });

          return {
            success: false,
            writePathId,
            newStatus: previousStatus,
            errorMessage: `Cannot retire: ${evaluation.recommendation}`,
            auditEntry,
          };
        }
      }

      // Transition to RETIREMENT_PENDING first
      state.retirementStatus = WritePathRetirementStatus.RETIREMENT_PENDING;

      // Then to MEMBERSHIP_ONLY
      state.retirementStatus = WritePathRetirementStatus.MEMBERSHIP_ONLY;

      const auditEntry = createAuditEntry(
        'RETIREMENT_COMPLETED',
        writePathId,
        operatorId,
        previousStatus,
        WritePathRetirementStatus.MEMBERSHIP_ONLY,
        reason,
        true,
        { correlationId },
      );

      logFinalizationOperation('INITIATE_RETIREMENT', writePathId, true, {
        previousStatus,
        newStatus: WritePathRetirementStatus.MEMBERSHIP_ONLY,
        operatorId,
        correlationId,
      });

      return {
        success: true,
        writePathId,
        newStatus: WritePathRetirementStatus.MEMBERSHIP_ONLY,
        auditEntry,
      };
    },

    async revertRetirement(
      params: InitiateRetirementParams,
    ): Promise<RetirementOperationResult> {
      const { writePathId, operatorId, reason, correlationId } = params;

      // Get current state
      const state = metricsState.get(writePathId);
      if (!state) {
        return {
          success: false,
          writePathId,
          newStatus: WritePathRetirementStatus.DUAL_WRITE,
          errorMessage: `Write path "${writePathId}" not found.`,
        };
      }

      const previousStatus = state.retirementStatus;

      // Only revert if currently MEMBERSHIP_ONLY or RETIREMENT_PENDING
      if (
        state.retirementStatus !== WritePathRetirementStatus.MEMBERSHIP_ONLY &&
        state.retirementStatus !== WritePathRetirementStatus.RETIREMENT_PENDING
      ) {
        return {
          success: false,
          writePathId,
          newStatus: state.retirementStatus,
          errorMessage: `Cannot revert: write path is in ${state.retirementStatus} status.`,
        };
      }

      // Revert to DUAL_WRITE
      state.retirementStatus = WritePathRetirementStatus.DUAL_WRITE;
      state.rollbackTriggered = true;

      const auditEntry = createAuditEntry(
        'RETIREMENT_REVERTED',
        writePathId,
        operatorId,
        previousStatus,
        WritePathRetirementStatus.DUAL_WRITE,
        reason,
        true,
        { correlationId },
      );

      logFinalizationOperation('REVERT_RETIREMENT', writePathId, true, {
        previousStatus,
        newStatus: WritePathRetirementStatus.DUAL_WRITE,
        operatorId,
        correlationId,
      });

      return {
        success: true,
        writePathId,
        newStatus: WritePathRetirementStatus.DUAL_WRITE,
        auditEntry,
      };
    },

    getStabilityMetrics(writePathId: string): WritePathStabilityMetrics | undefined {
      const state = metricsState.get(writePathId);
      if (!state) {
        return undefined;
      }

      return buildStabilityMetrics(state);
    },

    recordWriteOperation(writePathId: string, success: boolean): void {
      const state = metricsState.get(writePathId);
      if (!state) {
        // Initialize state if not exists
        initializeMetricsState();
        const newState = metricsState.get(writePathId);
        if (newState) {
          if (success) {
            newState.successfulWrites++;
            newState.lastSuccessfulWriteAt = new Date();
          } else {
            newState.failedWrites++;
          }
        }
        return;
      }

      if (success) {
        state.successfulWrites++;
        state.lastSuccessfulWriteAt = new Date();
      } else {
        state.failedWrites++;
      }
    },

    recordInconsistency(writePathId: string): void {
      const state = metricsState.get(writePathId);
      if (state) {
        state.inconsistencyCount++;
      }
    },

    getRetirementAuditLog(
      options?: { writePathId?: string; limit?: number },
    ): readonly WritePathRetirementAuditEntry[] {
      let filtered = [...auditLog];

      if (options?.writePathId) {
        filtered = filtered.filter((e) => e.writePathId === options.writePathId);
      }

      // Sort by timestamp descending (most recent first)
      filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      if (options?.limit && options.limit > 0) {
        filtered = filtered.slice(0, options.limit);
      }

      return filtered;
    },

    verifyQuarantinePreserved(): boolean {
      return quarantineService.getQuarantinedCount() === EXPECTED_QUARANTINE_COUNT;
    },

    isFinalizationComplete(): boolean {
      // Check quarantine first
      if (!this.verifyQuarantinePreserved()) {
        return false;
      }

      // Check all write paths are retired or membership-only
      for (const state of metricsState.values()) {
        if (
          state.retirementStatus === WritePathRetirementStatus.DUAL_WRITE ||
          state.retirementStatus === WritePathRetirementStatus.RETIREMENT_PENDING
        ) {
          return false;
        }
      }

      return true;
    },
  };
};

// ---------------------------------------------------------------------------
// Convenience Exports
// ---------------------------------------------------------------------------

/**
 * Type alias for cleaner DI registration.
 */
export type WritePathFinalizationService = IWritePathFinalizationService;
