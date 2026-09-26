/**
 * PreCutoverGateService — Pre-cutover gate verification for authorization cutover.
 *
 * This service verifies that ALL criteria are met before authorization cutover
 * can proceed. Cutover is BLOCKED if any criterion fails.
 *
 * **PRE-CUTOVER CRITERIA (TPR-05-FINAL):**
 * A. INVENTORY: All authorization-affecting write paths inventoried
 * B. IMPLEMENTATION: For every auth-affecting legacy writer:
 *    - Write Membership as authoritative state, OR
 *    - Dual-write legacy + Membership atomically, OR
 *    - Disable/block that legacy writer
 * C. TRANSACTION CONSISTENCY: Atomic updates, failure rollback
 * D. QUARANTINE: PNA-01..PNA-05 remain excluded
 * E. VERIFICATION: All criteria pass
 * F. GATE: Explicit approval gate
 *
 * **ZERO LEGACY-ONLY AUTHORIZATION-AFFECTING WRITERS** when this gate passes.
 *
 * @see Task 24: Pre-Cutover Authorization Write Compatibility
 * @see Requirements 8, 9, 45
 */

import type {
  IPreCutoverGateService,
  PreCutoverGateResult,
  GateCriterion,
  IWritePathInventoryService,
} from './types';
import { WritePathClassification, WritePathStatus } from './types';
import type { IQuarantineManifestService } from '@infrastructure/quarantine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Current version of the pre-cutover gate check implementation.
 * Increment when gate logic changes.
 */
const GATE_CHECK_VERSION = '1.0.0';

/**
 * Expected count of quarantined users (PNA-01 through PNA-05).
 */
const EXPECTED_QUARANTINE_COUNT = 5;

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a PreCutoverGateService instance.
 *
 * This service runs all pre-cutover verification checks and produces
 * a comprehensive gate result indicating whether cutover can proceed.
 *
 * @param inventoryService - The write path inventory service
 * @param quarantineService - The quarantine manifest service
 * @returns An implementation of IPreCutoverGateService
 *
 * @example
 * ```typescript
 * const gateService = createPreCutoverGateService({
 *   inventoryService,
 *   quarantineService,
 * });
 *
 * const result = await gateService.runGateCheck();
 * if (!result.passed) {
 *   console.error('CUTOVER BLOCKED:', result.summary);
 *   for (const criterion of result.criteria) {
 *     if (!criterion.passed) {
 *       console.error(`  - ${criterion.name}: ${criterion.message}`);
 *     }
 *   }
 * }
 * ```
 */
