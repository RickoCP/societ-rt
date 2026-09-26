/**
 * Authorization Cutover Service — Atomic switching from legacy to new authorization.
 *
 * This service manages the cutover from legacy (User.tenantId + UserRole) to new
 * (Membership-based) authorization with the following capabilities:
 *
 * **Key Features:**
 * - Atomic switching via feature flag (per-route)
 * - Pre-cutover prerequisite verification
 * - Instant rollback support
 * - Comprehensive audit logging
 * - Critical alerts on rollback
 *
 * **Prerequisites (TPR-05-FINAL, TPR-06):**
 * - Pre-cutover write compatibility gate PASS (Task 24)
 * - Mismatch rate < 0.1% (cutover eligibility threshold)
 * - Zero legacy-only authorization writers
 *
 * **Security Considerations:**
 * - Fail closed if prerequisites not met
 * - All operations are audited
 * - Rollbacks emit critical alerts
 *
 * @see Task 25: Authorization Cutover Service
 * @see Requirements 8 (AC 1-7)
 * @see TPR-06: Warning vs Cutover threshold semantics
 */

import { randomUUID } from 'crypto';
import type {
  IAuthorizationCutoverService,
  CutoverPrerequisitesResult,
  PrerequisiteCheckResult,
  InitiateRouteCutoverParams,
  CutoverOperationResult,
  RollbackRouteCutoverParams,
  RollbackOperationResult,
  CutoverStatusResponse,
  RouteCutoverConfig,
  MutableRouteCutoverConfig,
  CutoverAuditEntry,
  AuditLogOptions,
  ICutoverAlertEmitter,
  CriticalAlertParams,
  InfoAlertParams,
} from './types';
import {
  CutoverStatus,
  CutoverAuditAction,
  CUTOVER_MISMATCH_THRESHOLD,
} from './types';
import type { IPreCutoverGateService } from '../compatibility';
import type { IShadowAuthorizationService } from '@core/domains/authorization/services/ShadowAuthorizationService';

// ---------------------------------------------------------------------------
// Default Alert Emitter (Console-based)
// ---------------------------------------------------------------------------

/**
 * Default console-based alert emitter.
 * In production, this would be replaced with an observability platform integration.
 */
const DefaultAlertEmitter: ICutoverAlertEmitter = {
  emitCriticalAlert(params: CriticalAlertParams): void {
    console.error(
      `[CRITICAL ALERT] ${params.type}: Route "${params.routeId}" - ${params.reason}`,
      {
        operatorId: params.operatorId,
        timestamp: params.timestamp.toISOString(),
        correlationId: params.correlationId,
      },
    );
  },
  emitInfoAlert(params: InfoAlertParams): void {
    console.info(`[INFO] ${params.type}: ${params.message}`, {
      routeId: params.routeId,
      operatorId: params.operatorId,
      timestamp: params.timestamp.toISOString(),
      correlationId: params.correlationId,
    });
  },
};

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create an Authorization Cutover Service.
 *
 * Follows Clean Architecture DI pattern — dependencies are injected.
 *
 * @param preCutoverGateService - Service to verify pre-cutover gate (Task 24)
 * @param shadowAuthService - Shadow authorization service for mismatch metrics
 * @param alertEmitter - Alert emitter for critical/info alerts
 *
 * @returns Authorization Cutover Service implementation
 *
 * @example
 * ```typescript
 * // DI Registration
 * container.register({
 *   authorizationCutoverService: asFunction(AuthorizationCutoverServiceImpl).singleton(),
 * });
 *
 * // Usage
 * const service = container.resolve('authorizationCutoverService');
 *
 * // Verify prerequisites
 * const prereqs = await service.verifyCutoverPrerequisites();
 * if (!prereqs.allMet) {
 *   console.error('Cannot proceed:', prereqs.blockingIssues);
 *   return;
 * }
 *
 * // Initiate cutover for a route
 * const result = await service.initiateRouteCutover({
 *   routeId: 'get-residents',
 *   operatorId: 'admin-123',
 *   reason: 'Production cutover after shadow validation',
 * });
 * ```
 */
