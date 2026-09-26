/**
 * Pre-Flight Verification Service — Verifies TPR-07 ordered criteria before cleanup.
 *
 * This service ensures all preconditions are met before destructive schema cleanup:
 * 1. Legacy dependency stopped
 * 2. Zero authorization dependency on User.tenantId
 * 3. Zero required legacy writes
 * 4. Stabilization/rollback observation window passed (24 hours)
 * 5. Backup/recovery checkpoint created
 * 6. Explicit destructive-operation approval gate
 *
 * **CRITICAL:** Criteria MUST be checked in TPR-07 order.
 *
 * @see Task 37: Legacy Schema Cleanup
 * @see Requirement 13 (AC 1, 7)
 * @see TPR-07: Destructive cleanup ordering
 */

import type {
  IPreFlightVerificationService,
  PreFlightVerificationResult,
  PreFlightCriteria,
  CriterionResult,
  PreFlightOptions,
  ApprovalGateStatus,
} from './types';
import {
  CleanupError,
  DEFAULT_STABILIZATION_WINDOW_HOURS,
} from './types';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies for the Pre-Flight Verification Service.
 */
export interface PreFlightVerificationServiceDeps {
  /** Code path analyzer for checking tenantId dependencies */
  readonly codePathAnalyzer?: {
    getUsagesByClassification: (classification: string) => readonly { id: string }[];
  };
  /** Migration status tracker for checking completion */
  readonly migrationStatusTracker?: {
    isMigrationComplete: () => boolean;
    getBlockingIssues: () => readonly string[];
  };
  /** Backup service for checking checkpoint status */
  readonly backupService?: {
    listCheckpoints: () => Promise<readonly { isValid: boolean }[]>;
  };
  /** Approval gate for checking destructive approval */
  readonly approvalGate?: {
    getStatus: () => ApprovalGateStatus;
  };
  /** Logger for recording verification progress */
  readonly logger?: {
    info: (message: string, context?: Record<string, unknown>) => void;
    warn: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
  };
  /** Custom date provider for testing */
  readonly dateProvider?: () => Date;
  /** FASE 1.14 completion timestamp (from migration status or config) */
  readonly getFase114CompletionTimestamp?: () => Promise<Date | null>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function for Pre-Flight Verification Service.
 *
 * @param deps - Service dependencies
 * @returns Pre-Flight Verification Service instance
 */
export function createPreFlightVerificationService(
  deps: PreFlightVerificationServiceDeps = {},
): IPreFlightVerificationService {
  const {
    codePathAnalyzer,
    migrationStatusTracker,
    backupService,
    approvalGate,
    logger = console,
    dateProvider = () => new Date(),
    getFase114CompletionTimestamp,
  } = deps;

  // Internal state for tracking latest verification
  let lastVerificationResult: PreFlightVerificationResult | null = null;

  /**
   * Generate a correlation ID.
   */
  function generateCorrelationId(): string {
    return `preflight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if legacy dependency has been stopped (FASE 1.14 complete).
   */
  async function checkLegacyDependencyStopped(): Promise<CriterionResult> {
    const now = dateProvider();

    // Check if migration status tracker indicates completion
    if (migrationStatusTracker) {
      const isComplete = migrationStatusTracker.isMigrationComplete();
      const blockingIssues = migrationStatusTracker.getBlockingIssues();

      return {
        passed: isComplete && blockingIssues.length === 0,
        checkedAt: now,
        evidence: isComplete
          ? 'FASE 1.14 complete: all legacy dependencies removed'
          : 'FASE 1.14 incomplete: migration in progress',
        details: {
          migrationComplete: isComplete,
          blockingIssues,
        },
        blockingReason: isComplete
          ? undefined
          : `FASE 1.14 not complete. Blocking issues: ${blockingIssues.join(', ') || 'none reported'}`,
      };
    }

    // Fallback: Check via FASE 1.14 completion timestamp
    if (getFase114CompletionTimestamp) {
      const completedAt = await getFase114CompletionTimestamp();
      return {
        passed: completedAt !== null,
        checkedAt: now,
        evidence: completedAt
          ? `FASE 1.14 completed at ${completedAt.toISOString()}`
          : 'FASE 1.14 completion timestamp not found',
        details: { completedAt: completedAt?.toISOString() },
        blockingReason: completedAt ? undefined : 'FASE 1.14 must be completed before cleanup',
      };
    }

    // No way to verify - fail closed
    return {
      passed: false,
      checkedAt: now,
      evidence: 'Unable to verify FASE 1.14 completion (no tracker or timestamp provider)',
      blockingReason: 'Cannot verify legacy dependency removal status',
    };
  }

  /**
   * Check for zero authorization dependency on User.tenantId.
   */
  async function checkZeroAuthorizationDependency(): Promise<CriterionResult> {
    const now = dateProvider();

    if (codePathAnalyzer) {
      const authCriticalUsages = codePathAnalyzer.getUsagesByClassification('authorization-critical');

      return {
        passed: authCriticalUsages.length === 0,
        checkedAt: now,
        evidence:
          authCriticalUsages.length === 0
            ? 'Zero authorization-critical usages of User.tenantId found'
            : `Found ${authCriticalUsages.length} authorization-critical usages`,
        details: {
          authCriticalCount: authCriticalUsages.length,
          usageIds: authCriticalUsages.map(u => u.id),
        },
        blockingReason:
          authCriticalUsages.length > 0
            ? `${authCriticalUsages.length} authorization-critical usages must be removed first`
            : undefined,
      };
    }

    // Fallback: Check migration status for blocking issues
    if (migrationStatusTracker) {
      const blockingIssues = migrationStatusTracker.getBlockingIssues();
      const hasAuthIssues = blockingIssues.some(
        issue => issue.toLowerCase().includes('authorization') || issue.toLowerCase().includes('auth'),
      );

      return {
        passed: !hasAuthIssues,
        checkedAt: now,
        evidence: hasAuthIssues
          ? 'Authorization-related blocking issues found'
          : 'No authorization-related blocking issues detected',
        details: { blockingIssues },
        blockingReason: hasAuthIssues ? 'Authorization dependencies must be removed first' : undefined,
      };
    }

    // Assume passed if no analyzer available (rely on FASE 1.14 completion)
    return {
      passed: true,
      checkedAt: now,
      evidence: 'Verification relies on FASE 1.14 completion status (no code analyzer available)',
      details: { assumedPassed: true },
    };
  }

  /**
   * Check for zero required legacy writes.
   */
  async function checkZeroLegacyWrites(): Promise<CriterionResult> {
    const now = dateProvider();

    // This check relies on FASE 1.14 completion which includes write path migration
    // The write path should have been finalized in FASE 1.11
    if (migrationStatusTracker) {
      const isComplete = migrationStatusTracker.isMigrationComplete();

      return {
        passed: isComplete,
        checkedAt: now,
        evidence: isComplete
          ? 'Legacy write paths removed (FASE 1.11 complete, included in FASE 1.14)'
          : 'Legacy write paths may still exist',
        details: { migrationComplete: isComplete },
        blockingReason: isComplete ? undefined : 'Legacy write paths must be removed first',
      };
    }

    // Assume passed if relying on FASE 1.14 completion
    return {
      passed: true,
      checkedAt: now,
      evidence: 'Verification relies on FASE 1.14 completion status',
      details: { assumedPassed: true },
    };
  }

  /**
   * Check if stabilization window has passed.
   */
  async function checkStabilizationWindowPassed(
    options?: PreFlightOptions,
  ): Promise<CriterionResult> {
    const now = dateProvider();
    const windowHours = options?.stabilizationWindowHours ?? DEFAULT_STABILIZATION_WINDOW_HOURS;

    // Allow skipping for testing (DANGEROUS)
    if (options?.skipStabilizationCheck) {
      logger.warn?.('Stabilization window check skipped (skipStabilizationCheck=true)', {
        correlationId: options.correlationId,
      });
      return {
        passed: true,
        checkedAt: now,
        evidence: 'Stabilization window check SKIPPED (skipStabilizationCheck=true)',
        details: { skipped: true },
      };
    }

    // Get FASE 1.14 completion timestamp
    let fase114CompletedAt: Date | null = options?.fase114CompletedAt ?? null;

    if (!fase114CompletedAt && getFase114CompletionTimestamp) {
      fase114CompletedAt = await getFase114CompletionTimestamp();
    }

    if (!fase114CompletedAt) {
      return {
        passed: false,
        checkedAt: now,
        evidence: 'Cannot determine stabilization window: FASE 1.14 completion timestamp not found',
        blockingReason: 'FASE 1.14 must be completed before stabilization window starts',
      };
    }

    const windowEndTime = new Date(fase114CompletedAt.getTime() + windowHours * 60 * 60 * 1000);
    const windowPassed = now >= windowEndTime;
    const hoursRemaining = windowPassed
      ? 0
      : Math.ceil((windowEndTime.getTime() - now.getTime()) / (60 * 60 * 1000));

    return {
      passed: windowPassed,
      checkedAt: now,
      evidence: windowPassed
        ? `${windowHours}-hour stabilization window passed (ended ${windowEndTime.toISOString()})`
        : `${windowHours}-hour stabilization window not yet passed (${hoursRemaining} hours remaining)`,
      details: {
        fase114CompletedAt: fase114CompletedAt.toISOString(),
        windowEndTime: windowEndTime.toISOString(),
        windowHours,
        hoursRemaining,
      },
      blockingReason: windowPassed
        ? undefined
        : `Stabilization window has ${hoursRemaining} hours remaining`,
    };
  }

  /**
   * Check if backup checkpoint has been created.
   */
  async function checkBackupCheckpointCreated(): Promise<CriterionResult> {
    const now = dateProvider();

    if (backupService) {
      const checkpoints = await backupService.listCheckpoints();
      const validCheckpoints = checkpoints.filter(cp => cp.isValid);

      return {
        passed: validCheckpoints.length > 0,
        checkedAt: now,
        evidence:
          validCheckpoints.length > 0
            ? `${validCheckpoints.length} valid backup checkpoint(s) available`
            : 'No valid backup checkpoints found',
        details: {
          totalCheckpoints: checkpoints.length,
          validCheckpoints: validCheckpoints.length,
        },
        blockingReason:
          validCheckpoints.length === 0 ? 'A backup checkpoint must be created before cleanup' : undefined,
      };
    }

    // No backup service available - fail closed
    return {
      passed: false,
      checkedAt: now,
      evidence: 'Backup service not available',
      blockingReason: 'Backup service required for cleanup',
    };
  }

  /**
   * Check if destructive operation approval has been granted.
   */
  async function checkDestructiveApprovalGate(): Promise<CriterionResult> {
    const now = dateProvider();

    if (approvalGate) {
      const status = approvalGate.getStatus();

      return {
        passed: status.approved && status.isValid,
        checkedAt: now,
        evidence: status.approved && status.isValid
          ? `Destructive operation approved by ${status.approval?.approverId} (expires in ${status.timeUntilExpirationSeconds}s)`
          : status.approved && !status.isValid
            ? 'Approval has expired'
            : 'No approval granted',
        details: {
          approved: status.approved,
          isValid: status.isValid,
          approvalId: status.approval?.approvalId,
          approverId: status.approval?.approverId,
          expiresAt: status.approval?.expiresAt?.toISOString(),
        },
        blockingReason: !status.approved || !status.isValid
          ? 'Explicit approval required for destructive operation'
          : undefined,
      };
    }

    // No approval gate available - require manual approval
    return {
      passed: false,
      checkedAt: now,
      evidence: 'Approval gate not configured',
      blockingReason: 'Approval gate must be configured for destructive operations',
    };
  }

  /**
   * Run full pre-flight verification.
   */
  async function verify(options?: PreFlightOptions): Promise<PreFlightVerificationResult> {
    const correlationId = options?.correlationId ?? generateCorrelationId();
    const now = dateProvider();

    logger.info?.('Starting pre-flight verification', { correlationId });

    // Run criteria checks in TPR-07 order
    const criteria: PreFlightCriteria = {
      legacyDependencyStopped: await checkLegacyDependencyStopped(),
      zeroAuthorizationDependency: await checkZeroAuthorizationDependency(),
      zeroLegacyWrites: await checkZeroLegacyWrites(),
      stabilizationWindowPassed: await checkStabilizationWindowPassed(options),
      backupCheckpointCreated: await checkBackupCheckpointCreated(),
      destructiveApprovalGate: await checkDestructiveApprovalGate(),
    };

    // Collect blocking issues
    const blockingIssues: string[] = [];
    const warnings: string[] = [];

    Object.entries(criteria).forEach(([name, result]) => {
      if (!result.passed && result.blockingReason) {
        blockingIssues.push(`[${name}] ${result.blockingReason}`);
      }
    });

    // Check for incomplete dependencies
    if (!criteria.legacyDependencyStopped.passed) {
      blockingIssues.unshift('CRITICAL: FASE 1.14 must be complete before legacy cleanup');
    }

    // Overall verification passes only if ALL criteria pass
    const verified = Object.values(criteria).every(c => c.passed);

    const result: PreFlightVerificationResult = {
      verified,
      verifiedAt: now,
      criteria,
      blockingIssues,
      warnings,
      correlationId,
    };

    lastVerificationResult = result;

    logger.info?.(`Pre-flight verification ${verified ? 'PASSED' : 'FAILED'}`, {
      correlationId,
      verified,
      blockingIssuesCount: blockingIssues.length,
    });

    return result;
  }

  /**
   * Check a single criterion.
   */
  async function checkCriterion(
    criterionName: keyof PreFlightCriteria,
  ): Promise<CriterionResult> {
    switch (criterionName) {
      case 'legacyDependencyStopped':
        return checkLegacyDependencyStopped();
      case 'zeroAuthorizationDependency':
        return checkZeroAuthorizationDependency();
      case 'zeroLegacyWrites':
        return checkZeroLegacyWrites();
      case 'stabilizationWindowPassed':
        return checkStabilizationWindowPassed();
      case 'backupCheckpointCreated':
        return checkBackupCheckpointCreated();
      case 'destructiveApprovalGate':
        return checkDestructiveApprovalGate();
      default:
        throw new CleanupError(
          'INVALID_CONFIGURATION',
          `Unknown criterion: ${String(criterionName)}`,
        );
    }
  }

  /**
   * Get stabilization window status.
   */
  async function getStabilizationStatus(): Promise<{
    windowPassed: boolean;
    fase114CompletedAt: Date | null;
    windowEndTime: Date | null;
    hoursRemaining: number | null;
  }> {
    const now = dateProvider();

    const fase114CompletedAt = getFase114CompletionTimestamp
      ? await getFase114CompletionTimestamp()
      : null;

    if (!fase114CompletedAt) {
      return {
        windowPassed: false,
        fase114CompletedAt: null,
        windowEndTime: null,
        hoursRemaining: null,
      };
    }

    const windowEndTime = new Date(
      fase114CompletedAt.getTime() + DEFAULT_STABILIZATION_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const windowPassed = now >= windowEndTime;
    const hoursRemaining = windowPassed
      ? 0
      : Math.ceil((windowEndTime.getTime() - now.getTime()) / (60 * 60 * 1000));

    return {
      windowPassed,
      fase114CompletedAt,
      windowEndTime,
      hoursRemaining,
    };
  }

  return {
    verify,
    checkCriterion,
    getStabilizationStatus,
  };
}

/**
 * Default Pre-Flight Verification Service instance.
 */
export const PreFlightVerificationServiceImpl = createPreFlightVerificationService;
