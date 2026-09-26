/**
 * SafetyCriticalProtectionService — Domain service for safety-critical operations.
 *
 * Implements the Safety-Critical Protection (Req 20 AC 1-11) to:
 * - Define and validate safety-critical operation codes
 * - Bypass subscription status checks for emergency operations
 * - Enforce authentication and tenant membership (REVOKED/INVITED denied)
 * - Allow SUSPENDED membership with elevated audit (L10 safety priority)
 * - Log all safety-critical operations with elevated audit level
 * - Emit alerts when emergency used during subscription/membership suspension
 * - Reject non-safety-critical operations claiming to be safety-critical
 *
 * This is a factory function (DI-friendly) following Clean Architecture.
 *
 * CRITICAL DESIGN PRINCIPLES (from LOCKED decisions):
 * - L10: Emergency access for SUSPENDED membership is allowed by default
 * - Safety priority over membership suspension state
 * - Tenant is security boundary (NOT orgUnit path)
 * - Fail closed on unknown states
 *
 * @see Requirements 20 (AC 1-11)
 * @see Design L10: Emergency access for SUSPENDED membership
 */

import type { DomainResult } from '@core/utils';
import { ok, fail } from '@core/utils';
import { authorizationError, businessError } from '@core/utils';
import { MembershipStatus } from '@core/domains/membership/types/MembershipStatus';
import {
  SafetyCriticalOperationCode,
  isSafetyCriticalOperationCode,
  EMERGENCY_ALLOWED_STATUSES,
  EMERGENCY_DENIED_STATUSES,
} from '../types';
import type {
  SafetyCriticalOperationRequest,
  SafetyCriticalCheckResult,
  EmergencyDenialReason,
  SafetyCriticalAuditEntry,
  EmergencyQueueMessage,
} from '../types';
import type { SubscriptionStatus } from '@core/domains/subscription/types';
import { isTerminalStatus } from '@core/domains/subscription/types';
import { SubscriptionStatus as StatusEnum } from '@core/domains/subscription/types';

// ---------------------------------------------------------------------------
// Protocol Interfaces (Core Layer - No External Dependencies)
// ---------------------------------------------------------------------------

/**
 * Protocol for resolving membership with status (for emergency policy).
 */
export interface IMembershipStatusResolver {
  /**
   * Get membership status for a user in a tenant.
   * Returns membership status or null if no membership exists.
   */
  getMembershipStatus(
    userId: string,
    tenantId: string,
  ): Promise<{ status: MembershipStatus; membershipId: string } | null>;
}

/**
 * Protocol for resolving subscription status.
 */
export interface ISubscriptionStatusResolver {
  /**
   * Get subscription status for a tenant.
   * Returns null if no subscription exists.
   */
  getSubscriptionStatus(tenantId: string): Promise<SubscriptionStatus | null>;
}

/**
 * Protocol for elevated audit logging (Req 20 AC 4).
 */
export interface ISafetyCriticalAuditLogger {
  /**
   * Log a safety-critical operation with elevated audit level.
   */
  logSafetyCriticalOperation(entry: SafetyCriticalAuditEntry): Promise<void>;
}

/**
 * Protocol for alerting billing team (Req 20 AC 5).
 */
export interface IBillingAlertEmitter {
  /**
   * Emit alert to billing team when emergency invoked during SUSPENDED subscription.
   */
  emitEmergencyDuringSubscriptionSuspension(context: {
    userId: string;
    tenantId: string;
    operationCode: SafetyCriticalOperationCode;
    correlationId: string;
    timestamp: Date;
  }): Promise<void>;
}

/**
 * Protocol for alerting admin team (Req 20 AC 11).
 */
export interface IAdminAlertEmitter {
  /**
   * Emit alert to admin team when emergency invoked during SUSPENDED membership.
   */
  emitEmergencyDuringMembershipSuspension(context: {
    userId: string;
    tenantId: string;
    membershipId: string;
    operationCode: SafetyCriticalOperationCode;
    correlationId: string;
    timestamp: Date;
  }): Promise<void>;
}