export const createPreCutoverGateService = ({
  inventoryService,
  quarantineService,
}: {
  inventoryService: IWritePathInventoryService;
  quarantineService: IQuarantineManifestService;
}): IPreCutoverGateService => {
  /**
   * Check: All write paths are inventoried with complete information.
   */
  function checkInventoryCompleteness(): GateCriterion {
    const allPaths = inventoryService.getAllWritePaths();
    const incomplete = allPaths.filter(
      (wp) =>
        !wp.id ||
        !wp.name ||
        !wp.location ||
        wp.classification === undefined ||
        wp.status === undefined,
    );

    if (incomplete.length > 0) {
      return {
        id: 'GATE-001',
        name: 'Inventory Completeness',
        passed: false,
        message: `${incomplete.length} write path(s) have incomplete information`,
        blocking: true,
      };
    }

    return {
      id: 'GATE-001',
      name: 'Inventory Completeness',
      passed: true,
      message: `All ${allPaths.length} write paths have complete information`,
      blocking: true,
    };
  }

  /**
   * Check: No legacy-only write paths exist.
   * CRITICAL: This MUST pass for cutover to proceed.
   */
  function checkNoLegacyOnlyWriters(): GateCriterion {
    const legacyOnly = inventoryService.getLegacyOnlyWritePaths();

    if (legacyOnly.length > 0) {
      const names = legacyOnly.map((wp) => `${wp.id}: ${wp.name}`).join(', ');
      return {
        id: 'GATE-002',
        name: 'Zero Legacy-Only Writers',
        passed: false,
        message: `CRITICAL: ${legacyOnly.length} legacy-only writer(s) found: [${names}]. Cutover BLOCKED.`,
        blocking: true,
      };
    }

    return {
      id: 'GATE-002',
      name: 'Zero Legacy-Only Writers',
      passed: true,
      message: 'No legacy-only writers found. All auth-affecting writes have Membership compatibility.',
      blocking: true,
    };
  }

  /**
   * Check: All write paths have IMPLEMENTED status or better.
   */
  function checkImplementationStatus(): GateCriterion {
    const allPaths = inventoryService.getAllWritePaths();
    const notImplemented = allPaths.filter(
      (wp) =>
        wp.status !== WritePathStatus.IMPLEMENTED &&
        wp.status !== WritePathStatus.VERIFIED &&
        wp.classification !== WritePathClassification.DISABLED,
    );

    if (notImplemented.length > 0) {
      const names = notImplemented.map((wp) => `${wp.id}: ${wp.name} (${wp.status})`).join(', ');
      return {
        id: 'GATE-003',
        name: 'Implementation Status',
        passed: false,
        message: `${notImplemented.length} write path(s) not fully implemented: [${names}]`,
        blocking: true,
      };
    }

    const implementedCount = allPaths.filter(
      (wp) =>
        wp.status === WritePathStatus.IMPLEMENTED ||
        wp.status === WritePathStatus.VERIFIED,
    ).length;

    return {
      id: 'GATE-003',
      name: 'Implementation Status',
      passed: true,
      message: `All ${implementedCount} write paths are fully implemented`,
      blocking: true,
    };
  }

  /**
   * Check: All dual-write paths use atomic transactions.
   */
  function checkTransactionConsistency(): GateCriterion {
    const dualWritePaths = inventoryService.getWritePathsByClassification(
      WritePathClassification.DUAL_WRITE,
    );

    const nonAtomic = dualWritePaths.filter((wp) => !wp.usesAtomicTransaction);

    if (nonAtomic.length > 0) {
      const names = nonAtomic.map((wp) => `${wp.id}: ${wp.name}`).join(', ');
      return {
        id: 'GATE-004',
        name: 'Transaction Consistency',
        passed: false,
        message: `${nonAtomic.length} dual-write path(s) missing atomic transactions: [${names}]`,
        blocking: true,
      };
    }

    return {
      id: 'GATE-004',
      name: 'Transaction Consistency',
      passed: true,
      message: `All ${dualWritePaths.length} dual-write paths use atomic transactions`,
      blocking: true,
    };
  }

  /**
   * Check: Quarantine manifest is properly configured.
   */
  function checkQuarantineConfiguration(): GateCriterion {
    const quarantineCount = quarantineService.getQuarantinedCount();

    if (quarantineCount !== EXPECTED_QUARANTINE_COUNT) {
      return {
        id: 'GATE-005',
        name: 'Quarantine Configuration',
        passed: false,
        message: `Quarantine manifest has ${quarantineCount} users, expected ${EXPECTED_QUARANTINE_COUNT} (PNA-01..PNA-05)`,
        blocking: true,
      };
    }

    return {
      id: 'GATE-005',
      name: 'Quarantine Configuration',
      passed: true,
      message: `Quarantine manifest correctly configured with ${quarantineCount} users (PNA-01..PNA-05)`,
      blocking: true,
    };
  }

  /**
   * Check: All write paths that should respect quarantine do so.
   */
  function checkQuarantineRespect(): GateCriterion {
    const allPaths = inventoryService.getAllWritePaths();
    const writablePathsNeedingQuarantine = allPaths.filter(
      (wp) =>
        wp.classification !== WritePathClassification.DISABLED &&
        // Membership operations and role updates should respect quarantine
        (wp.category.includes('MEMBERSHIP') ||
          wp.category.includes('ROLE') ||
          wp.category.includes('USER_ROLE')),
    );

    const notRespecting = writablePathsNeedingQuarantine.filter(
      (wp) => !wp.respectsQuarantine,
    );

    if (notRespecting.length > 0) {
      const names = notRespecting.map((wp) => `${wp.id}: ${wp.name}`).join(', ');
      return {
        id: 'GATE-006',
        name: 'Quarantine Respect',
        passed: false,
        message: `${notRespecting.length} write path(s) do not respect quarantine: [${names}]`,
        blocking: true,
      };
    }

    return {
      id: 'GATE-006',
      name: 'Quarantine Respect',
      passed: true,
      message: 'All relevant write paths respect quarantine exclusion (INV-QUARANTINE-001)',
      blocking: true,
    };
  }

  /**
   * Check: Classification coverage (all categories have paths).
   * Non-blocking but informational.
   */
  function checkClassificationCoverage(): GateCriterion {
    const summary = inventoryService.getInventorySummary();
    const { byClassification } = summary;

    const hasCompatiblePaths =
      byClassification[WritePathClassification.MEMBERSHIP_AUTHORITATIVE] > 0 ||
      byClassification[WritePathClassification.DUAL_WRITE] > 0;

    if (!hasCompatiblePaths) {
      return {
        id: 'GATE-007',
        name: 'Classification Coverage',
        passed: false,
        message: 'No MEMBERSHIP_AUTHORITATIVE or DUAL_WRITE paths found',
        blocking: false, // Warning, not blocking
      };
    }

    return {
      id: 'GATE-007',
      name: 'Classification Coverage',
      passed: true,
      message: `Classification: ${byClassification[WritePathClassification.MEMBERSHIP_AUTHORITATIVE]} membership-authoritative, ${byClassification[WritePathClassification.DUAL_WRITE]} dual-write, ${byClassification[WritePathClassification.DISABLED]} disabled`,
      blocking: false,
    };
  }

  return {
    /**
     * Run all pre-cutover gate checks.
     */
    async runGateCheck(): Promise<PreCutoverGateResult> {
      const checkedAt = new Date();
      const summary = inventoryService.getInventorySummary();

      // Run all checks
      const criteria: GateCriterion[] = [
        checkInventoryCompleteness(),
        checkNoLegacyOnlyWriters(),
        checkImplementationStatus(),
        checkTransactionConsistency(),
        checkQuarantineConfiguration(),
        checkQuarantineRespect(),
        checkClassificationCoverage(),
      ];

      // Determine overall pass/fail (blocking criteria only)
      const blockingCriteria = criteria.filter((c) => c.blocking);
      const allBlockingPassed = blockingCriteria.every((c) => c.passed);

      // Build summary message
      const failedBlocking = blockingCriteria.filter((c) => !c.passed);
      let summaryMessage: string;

      if (allBlockingPassed) {
        summaryMessage =
          'PRE-CUTOVER GATE: PASS — All criteria met. Authorization cutover may proceed.';
      } else {
        summaryMessage =
          `PRE-CUTOVER GATE: FAIL — ${failedBlocking.length} blocking criterion/criteria failed. ` +
          'Authorization cutover is BLOCKED.';
      }

      return {
        passed: allBlockingPassed,
        checkedAt,
        checkVersion: GATE_CHECK_VERSION,
        criteria,
        legacyOnlyWriterCount: summary.legacyOnlyCount,
        totalWritePathCount: summary.total,
        compatibleWritePathCount:
          summary.byClassification[WritePathClassification.MEMBERSHIP_AUTHORITATIVE] +
          summary.byClassification[WritePathClassification.DUAL_WRITE],
        summary: summaryMessage,
      };
    },

    /**
     * Check if cutover can proceed (convenience method).
     */
    async canProceedWithCutover(): Promise<boolean> {
      const result = await this.runGateCheck();
      return result.passed;
    },

    /**
     * Get the list of blocking issues.
     */
    async getBlockingIssues(): Promise<readonly GateCriterion[]> {
      const result = await this.runGateCheck();
      return result.criteria.filter((c) => c.blocking && !c.passed);
    },
  };
};

