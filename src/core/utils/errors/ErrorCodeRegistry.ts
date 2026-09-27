/**
 * ErrorCodeRegistry — Central registry for all standardized error codes.
 *
 * Error codes follow the pattern: {DOMAIN}_{ACTION_OR_REASON}
 *
 * Design principles:
 * - Unique, non-conflicting codes across all domains
 * - Machine-readable (stable, no spaces)
 * - Human-readable (descriptive)
 * - Documented with recommended HTTP status
 * - Support i18n mapping via code-based lookup
 *
 * @see Requirements 61 (Error Code Standardization)
 * @see Design Document: Error Handling section
 * @see Steering: 12-error-handling.md
 */

import type { AppErrorType } from '../AppError';

// ---------------------------------------------------------------------------
// Error Code Definition Interface
// ---------------------------------------------------------------------------

export interface ErrorCodeDefinition {
  /** Stable, unique error code (e.g., AUTH_TOKEN_INVALID) */
  readonly code: string;
  /** Classification of the error */
  readonly type: AppErrorType;
  /** Recommended HTTP status code */
  readonly httpStatus: number;
  /** Internal description (for developers) */
  readonly description: string;
  /** Whether the operation can be retried */
  readonly retryable: boolean;
  /** i18n key for user-facing message (optional) */
  readonly i18nKey?: string;
}

// ---------------------------------------------------------------------------
// Authentication Error Codes (AUTH_*)
// ---------------------------------------------------------------------------

