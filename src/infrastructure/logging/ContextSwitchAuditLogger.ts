/**
 * ContextSwitchAuditLogger — Audit logging for context switches.
 *
 * This service provides comprehensive audit logging for all tenant and OrgUnit
 * context switches. Every context switch (successful or failed) is logged with
 * full context for security audit and debugging purposes.
 *
 * **SECURITY AUDIT REQUIREMENTS:**
 * - All context switches MUST be logged
 * - Both success and failure cases MUST be captured
 * - No sensitive data (tokens, passwords, PII) in logs
 * - Integration with correlationId for request tracing
 *
 * **CORRELATION ID INTEGRATION:**
 * - Uses `@infrastructure/utils/correlationId` for correlation ID generation
 * - If correlationId is not provided, a fallback value is generated automatically
 * - Ensures consistent correlationId propagation across all log entries for a request
 *
 * @see Task 23.2: Implement context switch logging
 * @see Requirement 15.2: Log all context switches
 * @see Requirement 15.8: Integrate with correlationId system
 * @see Error Handling Guideline (12-error-handling.md)
 */

import { generateCorrelationId } from '@infrastructure/utils/correlationId';
import { createLogger, type Logger, type LogContext } from './Logger';

// ---------------------------------------------------------------------------
// Context Switch Log Types
// ---------------------------------------------------------------------------

/**
 * Type of context switch operation.
 */
export enum ContextSwitchType {
  /** User switching from one tenant to another */
  TENANT_SWITCH = 'TENANT_SWITCH',
  /** User switching from one OrgUnit to another within same tenant */
  ORGUNIT_SWITCH = 'ORGUNIT_SWITCH',
  /** Combined tenant and OrgUnit switch */
  FULL_CONTEXT_SWITCH = 'FULL_CONTEXT_SWITCH',
}

/**
 * Reason/trigger for the context switch.
 */
export enum ContextSwitchTrigger {
  /** User initiated via UI context picker */
  USER_INITIATED = 'USER_INITIATED',
  /** System switched context (e.g., on login) */
  SYSTEM_AUTOMATIC = 'SYSTEM_AUTOMATIC',
  /** Session restore/reload */
  SESSION_RESTORE = 'SESSION_RESTORE',
  /** API request with different context */
  API_REQUEST = 'API_REQUEST',
}

/**
 * Result of the context switch attempt.
 */
export enum ContextSwitchResult {
  /** Context switch was successful */
  SUCCESS = 'SUCCESS',
  /** Failed - user quarantined */
  FAILED_USER_QUARANTINED = 'FAILED_USER_QUARANTINED',
  /** Failed - no membership in target tenant */
  FAILED_NO_MEMBERSHIP = 'FAILED_NO_MEMBERSHIP',
  /** Failed - membership not active */
  FAILED_MEMBERSHIP_INACTIVE = 'FAILED_MEMBERSHIP_INACTIVE',
  /** Failed - invalid scope (non-admin requesting null OrgUnit) */
  FAILED_INVALID_SCOPE = 'FAILED_INVALID_SCOPE',
  /** Failed - OrgUnit not found */
  FAILED_ORGUNIT_NOT_FOUND = 'FAILED_ORGUNIT_NOT_FOUND',
  /** Failed - OrgUnit out of membership scope */
  FAILED_OUT_OF_SCOPE = 'FAILED_OUT_OF_SCOPE',
  /** Failed - other/unknown error */
  FAILED_OTHER = 'FAILED_OTHER',
}

/**
 * Input for logging a context switch event.
 */
export interface ContextSwitchLogInput {
  /** 
   * Correlation ID for request tracing.
   * If not provided, a fallback ID is generated using `@infrastructure/utils/correlationId`.
   * @see Requirements 15.8 — Integrate with correlationId system
   */
  readonly correlationId?: string;
  /** User ID performing the switch */
  readonly userId: string;
  /** Type of context switch */
  readonly switchType: ContextSwitchType;
  /** Source tenant ID (switching from) */
  readonly fromTenantId: string | null;
  /** Target tenant ID (switching to) */
  readonly toTenantId: string;
  /** Source OrgUnit ID (switching from) */
  readonly fromOrgUnitId: string | null;
  /** Target OrgUnit ID (switching to) */
  readonly toOrgUnitId: string | null;
  /** Result of the context switch */
  readonly result: ContextSwitchResult;
  /** Trigger/reason for the switch */
  readonly trigger: ContextSwitchTrigger;
  /** Membership ID used (if successful) */
  readonly membershipId?: string;
  /** Error code (if failed) */
  readonly errorCode?: string;
  /** Additional details */
  readonly details?: Record<string, unknown>;
}

