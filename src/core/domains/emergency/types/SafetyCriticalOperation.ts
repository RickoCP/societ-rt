/**
 * SafetyCriticalOperation — Types for safety-critical emergency operations.
 *
 * Safety-critical operations MUST bypass subscription status checks per Req 20.
 * However, they MUST still enforce:
 * - Authentication (user must be logged in)
 * - Tenant membership (user must have valid membership in tenant)
 * - Permission checks (user must have required permission)
 *
 * Membership status policy per Req 20 AC 10:
 * - REVOKED membership → panic DENIED
 * - INVITED membership → panic DENIED
 * - ACTIVE membership → panic ALLOWED
 * - SUSPENDED membership → panic ALLOWED with elevated audit
 *
 * @see Requirements 20 (AC 1-11)
 * @see Design L10: Emergency access for SUSPENDED membership is allowed by default
 */

// ---------------------------------------------------------------------------
// Safety-Critical Operation Codes
// ---------------------------------------------------------------------------

/**
 * Safety-critical operation codes as defined in Req 20 AC 1.
 * These operations bypass subscription status checks.
 */
export const SafetyCriticalOperationCode = {
  EMERGENCY_ALERT_CREATE: 'emergency_alert:create',
  ALARM_TRIGGER: 'alarm:trigger',
  PANIC_BUTTON_ACTIVATE: 'panic_button:activate',
} as const;

export type SafetyCriticalOperationCode =
  (typeof SafetyCriticalOperationCode)[keyof typeof SafetyCriticalOperationCode];

/**
 * Set of all safety-critical operation codes for fast lookup.
 */
export const ALL_SAFETY_CRITICAL_OPERATIONS: ReadonlySet<SafetyCriticalOperationCode> =
  new Set(Object.values(SafetyCriticalOperationCode));

/**
 * Check if an operation code is safety-critical.
 * Returns true only for explicitly defined safety-critical operations.
 */
export function isSafetyCriticalOperationCode(
  code: string,
): code is SafetyCriticalOperationCode {
  return ALL_SAFETY_CRITICAL_OPERATIONS.has(code as SafetyCriticalOperationCode);
}

// ---------------------------------------------------------------------------
// Emergency Policy for Membership Status
// ---------------------------------------------------------------------------

/**
 * Membership status eligibility for emergency operations per Req 20 AC 10.
 *
 * - REVOKED: panic DENIED (terminal state)
 * - INVITED: panic DENIED (not yet a member)
 * - ACTIVE: panic ALLOWED (normal operation)
 * - SUSPENDED: panic ALLOWED with elevated audit (safety priority)
 */
export const EmergencyMembershipPolicy = {
  /** REVOKED membership cannot invoke emergency operations */
  REVOKED: 'DENIED',
  /** INVITED membership cannot invoke emergency operations */
  INVITED: 'DENIED',
  /** ACTIVE membership can invoke emergency operations */
  ACTIVE: 'ALLOWED',
  /** SUSPENDED membership can invoke emergency operations with elevated audit */
  SUSPENDED: 'ALLOWED_WITH_AUDIT',
} as const;

export type EmergencyMembershipPolicy =
  (typeof EmergencyMembershipPolicy)[keyof typeof EmergencyMembershipPolicy];

/**
 * Membership statuses that allow emergency operations.
 */
export const EMERGENCY_ALLOWED_STATUSES: ReadonlySet<string> = new Set([
  'ACTIVE',
  'SUSPENDED',
]);

/**
 * Membership statuses that deny emergency operations.
 */
export const EMERGENCY_DENIED_STATUSES: ReadonlySet<string> = new Set([
  'REVOKED',
  'INVITED',
]);

// ---------------------------------------------------------------------------
// Safety-Critical Operation Request
// ---------------------------------------------------------------------------

/**
 * Input for invoking a safety-critical operation.
 */
export interface SafetyCriticalOperationRequest {
  /** The operation being invoked */
  readonly operationCode: SafetyCriticalOperationCode;
  /** User ID of the invoker */
  readonly userId: string;
  /** Tenant ID context */
  readonly tenantId: string;
  /** Membership ID (resolved server-side, NOT from JWT) */
  readonly membershipId: string;
  /** Optional payload specific to the operation */
  readonly payload?: Record<string, unknown>;
  /** Request correlation ID for tracing */
  readonly correlationId: string;
  /** IP address of the requester */
  readonly ipAddress?: string;
}