export const AUTH_ERROR_CODES = {
  /** JWT missing, malformed, or expired */
  AUTH_TOKEN_INVALID: {
    code: 'AUTH_TOKEN_INVALID',
    type: 'authentication',
    httpStatus: 401,
    description: 'JWT missing, malformed, or expired',
    retryable: false,
    i18nKey: 'error.auth.tokenInvalid',
  },
  /** Token version mismatch (forced logout) */
  AUTH_TOKEN_REVOKED: {
    code: 'AUTH_TOKEN_REVOKED',
    type: 'authentication',
    httpStatus: 401,
    description: 'Token version mismatch - session has been invalidated',
    retryable: false,
    i18nKey: 'error.auth.tokenRevoked',
  },
  /** Refresh token reuse detected (potential theft) */
  AUTH_TOKEN_REUSE_DETECTED: {
    code: 'AUTH_TOKEN_REUSE_DETECTED',
    type: 'authentication',
    httpStatus: 401,
    description: 'Refresh token reuse detected - family revoked',
    retryable: false,
    i18nKey: 'error.auth.tokenReuse',
  },
  /** Token has expired naturally */
  AUTH_TOKEN_EXPIRED: {
    code: 'AUTH_TOKEN_EXPIRED',
    type: 'authentication',
    httpStatus: 401,
    description: 'Token has expired',
    retryable: false,
    i18nKey: 'error.auth.tokenExpired',
  },
  /** Invalid login credentials */
  AUTH_INVALID_CREDENTIALS: {
    code: 'AUTH_INVALID_CREDENTIALS',
    type: 'authentication',
    httpStatus: 401,
    description: 'Authentication failed',
    retryable: true,
    i18nKey: 'error.auth.invalidCredentials',
  },
  /** Account locked due to failed attempts */
  AUTH_ACCOUNT_LOCKED: {
    code: 'AUTH_ACCOUNT_LOCKED',
    type: 'authentication',
    httpStatus: 401,
    description: 'Account temporarily locked due to failed login attempts',
    retryable: false,
    i18nKey: 'error.auth.accountLocked',
  },
  /** MFA verification failed */
  AUTH_MFA_FAILED: {
    code: 'AUTH_MFA_FAILED',
    type: 'authentication',
    httpStatus: 401,
    description: 'Multi-factor authentication verification failed',
    retryable: true,
    i18nKey: 'error.auth.mfaFailed',
  },
  /** MFA is required but not provided */
  AUTH_MFA_REQUIRED: {
    code: 'AUTH_MFA_REQUIRED',
    type: 'authentication',
    httpStatus: 401,
    description: 'Multi-factor authentication is required',
    retryable: false,
    i18nKey: 'error.auth.mfaRequired',
  },
  /** Session not found or invalid */
  AUTH_SESSION_INVALID: {
    code: 'AUTH_SESSION_INVALID',
    type: 'authentication',
    httpStatus: 401,
    description: 'Session not found or invalid',
    retryable: false,
    i18nKey: 'error.auth.sessionInvalid',
  },
  /** Session has expired */
  AUTH_SESSION_EXPIRED: {
    code: 'AUTH_SESSION_EXPIRED',
    type: 'authentication',
    httpStatus: 401,
    description: 'Session has expired',
    retryable: false,
    i18nKey: 'error.auth.sessionExpired',
  },
  /** Webhook signature verification failed */
  AUTH_WEBHOOK_SIGNATURE_INVALID: {
    code: 'AUTH_WEBHOOK_SIGNATURE_INVALID',
    type: 'authentication',
    httpStatus: 401,
    description: 'Webhook signature verification failed',
    retryable: false,
    i18nKey: 'error.auth.webhookSignatureInvalid',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

// ---------------------------------------------------------------------------
// Authorization Error Codes (AUTHZ_*)
// ---------------------------------------------------------------------------

export const AUTHZ_ERROR_CODES = {
  /** No membership in requested tenant */
  AUTHZ_NO_MEMBERSHIP: {
    code: 'AUTHZ_NO_MEMBERSHIP',
    type: 'authorization',
    httpStatus: 403,
    description: 'No membership in requested tenant',
    retryable: false,
    i18nKey: 'error.authz.noMembership',
  },
  /** Membership status not ACTIVE */
  AUTHZ_MEMBERSHIP_INACTIVE: {
    code: 'AUTHZ_MEMBERSHIP_INACTIVE',
    type: 'authorization',
    httpStatus: 403,
    description: 'Membership status is not active',
    retryable: false,
    i18nKey: 'error.authz.membershipInactive',
  },
  /** Membership context could not be resolved (multi-membership) */
  AUTHZ_MEMBERSHIP_CONTEXT_INVALID: {
    code: 'AUTHZ_MEMBERSHIP_CONTEXT_INVALID',
    type: 'authorization',
    httpStatus: 403,
    description: 'Invalid membership context for multi-membership resolution',
    retryable: false,
    i18nKey: 'error.authz.membershipContextInvalid',
  },
  /** User lacks required permission */
  AUTHZ_INSUFFICIENT_PERMISSION: {
    code: 'AUTHZ_INSUFFICIENT_PERMISSION',
    type: 'authorization',
    httpStatus: 403,
    description: 'User lacks required permission',
    retryable: false,
    i18nKey: 'error.authz.insufficientPermission',
  },
  /** Resource outside user's OrgUnit scope */
  AUTHZ_OUT_OF_SCOPE: {
    code: 'AUTHZ_OUT_OF_SCOPE',
    type: 'authorization',
    httpStatus: 403,
    description: "Resource outside user's organizational unit scope",
    retryable: false,
    i18nKey: 'error.authz.outOfScope',
  },
  /** Resource tenant ≠ user's active tenant */
  AUTHZ_TENANT_MISMATCH: {
    code: 'AUTHZ_TENANT_MISMATCH',
    type: 'authorization',
    httpStatus: 403,
    description: "Resource tenant does not match user's active tenant",
    retryable: false,
    i18nKey: 'error.authz.tenantMismatch',
  },
  /** User in quarantine manifest */
  AUTHZ_USER_QUARANTINED: {
    code: 'AUTHZ_USER_QUARANTINED',
    type: 'authorization',
    httpStatus: 403,
    description: 'User is quarantined due to platform anomaly',
    retryable: false,
    i18nKey: 'error.authz.userQuarantined',
  },
  /** Privilege escalation via delegation */
  AUTHZ_DELEGATION_VIOLATION: {
    code: 'AUTHZ_DELEGATION_VIOLATION',
    type: 'authorization',
    httpStatus: 403,
    description: 'Attempted privilege escalation via role delegation',
    retryable: false,
    i18nKey: 'error.authz.delegationViolation',
  },
  /** Access to another household */
  AUTHZ_HOUSEHOLD_MISMATCH: {
    code: 'AUTHZ_HOUSEHOLD_MISMATCH',
    type: 'authorization',
    httpStatus: 403,
    description: 'Cannot access resources from another household',
    retryable: false,
    i18nKey: 'error.authz.householdMismatch',
  },
  /** Step-up authentication required */
  AUTHZ_REAUTH_REQUIRED: {
    code: 'AUTHZ_REAUTH_REQUIRED',
    type: 'authorization',
    httpStatus: 403,
    description: 'Step-up authentication required for this operation',
    retryable: true,
    i18nKey: 'error.authz.reauthRequired',
  },
  /** Role escalation attempt blocked */
  AUTHZ_ROLE_ESCALATION_DENIED: {
    code: 'AUTHZ_ROLE_ESCALATION_DENIED',
    type: 'authorization',
    httpStatus: 403,
    description: 'Role escalation attempt denied',
    retryable: false,
    i18nKey: 'error.authz.roleEscalationDenied',
  },
  /** Insufficient role for operation */
  AUTHZ_INSUFFICIENT_ROLE: {
    code: 'AUTHZ_INSUFFICIENT_ROLE',
    type: 'authorization',
    httpStatus: 403,
    description: 'Insufficient role for this operation',
    retryable: false,
    i18nKey: 'error.authz.insufficientRole',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

// ---------------------------------------------------------------------------
// Legacy Authorization Error Codes (AUTH_* for backward compatibility)
// ---------------------------------------------------------------------------

export const LEGACY_AUTHZ_ERROR_CODES = {
  /** @deprecated Use AUTHZ_NO_MEMBERSHIP. No membership in requested tenant */
  AUTH_NO_MEMBERSHIP: {
    code: 'AUTH_NO_MEMBERSHIP',
    type: 'authorization',
    httpStatus: 403,
    description: '[Legacy] No membership in requested tenant',
    retryable: false,
    i18nKey: 'error.authz.noMembership',
  },
  /** @deprecated Use AUTHZ_MEMBERSHIP_INACTIVE. Membership status not ACTIVE */
  AUTH_MEMBERSHIP_INACTIVE: {
    code: 'AUTH_MEMBERSHIP_INACTIVE',
    type: 'authorization',
    httpStatus: 403,
    description: '[Legacy] Membership status is not active',
    retryable: false,
    i18nKey: 'error.authz.membershipInactive',
  },
  /** @deprecated Use AUTHZ_MEMBERSHIP_CONTEXT_INVALID */
  AUTH_MEMBERSHIP_CONTEXT_INVALID: {
    code: 'AUTH_MEMBERSHIP_CONTEXT_INVALID',
    type: 'authorization',
    httpStatus: 403,
    description: '[Legacy] Invalid membership context',
    retryable: false,
    i18nKey: 'error.authz.membershipContextInvalid',
  },
  /** @deprecated Use AUTHZ_INSUFFICIENT_PERMISSION. User lacks required permission */
  AUTH_INSUFFICIENT_PERMISSION: {
    code: 'AUTH_INSUFFICIENT_PERMISSION',
    type: 'authorization',
    httpStatus: 403,
    description: '[Legacy] User lacks required permission',
    retryable: false,
    i18nKey: 'error.authz.insufficientPermission',
  },
  /** @deprecated Use AUTHZ_OUT_OF_SCOPE. Resource outside user's OrgUnit scope */
  AUTH_OUT_OF_SCOPE: {
    code: 'AUTH_OUT_OF_SCOPE',
    type: 'authorization',
    httpStatus: 403,
    description: "[Legacy] Resource outside user's OrgUnit scope",
    retryable: false,
    i18nKey: 'error.authz.outOfScope',
  },
  /** @deprecated Use AUTHZ_TENANT_MISMATCH. Resource tenant mismatch */
  AUTH_TENANT_MISMATCH: {
    code: 'AUTH_TENANT_MISMATCH',
    type: 'authorization',
    httpStatus: 403,
    description: "[Legacy] Resource tenant does not match user's active tenant",
    retryable: false,
    i18nKey: 'error.authz.tenantMismatch',
  },
  /** @deprecated Use AUTHZ_USER_QUARANTINED. User in quarantine manifest */
  AUTH_USER_QUARANTINED: {
    code: 'AUTH_USER_QUARANTINED',
    type: 'authorization',
    httpStatus: 403,
    description: '[Legacy] User is quarantined',
    retryable: false,
    i18nKey: 'error.authz.userQuarantined',
  },
  /** @deprecated Use AUTHZ_DELEGATION_VIOLATION */
  AUTH_DELEGATION_VIOLATION: {
    code: 'AUTH_DELEGATION_VIOLATION',
    type: 'authorization',
    httpStatus: 403,
    description: '[Legacy] Privilege escalation via delegation',
    retryable: false,
    i18nKey: 'error.authz.delegationViolation',
  },
  /** @deprecated Use AUTHZ_HOUSEHOLD_MISMATCH */
  AUTH_HOUSEHOLD_MISMATCH: {
    code: 'AUTH_HOUSEHOLD_MISMATCH',
    type: 'authorization',
    httpStatus: 403,
    description: '[Legacy] Access to another household',
    retryable: false,
    i18nKey: 'error.authz.householdMismatch',
  },
  /** @deprecated Use AUTHZ_REAUTH_REQUIRED */
  AUTH_REAUTH_REQUIRED: {
    code: 'AUTH_REAUTH_REQUIRED',
    type: 'authorization',
    httpStatus: 403,
    description: '[Legacy] Step-up authentication required',
    retryable: true,
    i18nKey: 'error.authz.reauthRequired',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

// ---------------------------------------------------------------------------
// Membership Error Codes (MEM_*)
// ---------------------------------------------------------------------------

export const MEM_ERROR_CODES = {
  /** Membership not found */
  MEM_NOT_FOUND: {
    code: 'MEM_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'Membership not found',
    retryable: false,
    i18nKey: 'error.membership.notFound',
  },
  /** Membership already exists for user in tenant */
  MEM_ALREADY_EXISTS: {
    code: 'MEM_ALREADY_EXISTS',
    type: 'business',
    httpStatus: 409,
    description: 'Membership already exists for this user in the tenant',
    retryable: false,
    i18nKey: 'error.membership.alreadyExists',
  },
  /** Cannot revoke last admin of tenant */
  MEM_LAST_ADMIN: {
    code: 'MEM_LAST_ADMIN',
    type: 'business',
    httpStatus: 400,
    description: 'Cannot revoke the last administrator of a tenant',
    retryable: false,
    i18nKey: 'error.membership.lastAdmin',
  },
  /** Invalid status transition */
  MEM_INVALID_TRANSITION: {
    code: 'MEM_INVALID_TRANSITION',
    type: 'business',
    httpStatus: 400,
    description: 'Invalid membership status transition',
    retryable: false,
    i18nKey: 'error.membership.invalidTransition',
  },
  /** Invitation expired */
  MEM_INVITATION_EXPIRED: {
    code: 'MEM_INVITATION_EXPIRED',
    type: 'business',
    httpStatus: 400,
    description: 'Membership invitation has expired',
    retryable: false,
    i18nKey: 'error.membership.invitationExpired',
  },
  /** Invitation already used */
  MEM_INVITATION_USED: {
    code: 'MEM_INVITATION_USED',
    type: 'business',
    httpStatus: 400,
    description: 'Membership invitation has already been used',
    retryable: false,
    i18nKey: 'error.membership.invitationUsed',
  },
  /** Invitation not found */
  MEM_INVITATION_NOT_FOUND: {
    code: 'MEM_INVITATION_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'Membership invitation not found',
    retryable: false,
    i18nKey: 'error.membership.invitationNotFound',
  },
  /** Role not delegatable by current user */
  MEM_ROLE_NOT_DELEGATABLE: {
    code: 'MEM_ROLE_NOT_DELEGATABLE',
    type: 'business',
    httpStatus: 400,
    description: 'Current user cannot delegate this role',
    retryable: false,
    i18nKey: 'error.membership.roleNotDelegatable',
  },
  /** Self-revocation not allowed */
  MEM_SELF_REVOCATION: {
    code: 'MEM_SELF_REVOCATION',
    type: 'business',
    httpStatus: 400,
    description: 'Cannot revoke your own membership',
    retryable: false,
    i18nKey: 'error.membership.selfRevocation',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

// ---------------------------------------------------------------------------
// Tenant Error Codes (TENANT_*)
// ---------------------------------------------------------------------------

export const TENANT_ERROR_CODES = {
  /** Tenant not found */
  TENANT_NOT_FOUND: {
    code: 'TENANT_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'Tenant not found',
    retryable: false,
    i18nKey: 'error.tenant.notFound',
  },
  /** Tenant subscription suspended */
  TENANT_SUSPENDED: {
    code: 'TENANT_SUSPENDED',
    type: 'authorization',
    httpStatus: 403,
    description: 'Tenant subscription is suspended',
    retryable: false,
    i18nKey: 'error.tenant.suspended',
  },
  /** Tenant is closed */
  TENANT_CLOSED: {
    code: 'TENANT_CLOSED',
    type: 'authorization',
    httpStatus: 403,
    description: 'Tenant is closed',
    retryable: false,
    i18nKey: 'error.tenant.closed',
  },
  /** Tenant access denied */
  TENANT_ACCESS_DENIED: {
    code: 'TENANT_ACCESS_DENIED',
    type: 'authorization',
    httpStatus: 403,
    description: 'Access to this tenant is denied',
    retryable: false,
    i18nKey: 'error.tenant.accessDenied',
  },
  /** Invalid tenant lifecycle transition */
  TENANT_INVALID_TRANSITION: {
    code: 'TENANT_INVALID_TRANSITION',
    type: 'business',
    httpStatus: 400,
    description: 'Invalid tenant lifecycle status transition',
    retryable: false,
    i18nKey: 'error.tenant.invalidTransition',
  },
  /** Subdomain already taken */
  TENANT_SUBDOMAIN_TAKEN: {
    code: 'TENANT_SUBDOMAIN_TAKEN',
    type: 'validation',
    httpStatus: 400,
    description: 'Tenant subdomain is already in use',
    retryable: false,
    i18nKey: 'error.tenant.subdomainTaken',
  },
  /** Tenant provisioning failed */
  TENANT_PROVISIONING_FAILED: {
    code: 'TENANT_PROVISIONING_FAILED',
    type: 'technical',
    httpStatus: 500,
    description: 'Tenant provisioning failed',
    retryable: true,
    i18nKey: 'error.tenant.provisioningFailed',
  },
  /** Feature not available in subscription plan */
  TENANT_ENTITLEMENT_NOT_AVAILABLE: {
    code: 'TENANT_ENTITLEMENT_NOT_AVAILABLE',
    type: 'authorization',
    httpStatus: 403,
    description: 'Feature not available in current subscription plan',
    retryable: false,
    i18nKey: 'error.tenant.entitlementNotAvailable',
  },
  /** User limit exceeded */
  TENANT_USER_LIMIT_EXCEEDED: {
    code: 'TENANT_USER_LIMIT_EXCEEDED',
    type: 'business',
    httpStatus: 400,
    description: 'Tenant user limit exceeded',
    retryable: false,
    i18nKey: 'error.tenant.userLimitExceeded',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

// ---------------------------------------------------------------------------
// Validation Error Codes (VAL_*)
// ---------------------------------------------------------------------------

export const VAL_ERROR_CODES = {
  /** Generic validation failed */
  VAL_FAILED: {
    code: 'VAL_FAILED',
    type: 'validation',
    httpStatus: 400,
    description: 'Validation failed',
    retryable: false,
    i18nKey: 'error.validation.failed',
  },
  /** Required field missing */
  VAL_REQUIRED_FIELD: {
    code: 'VAL_REQUIRED_FIELD',
    type: 'validation',
    httpStatus: 400,
    description: 'Required field is missing',
    retryable: false,
    i18nKey: 'error.validation.requiredField',
  },
  /** Invalid field format */
  VAL_INVALID_FORMAT: {
    code: 'VAL_INVALID_FORMAT',
    type: 'validation',
    httpStatus: 400,
    description: 'Field format is invalid',
    retryable: false,
    i18nKey: 'error.validation.invalidFormat',
  },
  /** Invalid email format */
  VAL_INVALID_EMAIL: {
    code: 'VAL_INVALID_EMAIL',
    type: 'validation',
    httpStatus: 400,
    description: 'Invalid email format',
    retryable: false,
    i18nKey: 'error.validation.invalidEmail',
  },
  /** Invalid phone format */
  VAL_INVALID_PHONE: {
    code: 'VAL_INVALID_PHONE',
    type: 'validation',
    httpStatus: 400,
    description: 'Invalid phone number format',
    retryable: false,
    i18nKey: 'error.validation.invalidPhone',
  },
  /** Value out of range */
  VAL_OUT_OF_RANGE: {
    code: 'VAL_OUT_OF_RANGE',
    type: 'validation',
    httpStatus: 400,
    description: 'Value is out of allowed range',
    retryable: false,
    i18nKey: 'error.validation.outOfRange',
  },
  /** Invalid enum value */
  VAL_INVALID_ENUM: {
    code: 'VAL_INVALID_ENUM',
    type: 'validation',
    httpStatus: 400,
    description: 'Invalid enumeration value',
    retryable: false,
    i18nKey: 'error.validation.invalidEnum',
  },
  /** Invalid UUID format */
  VAL_INVALID_UUID: {
    code: 'VAL_INVALID_UUID',
    type: 'validation',
    httpStatus: 400,
    description: 'Invalid UUID format',
    retryable: false,
    i18nKey: 'error.validation.invalidUuid',
  },
  /** Invalid date format */
  VAL_INVALID_DATE: {
    code: 'VAL_INVALID_DATE',
    type: 'validation',
    httpStatus: 400,
    description: 'Invalid date format',
    retryable: false,
    i18nKey: 'error.validation.invalidDate',
  },
  /** String too long */
  VAL_STRING_TOO_LONG: {
    code: 'VAL_STRING_TOO_LONG',
    type: 'validation',
    httpStatus: 400,
    description: 'String exceeds maximum length',
    retryable: false,
    i18nKey: 'error.validation.stringTooLong',
  },
  /** String too short */
  VAL_STRING_TOO_SHORT: {
    code: 'VAL_STRING_TOO_SHORT',
    type: 'validation',
    httpStatus: 400,
    description: 'String is below minimum length',
    retryable: false,
    i18nKey: 'error.validation.stringTooShort',
  },
  /** Invalid password format */
  VAL_INVALID_PASSWORD: {
    code: 'VAL_INVALID_PASSWORD',
    type: 'validation',
    httpStatus: 400,
    description: 'Credential does not meet security requirements',
    retryable: false,
    i18nKey: 'error.validation.invalidPassword',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

// ---------------------------------------------------------------------------
// Business Error Codes (BIZ_*)
// ---------------------------------------------------------------------------

export const BIZ_ERROR_CODES = {
  /** Generic business rule violation */
  BIZ_RULE_VIOLATION: {
    code: 'BIZ_RULE_VIOLATION',
    type: 'business',
    httpStatus: 400,
    description: 'Business rule violation',
    retryable: false,
    i18nKey: 'error.business.ruleViolation',
  },
  /** Resource conflict detected */
  BIZ_CONFLICT_DETECTED: {
    code: 'BIZ_CONFLICT_DETECTED',
    type: 'business',
    httpStatus: 409,
    description: 'Resource conflict detected (TOCTOU race condition)',
    retryable: true,
    i18nKey: 'error.business.conflictDetected',
  },
  /** Idempotency key reused with different body */
  BIZ_IDEMPOTENCY_MISMATCH: {
    code: 'BIZ_IDEMPOTENCY_MISMATCH',
    type: 'business',
    httpStatus: 409,
    description: 'Idempotency key reused with different request body',
    retryable: false,
    i18nKey: 'error.business.idempotencyMismatch',
  },
  /** Invalid status transition */
  BIZ_INVALID_STATUS_TRANSITION: {
    code: 'BIZ_INVALID_STATUS_TRANSITION',
    type: 'business',
    httpStatus: 400,
    description: 'Invalid state machine transition',
    retryable: false,
    i18nKey: 'error.business.invalidStatusTransition',
  },
  /** Resource already exists */
  BIZ_ALREADY_EXISTS: {
    code: 'BIZ_ALREADY_EXISTS',
    type: 'business',
    httpStatus: 409,
    description: 'Resource already exists',
    retryable: false,
    i18nKey: 'error.business.alreadyExists',
  },
  /** Duplicate entry */
  BIZ_DUPLICATE_ENTRY: {
    code: 'BIZ_DUPLICATE_ENTRY',
    type: 'business',
    httpStatus: 409,
    description: 'Duplicate entry detected',
    retryable: false,
    i18nKey: 'error.business.duplicateEntry',
  },
  /** Operation not allowed in current state */
  BIZ_OPERATION_NOT_ALLOWED: {
    code: 'BIZ_OPERATION_NOT_ALLOWED',
    type: 'business',
    httpStatus: 400,
    description: 'Operation not allowed in current state',
    retryable: false,
    i18nKey: 'error.business.operationNotAllowed',
  },
  /** Insufficient balance */
  BIZ_INSUFFICIENT_BALANCE: {
    code: 'BIZ_INSUFFICIENT_BALANCE',
    type: 'business',
    httpStatus: 400,
    description: 'Insufficient balance for operation',
    retryable: false,
    i18nKey: 'error.business.insufficientBalance',
  },
  /** Invalid amount */
  BIZ_INVALID_AMOUNT: {
    code: 'BIZ_INVALID_AMOUNT',
    type: 'business',
    httpStatus: 400,
    description: 'Invalid amount specified',
    retryable: false,
    i18nKey: 'error.business.invalidAmount',
  },
  /** Deadline passed */
  BIZ_DEADLINE_PASSED: {
    code: 'BIZ_DEADLINE_PASSED',
    type: 'business',
    httpStatus: 400,
    description: 'Operation deadline has passed',
    retryable: false,
    i18nKey: 'error.business.deadlinePassed',
  },
  /** Cannot delete plan with active subscribers */
  BIZ_PLAN_HAS_SUBSCRIBERS: {
    code: 'BIZ_PLAN_HAS_SUBSCRIBERS',
    type: 'business',
    httpStatus: 400,
    description: 'Cannot delete subscription plan with active subscribers',
    retryable: false,
    i18nKey: 'error.business.planHasSubscribers',
  },
  /** Feature disabled */
  BIZ_FEATURE_DISABLED: {
    code: 'BIZ_FEATURE_DISABLED',
    type: 'business',
    httpStatus: 400,
    description: 'Feature is disabled',
    retryable: false,
    i18nKey: 'error.business.featureDisabled',
  },
  /** Context switch invalid */
  BIZ_CONTEXT_SWITCH_INVALID: {
    code: 'BIZ_CONTEXT_SWITCH_INVALID',
    type: 'business',
    httpStatus: 400,
    description: 'Invalid tenant or OrgUnit context switch',
    retryable: false,
    i18nKey: 'error.business.contextSwitchInvalid',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

// ---------------------------------------------------------------------------
// Technical Error Codes (TECH_*)
// ---------------------------------------------------------------------------

export const TECH_ERROR_CODES = {
  /** Generic technical/infrastructure error */
  TECH_ERROR: {
    code: 'TECH_ERROR',
    type: 'technical',
    httpStatus: 500,
    description: 'Technical error occurred',
    retryable: true,
    i18nKey: 'error.technical.error',
  },
  /** Database connection error */
  TECH_DATABASE_ERROR: {
    code: 'TECH_DATABASE_ERROR',
    type: 'technical',
    httpStatus: 500,
    description: 'Database connection or query error',
    retryable: true,
    i18nKey: 'error.technical.databaseError',
  },
  /** External service unavailable */
  TECH_SERVICE_UNAVAILABLE: {
    code: 'TECH_SERVICE_UNAVAILABLE',
    type: 'technical',
    httpStatus: 503,
    description: 'External service is unavailable',
    retryable: true,
    i18nKey: 'error.technical.serviceUnavailable',
  },
  /** Request timeout */
  TECH_TIMEOUT: {
    code: 'TECH_TIMEOUT',
    type: 'technical',
    httpStatus: 504,
    description: 'Request timed out',
    retryable: true,
    i18nKey: 'error.technical.timeout',
  },
  /** Network error */
  TECH_NETWORK_ERROR: {
    code: 'TECH_NETWORK_ERROR',
    type: 'technical',
    httpStatus: 502,
    description: 'Network communication error',
    retryable: true,
    i18nKey: 'error.technical.networkError',
  },
  /** Rate limit exceeded */
  TECH_RATE_LIMIT_EXCEEDED: {
    code: 'TECH_RATE_LIMIT_EXCEEDED',
    type: 'technical',
    httpStatus: 429,
    description: 'Rate limit exceeded',
    retryable: true,
    i18nKey: 'error.technical.rateLimitExceeded',
  },
  /** Parsing error */
  TECH_PARSING_ERROR: {
    code: 'TECH_PARSING_ERROR',
    type: 'technical',
    httpStatus: 500,
    description: 'Failed to parse data',
    retryable: false,
    i18nKey: 'error.technical.parsingError',
  },
  /** External API error */
  TECH_EXTERNAL_API_ERROR: {
    code: 'TECH_EXTERNAL_API_ERROR',
    type: 'technical',
    httpStatus: 502,
    description: 'External API returned an error',
    retryable: true,
    i18nKey: 'error.technical.externalApiError',
  },
  /** Cache error */
  TECH_CACHE_ERROR: {
    code: 'TECH_CACHE_ERROR',
    type: 'technical',
    httpStatus: 500,
    description: 'Cache operation failed',
    retryable: true,
    i18nKey: 'error.technical.cacheError',
  },
  /** File storage error */
  TECH_STORAGE_ERROR: {
    code: 'TECH_STORAGE_ERROR',
    type: 'technical',
    httpStatus: 500,
    description: 'File storage operation failed',
    retryable: true,
    i18nKey: 'error.technical.storageError',
  },
  /** Message queue error */
  TECH_QUEUE_ERROR: {
    code: 'TECH_QUEUE_ERROR',
    type: 'technical',
    httpStatus: 500,
    description: 'Message queue operation failed',
    retryable: true,
    i18nKey: 'error.technical.queueError',
  },
  /** IoT device communication error */
  TECH_IOT_ERROR: {
    code: 'TECH_IOT_ERROR',
    type: 'technical',
    httpStatus: 502,
    description: 'IoT device communication error',
    retryable: true,
    i18nKey: 'error.technical.iotError',
  },
  /** Notification delivery failed */
  TECH_NOTIFICATION_ERROR: {
    code: 'TECH_NOTIFICATION_ERROR',
    type: 'technical',
    httpStatus: 502,
    description: 'Notification delivery failed',
    retryable: true,
    i18nKey: 'error.technical.notificationError',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

// ---------------------------------------------------------------------------
// Not Found Error Codes (Common)
// ---------------------------------------------------------------------------

export const NOT_FOUND_ERROR_CODES = {
  /** Generic resource not found */
  COMMON_NOT_FOUND: {
    code: 'COMMON_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'Resource not found',
    retryable: false,
    i18nKey: 'error.common.notFound',
  },
  /** User not found */
  USER_NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'User not found',
    retryable: false,
    i18nKey: 'error.user.notFound',
  },
  /** Tenant not found */
  TENANT_NOT_FOUND: {
    code: 'TENANT_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'Tenant not found',
    retryable: false,
    i18nKey: 'error.tenant.notFound',
  },
  /** OrgUnit not found */
  ORGUNIT_NOT_FOUND: {
    code: 'ORGUNIT_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'Organizational unit not found',
    retryable: false,
    i18nKey: 'error.orgunit.notFound',
  },
  /** Resident not found */
  RESIDENT_NOT_FOUND: {
    code: 'RESIDENT_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'Resident not found',
    retryable: false,
    i18nKey: 'error.resident.notFound',
  },
  /** Household not found */
  HOUSEHOLD_NOT_FOUND: {
    code: 'HOUSEHOLD_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'Household not found',
    retryable: false,
    i18nKey: 'error.household.notFound',
  },
  /** Announcement not found */
  ANNOUNCEMENT_NOT_FOUND: {
    code: 'ANNOUNCEMENT_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'Announcement not found',
    retryable: false,
    i18nKey: 'error.announcement.notFound',
  },
  /** Vote not found */
  VOTE_NOT_FOUND: {
    code: 'VOTE_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'Vote not found',
    retryable: false,
    i18nKey: 'error.vote.notFound',
  },
  /** Transaction not found */
  TRANSACTION_NOT_FOUND: {
    code: 'TRANSACTION_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'Financial transaction not found',
    retryable: false,
    i18nKey: 'error.transaction.notFound',
  },
  /** Emergency alert not found */
  EMERGENCY_NOT_FOUND: {
    code: 'EMERGENCY_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'Emergency alert not found',
    retryable: false,
    i18nKey: 'error.emergency.notFound',
  },
  /** IoT device not found */
  IOT_DEVICE_NOT_FOUND: {
    code: 'IOT_DEVICE_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'IoT device not found',
    retryable: false,
    i18nKey: 'error.iot.deviceNotFound',
  },
  /** Subscription plan not found */
  SUBSCRIPTION_PLAN_NOT_FOUND: {
    code: 'SUBSCRIPTION_PLAN_NOT_FOUND',
    type: 'not_found',
    httpStatus: 404,
    description: 'Subscription plan not found',
    retryable: false,
    i18nKey: 'error.subscription.planNotFound',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

// ---------------------------------------------------------------------------
// Unexpected Error Codes
// ---------------------------------------------------------------------------

export const UNEXPECTED_ERROR_CODES = {
  /** Generic unexpected error */
  UNEXPECTED_ERROR: {
    code: 'UNEXPECTED_ERROR',
    type: 'unexpected',
    httpStatus: 500,
    description: 'An unexpected error occurred',
    retryable: false,
    i18nKey: 'error.unexpected.error',
  },
  /** Invariant violation */
  UNEXPECTED_INVARIANT: {
    code: 'UNEXPECTED_INVARIANT',
    type: 'unexpected',
    httpStatus: 500,
    description: 'Internal invariant violation',
    retryable: false,
    i18nKey: 'error.unexpected.invariant',
  },
  /** Null reference error */
  UNEXPECTED_NULL_REFERENCE: {
    code: 'UNEXPECTED_NULL_REFERENCE',
    type: 'unexpected',
    httpStatus: 500,
    description: 'Unexpected null or undefined value',
    retryable: false,
    i18nKey: 'error.unexpected.nullReference',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

// ---------------------------------------------------------------------------
// Domain-Specific Error Codes for Multi-Tenant SaaS
// ---------------------------------------------------------------------------

export const ENTITLEMENT_ERROR_CODES = {
  /** Feature not available in plan */
  ENTITLEMENT_NOT_AVAILABLE: {
    code: 'ENTITLEMENT_NOT_AVAILABLE',
    type: 'authorization',
    httpStatus: 403,
    description: 'Feature not available in subscription plan',
    retryable: false,
    i18nKey: 'error.entitlement.notAvailable',
  },
  /** Quota exceeded */
  ENTITLEMENT_QUOTA_EXCEEDED: {
    code: 'ENTITLEMENT_QUOTA_EXCEEDED',
    type: 'business',
    httpStatus: 400,
    description: 'Plan quota has been exceeded',
    retryable: false,
    i18nKey: 'error.entitlement.quotaExceeded',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

export const CONTEXT_ERROR_CODES = {
  /** Invalid context switch */
  CONTEXT_SWITCH_INVALID: {
    code: 'CONTEXT_SWITCH_INVALID',
    type: 'business',
    httpStatus: 400,
    description: 'Invalid tenant or OrgUnit context switch',
    retryable: false,
    i18nKey: 'error.context.switchInvalid',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

// ---------------------------------------------------------------------------
// Aggregated Registry
// ---------------------------------------------------------------------------

export const ERROR_CODES = {
  ...AUTH_ERROR_CODES,
  ...AUTHZ_ERROR_CODES,
  ...LEGACY_AUTHZ_ERROR_CODES,
  ...MEM_ERROR_CODES,
  ...TENANT_ERROR_CODES,
  ...VAL_ERROR_CODES,
  ...BIZ_ERROR_CODES,
  ...TECH_ERROR_CODES,
  ...NOT_FOUND_ERROR_CODES,
  ...UNEXPECTED_ERROR_CODES,
  ...ENTITLEMENT_ERROR_CODES,
  ...CONTEXT_ERROR_CODES,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

// ---------------------------------------------------------------------------
// Lookup Functions
// ---------------------------------------------------------------------------

/**
 * Get error code definition by code string.
 * Returns undefined if code is not found.
 */
export function getErrorCodeDefinition(
  code: string,
): ErrorCodeDefinition | undefined {
  return (ERROR_CODES as Record<string, ErrorCodeDefinition>)[code];
}

/**
 * Get HTTP status code for an error code.
 * Returns 500 if code is not found (fail closed).
 */
export function getHttpStatusForCode(code: string): number {
  const definition = getErrorCodeDefinition(code);
  return definition?.httpStatus ?? 500;
}

/**
 * Check if an error code indicates retryable error.
 */
export function isRetryableCode(code: string): boolean {
  const definition = getErrorCodeDefinition(code);
  return definition?.retryable ?? false;
}

/**
 * Get error type for an error code.
 */
export function getErrorTypeForCode(code: string): AppErrorType | undefined {
  const definition = getErrorCodeDefinition(code);
  return definition?.type;
}

/**
 * Get i18n key for user message.
 */
export function getI18nKeyForCode(code: string): string | undefined {
  const definition = getErrorCodeDefinition(code);
  return definition?.i18nKey;
}

/**
 * Validate that an error code exists in the registry.
 * Logs a warning if the code is unknown.
 */
export function isKnownErrorCode(code: string): boolean {
  const known = code in ERROR_CODES;
  if (!known) {
    console.warn(
      `[ErrorCodeRegistry] Unknown error code: ${code}. Consider adding it to the registry.`,
    );
  }
  return known;
}

/**
 * Get all error codes for a specific type.
 */
export function getErrorCodesByType(type: AppErrorType): ErrorCodeDefinition[] {
  return Object.values(ERROR_CODES).filter(def => def.type === type);
}

/**
 * Get all error codes for a specific HTTP status.
 */
export function getErrorCodesByHttpStatus(
  status: number,
): ErrorCodeDefinition[] {
  return Object.values(ERROR_CODES).filter(def => def.httpStatus === status);
}