/**
 * Structured context switch audit log entry.
 */
export interface ContextSwitchAuditEntry {
  /** ISO timestamp of the event */
  readonly timestamp: string;
  /** Event type identifier */
  readonly eventType: 'CONTEXT_SWITCH';
  /** Correlation ID for request tracing */
  readonly correlationId: string;
  /** User ID performing the switch */
  readonly userId: string;
  /** Type of context switch */
  readonly switchType: ContextSwitchType;
  /** Source context */
  readonly from: {
    readonly tenantId: string | null;
    readonly orgUnitId: string | null;
  };
  /** Target context */
  readonly to: {
    readonly tenantId: string;
    readonly orgUnitId: string | null;
  };
  /** Whether the switch was successful */
  readonly success: boolean;
  /** Result code */
  readonly resultCode: ContextSwitchResult;
  /** Trigger/reason for the switch */
  readonly trigger: ContextSwitchTrigger;
  /** Membership ID used (if successful) */
  readonly membershipId?: string;
  /** Error code (if failed) */
  readonly errorCode?: string;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

/**
 * IContextSwitchAuditLogger interface.
 *
 * Provides audit logging capabilities for context switch operations.
 */
export interface IContextSwitchAuditLogger {
  /**
   * Log a context switch event.
   *
   * @param input - Context switch log input
   */
  logContextSwitch(input: ContextSwitchLogInput): void;

  /**
   * Log a successful tenant switch.
   *
   * @param correlationId - Request correlation ID
   * @param userId - User performing the switch
   * @param fromTenantId - Source tenant ID
   * @param toTenantId - Target tenant ID
   * @param membershipId - Resolved membership ID
   * @param trigger - Trigger for the switch
   */
  logTenantSwitchSuccess(
    correlationId: string,
    userId: string,
    fromTenantId: string | null,
    toTenantId: string,
    membershipId: string,
    trigger?: ContextSwitchTrigger,
  ): void;

  /**
   * Log a failed tenant switch.
   *
   * @param correlationId - Request correlation ID
   * @param userId - User performing the switch
   * @param fromTenantId - Source tenant ID
   * @param toTenantId - Target tenant ID
   * @param result - Failure result code
   * @param errorCode - Error code
   * @param trigger - Trigger for the switch
   */
  logTenantSwitchFailure(
    correlationId: string,
    userId: string,
    fromTenantId: string | null,
    toTenantId: string,
    result: ContextSwitchResult,
    errorCode?: string,
    trigger?: ContextSwitchTrigger,
  ): void;

  /**
   * Log a successful OrgUnit switch.
   *
   * @param correlationId - Request correlation ID
   * @param userId - User performing the switch
   * @param tenantId - Current tenant ID
   * @param fromOrgUnitId - Source OrgUnit ID
   * @param toOrgUnitId - Target OrgUnit ID
   * @param membershipId - Resolved membership ID
   * @param trigger - Trigger for the switch
   */
  logOrgUnitSwitchSuccess(
    correlationId: string,
    userId: string,
    tenantId: string,
    fromOrgUnitId: string | null,
    toOrgUnitId: string | null,
    membershipId: string,
    trigger?: ContextSwitchTrigger,
  ): void;