// ---------------------------------------------------------------------------
// Safety-Critical Operation Result
// ---------------------------------------------------------------------------

/**
 * Reason for denying a safety-critical operation.
 */
export type EmergencyDenialReason =
  | 'MEMBERSHIP_REVOKED'
  | 'MEMBERSHIP_INVITED'
  | 'USER_NOT_AUTHENTICATED'
  | 'NO_TENANT_MEMBERSHIP'
  | 'PERMISSION_DENIED'
  | 'INVALID_OPERATION_CODE'
  | 'TENANT_CLOSED';

/**
 * Result of a safety-critical operation eligibility check.
 */
export interface SafetyCriticalCheckResult {
  /** Whether the operation is allowed */
  readonly allowed: boolean;
  /** The operation that was checked */
  readonly operationCode: SafetyCriticalOperationCode;
  /** Whether elevated audit logging is required */
  readonly requiresElevatedAudit: boolean;
  /** Whether billing team should be alerted (SUSPENDED subscription) */
  readonly alertBillingTeam: boolean;
  /** Whether admin team should be alerted (SUSPENDED membership) */
  readonly alertAdminTeam: boolean;
  /** Denial reason if not allowed */
  readonly denialReason?: EmergencyDenialReason;
  /** The user's membership status at check time */
  readonly membershipStatus: string;
  /** The tenant's subscription status at check time (if resolved) */
  readonly subscriptionStatus?: string;
}

// ---------------------------------------------------------------------------
// Audit Context for Safety-Critical Operations
// ---------------------------------------------------------------------------

/**
 * Audit log entry for safety-critical operations.
 * All safety-critical operations MUST be logged with elevated audit level.
 */
export interface SafetyCriticalAuditEntry {
  /** Audit entry type - always 'SAFETY_CRITICAL' for these operations */
  readonly auditType: 'SAFETY_CRITICAL';
  /** The safety-critical operation code */
  readonly operationCode: SafetyCriticalOperationCode;
  /** User ID of the invoker */
  readonly userId: string;
  /** Tenant ID context */
  readonly tenantId: string;
  /** Membership ID */
  readonly membershipId: string;
  /** Membership status at invocation time */
  readonly membershipStatus: string;
  /** Subscription status at invocation time */
  readonly subscriptionStatus?: string;
  /** Whether the operation was allowed */
  readonly allowed: boolean;
  /** Denial reason if not allowed */
  readonly denialReason?: EmergencyDenialReason;
  /** Whether this was during SUSPENDED subscription */
  readonly duringSubscriptionSuspension: boolean;
  /** Whether this was during SUSPENDED membership */
  readonly duringMembershipSuspension: boolean;
  /** Request correlation ID */
  readonly correlationId: string;
  /** IP address of the requester */
  readonly ipAddress?: string;
  /** Timestamp of the operation */
  readonly timestamp: Date;
  /** Any additional context */
  readonly additionalContext?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Emergency Queue Message
// ---------------------------------------------------------------------------

/**
 * Message structure for the emergency queue.
 * Emergency operations use a dedicated high-priority queue per Req 20 AC 8.
 */
export interface EmergencyQueueMessage {
  /** Unique message ID */
  readonly messageId: string;
  /** The safety-critical operation code */
  readonly operationCode: SafetyCriticalOperationCode;
  /** User ID of the invoker */
  readonly userId: string;
  /** Tenant ID context */
  readonly tenantId: string;
  /** Membership ID */
  readonly membershipId: string;
  /** Operation payload */
  readonly payload: Record<string, unknown>;
  /** Request correlation ID */
  readonly correlationId: string;
  /** Timestamp when the message was enqueued */
  readonly enqueuedAt: Date;
  /** Current retry attempt (0 for first attempt) */
  readonly retryAttempt: number;
  /** Priority level (lower = higher priority) */
  readonly priority: number;
}