export const AuthorizationCutoverServiceImpl = ({
  preCutoverGateService,
  shadowAuthService,
  alertEmitter = DefaultAlertEmitter,
}: {
  preCutoverGateService: IPreCutoverGateService;
  shadowAuthService: IShadowAuthorizationService;
  alertEmitter?: ICutoverAlertEmitter;
}): IAuthorizationCutoverService => {
  // Internal state
  const routes = new Map<string, MutableRouteCutoverConfig>();
  const auditLog: CutoverAuditEntry[] = [];
  let globalStatus = CutoverStatus.LEGACY;
  let lastUpdated = new Date();

  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Generate a unique audit entry ID.
   */
  const generateAuditId = (): string => {
    return `audit-${randomUUID()}`;
  };

  /**
   * Create an audit entry and add it to the log.
   */
  const createAuditEntry = (
    action: CutoverAuditAction,
    operatorId: string,
    routesAffected: string[],
    reason: string,
    success: boolean,
    options?: {
      previousStatus?: CutoverStatus;
      newStatus?: CutoverStatus;
      errorMessage?: string;
      metadata?: Record<string, unknown>;
    },
  ): CutoverAuditEntry => {
    const entry: CutoverAuditEntry = {
      id: generateAuditId(),
      timestamp: new Date(),
      action,
      operatorId,
      routesAffected,
      reason,
      previousStatus: options?.previousStatus,
      newStatus: options?.newStatus,
      success,
      errorMessage: options?.errorMessage,
      metadata: options?.metadata,
    };

    auditLog.push(entry);
    return entry;
  };

  /**
   * Update the global status based on route statuses.
   */
  const updateGlobalStatus = (): void => {
    const routeArray = Array.from(routes.values());

    if (routeArray.length === 0) {
      globalStatus = CutoverStatus.LEGACY;
      return;
    }

    const statusCounts = getStatusCounts();

    // If all routes are cut over, global is MEMBERSHIP_AUTHORITATIVE
    if (statusCounts[CutoverStatus.MEMBERSHIP_AUTHORITATIVE] === routeArray.length) {
      globalStatus = CutoverStatus.MEMBERSHIP_AUTHORITATIVE;
    }
    // If any route is rolled back, global reflects that
    else if (statusCounts[CutoverStatus.ROLLED_BACK] > 0) {
      globalStatus = CutoverStatus.ROLLED_BACK;
    }
    // If any route is transitioning, global is transitioning
    else if (statusCounts[CutoverStatus.TRANSITIONING] > 0) {
      globalStatus = CutoverStatus.TRANSITIONING;
    }
    // If some routes are cut over but not all
    else if (statusCounts[CutoverStatus.MEMBERSHIP_AUTHORITATIVE] > 0) {
      // Partial cutover — treat as transitioning
      globalStatus = CutoverStatus.TRANSITIONING;
    }
    // Otherwise, still in legacy
    else {
      globalStatus = CutoverStatus.LEGACY;
    }

    lastUpdated = new Date();
  };

  /**
   * Get status counts for all routes.
   */
  const getStatusCounts = (): Record<CutoverStatus, number> => {
    const counts: Record<CutoverStatus, number> = {
      [CutoverStatus.LEGACY]: 0,
      [CutoverStatus.TRANSITIONING]: 0,
      [CutoverStatus.MEMBERSHIP_AUTHORITATIVE]: 0,
      [CutoverStatus.ROLLED_BACK]: 0,
    };

    for (const route of routes.values()) {
      counts[route.status]++;
    }

    return counts;
  };

  /**
   * Convert mutable config to readonly.
   */
  const toReadonlyConfig = (config: MutableRouteCutoverConfig): RouteCutoverConfig => {
    return {
      routeId: config.routeId,
      routeName: config.routeName,
      status: config.status,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      cutoverAt: config.cutoverAt,
      rolledBackAt: config.rolledBackAt,
      lastOperatorId: config.lastOperatorId,
      notes: config.notes,
    };
  };

  // -------------------------------------------------------------------------
  // Service Implementation
  // -------------------------------------------------------------------------

  return {
    async verifyCutoverPrerequisites(): Promise<CutoverPrerequisitesResult> {
      const verifiedAt = new Date();
      const blockingIssues: string[] = [];

      // -----------------------------------------------------------------------
      // Check 1: Pre-cutover write compatibility gate (Task 24)
      // -----------------------------------------------------------------------
      let writeCompatibilityGate: PrerequisiteCheckResult;
      try {
        const canProceed = await preCutoverGateService.canProceedWithCutover();
        const gateResult = await preCutoverGateService.runGateCheck();

        writeCompatibilityGate = {
          name: 'Pre-Cutover Write Compatibility Gate',
          met: canProceed,
          currentValue: gateResult.passed ? 'PASS' : 'FAIL',
          requiredValue: 'PASS',
          message: canProceed
            ? 'All authorization-affecting writes have Membership compatibility.'
            : `Gate failed: ${gateResult.summary}`,
        };

        if (!canProceed) {
          blockingIssues.push(
            `Pre-cutover write compatibility gate FAILED: ${gateResult.legacyOnlyWriterCount} legacy-only writers remain.`,
          );
        }
      } catch (error) {
        writeCompatibilityGate = {
          name: 'Pre-Cutover Write Compatibility Gate',
          met: false,
          currentValue: 'ERROR',
          requiredValue: 'PASS',
          message: `Failed to verify gate: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
        blockingIssues.push('Pre-cutover write compatibility gate verification failed.');
      }

      // -----------------------------------------------------------------------
      // Check 2: Mismatch rate gate (< 0.1%)
      // -----------------------------------------------------------------------
      const eligibility = shadowAuthService.checkCutoverEligibility();
      const mismatchRateGate: PrerequisiteCheckResult = {
        name: 'Shadow Authorization Mismatch Rate',
        met: eligibility.eligible,
        currentValue: `${(eligibility.currentMismatchRate * 100).toFixed(3)}%`,
        requiredValue: `< ${(CUTOVER_MISMATCH_THRESHOLD * 100).toFixed(1)}%`,
        message: eligibility.eligible
          ? `Mismatch rate ${(eligibility.currentMismatchRate * 100).toFixed(3)}% is below threshold.`
          : eligibility.reason ?? 'Mismatch rate exceeds cutover eligibility threshold.',
      };

      if (!eligibility.eligible) {
        blockingIssues.push(
          `Mismatch rate ${(eligibility.currentMismatchRate * 100).toFixed(3)}% exceeds cutover threshold of ${(CUTOVER_MISMATCH_THRESHOLD * 100).toFixed(1)}%.`,
        );

        // Add route-specific issues
        if (eligibility.problemRoutes && eligibility.problemRoutes.length > 0) {
          for (const route of eligibility.problemRoutes.slice(0, 3)) {
            blockingIssues.push(
              `Route "${route.routeId}" has ${route.mismatchCount} mismatches (${(route.mismatchRate * 100).toFixed(2)}%).`,
            );
          }
        }
      }

      // -----------------------------------------------------------------------
      // Check 3: Zero legacy-only writers (derived from gate check)
      // -----------------------------------------------------------------------
      let legacyWritersGate: PrerequisiteCheckResult;
      try {
        const gateResult = await preCutoverGateService.runGateCheck();
        const hasLegacyOnlyWriters = gateResult.legacyOnlyWriterCount > 0;

        legacyWritersGate = {
          name: 'Zero Legacy-Only Authorization Writers',
          met: !hasLegacyOnlyWriters,
          currentValue: String(gateResult.legacyOnlyWriterCount),
          requiredValue: '0',
          message: hasLegacyOnlyWriters
            ? `${gateResult.legacyOnlyWriterCount} legacy-only writer(s) still exist.`
            : 'All authorization writes have Membership synchronization.',
        };

        if (hasLegacyOnlyWriters) {
          blockingIssues.push(
            `CRITICAL: ${gateResult.legacyOnlyWriterCount} legacy-only authorization writer(s) remain. Cutover is BLOCKED.`,
          );
        }
      } catch (error) {
        legacyWritersGate = {
          name: 'Zero Legacy-Only Authorization Writers',
          met: false,
          currentValue: 'ERROR',
          requiredValue: '0',
          message: `Failed to verify: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
        blockingIssues.push('Failed to verify legacy-only writers status.');
      }

      // -----------------------------------------------------------------------
      // Build result
      // -----------------------------------------------------------------------
      const allMet =
        writeCompatibilityGate.met && mismatchRateGate.met && legacyWritersGate.met;

      let summary: string;
      if (allMet) {
        summary =
          'All prerequisites met. Authorization cutover may proceed.';

        // Create audit entry for successful verification
        createAuditEntry(
          CutoverAuditAction.PREREQUISITES_VERIFIED,
          'SYSTEM',
          [],
          'All cutover prerequisites verified successfully.',
          true,
          {
            metadata: {
              mismatchRate: eligibility.currentMismatchRate,
              sampleSize: shadowAuthService.getMetrics().totalChecks,
            },
          },
        );

        alertEmitter.emitInfoAlert({
          type: 'PREREQUISITES_VERIFIED',
          message: 'All authorization cutover prerequisites verified.',
          operatorId: 'SYSTEM',
          timestamp: verifiedAt,
        });
      } else {
        summary = `${blockingIssues.length} blocking issue(s) found. Cutover is BLOCKED.`;

        // Create audit entry for failed verification
        createAuditEntry(
          CutoverAuditAction.PREREQUISITES_FAILED,
          'SYSTEM',
          [],
          summary,
          false,
          {
            errorMessage: blockingIssues.join(' | '),
            metadata: {
              blockingIssues,
            },
          },
        );
      }

      return {
        allMet,
        verifiedAt,
        writeCompatibilityGate,
        mismatchRateGate,
        legacyWritersGate,
        summary,
        blockingIssues,
      };
    },

    async initiateRouteCutover(
      params: InitiateRouteCutoverParams,
    ): Promise<CutoverOperationResult> {
      const { routeId, operatorId, reason, skipPrerequisiteCheck, correlationId } = params;

      // Get route config
      const routeConfig = routes.get(routeId);
      if (!routeConfig) {
        const auditEntry = createAuditEntry(
          CutoverAuditAction.CUTOVER_FAILED,
          operatorId,
          [routeId],
          reason,
          false,
          { errorMessage: `Route "${routeId}" not registered.` },
        );

        return {
          success: false,
          routeId,
          newStatus: CutoverStatus.LEGACY,
          auditEntry,
          errorMessage: `Route "${routeId}" is not registered. Call registerRoute() first.`,
        };
      }

      const previousStatus = routeConfig.status;

      // Check if already cut over
      if (routeConfig.status === CutoverStatus.MEMBERSHIP_AUTHORITATIVE) {
        const auditEntry = createAuditEntry(
          CutoverAuditAction.CUTOVER_FAILED,
          operatorId,
          [routeId],
          reason,
          false,
          {
            previousStatus,
            errorMessage: 'Route is already cut over.',
          },
        );

        return {
          success: false,
          routeId,
          newStatus: routeConfig.status,
          auditEntry,
          errorMessage: `Route "${routeId}" is already cut over to membership authorization.`,
        };
      }

      // Verify prerequisites (unless skipped for testing)
      if (!skipPrerequisiteCheck) {
        const prereqs = await this.verifyCutoverPrerequisites();
        if (!prereqs.allMet) {
          const auditEntry = createAuditEntry(
            CutoverAuditAction.CUTOVER_FAILED,
            operatorId,
            [routeId],
            reason,
            false,
            {
              previousStatus,
              errorMessage: `Prerequisites not met: ${prereqs.blockingIssues.join('; ')}`,
            },
          );

          return {
            success: false,
            routeId,
            newStatus: routeConfig.status,
            auditEntry,
            errorMessage: `Prerequisites not met: ${prereqs.summary}`,
          };
        }
      }

      // Perform atomic cutover
      try {
        // Set to transitioning briefly
        routeConfig.status = CutoverStatus.TRANSITIONING;
        routeConfig.updatedAt = new Date();

        // Atomic switch to membership authoritative
        routeConfig.status = CutoverStatus.MEMBERSHIP_AUTHORITATIVE;
        routeConfig.cutoverAt = new Date();
        routeConfig.updatedAt = routeConfig.cutoverAt;
        routeConfig.lastOperatorId = operatorId;
        routeConfig.notes = reason;

        updateGlobalStatus();

        const auditEntry = createAuditEntry(
          CutoverAuditAction.CUTOVER_COMPLETED,
          operatorId,
          [routeId],
          reason,
          true,
          {
            previousStatus,
            newStatus: CutoverStatus.MEMBERSHIP_AUTHORITATIVE,
            metadata: { correlationId },
          },
        );

        alertEmitter.emitInfoAlert({
          type: 'CUTOVER_SUCCESS',
          routeId,
          message: `Route "${routeId}" successfully cut over to membership authorization.`,
          operatorId,
          timestamp: routeConfig.cutoverAt,
          correlationId,
        });

        return {
          success: true,
          routeId,
          newStatus: CutoverStatus.MEMBERSHIP_AUTHORITATIVE,
          auditEntry,
        };
      } catch (error) {
        // Rollback on error
        routeConfig.status = previousStatus;
        routeConfig.updatedAt = new Date();

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const auditEntry = createAuditEntry(
          CutoverAuditAction.CUTOVER_FAILED,
          operatorId,
          [routeId],
          reason,
          false,
          {
            previousStatus,
            errorMessage,
            metadata: { correlationId },
          },
        );

        return {
          success: false,
          routeId,
          newStatus: previousStatus,
          auditEntry,
          errorMessage,
        };
      }
    },

    async rollbackRouteCutover(
      params: RollbackRouteCutoverParams,
    ): Promise<RollbackOperationResult> {
      const { routeId, operatorId, reason, isEmergency, correlationId } = params;

      // Get route config
      const routeConfig = routes.get(routeId);
      if (!routeConfig) {
        const auditEntry = createAuditEntry(
          CutoverAuditAction.ROLLBACK_FAILED,
          operatorId,
          [routeId],
          reason,
          false,
          { errorMessage: `Route "${routeId}" not registered.` },
        );

        return {
          success: false,
          routeId,
          newStatus: CutoverStatus.LEGACY,
          alertEmitted: false,
          auditEntry,
          errorMessage: `Route "${routeId}" is not registered.`,
        };
      }

      const previousStatus = routeConfig.status;

      // Check if already in legacy or rolled back
      if (
        routeConfig.status === CutoverStatus.LEGACY ||
        routeConfig.status === CutoverStatus.ROLLED_BACK
      ) {
        const auditEntry = createAuditEntry(
          CutoverAuditAction.ROLLBACK_FAILED,
          operatorId,
          [routeId],
          reason,
          false,
          {
            previousStatus,
            errorMessage: 'Route is already using legacy authorization.',
          },
        );

        return {
          success: false,
          routeId,
          newStatus: routeConfig.status,
          alertEmitted: false,
          auditEntry,
          errorMessage: `Route "${routeId}" is already using legacy authorization.`,
        };
      }

      // Perform instant rollback
      try {
        routeConfig.status = CutoverStatus.ROLLED_BACK;
        routeConfig.rolledBackAt = new Date();
        routeConfig.updatedAt = routeConfig.rolledBackAt;
        routeConfig.lastOperatorId = operatorId;
        routeConfig.notes = `ROLLBACK: ${reason}`;

        updateGlobalStatus();

        // Emit critical alert
        alertEmitter.emitCriticalAlert({
          type: 'CUTOVER_ROLLBACK',
          routeId,
          reason,
          operatorId,
          timestamp: routeConfig.rolledBackAt,
          correlationId,
        });

        const auditEntry = createAuditEntry(
          CutoverAuditAction.ROLLBACK_COMPLETED,
          operatorId,
          [routeId],
          reason,
          true,
          {
            previousStatus,
            newStatus: CutoverStatus.ROLLED_BACK,
            metadata: {
              isEmergency: isEmergency ?? false,
              correlationId,
            },
          },
        );

        return {
          success: true,
          routeId,
          newStatus: CutoverStatus.ROLLED_BACK,
          alertEmitted: true,
          auditEntry,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const auditEntry = createAuditEntry(
          CutoverAuditAction.ROLLBACK_FAILED,
          operatorId,
          [routeId],
          reason,
          false,
          {
            previousStatus,
            errorMessage,
            metadata: { correlationId },
          },
        );

        return {
          success: false,
          routeId,
          newStatus: previousStatus,
          alertEmitted: false,
          auditEntry,
          errorMessage,
        };
      }
    },

    getCutoverStatus(): CutoverStatusResponse {
      const routeArray = Array.from(routes.values()).map(toReadonlyConfig);
      const statusCounts = getStatusCounts();

      const isFullyCutOver =
        routeArray.length > 0 &&
        statusCounts[CutoverStatus.MEMBERSHIP_AUTHORITATIVE] === routeArray.length;

      const hasRolledBackRoutes = statusCounts[CutoverStatus.ROLLED_BACK] > 0;

      return {
        globalStatus,
        routes: routeArray,
        statusCounts,
        isFullyCutOver,
        hasRolledBackRoutes,
        lastUpdated,
      };
    },

    getRouteCutoverStatus(routeId: string): RouteCutoverConfig | undefined {
      const config = routes.get(routeId);
      return config ? toReadonlyConfig(config) : undefined;
    },

    isRouteCutOver(routeId: string): boolean {
      const config = routes.get(routeId);
      return config?.status === CutoverStatus.MEMBERSHIP_AUTHORITATIVE;
    },

    getAuditLog(options?: AuditLogOptions): readonly CutoverAuditEntry[] {
      let filtered = [...auditLog];

      if (options?.routeId) {
        filtered = filtered.filter((e) => e.routesAffected.includes(options.routeId!));
      }

      if (options?.action) {
        filtered = filtered.filter((e) => e.action === options.action);
      }

      if (options?.operatorId) {
        filtered = filtered.filter((e) => e.operatorId === options.operatorId);
      }

      if (options?.fromTimestamp) {
        filtered = filtered.filter((e) => e.timestamp >= options.fromTimestamp!);
      }

      if (options?.toTimestamp) {
        filtered = filtered.filter((e) => e.timestamp <= options.toTimestamp!);
      }

      if (options?.successOnly) {
        filtered = filtered.filter((e) => e.success);
      }

      // Sort by timestamp descending (most recent first)
      filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      if (options?.limit && options.limit > 0) {
        filtered = filtered.slice(0, options.limit);
      }

      return filtered;
    },

    registerRoute(routeId: string, routeName: string): void {
      if (routes.has(routeId)) {
        // Already registered, just update name if different
        const existing = routes.get(routeId)!;
        if (existing.routeName !== routeName) {
          existing.routeName = routeName;
          existing.updatedAt = new Date();
        }
        return;
      }

      const now = new Date();
      routes.set(routeId, {
        routeId,
        routeName,
        status: CutoverStatus.LEGACY,
        createdAt: now,
        updatedAt: now,
      });

      updateGlobalStatus();
    },

    getRegisteredRoutes(): readonly string[] {
      return Array.from(routes.keys());
    },
  };
};

/**
 * Type alias for cleaner DI registration.
 */
export type AuthorizationCutoverService = IAuthorizationCutoverService;