  /**
   * Log a failed OrgUnit switch.
   *
   * @param correlationId - Request correlation ID
   * @param userId - User performing the switch
   * @param tenantId - Current tenant ID
   * @param fromOrgUnitId - Source OrgUnit ID
   * @param toOrgUnitId - Target OrgUnit ID
   * @param result - Failure result code
   * @param errorCode - Error code
   * @param trigger - Trigger for the switch
   */
  logOrgUnitSwitchFailure(
    correlationId: string,
    userId: string,
    tenantId: string,
    fromOrgUnitId: string | null,
    toOrgUnitId: string | null,
    result: ContextSwitchResult,
    errorCode?: string,
    trigger?: ContextSwitchTrigger,
  ): void;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Determine the type of context switch based on from/to values.
 */
export function determineSwitchType(
  fromTenantId: string | null,
  toTenantId: string,
  fromOrgUnitId: string | null,
  toOrgUnitId: string | null,
): ContextSwitchType {
  const isTenantSwitch = fromTenantId !== toTenantId;
  const isOrgUnitSwitch = fromOrgUnitId !== toOrgUnitId;

  if (isTenantSwitch && isOrgUnitSwitch) {
    return ContextSwitchType.FULL_CONTEXT_SWITCH;
  }
  if (isTenantSwitch) {
    return ContextSwitchType.TENANT_SWITCH;
  }
  return ContextSwitchType.ORGUNIT_SWITCH;
}

/**
 * Map error code to context switch result.
 */
export function mapErrorCodeToResult(errorCode: string): ContextSwitchResult {
  switch (errorCode) {
    case 'CONTEXT_SWITCH_USER_QUARANTINED':
      return ContextSwitchResult.FAILED_USER_QUARANTINED;
    case 'CONTEXT_SWITCH_NO_MEMBERSHIP':
      return ContextSwitchResult.FAILED_NO_MEMBERSHIP;
    case 'CONTEXT_SWITCH_MEMBERSHIP_INACTIVE':
      return ContextSwitchResult.FAILED_MEMBERSHIP_INACTIVE;
    case 'CONTEXT_SWITCH_INVALID_SCOPE':
      return ContextSwitchResult.FAILED_INVALID_SCOPE;
    case 'CONTEXT_SWITCH_ORGUNIT_NOT_FOUND':
      return ContextSwitchResult.FAILED_ORGUNIT_NOT_FOUND;
    case 'CONTEXT_SWITCH_OUT_OF_SCOPE':
      return ContextSwitchResult.FAILED_OUT_OF_SCOPE;
    default:
      return ContextSwitchResult.FAILED_OTHER;
  }
}

// ---------------------------------------------------------------------------
// Factory Implementation
// ---------------------------------------------------------------------------

/**
 * Factory function to create a ContextSwitchAuditLogger instance.
 *
 * @param logger - Optional logger instance (uses default if not provided)
 * @returns An implementation of IContextSwitchAuditLogger
 *
 * @example
 * ```typescript
 * // DI Registration
 * container.register({
 *   contextSwitchAuditLogger: asFunction(ContextSwitchAuditLoggerImpl).singleton(),
 * });
 *
 * // Usage
 * const auditLogger = DI.resolve('contextSwitchAuditLogger');
 * auditLogger.logTenantSwitchSuccess(
 *   correlationId,
 *   userId,
 *   'tenant-a',
 *   'tenant-b',
 *   'membership-123',
 * );
 * ```
 */
export const ContextSwitchAuditLoggerImpl = ({
  logger,
}: {
  logger?: Logger;
} = {}): IContextSwitchAuditLogger => {
  const loggerInstance = logger ?? createLogger();

  /**
   * Build the audit entry from input.
   * Uses fallback correlationId if not provided (per Requirements 15.8).
   */
  function buildAuditEntry(input: ContextSwitchLogInput): ContextSwitchAuditEntry {
    // Use provided correlationId or generate a fallback (Requirements 15.8)
    const effectiveCorrelationId = input.correlationId || generateCorrelationId();
    
    return {
      timestamp: new Date().toISOString(),
      eventType: 'CONTEXT_SWITCH',
      correlationId: effectiveCorrelationId,
      userId: input.userId,
      switchType: input.switchType,
      from: {
        tenantId: input.fromTenantId,
        orgUnitId: input.fromOrgUnitId,
      },
      to: {
        tenantId: input.toTenantId,
        orgUnitId: input.toOrgUnitId,
      },
      success: input.result === ContextSwitchResult.SUCCESS,
      resultCode: input.result,
      trigger: input.trigger,
      ...(input.membershipId && { membershipId: input.membershipId }),
      ...(input.errorCode && { errorCode: input.errorCode }),
    };
  }

  /**
   * Write the audit entry to the log.
   */
  function writeLog(entry: ContextSwitchAuditEntry): void {
    const logContext: LogContext = {
      correlation_id: entry.correlationId,
      user_id: entry.userId,
      tenant_id: entry.to.tenantId,
      event_type: entry.eventType,
      switch_type: entry.switchType,
      from_tenant_id: entry.from.tenantId,
      to_tenant_id: entry.to.tenantId,
      from_org_unit_id: entry.from.orgUnitId,
      to_org_unit_id: entry.to.orgUnitId,
      success: entry.success,
      result_code: entry.resultCode,
      trigger: entry.trigger,
      ...(entry.membershipId && { membership_id: entry.membershipId }),
      ...(entry.errorCode && { error_code: entry.errorCode }),
    };

    const message = entry.success
      ? `Context switch successful: ${entry.switchType} for user ${entry.userId}`
      : `Context switch failed: ${entry.switchType} for user ${entry.userId} - ${entry.resultCode}`;

    if (entry.success) {
      loggerInstance.info(message, logContext);
    } else {
      loggerInstance.warn(message, logContext);
    }
  }

  return {
    logContextSwitch(input: ContextSwitchLogInput): void {
      const entry = buildAuditEntry(input);
      writeLog(entry);
    },

    logTenantSwitchSuccess(
      correlationId: string,
      userId: string,
      fromTenantId: string | null,
      toTenantId: string,
      membershipId: string,
      trigger: ContextSwitchTrigger = ContextSwitchTrigger.USER_INITIATED,
    ): void {
      this.logContextSwitch({
        correlationId,
        userId,
        switchType: ContextSwitchType.TENANT_SWITCH,
        fromTenantId,
        toTenantId,
        fromOrgUnitId: null, // Unknown when switching tenants
        toOrgUnitId: null, // Set after tenant switch
        result: ContextSwitchResult.SUCCESS,
        trigger,
        membershipId,
      });
    },

    logTenantSwitchFailure(
      correlationId: string,
      userId: string,
      fromTenantId: string | null,
      toTenantId: string,
      result: ContextSwitchResult,
      errorCode?: string,
      trigger: ContextSwitchTrigger = ContextSwitchTrigger.USER_INITIATED,
    ): void {
      this.logContextSwitch({
        correlationId,
        userId,
        switchType: ContextSwitchType.TENANT_SWITCH,
        fromTenantId,
        toTenantId,
        fromOrgUnitId: null,
        toOrgUnitId: null,
        result,
        trigger,
        errorCode,
      });
    },

    logOrgUnitSwitchSuccess(
      correlationId: string,
      userId: string,
      tenantId: string,
      fromOrgUnitId: string | null,
      toOrgUnitId: string | null,
      membershipId: string,
      trigger: ContextSwitchTrigger = ContextSwitchTrigger.USER_INITIATED,
    ): void {
      this.logContextSwitch({
        correlationId,
        userId,
        switchType: ContextSwitchType.ORGUNIT_SWITCH,
        fromTenantId: tenantId,
        toTenantId: tenantId,
        fromOrgUnitId,
        toOrgUnitId,
        result: ContextSwitchResult.SUCCESS,
        trigger,
        membershipId,
      });
    },

    logOrgUnitSwitchFailure(
      correlationId: string,
      userId: string,
      tenantId: string,
      fromOrgUnitId: string | null,
      toOrgUnitId: string | null,
      result: ContextSwitchResult,
      errorCode?: string,
      trigger: ContextSwitchTrigger = ContextSwitchTrigger.USER_INITIATED,
    ): void {
      this.logContextSwitch({
        correlationId,
        userId,
        switchType: ContextSwitchType.ORGUNIT_SWITCH,
        fromTenantId: tenantId,
        toTenantId: tenantId,
        fromOrgUnitId,
        toOrgUnitId,
        result,
        trigger,
        errorCode,
      });
    },
  };
};

/**
 * Type alias for the factory function for cleaner DI registration.
 */
export type ContextSwitchAuditLogger = IContextSwitchAuditLogger;