// ---------------------------------------------------------------------------
// Convenience Exports
// ---------------------------------------------------------------------------

/**
 * Get the current gate check version.
 */
export const getGateCheckVersion = (): string => GATE_CHECK_VERSION;

/**
 * Format a gate result for console output.
 */
export function formatGateResult(result: PreCutoverGateResult): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════════════════════',
    '                    PRE-CUTOVER AUTHORIZATION WRITE COMPATIBILITY GATE',
    '═══════════════════════════════════════════════════════════════════════════════',
    '',
    `Status: ${result.passed ? '✅ PASS' : '❌ FAIL'}`,
    `Checked At: ${result.checkedAt.toISOString()}`,
    `Check Version: ${result.checkVersion}`,
    '',
    '───────────────────────────────────────────────────────────────────────────────',
    'STATISTICS',
    '───────────────────────────────────────────────────────────────────────────────',
    `  Total Write Paths:      ${result.totalWritePathCount}`,
    `  Compatible Write Paths: ${result.compatibleWritePathCount}`,
    `  Legacy-Only Writers:    ${result.legacyOnlyWriterCount}`,
    '',
    '───────────────────────────────────────────────────────────────────────────────',
    'CRITERIA RESULTS',
    '───────────────────────────────────────────────────────────────────────────────',
  ];

  for (const criterion of result.criteria) {
    const status = criterion.passed ? '✅' : '❌';
    const blocking = criterion.blocking ? '[BLOCKING]' : '[INFO]';
    lines.push(`  ${status} ${criterion.id} ${criterion.name} ${blocking}`);
    lines.push(`     └─ ${criterion.message}`);
  }

  lines.push('');
  lines.push('───────────────────────────────────────────────────────────────────────────────');
  lines.push('SUMMARY');
  lines.push('───────────────────────────────────────────────────────────────────────────────');
  lines.push(`  ${result.summary}`);
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════════════════════');

  return lines.join('\n');
}