/**
 * Protocol for enqueueing emergency operations (Req 20 AC 8-9).
 */
export interface IEmergencyQueueProtocol {
  /**
   * Enqueue an emergency operation with high priority and retry logic.
   * Uses dedicated queue with 3 retries and exponential backoff.
   */
  enqueueEmergencyOperation(message: EmergencyQueueMessage): Promise<string>;
}

/**
 * Protocol for logging security events (Req 20 AC 7).
 */
export interface ISecurityEventLogger {
  /**
   * Log a security event when non-safety-critical claims to be safety-critical.
   */
  logInvalidSafetyCriticalClaim(context: {
    claimedOperationCode: string;
    userId: string;
    tenantId: string;
    correlationId: string;
    timestamp: Date;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface ISafetyCriticalProtectionService {
  /**
   * Check if an operation code is a valid safety-critical operation.
   *
   * Per Req 20 AC 1: Only emergency_alert:create, alarm:trigger,
   * panic_button:activate are safety-critical.
   *
   * @param operationCode - The operation code to check
   * @returns true if the operation is safety-critical
   */
  isSafetyCriticalOperation(operationCode: string): boolean;

  /**
   * Validate and check if a safety-critical operation can be executed.
   *
   * This performs the full safety-critical check flow:
   * 1. Validate operation code is actually safety-critical (AC 7)
   * 2. Enforce authentication (user must be logged in) (AC 3)
   * 3. Resolve membership and apply Emergency_Policy (AC 10)
   * 4. Bypass subscription status checks (AC 2) EXCEPT for CLOSED
   * 5. Determine if elevated audit is required (AC 4)
   * 6. Determine if billing/admin alerts are needed (AC 5, 11)
   *
   * DOES NOT check permissions - that's a separate step (AC 6).
   *
   * @param request - The safety-critical operation request
   * @returns DomainResult with check result
   */
  checkSafetyCriticalAccess(
    request: SafetyCriticalOperationRequest,
  ): Promise<DomainResult<SafetyCriticalCheckResult>>;

  /**
   * Execute a safety-critical operation after validation.
   *
   * This:
   * 1. Logs the operation with elevated audit (AC 4)
   * 2. Emits alerts if needed (AC 5, 11)
   * 3. Enqueues the operation to the emergency queue (AC 8)
   * 4. Returns the queue message ID
   *
   * PRECONDITION: checkSafetyCriticalAccess must have returned allowed=true.
   *
   * @param request - The validated safety-critical operation request
   * @param checkResult - The result from checkSafetyCriticalAccess
   * @returns DomainResult with queue message ID
   */
  executeSafetyCriticalOperation(
    request: SafetyCriticalOperationRequest,
    checkResult: SafetyCriticalCheckResult,
  ): Promise<DomainResult<{ messageId: string }>>;

  /**
   * Get the Emergency_Policy for a membership status.
   *
   * @param membershipStatus - The membership status
   * @returns 'ALLOWED' | 'ALLOWED_WITH_AUDIT' | 'DENIED'
   */
  getEmergencyPolicy(membershipStatus: MembershipStatus): 'ALLOWED' | 'ALLOWED_WITH_AUDIT' | 'DENIED';
}

// ---------------------------------------------------------------------------
// Error Factories
// ---------------------------------------------------------------------------

export function emergencyAccessDenied(
  reason: EmergencyDenialReason,
  message: string,
): ReturnType<typeof authorizationError> {
  return authorizationError(
    `EMERGENCY_ACCESS_DENIED_${reason}`,
    message,
    { userMessage: 'Emergency access denied' },
  );
}

export function invalidSafetyCriticalOperation(
  operationCode: string,
): ReturnType<typeof businessError> {
  return businessError(
    'INVALID_SAFETY_CRITICAL_OPERATION',
    `Operation '${operationCode}' is not a valid safety-critical operation`,
  );
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

export interface SafetyCriticalProtectionServiceDeps {
  membershipStatusResolver: IMembershipStatusResolver;
  subscriptionStatusResolver: ISubscriptionStatusResolver;
  auditLogger: ISafetyCriticalAuditLogger;
  billingAlertEmitter: IBillingAlertEmitter;
  adminAlertEmitter: IAdminAlertEmitter;
  emergencyQueue: IEmergencyQueueProtocol;
  securityEventLogger: ISecurityEventLogger;
}

export function createSafetyCriticalProtectionService(
  deps: SafetyCriticalProtectionServiceDeps,
): ISafetyCriticalProtectionService {
  const {
    membershipStatusResolver,
    subscriptionStatusResolver,
    auditLogger,
    billingAlertEmitter,
    adminAlertEmitter,
    emergencyQueue,
    securityEventLogger,
  } = deps;

  /**
   * Map membership status to emergency policy (Req 20 AC 10).
   */
  function getEmergencyPolicyForStatus(
    status: MembershipStatus,
  ): 'ALLOWED' | 'ALLOWED_WITH_AUDIT' | 'DENIED' {
    switch (status) {
      case MembershipStatus.ACTIVE:
        return 'ALLOWED';
      case MembershipStatus.SUSPENDED:
        // L10: Emergency access for SUSPENDED membership is allowed by default
        return 'ALLOWED_WITH_AUDIT';
      case MembershipStatus.REVOKED:
      case MembershipStatus.INVITED:
        return 'DENIED';
      default:
        // Fail closed on unknown states
        return 'DENIED';
    }
  }

  return {
    /**
     * Check if an operation code is a valid safety-critical operation.
     */
    isSafetyCriticalOperation(operationCode: string): boolean {
      return isSafetyCriticalOperationCode(operationCode);
    },

    /**
     * Get the Emergency_Policy for a membership status.
     */
    getEmergencyPolicy(membershipStatus: MembershipStatus): 'ALLOWED' | 'ALLOWED_WITH_AUDIT' | 'DENIED' {
      return getEmergencyPolicyForStatus(membershipStatus);
    },

    /**
     * Validate and check if a safety-critical operation can be executed.
     */
    async checkSafetyCriticalAccess(
      request: SafetyCriticalOperationRequest,
    ): Promise<DomainResult<SafetyCriticalCheckResult>> {
      const {
        operationCode,
        userId,
        tenantId,
        correlationId,
      } = request;

      // Step 1: Validate operation code is actually safety-critical (AC 7)
      if (!isSafetyCriticalOperationCode(operationCode)) {
        // Log security event for non-safety-critical claiming to be safety-critical
        await securityEventLogger.logInvalidSafetyCriticalClaim({
          claimedOperationCode: operationCode,
          userId,
          tenantId,
          correlationId,
          timestamp: new Date(),
        });

        return fail(invalidSafetyCriticalOperation(operationCode));
      }

      // Step 2: Resolve membership status (AC 3, AC 10)
      const membershipInfo = await membershipStatusResolver.getMembershipStatus(
        userId,
        tenantId,
      );

      if (!membershipInfo) {
        return ok({
          allowed: false,
          operationCode,
          requiresElevatedAudit: true, // Log failed attempts too
          alertBillingTeam: false,
          alertAdminTeam: false,
          denialReason: 'NO_TENANT_MEMBERSHIP',
          membershipStatus: 'NONE',
        });
      }

      const { status: membershipStatus, membershipId } = membershipInfo;

      // Step 3: Apply Emergency_Policy based on membership status (AC 10)
      const emergencyPolicy = getEmergencyPolicyForStatus(membershipStatus);

      if (emergencyPolicy === 'DENIED') {
        const denialReason: EmergencyDenialReason =
          membershipStatus === MembershipStatus.REVOKED
            ? 'MEMBERSHIP_REVOKED'
            : 'MEMBERSHIP_INVITED';

        return ok({
          allowed: false,
          operationCode,
          requiresElevatedAudit: true, // Log denied attempts
          alertBillingTeam: false,
          alertAdminTeam: false,
          denialReason,
          membershipStatus,
        });
      }

      // Step 4: Check subscription status (AC 2, AC 5)
      // Safety-critical operations bypass subscription checks EXCEPT for CLOSED
      const subscriptionStatus = await subscriptionStatusResolver.getSubscriptionStatus(tenantId);

      // If subscription is CLOSED (terminal), even emergency operations are denied
      if (subscriptionStatus && isTerminalStatus(subscriptionStatus)) {
        return ok({
          allowed: false,
          operationCode,
          requiresElevatedAudit: true,
          alertBillingTeam: false,
          alertAdminTeam: false,
          denialReason: 'TENANT_CLOSED',
          membershipStatus,
          subscriptionStatus,
        });
      }

      // Determine if we need to alert billing team (AC 5)
      const duringSubscriptionSuspension = subscriptionStatus === StatusEnum.SUSPENDED;
      const alertBillingTeam = duringSubscriptionSuspension;

      // Determine if we need to alert admin team (AC 11)
      const duringMembershipSuspension = membershipStatus === MembershipStatus.SUSPENDED;
      const alertAdminTeam = duringMembershipSuspension;

      // Emergency access is allowed
      return ok({
        allowed: true,
        operationCode,
        requiresElevatedAudit: emergencyPolicy === 'ALLOWED_WITH_AUDIT' || duringSubscriptionSuspension,
        alertBillingTeam,
        alertAdminTeam,
        membershipStatus,
        subscriptionStatus: subscriptionStatus ?? undefined,
      });
    },

    /**
     * Execute a safety-critical operation after validation.
     */
    async executeSafetyCriticalOperation(
      request: SafetyCriticalOperationRequest,
      checkResult: SafetyCriticalCheckResult,
    ): Promise<DomainResult<{ messageId: string }>> {
      const {
        operationCode,
        userId,
        tenantId,
        membershipId,
        payload,
        correlationId,
        ipAddress,
      } = request;

      const {
        allowed,
        requiresElevatedAudit,
        alertBillingTeam,
        alertAdminTeam,
        membershipStatus,
        subscriptionStatus,
      } = checkResult;

      const timestamp = new Date();

      // Step 1: Log with elevated audit (AC 4)
      const auditEntry: SafetyCriticalAuditEntry = {
        auditType: 'SAFETY_CRITICAL',
        operationCode,
        userId,
        tenantId,
        membershipId,
        membershipStatus,
        subscriptionStatus,
        allowed,
        denialReason: checkResult.denialReason,
        duringSubscriptionSuspension: subscriptionStatus === StatusEnum.SUSPENDED,
        duringMembershipSuspension: membershipStatus === MembershipStatus.SUSPENDED,
        correlationId,
        ipAddress,
        timestamp,
        additionalContext: payload,
      };

      await auditLogger.logSafetyCriticalOperation(auditEntry);

      // If not allowed, we've logged but shouldn't proceed
      if (!allowed) {
        return fail(
          emergencyAccessDenied(
            checkResult.denialReason ?? 'PERMISSION_DENIED',
            `Emergency operation ${operationCode} was denied`,
          ),
        );
      }

      // Step 2: Emit alerts if needed
      if (alertBillingTeam) {
        // AC 5: Alert billing team when emergency during SUSPENDED subscription
        await billingAlertEmitter.emitEmergencyDuringSubscriptionSuspension({
          userId,
          tenantId,
          operationCode,
          correlationId,
          timestamp,
        });
      }

      if (alertAdminTeam) {
        // AC 11: Alert admin team when emergency during SUSPENDED membership
        await adminAlertEmitter.emitEmergencyDuringMembershipSuspension({
          userId,
          tenantId,
          membershipId,
          operationCode,
          correlationId,
          timestamp,
        });
      }

      // Step 3: Enqueue to emergency queue (AC 8)
      const queueMessage: EmergencyQueueMessage = {
        messageId: crypto.randomUUID(),
        operationCode,
        userId,
        tenantId,
        membershipId,
        payload: payload ?? {},
        correlationId,
        enqueuedAt: timestamp,
        retryAttempt: 0,
        priority: 1, // Highest priority
      };

      const messageId = await emergencyQueue.enqueueEmergencyOperation(queueMessage);

      return ok({ messageId });
    },
  };
}
